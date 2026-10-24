import { useEffect, useRef, useState } from "react";
import { useValue } from "@moq/signals/react";
import { InCallDevicePicker } from "./DevicePicker";
import { Diagnostics } from "./Diagnostics";
import { Brand, PreferencesControls } from "./AppChrome";
import { CameraIcon, CopyIcon, LeaveIcon, MicIcon, ScreenIcon, ShareIcon } from "./icons";
import { MediaTiles } from "./MediaTiles";
import { ParticipantCounter, ParticipantRoster } from "./ParticipantRoster";
import { isSafariFamily } from "../lib/browser-platform";
import type { MoqSession } from "../lib/moq-session";
import { usePreferences } from "../lib/preferences";

function ConnectionPill({ session }: { session: MoqSession }) {
  const { t } = usePreferences();
  const status = useValue(session.connection.status);
  const error = useValue(session.connection.error);
  const connectedOnce = useValue(session.connectedOnce);
  const label = status !== "connected" && connectedOnce && !error
    ? t("reconnecting")
    : { connecting: t("connecting"), connected: t("ready"), disconnected: t("offline") }[status];
  return <span className={`connection-pill ${status}`}><i /><span>{label}</span></span>;
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function ConnectionRecovery({ session, onLeave }: { session: MoqSession; onLeave: () => void }) {
  const { t } = usePreferences();
  const status = useValue(session.connection.status);
  const error = useValue(session.connection.error);
  const online = useOnlineStatus();
  const connectedOnce = useValue(session.connectedOnce);
  const [slowInitialSession, setSlowInitialSession] = useState<MoqSession>();

  useEffect(() => {
    if (connectedOnce || status === "connected" || error) return;
    const timer = window.setTimeout(() => setSlowInitialSession(session), 10_000);
    return () => window.clearTimeout(timer);
  }, [connectedOnce, error, session, status]);

  const reconnecting = online && !error && connectedOnce && status !== "connected";
  const lost = !online || Boolean(error);
  const waiting = online && !error && !connectedOnce && slowInitialSession === session;
  if (!reconnecting && !lost && !waiting) return null;

  const title = reconnecting ? t("reconnectingTitle") : waiting ? t("stillConnecting") : t("connectionLost");
  const message = reconnecting
    ? t("mediaWillResume")
    : waiting
      ? t("secureMediaSlow")
      : isSafariFamily()
        ? t("safariTransportError")
        : t("connectionError");

  function reconnect() {
    session.connection.enabled.set(false);
    window.setTimeout(() => session.connection.enabled.set(true), 50);
  }

  return (
    <aside className="connection-recovery" role="status" aria-live="polite">
      <span className={reconnecting || waiting ? "recovery-spinner" : "recovery-offline"} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {lost && (
        <div className="recovery-actions">
          <button type="button" onClick={reconnect} disabled={!online}>{t("reconnect")}</button>
          <button type="button" onClick={onLeave}>{t("leave")}</button>
        </div>
      )}
    </aside>
  );
}

function ToggleButton({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`control-button ${on ? "active" : "inactive"}`} type="button" onClick={onClick} aria-pressed={on}>
      {children}
      <span>{label}</span>
    </button>
  );
}

export default function CallView({ session, invite, onLeave }: { session: MoqSession; invite: string; onLeave: () => void }) {
  const { t } = usePreferences();
  const cameraOn = useValue(session.local.cameraEnabled);
  const microphoneOn = useValue(session.local.microphoneEnabled);
  const screenRequested = useValue(session.local.screenEnabled);
  const screenSource = useValue(session.local.share.out.source);
  const [copied, setCopied] = useState(false);
  const [screenError, setScreenError] = useState<string>();
  const screenAttemptRef = useRef<(() => void) | null>(null);

  const screenOn = Boolean(screenSource);

  useEffect(() => () => screenAttemptRef.current?.(), []);

  async function copyInvite() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(invite);
    } catch {
      const input = document.createElement("textarea");
      try {
        input.value = invite;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
      } finally {
        input.remove();
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareInvite() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "press-link-call", text: t("shareInviteText"), url: invite });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyInvite();
  }

  function toggleScreenShare() {
    setScreenError(undefined);
    if (screenRequested || screenOn) {
      screenAttemptRef.current?.();
      screenAttemptRef.current = null;
      session.local.screenEnabled.set(false);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenError(t("screenUnsupported"));
      return;
    }

    let focusTimer: number | undefined;
    let unsubscribe: () => void = () => undefined;
    const finishAttempt = () => {
      window.removeEventListener("focus", handleFocus);
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      unsubscribe();
      if (screenAttemptRef.current === finishAttempt) screenAttemptRef.current = null;
    };
    const cancelAttempt = () => {
      if (session.local.share.out.source.peek()) return finishAttempt();
      finishAttempt();
      session.local.screenEnabled.set(false);
      setScreenError(t("screenNotStarted"));
    };
    const handleFocus = () => {
      focusTimer = window.setTimeout(cancelAttempt, 500);
    };

    unsubscribe = session.local.share.out.source.subscribe((source) => {
      if (source) finishAttempt();
    });
    window.addEventListener("focus", handleFocus);
    screenAttemptRef.current?.();
    screenAttemptRef.current = finishAttempt;
    session.local.screenEnabled.set(true);
  }

  return (
    <main className="call-shell">
      <header className="call-header">
        <Brand />
        <div className="call-status">
          <PreferencesControls />
          <details className="participant-menu">
            <summary><ParticipantCounter session={session} /></summary>
            <div className="participant-popover"><ParticipantRoster session={session} /></div>
          </details>
          <ConnectionPill session={session} />
        </div>
      </header>

      <section className="call-stage"><MediaTiles session={session} /></section>

      <ConnectionRecovery session={session} onLeave={onLeave} />

      <div className="invite-actions" aria-label={t("share")}>
        <button className="invite-button" type="button" onClick={() => void copyInvite()}>
          <CopyIcon /><span>{copied ? t("linkCopied") : t("copyLink")}</span>
        </button>
        <button className="invite-button invite-share" type="button" onClick={() => void shareInvite()}>
          <ShareIcon /><span>{t("share")}</span>
        </button>
      </div>

      {screenError && <div className="call-toast" role="alert">{screenError}</div>}

      {(import.meta.env.DEV || new URLSearchParams(window.location.search).get("debug") === "1") && <Diagnostics session={session} />}

      <nav className="call-controls" aria-label={t("callControls")}>
        <ToggleButton on={microphoneOn} label={microphoneOn ? t("mute") : t("unmute")} onClick={() => session.local.microphoneEnabled.set(!microphoneOn)}><MicIcon /></ToggleButton>
        <ToggleButton on={cameraOn} label={cameraOn ? t("camera") : t("startVideo")} onClick={() => session.local.cameraEnabled.set(!cameraOn)}><CameraIcon /></ToggleButton>
        <button
          className={`control-button screen ${screenOn ? "sharing" : screenRequested ? "starting" : "active"}`}
          type="button"
          onClick={toggleScreenShare}
          aria-pressed={screenOn}
        >
          <ScreenIcon />
          <span>{screenOn ? t("stopSharing") : screenRequested ? t("starting") : t("shareScreen")}</span>
        </button>
        <InCallDevicePicker session={session} />
        <button className="control-button leave" type="button" onClick={onLeave}><LeaveIcon /><span>{t("leave")}</span></button>
      </nav>
    </main>
  );
}
