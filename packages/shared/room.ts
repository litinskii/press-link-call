export const MAX_PARTICIPANTS = 10;
export const ROOM_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const PARTICIPANT_LEASE_MS = 2 * 60 * 1000;

export interface Participant {
  id: string;
  name: string;
}

export interface RoomRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  authVerifier: string;
  maxParticipants: typeof MAX_PARTICIPANTS;
}

export function isRoomExpired(expiresAt: number, now = Date.now()): boolean {
  return now >= expiresAt;
}
