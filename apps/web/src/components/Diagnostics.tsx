import { useEffect, useState } from "react";
import { Signals } from "@moq/room";
import type { MoqSession } from "../lib/moq-session";

interface Snapshot {
  status: string;
  error?: string;
  transport: string;
  participants: number;
  camera: boolean;
  capture: string;
  microphone: boolean;
  screen: boolean;
  videoCodec: string;
  audioCodec: string;
  rtt?: number;
  sendRate?: number;
  bytesReceived?: number;
}

const EMPTY: Snapshot = {
  status: "disconnected",
  transport: "—",
  participants: 0,
  camera: false,
  capture: "—",
  microphone: false,
  screen: false,
  videoCodec: "waiting for stream",
  audioCodec: "waiting for stream",
};

function formatRate(bits?: number): string {
  if (bits === undefined) return "—";
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bits / 1_000)} Kbps`;
}

export function Diagnostics({ session }: { session: MoqSession }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);

  useEffect(() => {
    let active = true;
    const effect = new Signals.Effect((scope) => {
      const remotes = scope.get(session.room.remotes);
      let videoCodec = "waiting for stream";
      let audioCodec = "waiting for stream";

      for (const remote of remotes.values()) {
        const member = scope.get(remote.camera);
        if (!member) continue;
        const video = scope.get(member.video.source.out.config);
        const audio = scope.get(member.audio.source.out.config);
        if (video) videoCodec = video.codec;
        if (audio) audioCodec = `${audio.codec} · ${audio.sampleRate / 1000} kHz`;
      }

      const localCamera = scope.get(session.local.webcam.out.source);
      const localMicrophone = scope.get(session.local.microphone.out.source);
      const localScreen = scope.get(session.local.share.out.source);
      const probe = scope.get(session.connection.probe);
      const error = scope.get(session.connection.error);
      const cameraSettings = scope.get(session.localCameraTrack)?.getSettings();
      const capture = cameraSettings?.width && cameraSettings.height
        ? `${cameraSettings.width}×${cameraSettings.height}${cameraSettings.frameRate ? ` · ${Math.round(cameraSettings.frameRate)} fps` : ""}`
        : "—";

      setSnapshot((previous) => ({
        ...previous,
        status: scope.get(session.connection.status),
        error: error?.message,
        transport: scope.get(session.connection.transport) ?? "—",
        participants: remotes.size + 1,
        camera: Boolean(localCamera?.video),
        capture,
        microphone: Boolean(localMicrophone?.audio),
        screen: Boolean(localScreen?.video || localScreen?.audio),
        videoCodec,
        audioCodec,
        rtt: probe?.rtt,
        sendRate: probe?.estimatedRecvRate,
      }));
    });

    const poll = window.setInterval(() => {
      void session.connection.stats().then((stats) => {
        if (!active || !stats) return;
        setSnapshot((previous) => ({
          ...previous,
          rtt: stats.rtt ?? previous.rtt,
          sendRate: stats.estimatedSendRate ?? previous.sendRate,
          bytesReceived: stats.bytesReceived,
        }));
      });
    }, 1500);

    return () => {
      active = false;
      window.clearInterval(poll);
      effect.close();
    };
  }, [session]);

  return (
    <details className="diagnostics" open>
      <summary>Connection diagnostics</summary>
      <dl>
        <div><dt>Room ID</dt><dd>{session.roomUrl.pathname.split("/").at(-1)}</dd></div>
        <div><dt>Participant ID</dt><dd>{session.participantId}</dd></div>
        <div><dt>Status</dt><dd className={`state-${snapshot.status}`}>{snapshot.status}</dd></div>
        <div><dt>Transport</dt><dd>{snapshot.transport}</dd></div>
        <div><dt>Participants</dt><dd>{snapshot.participants}</dd></div>
        <div><dt>Camera / mic</dt><dd>{snapshot.camera ? "on" : "off"} / {snapshot.microphone ? "on" : "off"}</dd></div>
        <div><dt>Capture</dt><dd>{snapshot.capture}</dd></div>
        <div><dt>Screen share</dt><dd>{snapshot.screen ? "on" : "off"}</dd></div>
        <div><dt>Video</dt><dd>{snapshot.videoCodec}</dd></div>
        <div><dt>Audio</dt><dd>{snapshot.audioCodec}</dd></div>
        <div><dt>RTT</dt><dd>{snapshot.rtt === undefined ? "—" : `${Math.round(snapshot.rtt)} ms`}</dd></div>
        <div><dt>Send rate</dt><dd>{formatRate(snapshot.sendRate)}</dd></div>
        <div><dt>Received</dt><dd>{snapshot.bytesReceived === undefined ? "—" : `${Math.round(snapshot.bytesReceived / 1024)} KB`}</dd></div>
      </dl>
      {snapshot.error && <p className="diagnostic-error">{snapshot.error}</p>}
    </details>
  );
}
