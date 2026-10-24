import { constantTimeEqual } from "@press-link-call/shared/crypto";
import type { Participant } from "@press-link-call/shared/room";

export const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,47}$/;
export const AUTH_PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PARTICIPANT_ID_PATTERN = /^p-[a-f0-9]{18}$/;

export function validRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

export function validAuthProof(value: unknown): value is string {
  return typeof value === "string" && AUTH_PROOF_PATTERN.test(value);
}

export function validParticipant(value: unknown): value is Participant {
  if (!value || typeof value !== "object") return false;
  const participant = value as Partial<Participant>;
  return (
    typeof participant.id === "string" &&
    PARTICIPANT_ID_PATTERN.test(participant.id) &&
    typeof participant.name === "string" &&
    participant.name.trim().length > 0 &&
    participant.name.trim().length <= 64
  );
}

export function verifyProof(expected: string, received: string): boolean {
  return constantTimeEqual(expected, received);
}
