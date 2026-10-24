import { describe, expect, it } from "vitest";
import { VIDEO_QUALITY_PROFILES, videoConstraints } from "./video-quality";

describe("video quality profiles", () => {
  it("keeps the saver profile below the balanced and high profiles", () => {
    expect(VIDEO_QUALITY_PROFILES.saver).toEqual({ width: 640, height: 360, frameRate: 24 });
    expect(VIDEO_QUALITY_PROFILES.balanced).toEqual({ width: 960, height: 540, frameRate: 24 });
    expect(VIDEO_QUALITY_PROFILES.high).toEqual({ width: 1280, height: 720, frameRate: 30 });
  });

  it("uses strict maxima so mobile browsers do not capture a larger stream", () => {
    expect(videoConstraints("saver")).toMatchObject({
      width: { ideal: 640, max: 640 },
      height: { ideal: 360, max: 360 },
      frameRate: { ideal: 24, max: 24 },
      facingMode: { ideal: "user" },
    });
  });
});
