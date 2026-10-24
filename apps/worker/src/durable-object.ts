import { DurableObject } from "cloudflare:workers";
import type { JoinRoomRequest, LeaveRoomRequest } from "@press-link-call/shared/api";
import { base64UrlEncode } from "@press-link-call/shared/crypto";
import { isRoomExpired, MAX_PARTICIPANTS, PARTICIPANT_LEASE_MS, ROOM_LIFETIME_MS } from "@press-link-call/shared/room";
import { validAuthProof, validParticipant, validRoomId, verifyProof } from "./auth";
import type { StoredRoom } from "./room";

const TOMBSTONE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const FAILED_ATTEMPT_WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 12;

interface CreatePayload {
  roomId: string;
  authVerifier: string;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function randomRelayRoomId(prefix: string): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `${prefix}-${base64UrlEncode(bytes)}`;
}

export function relayAccessUrl(baseUrl: string, token?: string): string {
  const secret = token?.trim();
  if (!secret) return baseUrl;
  const relay = new URL(baseUrl);
  relay.pathname = `${relay.pathname.replace(/\/+$/, "")}/${encodeURIComponent(secret)}`;
  relay.search = "";
  relay.hash = "";
  return relay.toString();
}

export class RoomDurableObject extends DurableObject<Env> {
  private readonly failedAttempts = new Map<string, { count: number; windowStartedAt: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        room_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        auth_verifier TEXT NOT NULL,
        relay_room_id TEXT NOT NULL,
        max_participants INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `);
    this.ctx.storage.sql.exec(
      "UPDATE room SET expires_at = MIN(expires_at, created_at + ?), max_participants = ?",
      ROOM_LIFETIME_MS,
      MAX_PARTICIPANTS,
    );
    this.ctx.blockConcurrencyWhile(async () => {
      const room = this.room();
      if (!room) return;
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null || alarm > room.expiresAt) await this.ctx.storage.setAlarm(room.expiresAt);
    });
  }

  private room(): StoredRoom | undefined {
    const rows = this.ctx.storage.sql.exec<{
      room_id: string;
      created_at: number;
      expires_at: number;
      auth_verifier: string;
      relay_room_id: string;
      max_participants: number;
    }>("SELECT room_id, created_at, expires_at, auth_verifier, relay_room_id, max_participants FROM room WHERE singleton = 1").toArray();
    const row = rows[0];
    if (!row) return undefined;
    return {
      roomId: row.room_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      authVerifier: row.auth_verifier,
      relayRoomId: row.relay_room_id,
      maxParticipants: row.max_participants,
    };
  }

  private pruneParticipants(now: number): void {
    this.ctx.storage.sql.exec("DELETE FROM participants WHERE last_seen < ?", now - PARTICIPANT_LEASE_MS);
  }

  private participantCount(): number {
    return this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM participants").one().count;
  }

  private isRateLimited(rateKey: string): boolean {
    const now = Date.now();
    const attempt = this.failedAttempts.get(rateKey);
    if (!attempt || now - attempt.windowStartedAt >= FAILED_ATTEMPT_WINDOW_MS) {
      this.failedAttempts.set(rateKey, { count: 1, windowStartedAt: now });
      return false;
    }
    attempt.count += 1;
    return attempt.count > MAX_FAILED_ATTEMPTS;
  }

  private clearAttempts(rateKey: string): void {
    this.failedAttempts.delete(rateKey);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const rateKey = request.headers.get("X-Rate-Key") ?? "anonymous";

    if (url.pathname === "/create" && request.method === "POST") {
      const payload = await request.json<CreatePayload>();
      if (!validRoomId(payload.roomId) || !validAuthProof(payload.authVerifier)) {
        return json({ error: "Invalid room data", code: "bad_request" }, 400);
      }
      if (this.room()) return json({ error: "Room already exists", code: "conflict" }, 409);

      const createdAt = Date.now();
      const expiresAt = createdAt + ROOM_LIFETIME_MS;
      const relayRoomId = randomRelayRoomId(this.env.MOQ_RELAY_ID || "room");
      this.ctx.storage.sql.exec(
        "INSERT INTO room (singleton, room_id, created_at, expires_at, auth_verifier, relay_room_id, max_participants) VALUES (1, ?, ?, ?, ?, ?, ?)",
        payload.roomId,
        createdAt,
        expiresAt,
        payload.authVerifier,
        relayRoomId,
        MAX_PARTICIPANTS,
      );
      await this.ctx.storage.setAlarm(expiresAt);
      return json({ roomId: payload.roomId, expiresAt }, 201);
    }

    const room = this.room();
    if (!room) return json({ error: "Room not found", code: "not_found" }, 404);
    const now = Date.now();
    const expired = isRoomExpired(room.expiresAt, now);

    if (url.pathname === "/status" && request.method === "GET") {
      if (expired) return json({ exists: true, expired: true, full: false, participants: 0, maxParticipants: room.maxParticipants, expiresAt: room.expiresAt });
      this.pruneParticipants(now);
      const participants = this.participantCount();
      return json({ exists: true, expired: false, full: participants >= room.maxParticipants, participants, maxParticipants: room.maxParticipants, expiresAt: room.expiresAt });
    }

    if (expired) return json({ error: "Room expired", code: "expired" }, 410);

    if (url.pathname === "/join" && request.method === "POST") {
      const payload = await request.json<JoinRoomRequest>();
      if (!validAuthProof(payload.authProof) || !validParticipant(payload.participant)) {
        return json({ error: "Invalid join data", code: "bad_request" }, 400);
      }
      if (!verifyProof(room.authVerifier, payload.authProof)) {
        if (this.isRateLimited(rateKey)) return json({ error: "Too many attempts", code: "rate_limited" }, 429);
        return json({ error: "Invalid invite", code: "forbidden" }, 403);
      }
      this.clearAttempts(rateKey);
      this.pruneParticipants(now);
      const existing = this.ctx.storage.sql.exec<{ id: string }>("SELECT id FROM participants WHERE id = ?", payload.participant.id).toArray()[0];
      if (!existing && this.participantCount() >= room.maxParticipants) {
        return json({ error: "Room is full", code: "full" }, 409);
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO participants (id, name, last_seen) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen",
        payload.participant.id,
        payload.participant.name.trim(),
        now,
      );
      const participants = this.ctx.storage.sql.exec<{ id: string; name: string }>(
        "SELECT id, name FROM participants ORDER BY last_seen ASC",
      ).toArray();
      return json({
        roomId: room.roomId,
        expiresAt: room.expiresAt,
        relayUrl: relayAccessUrl(this.env.MOQ_RELAY_URL, this.env.MOQ_RELAY_TOKEN),
        relayRoomId: room.relayRoomId,
        maxParticipants: room.maxParticipants,
        participants,
      });
    }

    if (url.pathname === "/leave" && request.method === "POST") {
      const payload = await request.json<LeaveRoomRequest>();
      if (!validAuthProof(payload.authProof) || typeof payload.participantId !== "string") {
        return json({ error: "Invalid leave data", code: "bad_request" }, 400);
      }
      if (!verifyProof(room.authVerifier, payload.authProof)) return json({ error: "Invalid invite", code: "forbidden" }, 403);
      this.ctx.storage.sql.exec("DELETE FROM participants WHERE id = ?", payload.participantId);
      return new Response(null, { status: 204 });
    }

    return json({ error: "Not found", code: "not_found" }, 404);
  }

  async alarm(): Promise<void> {
    const room = this.room();
    if (!room) return;
    const cleanupAt = room.expiresAt + TOMBSTONE_LIFETIME_MS;
    if (Date.now() >= cleanupAt) {
      await this.ctx.storage.deleteAll();
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM participants");
    await this.ctx.storage.setAlarm(cleanupAt);
  }
}
