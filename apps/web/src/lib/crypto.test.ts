import { describe, expect, it, vi } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  deriveAuthVerifier,
  deriveRoomKeys,
  generateMasterSecret,
} from "@press-link-call/shared/crypto";
import { isRoomExpired, MAX_PARTICIPANTS, ROOM_LIFETIME_MS } from "@press-link-call/shared/room";

describe("room cryptography", () => {
  it("encodes and decodes base64url without padding", () => {
    const input = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    const encoded = base64UrlEncode(input);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(encoded)).toEqual(input);
  });

  it("generates a 256-bit master secret", () => {
    const realCrypto = crypto;
    vi.stubGlobal("crypto", { ...realCrypto, getRandomValues: (bytes: Uint8Array) => bytes.fill(9), subtle: realCrypto.subtle });
    const secret = generateMasterSecret();
    expect(base64UrlDecode(secret)).toHaveLength(32);
    expect(secret).toHaveLength(43);
    vi.unstubAllGlobals();
  });

  it("derives separate deterministic auth and media keys with HKDF", async () => {
    const secret = base64UrlEncode(Uint8Array.from({ length: 32 }, (_, index) => index));
    const first = await deriveRoomKeys(secret, "room-example");
    const second = await deriveRoomKeys(secret, "room-example");
    expect(first.authKey).toEqual(second.authKey);
    expect(first.mediaKey).toEqual(second.mediaKey);
    expect(first.authKey).not.toEqual(first.mediaKey);
    expect(await deriveAuthVerifier(first.authKey)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("compares authentication proofs without an early equality return", () => {
    expect(constantTimeEqual("same-proof", "same-proof")).toBe(true);
    expect(constantTimeEqual("same-proof", "other-proof")).toBe(false);
    expect(constantTimeEqual("short", "shorter")).toBe(false);
  });
});

describe("room constraints", () => {
  it("keeps the participant limit at ten", () => {
    expect(MAX_PARTICIPANTS).toBe(10);
  });

  it("expires rooms at the configured timestamp", () => {
    expect(ROOM_LIFETIME_MS).toBe(12 * 60 * 60 * 1000);
    expect(isRoomExpired(1_000, 999)).toBe(false);
    expect(isRoomExpired(1_000, 1_000)).toBe(true);
  });
});
