import { describe, expect, it, vi } from "vitest";
import { createRoomId, inviteSecretFromHash, inviteUrl, normalizeSegment, relayRoomPrefix, relayRoomUrl, roomIdFromPathname, roomPath } from "./room-url";

describe("room URL helpers", () => {
  it("normalizes a room into one safe MoQ path segment", () => {
    expect(normalizeSegment("  Product Demo / 42  ", "fallback")).toBe("product-demo-42");
  });

  it("keeps relay credentials separate from the isolated room prefix", () => {
    expect(relayRoomUrl("https://relay.example/token#ignored").toString()).toBe("https://relay.example/token");
    expect(relayRoomPrefix("Team A")).toBe("press-link-call/team-a");
  });

  it("reads a room from the product route", () => {
    expect(roomIdFromPathname("/r/Design%20Review")).toBe("design-review");
    expect(roomIdFromPathname("/call-ended")).toBeUndefined();
  });

  it("creates a high-entropy public room id", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    expect(createRoomId()).toBe("room-070707070707070707");
    vi.unstubAllGlobals();
  });

  it("generates clean room paths and invite URLs", () => {
    const secret = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";
    expect(roomPath("Team A")).toBe("/r/team-a");
    expect(inviteUrl("Team A", secret, "https://press-link-call.example/old?secret=no#fragment")).toBe(
      `https://press-link-call.example/r/team-a#k=${secret}`,
    );
    expect(inviteSecretFromHash(`#k=${secret}`)).toBe(secret);
    expect(inviteSecretFromHash("#k=too-short")).toBeUndefined();
  });
});
