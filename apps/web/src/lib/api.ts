import type {
  ApiErrorBody,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  LeaveRoomRequest,
  RoomStatusResponse,
} from "@press-link-call/shared/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorBody["code"],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const fallback: ApiErrorBody = { error: "Request failed", code: "server_error" };
    const body = await response.json().catch(() => fallback) as ApiErrorBody;
    throw new ApiError(body.error, response.status, body.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createRoom(payload: CreateRoomRequest): Promise<CreateRoomResponse> {
  return api("/api/rooms", { method: "POST", body: JSON.stringify(payload) });
}

export function getRoomStatus(roomId: string, signal?: AbortSignal): Promise<RoomStatusResponse> {
  return api(`/api/rooms/${encodeURIComponent(roomId)}`, { signal });
}

export function joinRoom(roomId: string, payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  return api(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST", body: JSON.stringify(payload) });
}

export function leaveRoom(roomId: string, payload: LeaveRoomRequest, keepalive = false): Promise<void> {
  return api(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
    body: JSON.stringify(payload),
    keepalive,
  });
}
