import type { Full as PublishSupport } from "@moq/publish/support";
import type { Full as WatchSupport } from "@moq/watch/support";

const VIDEO_CODECS = ["h264", "h265", "vp8", "vp9", "av1"] as const;

export interface BrowserSupportResult {
  supported: boolean;
  warning?: string;
  message?: string;
}

function hasCommonVideoCodec(publish: PublishSupport, watch: WatchSupport): boolean {
  if (publish.video.capture === "none" || !publish.video.encoding || !watch.video.render || !watch.video.decoding) {
    return false;
  }

  return VIDEO_CODECS.some((codec) => {
    const encoder = publish.video.encoding?.[codec];
    const decoder = watch.video.decoding?.[codec];
    return Boolean((encoder?.software || encoder?.hardware) && (decoder?.software || decoder?.hardware));
  });
}

export function evaluateBrowserSupport(publish: PublishSupport, watch: WatchSupport): BrowserSupportResult {
  const audio = publish.audio.capture
    && publish.audio.encoding.opus !== "none"
    && watch.audio.render
    && watch.audio.decoding.opus !== "none";
  const video = hasCommonVideoCodec(publish, watch);

  if (!audio && !video) {
    return {
      supported: false,
      message: "This browser cannot encode or play the media formats required for this call. Try the latest Chrome, Edge, or Safari.",
    };
  }
  if (!video) return { supported: true, warning: "Video is unavailable in this browser. You can still join with audio." };
  if (!audio) return { supported: true, warning: "Audio is unavailable in this browser. You can still join with video." };
  return { supported: true };
}
