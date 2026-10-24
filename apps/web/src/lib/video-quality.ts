export type VideoQuality = "saver" | "balanced" | "high";

export interface VideoQualityProfile {
  width: number;
  height: number;
  frameRate: number;
}

export const VIDEO_QUALITY_PROFILES: Record<VideoQuality, VideoQualityProfile> = {
  saver: { width: 640, height: 360, frameRate: 24 },
  balanced: { width: 960, height: 540, frameRate: 24 },
  high: { width: 1280, height: 720, frameRate: 30 },
};

export function videoConstraints(quality: VideoQuality): MediaTrackConstraints {
  const profile = VIDEO_QUALITY_PROFILES[quality];
  return {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    facingMode: { ideal: "user" },
  };
}
