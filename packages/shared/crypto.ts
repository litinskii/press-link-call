const encoder = new TextEncoder();

function bytesToBinary(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function generateMasterSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export interface DerivedRoomKeys {
  authKey: Uint8Array;
  mediaKey: Uint8Array;
}

async function deriveKeyMaterial(masterSecret: string, roomId: string, info: string): Promise<Uint8Array> {
  const secret = base64UrlDecode(masterSecret);
  const rawSecret = secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey("raw", rawSecret, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`press-link-call:${roomId}`),
      info: encoder.encode(info),
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export async function deriveRoomKeys(masterSecret: string, roomId: string): Promise<DerivedRoomKeys> {
  const [authKey, mediaKey] = await Promise.all([
    deriveKeyMaterial(masterSecret, roomId, "auth-key-v1"),
    deriveKeyMaterial(masterSecret, roomId, "media-key-v1"),
  ]);
  return { authKey, mediaKey };
}

export async function deriveAuthVerifier(authKey: Uint8Array): Promise<string> {
  const context = encoder.encode("press-link-call:auth-verifier-v1");
  const payload = new Uint8Array(context.length + authKey.length);
  payload.set(context);
  payload.set(authKey, context.length);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", payload)));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export interface MediaEncryptionProvider {
  encrypt(data: Uint8Array): Promise<Uint8Array>;
  decrypt(data: Uint8Array): Promise<Uint8Array>;
}
