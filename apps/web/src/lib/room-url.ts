import { base64UrlDecode } from "@press-link-call/shared/crypto";

const SAFE_SEGMENT = /[^a-z0-9-]+/g;

export const DEFAULT_RELAY_URL = "https://cdn.moq.dev/anon";

function randomToken(byteLength = 6): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(SAFE_SEGMENT, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalized || fallback;
}

export function createRoomId(): string {
  return `room-${randomToken(9)}`;
}

export function createParticipantId(): string {
  return `p-${randomToken(9)}`;
}

export function createGuestName(prefix = "Guest"): string {
  return `${prefix} ${randomToken(2).toUpperCase()}`;
}

export function roomIdFromPathname(pathname: string): string | undefined {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (!match) return undefined;

  try {
    const decoded = decodeURIComponent(match[1]);
    const normalized = normalizeSegment(decoded, "");
    return normalized || undefined;
  } catch {
    return undefined;
  }
}

export function roomPath(roomId: string): string {
  return `/r/${normalizeSegment(roomId, "demo")}`;
}

export function relayRoomUrl(relayUrl: string): URL {
  const relay = new URL(relayUrl.trim());
  relay.hash = "";
  return relay;
}

export function relayRoomPrefix(roomId: string): string {
  return `press-link-call/${normalizeSegment(roomId, "demo")}`;
}

export function inviteSecretFromHash(hash: string): string | undefined {
  const secret = new URLSearchParams(hash.replace(/^#/, "")).get("k") ?? "";
  try {
    return base64UrlDecode(secret).length === 32 ? secret : undefined;
  } catch {
    return undefined;
  }
}

export function inviteUrl(roomId: string, masterSecret: string, baseUrl = window.location.href): string {
  const url = new URL(roomPath(roomId), baseUrl);
  url.search = "";
  url.hash = new URLSearchParams({ k: masterSecret }).toString();
  return url.toString();
}
