import { describe, expect, it } from "vitest";
import { isSafariFamily } from "./browser-platform";

describe("Safari-family browser detection", () => {
  it("detects Safari on iPhone", () => {
    expect(isSafariFamily({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it("detects iPadOS when it identifies as macOS", () => {
    expect(isSafariFamily({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it("does not classify desktop Chrome as Safari", () => {
    expect(isSafariFamily({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0,
    })).toBe(false);
  });
});
