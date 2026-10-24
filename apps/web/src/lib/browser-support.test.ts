import { describe, expect, it } from "vitest";
import type { Full as PublishSupport } from "@moq/publish/support";
import type { Full as WatchSupport } from "@moq/watch/support";
import { evaluateBrowserSupport } from "./browser-support-evaluation";

function codec(software: boolean) {
  return { software };
}

function publisher(overrides: Partial<PublishSupport> = {}): PublishSupport {
  return {
    webtransport: "full",
    audio: { capture: true, encoding: { aac: true, opus: "full" } },
    video: {
      capture: "full",
      encoding: { h264: codec(true), h265: codec(false), vp8: codec(true), vp9: codec(false), av1: codec(false) },
    },
    ...overrides,
  };
}

function watcher(overrides: Partial<WatchSupport> = {}): WatchSupport {
  return {
    webtransport: "full",
    audio: { render: true, decoding: { aac: true, opus: "full" } },
    video: {
      render: true,
      decoding: { h264: codec(true), h265: codec(false), vp8: codec(true), vp9: codec(false), av1: codec(false) },
    },
    ...overrides,
  };
}

describe("browser support", () => {
  it("accepts a browser with common audio and video formats", () => {
    expect(evaluateBrowserSupport(publisher(), watcher())).toEqual({ supported: true });
  });

  it("accepts WebSocket fallback when WebTransport is unavailable", () => {
    expect(evaluateBrowserSupport(
      publisher({ webtransport: "none" }),
      watcher({ webtransport: "none" }),
    )).toEqual({ supported: true });
  });

  it("allows an audio-only call when video is unavailable", () => {
    const result = evaluateBrowserSupport(
      publisher({ video: { capture: "none", encoding: undefined } }),
      watcher({ video: { render: false, decoding: undefined } }),
    );
    expect(result.supported).toBe(true);
    expect(result.warning).toContain("Video is unavailable");
  });

  it("rejects a browser without usable audio or video", () => {
    const result = evaluateBrowserSupport(
      publisher({
        audio: { capture: false, encoding: { aac: false, opus: "none" } },
        video: { capture: "none", encoding: undefined },
      }),
      watcher({
        audio: { render: false, decoding: { aac: false, opus: "none" } },
        video: { render: false, decoding: undefined },
      }),
    );
    expect(result.supported).toBe(false);
    expect(result.message).toContain("latest Chrome, Edge, or Safari");
  });
});
