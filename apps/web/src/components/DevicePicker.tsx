import { useCallback, useEffect, useRef, useState } from "react";
import { useValue } from "@moq/signals/react";
import type { MoqSession } from "../lib/moq-session";
import { usePreferences } from "../lib/preferences";
import { VIDEO_QUALITY_PROFILES, videoConstraints, type VideoQuality } from "../lib/video-quality";
import { CameraIcon, MicIcon, SettingsIcon } from "./icons";

export interface DeviceSelection {
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
}

interface PreviewResult {
  key: string;
  error?: string;
  video: boolean;
}

interface DeviceSelectProps {
  label: string;
  devices: MediaDeviceInfo[];
  value?: string;
  onChange: (deviceId: string | undefined) => void;
}

function deviceLabel(device: MediaDeviceInfo, index: number, label: string): string {
  return device.label || `${label} ${index + 1}`;
}

function DeviceSelect({ label, devices, value, onChange }: DeviceSelectProps) {
  const { t } = usePreferences();
  return (
    <label className="device-field">
      <span>{label}</span>
      <select aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">{t("systemDefault")}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId || `${label}-${index}`} value={device.deviceId}>
            {deviceLabel(device, index, label)}
          </option>
        ))}
      </select>
    </label>
  );
}

function QualitySelect() {
  const { setVideoQuality, t, videoQuality } = usePreferences();
  const options: Array<{ value: VideoQuality; label: string }> = [
    { value: "saver", label: t("qualitySaver") },
    { value: "balanced", label: t("qualityBalanced") },
    { value: "high", label: t("qualityHigh") },
  ];

  return (
    <label className="device-field">
      <span>{t("videoQuality")}</span>
      <select
        aria-label={t("videoQuality")}
        value={videoQuality}
        onChange={(event) => setVideoQuality(event.target.value as VideoQuality)}
      >
        {options.map(({ value, label }) => {
          const profile = VIDEO_QUALITY_PROFILES[value];
          return <option key={value} value={value}>{label} · {profile.height}p/{profile.frameRate}</option>;
        })}
      </select>
    </label>
  );
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function mediaErrorMessage(error: unknown, t: ReturnType<typeof usePreferences>["t"]): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return t("permissionDenied");
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return t("selectedDeviceUnavailable");
    }
    if (error.name === "NotReadableError" || error.name === "AbortError") {
      return t("deviceBusy");
    }
  }
  return t("mediaAccessFailed");
}

export function PreJoinPreview({
  cameraEnabled,
  microphoneEnabled,
  selection,
}: {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  selection: DeviceSelection;
}) {
  const { t, videoQuality } = usePreferences();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<PreviewResult>();
  const requestKey = [cameraEnabled, microphoneEnabled, selection.cameraDeviceId, selection.microphoneDeviceId, videoQuality].join(":");
  const enabled = cameraEnabled || microphoneEnabled;
  const current = result?.key === requestKey ? result : undefined;

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled) {
      if (video) video.srcObject = null;
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) return;

    let active = true;
    let stream: MediaStream | undefined;
    void mediaDevices.getUserMedia({
      video: cameraEnabled ? {
        ...videoConstraints(videoQuality),
        deviceId: selection.cameraDeviceId ? { exact: selection.cameraDeviceId } : undefined,
      } : false,
      audio: microphoneEnabled ? {
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        deviceId: selection.microphoneDeviceId ? { exact: selection.microphoneDeviceId } : undefined,
      } : false,
    }).then((captured) => {
      if (!active) return stopStream(captured);
      stream = captured;
      if (video) video.srcObject = captured;
      setResult({ key: requestKey, video: captured.getVideoTracks().length > 0 });
    }).catch((error: unknown) => {
      if (active) setResult({ key: requestKey, error: mediaErrorMessage(error, t), video: false });
    });

    return () => {
      active = false;
      if (video && video.srcObject === stream) video.srcObject = null;
      if (stream) stopStream(stream);
    };
  }, [cameraEnabled, enabled, microphoneEnabled, requestKey, selection.cameraDeviceId, selection.microphoneDeviceId, t, videoQuality]);

  return (
    <div className={`prejoin-preview ${cameraEnabled && current?.video ? "live" : "idle"}`} aria-live="polite">
      <video ref={videoRef} autoPlay muted playsInline aria-label={t("cameraPreview")} />
      {!cameraEnabled && <div className="preview-placeholder"><CameraIcon /><span>{t("cameraOff")}</span></div>}
      {cameraEnabled && !current && <div className="preview-placeholder"><span className="preview-spinner" /><span>{t("startingCamera")}</span></div>}
      {cameraEnabled && current?.error && <div className="preview-placeholder preview-failed"><CameraIcon /><span>{current.error}</span></div>}
    </div>
  );
}

export function PreJoinDevicePicker({
  selection,
  onChange,
}: {
  selection: DeviceSelection;
  onChange: (selection: DeviceSelection) => void;
}) {
  const { t } = usePreferences();
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      setError(t("devicesUnavailable"));
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const devices = await mediaDevices.enumerateDevices();
      setCameras(devices.filter((device) => device.kind === "videoinput"));
      setMicrophones(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      setError(t("devicesReadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    const onDeviceChange = () => void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
  }, [refresh]);

  return (
    <details className="prejoin-devices" onToggle={(event) => {
      if (event.currentTarget.open) void refresh();
    }}>
      <summary><SettingsIcon /> {t("chooseDevices")}</summary>
      <div className="device-fields">
        <DeviceSelect
          label={t("camera")}
          devices={cameras}
          value={selection.cameraDeviceId}
          onChange={(cameraDeviceId) => onChange({ ...selection, cameraDeviceId })}
        />
        <QualitySelect />
        <DeviceSelect
          label={t("microphone")}
          devices={microphones}
          value={selection.microphoneDeviceId}
          onChange={(microphoneDeviceId) => onChange({ ...selection, microphoneDeviceId })}
        />
      </div>
      {loading && <p className="device-note">{t("checkingDevices")}</p>}
      {error && <p className="device-error" role="alert">{error}</p>}
    </details>
  );
}

export function InCallDevicePicker({ session }: { session: MoqSession }) {
  const { t, videoQuality } = usePreferences();
  const cameras = useValue(session.local.webcam.device.out.available) ?? [];
  const microphones = useValue(session.local.microphone.device.out.available) ?? [];
  const cameraDeviceId = useValue(session.local.webcam.device.out.requested);
  const microphoneDeviceId = useValue(session.local.microphone.device.out.requested);
  const cameraEnabled = useValue(session.local.cameraEnabled);
  const microphoneEnabled = useValue(session.local.microphoneEnabled);
  const cameraSource = useValue(session.local.webcam.out.source);
  const microphoneSource = useValue(session.local.microphone.out.source);

  useEffect(() => {
    session.local.webcam.constraints.set(videoConstraints(videoQuality));
  }, [session, videoQuality]);

  function retryCamera() {
    session.local.cameraEnabled.set(false);
    window.setTimeout(() => session.local.cameraEnabled.set(true), 0);
  }

  function retryMicrophone() {
    session.local.microphoneEnabled.set(false);
    window.setTimeout(() => session.local.microphoneEnabled.set(true), 0);
  }

  return (
    <details className="in-call-devices">
      <summary className="control-button active"><SettingsIcon /><span>{t("devices")}</span></summary>
      <div className="device-popover">
        <h3>{t("devices")}</h3>
        <DeviceSelect
          label={t("camera")}
          devices={cameras}
          value={cameraDeviceId}
          onChange={(deviceId) => session.local.webcam.device.preferred.set(deviceId)}
        />
        <QualitySelect />
        <DeviceSelect
          label={t("microphone")}
          devices={microphones}
          value={microphoneDeviceId}
          onChange={(deviceId) => session.local.microphone.device.preferred.set(deviceId)}
        />
        {cameraEnabled && !cameraSource?.video && (
          <button className="device-retry" type="button" onClick={retryCamera}><CameraIcon /> {t("retryCamera")}</button>
        )}
        {microphoneEnabled && !microphoneSource?.audio && (
          <button className="device-retry" type="button" onClick={retryMicrophone}><MicIcon /> {t("retryMicrophone")}</button>
        )}
      </div>
    </details>
  );
}
