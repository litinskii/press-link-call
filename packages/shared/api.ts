import type { Participant } from "./room";

export interface CreateRoomRequest {
  roomId: string;
  authVerifier: string;
}

export interface CreateRoomResponse {
  roomId: string;
  expiresAt: number;
}

export interface JoinRoomRequest {
  authProof: string;
  participant: Participant;
}

export interface JoinRoomResponse {
  roomId: string;
  expiresAt: number;
  relayUrl: string;
  relayRoomId: string;
  maxParticipants: number;
  participants: Participant[];
}

export interface LeaveRoomRequest {
  authProof: string;
  participantId: string;
}

export interface RoomStatusResponse {
  exists: boolean;
  expired: boolean;
  full: boolean;
  participants: number;
  maxParticipants: number;
  expiresAt?: number;
}

export interface ApiErrorBody {
  error: string;
  code: "bad_request" | "forbidden" | "not_found" | "expired" | "full" | "rate_limited" | "conflict" | "server_error";
}
