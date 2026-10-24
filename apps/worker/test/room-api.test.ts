import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { JoinRoomResponse, RoomStatusResponse } from "@press-link-call/shared/api";
import { MAX_PARTICIPANTS, ROOM_LIFETIME_MS } from "@press-link-call/shared/room";
import { relayAccessUrl, RoomDurableObject } from "../src/durable-object";
import { shouldNoIndexPath } from "../src/index";

const ROOM_ID = "room-integration-test";
const AUTH_PROOF = "A".repeat(43);

function participant(index: number) {
  return {
    id: `p-${index.toString(16).padStart(18, "0")}`,
    name: `Guest ${index}`,
  };
}

function request(path: string, method = "GET", payload?: unknown): Request {
  return new Request(`https://room.internal${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Rate-Key": "integration-test" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

describe("room Durable Object endpoints", () => {
  it("keeps private call routes out of search indexes", () => {
    expect(shouldNoIndexPath("/")).toBe(false);
    expect(shouldNoIndexPath("/robots.txt")).toBe(false);
    expect(shouldNoIndexPath("/r/room-example")).toBe(true);
    expect(shouldNoIndexPath("/call-ended")).toBe(true);
  });

  it("places the Cloudflare access token in the relay URL path", () => {
    expect(relayAccessUrl("https://draft-16.cloudflare.mediaoverquic.com", "header.payload/signature")).toBe(
      "https://draft-16.cloudflare.mediaoverquic.com/header.payload%2Fsignature",
    );
  });

  it("creates a temporary room without storing the invite master secret", async () => {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(ROOM_ID));
    const response = await stub.fetch(request("/create", "POST", { roomId: ROOM_ID, authVerifier: AUTH_PROOF }));
    expect(response.status).toBe(201);
    const created = await response.json<{ roomId: string; expiresAt: number }>();
    expect(created.roomId).toBe(ROOM_ID);
    expect(created.expiresAt).toBeGreaterThan(Date.now() + ROOM_LIFETIME_MS - 5_000);
    expect(created.expiresAt).toBeLessThanOrEqual(Date.now() + ROOM_LIFETIME_MS);

    await runInDurableObject(stub, async (instance, state) => {
      expect(instance).toBeInstanceOf(RoomDurableObject);
      const row = state.storage.sql.exec<{ auth_verifier: string; relay_room_id: string }>(
        "SELECT auth_verifier, relay_room_id FROM room WHERE singleton = 1",
      ).one();
      expect(row.auth_verifier).toBe(AUTH_PROOF);
      expect(row.relay_room_id).not.toContain(AUTH_PROOF);
      expect(state.storage.sql.databaseSize).toBeGreaterThan(0);
    });
  });

  it("rejects invalid proofs and atomically enforces the participant limit", async () => {
    const roomId = "room-capacity-test";
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    await stub.fetch(request("/create", "POST", { roomId, authVerifier: AUTH_PROOF }));

    const denied = await stub.fetch(request("/join", "POST", { authProof: "B".repeat(43), participant: participant(1) }));
    expect(denied.status).toBe(403);

    for (let index = 1; index <= MAX_PARTICIPANTS; index += 1) {
      const joined = await stub.fetch(request("/join", "POST", { authProof: AUTH_PROOF, participant: participant(index) }));
      expect(joined.status).toBe(200);
      const body = await joined.json<JoinRoomResponse>();
      expect(body.relayUrl).toBe("https://draft-16.cloudflare.mediaoverquic.com");
      expect(body.relayRoomId).not.toBe(roomId);
      expect(body.participants).toEqual(Array.from({ length: index }, (_, participantIndex) => participant(participantIndex + 1)));
    }

    const replacementIndex = MAX_PARTICIPANTS + 1;
    const full = await stub.fetch(request("/join", "POST", { authProof: AUTH_PROOF, participant: participant(replacementIndex) }));
    expect(full.status).toBe(409);
    expect((await full.json<{ code: string }>()).code).toBe("full");

    const status = await stub.fetch(request("/status"));
    const statusBody = await status.json<RoomStatusResponse>();
    expect(statusBody).toMatchObject({ exists: true, expired: false, full: true, participants: MAX_PARTICIPANTS, maxParticipants: MAX_PARTICIPANTS });

    const left = await stub.fetch(request("/leave", "POST", { authProof: AUTH_PROOF, participantId: participant(1).id }));
    expect(left.status).toBe(204);
    const replacement = await stub.fetch(request("/join", "POST", { authProof: AUTH_PROOF, participant: participant(replacementIndex) }));
    expect(replacement.status).toBe(200);
  });

  it("rate-limits excessive room creation per client", async () => {
    const stub = env.RATE_LIMITS.get(env.RATE_LIMITS.idFromName("client-rate-test"));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await stub.fetch(new Request("https://rate-limit.internal/room-create", { method: "POST" }))).status).toBe(204);
    }
    const limited = await stub.fetch(new Request("https://rate-limit.internal/room-create", { method: "POST" }));
    expect(limited.status).toBe(429);
    expect((await limited.json<{ code: string }>()).code).toBe("rate_limited");
  });
});
