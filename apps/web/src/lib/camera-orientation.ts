import { type Local, Publish } from "@moq/room";
import { Signal } from "@moq/signals";
import { isSafariFamily } from "./browser-platform";

type CameraMedia = ReturnType<Local["webcam"]["out"]["source"]["peek"]>;

function mediaTrack(source: Publish.Video.Source | undefined): MediaStreamTrack | undefined {
  if (!source || "frames" in source) return undefined;
  return "track" in source ? source.track : source;
}

function orientedFrames(track: MediaStreamTrack): Publish.Video.FrameSource {
  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);

  let callbackId: number | undefined;
  let cancelled = false;
  const ready = Promise.all([
    video.play(),
    video.readyState >= HTMLMediaElement.HAVE_METADATA
      ? Promise.resolve()
      : new Promise<void>((resolve) => video.addEventListener("loadedmetadata", () => resolve(), { once: true })),
  ]);

  const frames = new ReadableStream<VideoFrame>({
    async pull(controller) {
      await ready;
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        callbackId = video.requestVideoFrameCallback(() => {
          callbackId = undefined;
          if (!cancelled) {
            controller.enqueue(new VideoFrame(video, { timestamp: Math.round(performance.now() * 1_000) }));
          }
          resolve();
        });
      });
    },
    cancel() {
      cancelled = true;
      if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
      video.srcObject = null;
    },
  });

  return { frames, frameRate: track.getSettings().frameRate };
}

export interface CameraOrientationAdapter {
  track: Signal<MediaStreamTrack | undefined>;
  close: () => void;
}

/**
 * Safari exposes camera frames with rotation metadata that the current MoQ
 * publisher drops while encoding. Re-sampling the native video element bakes
 * the orientation into the pixels before the frames reach the encoder.
 */
export function adaptCameraOrientation(local: Local): CameraOrientationAdapter {
  const track = new Signal<MediaStreamTrack | undefined>(undefined);
  const source = local.webcam.out.source as Signal<CameraMedia>;
  const normalize = isSafariFamily();
  let rawTrack: MediaStreamTrack | undefined;

  const update = (media: CameraMedia) => {
    const nextTrack = mediaTrack(media?.video);
    if (!nextTrack || nextTrack === rawTrack) {
      if (!media) {
        rawTrack = undefined;
        track.set(undefined);
      }
      return;
    }

    rawTrack = nextTrack;
    track.set(nextTrack);
    if (normalize) source.set({ ...media, video: orientedFrames(nextTrack) });
  };

  update(source.peek());
  const unsubscribe = source.subscribe(update);

  return {
    track,
    close: () => {
      unsubscribe();
      track.set(undefined);
    },
  };
}
