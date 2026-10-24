import type { CreateRoomRequest, JoinRoomRequest, LeaveRoomRequest } from "@press-link-call/shared/api";
import { validAuthProof, validParticipant, validRoomId } from "./auth";

export { RoomDurableObject } from "./durable-object";
export { RateLimitDurableObject } from "./rate-limit";

const API_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, code: string, status: number): Response {
  return Response.json({ error, code }, { status, headers: API_HEADERS });
}

async function body<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 4096) throw new Error("Body too large");
  const text = await request.text();
  if (text.length > 4096) throw new Error("Body too large");
  return JSON.parse(text) as T;
}

function roomIdFromApiPath(pathname: string): { roomId: string; action: "status" | "join" | "leave" } | undefined {
  const match = /^\/api\/rooms\/([^/]+)(?:\/(join|leave))?$/.exec(pathname);
  if (!match) return undefined;
  try {
    const roomId = decodeURIComponent(match[1]);
    if (!validRoomId(roomId)) return undefined;
    return { roomId, action: (match[2] as "join" | "leave" | undefined) ?? "status" };
  } catch {
    return undefined;
  }
}

async function rateKey(request: Request): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function forwardToRoom(env: Env, roomId: string, action: string, request: Request, payload?: unknown): Promise<Response> {
  const id = env.ROOMS.idFromName(roomId);
  const stub = env.ROOMS.get(id);
  const headers = new Headers({ "X-Rate-Key": await rateKey(request) });
  if (payload !== undefined) headers.set("Content-Type", "application/json");
  return stub.fetch(new Request(`https://room.internal/${action}`, {
    method: request.method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }));
}

async function enforceCreationRateLimit(env: Env, request: Request): Promise<Response | undefined> {
  const key = await rateKey(request);
  const id = env.RATE_LIMITS.idFromName(key);
  const response = await env.RATE_LIMITS.get(id).fetch(new Request("https://rate-limit.internal/room-create", { method: "POST" }));
  return response.ok ? undefined : response;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return errorResponse("Cross-origin request denied", "forbidden", 403);

  try {
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const payload = await body<CreateRoomRequest>(request);
      if (!validRoomId(payload.roomId) || !validAuthProof(payload.authVerifier)) {
        return errorResponse("Invalid room data", "bad_request", 400);
      }
      const limited = await enforceCreationRateLimit(env, request);
      if (limited) return limited;
      return forwardToRoom(env, payload.roomId, "create", request, payload);
    }

    const route = roomIdFromApiPath(url.pathname);
    if (!route) return errorResponse("Not found", "not_found", 404);

    if (route.action === "status" && request.method === "GET") {
      return forwardToRoom(env, route.roomId, "status", request);
    }
    if (route.action === "join" && request.method === "POST") {
      const payload = await body<JoinRoomRequest>(request);
      if (!validAuthProof(payload.authProof) || !validParticipant(payload.participant)) {
        return errorResponse("Invalid join data", "bad_request", 400);
      }
      return forwardToRoom(env, route.roomId, "join", request, payload);
    }
    if (route.action === "leave" && request.method === "POST") {
      const payload = await body<LeaveRoomRequest>(request);
      if (!validAuthProof(payload.authProof) || typeof payload.participantId !== "string") {
        return errorResponse("Invalid leave data", "bad_request", 400);
      }
      return forwardToRoom(env, route.roomId, "leave", request, payload);
    }
    return errorResponse("Method not allowed", "not_found", 405);
  } catch {
    return errorResponse("Invalid JSON body", "bad_request", 400);
  }
}

export function shouldNoIndexPath(pathname: string): boolean {
  return pathname === "/call-ended" || pathname === "/r" || pathname.startsWith("/r/");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    const response = await env.ASSETS.fetch(request);
    if (!shouldNoIndexPath(url.pathname)) return response;

    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
