export interface StoredRoom {
  roomId: string;
  createdAt: number;
  expiresAt: number;
  authVerifier: string;
  relayRoomId: string;
  maxParticipants: number;
}

export interface StoredParticipant {
  id: string;
  name: string;
  lastSeen: number;
}
