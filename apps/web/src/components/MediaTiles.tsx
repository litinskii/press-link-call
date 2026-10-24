import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { type Member, type Remote, Publish } from "@moq/room";
import { useValue } from "@moq/signals/react";
import type { MoqSession } from "../lib/moq-session";
import { usePreferences } from "../lib/preferences";
import { participantGridClass } from "../lib/room";
import { useSignalMap } from "../lib/use-signal-map";
import { MicIcon } from "./icons";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

interface FocusableTileProps {
  children: ReactNode;
  className?: string;
  focused: boolean;
  label: string;
  onToggle: () => void;
}

function FocusableTile({ children, className = "", focused, label, onToggle }: FocusableTileProps) {
  const lastTouchRef = useRef(0);
  const suppressMouseUntilRef = useRef(0);

  function handleKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  }

  return (
    <article
      className={`media-tile ${className} ${focused ? "is-focused" : ""}`.trim()}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={handleKeyboard}
      onDoubleClick={() => {
        if (Date.now() >= suppressMouseUntilRef.current) onToggle();
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const now = Date.now();
        if (now - lastTouchRef.current > 40 && now - lastTouchRef.current < 340) {
          suppressMouseUntilRef.current = now + 700;
          lastTouchRef.current = 0;
          onToggle();
        } else {
          lastTouchRef.current = now;
        }
      }}
    >
      {children}
    </article>
  );
}

interface TileFocusProps {
  focused: boolean;
  onToggle: () => void;
}

function LocalTile({ session, focused, onToggle }: { session: MoqSession } & TileFocusProps) {
  const { t } = usePreferences();
  const videoRef = useRef<HTMLVideoElement>(null);
  const preview = useValue(session.local.preview);
  const cameraTrack = useValue(session.localCameraTrack);
  const name = useValue(session.local.user.name) ?? t("you");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = cameraTrack ? new MediaStream([cameraTrack]) : null;
    if (cameraTrack) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [cameraTrack]);

  return (
    <FocusableTile className="local-tile" focused={focused} onToggle={onToggle} label={focused ? t("collapseStream") : t("expandStream", { name })}>
      <video ref={videoRef} aria-label={t("yourVideo")} autoPlay muted playsInline />
      {!preview.video && <div className="avatar-placeholder">{initials(name)}</div>}
      <div className="tile-gradient" />
      <div className="tile-label">
        <span>{name} <em>{t("you")}</em></span>
        {!preview.audio && <span className="muted-indicator" title={t("microphoneOff")}><MicIcon /></span>}
      </div>
    </FocusableTile>
  );
}

function LocalScreenTile({ session, focused, onToggle }: { session: MoqSession } & TileFocusProps) {
  const { t } = usePreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const name = useValue(session.local.user.name) ?? t("you");

  useEffect(() => {
    const renderer = new Publish.Preview.Renderer({
      canvas: canvasRef.current ?? undefined,
      frames: session.local.screenCapture.out.frames,
      display: session.local.screenCapture.out.display,
      flip: false,
    });
    return () => renderer.close();
  }, [session]);

  return (
    <FocusableTile className="screen-tile local-screen-tile" focused={focused} onToggle={onToggle} label={focused ? t("collapseStream") : t("expandStream", { name })}>
      <canvas ref={canvasRef} aria-label={t("yourSharedScreen")} />
      <div className="tile-gradient" />
      <div className="tile-label"><span>{name} <em>{t("presenting")}</em></span></div>
    </FocusableTile>
  );
}

function RemoteMemberTile({ member, name, focused, onToggle }: { member: Member; name: string } & TileFocusProps) {
  const { t } = usePreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preview = useValue(member.preview);

  useEffect(() => {
    member.canvas.set(canvasRef.current ?? undefined);
    member.volume.set(1);
    member.muted.set(false);
    return () => {
      member.canvas.set(undefined);
      member.muted.set(true);
    };
  }, [member]);

  return (
    <FocusableTile focused={focused} onToggle={onToggle} label={focused ? t("collapseStream") : t("expandStream", { name })}>
      <canvas ref={canvasRef} aria-label={t("participantVideo", { name })} />
      {!preview.video && <div className="avatar-placeholder">{initials(name)}</div>}
      <div className="tile-gradient" />
      <div className="tile-label">
        <span>{name}</span>
        {!preview.audio && <span className="muted-indicator" title={t("microphoneOff")}><MicIcon /></span>}
      </div>
    </FocusableTile>
  );
}

function RemoteTile({ remote, focused, onToggle }: { remote: Remote } & TileFocusProps) {
  const { t } = usePreferences();
  const member = useValue(remote.camera);
  const name = useValue(remote.user.name) ?? t("guest");
  if (!member) return null;
  return <RemoteMemberTile member={member} name={name} focused={focused} onToggle={onToggle} />;
}

function RemoteScreenTile({ remote, focused, onToggle }: { remote: Remote } & TileFocusProps) {
  const { t } = usePreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const member = useValue(remote.screen);
  const name = useValue(remote.user.name) ?? t("guest");

  useEffect(() => {
    if (!member) return;
    member.canvas.set(canvasRef.current ?? undefined);
    member.volume.set(1);
    member.muted.set(false);
    return () => {
      member.canvas.set(undefined);
      member.muted.set(true);
    };
  }, [member]);

  if (!member) return null;
  return (
    <FocusableTile className="screen-tile" focused={focused} onToggle={onToggle} label={focused ? t("collapseStream") : t("expandStream", { name })}>
      <canvas ref={canvasRef} aria-label={t("participantScreen", { name })} />
      <div className="tile-gradient" />
      <div className="tile-label"><span>{name} <em>{t("presenting")}</em></span></div>
    </FocusableTile>
  );
}

function useActiveRemoteScreen<K>(remotes: Map<K, Remote>): [K, Remote] | undefined {
  const [, render] = useState(0);
  useEffect(() => {
    const dispose = Array.from(remotes.values(), (remote) => remote.screen.subscribe(() => render((version) => version + 1)));
    return () => dispose.forEach((unsubscribe) => unsubscribe());
  }, [remotes]);
  return Array.from(remotes.entries()).find(([, remote]) => remote.screen.peek());
}

export function MediaTiles({ session }: { session: MoqSession }) {
  const { t } = usePreferences();
  const [focusedId, setFocusedId] = useState<string>();
  const remotes = useSignalMap(session.room.remotes);
  const localScreen = useValue(session.local.share.out.source);
  const activeRemoteEntry = useActiveRemoteScreen(remotes);
  const hasScreen = Boolean(localScreen || activeRemoteEntry);

  function toggleFocus(id: string) {
    setFocusedId((current) => current === id ? undefined : id);
  }

  useEffect(() => {
    if (!focusedId) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFocusedId(undefined);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [focusedId]);

  return (
    <section className={`media-layout ${hasScreen ? "has-screen" : ""} ${focusedId ? "has-focus" : ""}`}>
      {localScreen && (
        <div className="screen-primary">
          <LocalScreenTile session={session} focused={focusedId === "local-screen"} onToggle={() => toggleFocus("local-screen")} />
        </div>
      )}
      {!localScreen && activeRemoteEntry && (
        <div className="screen-primary">
          <RemoteScreenTile
            remote={activeRemoteEntry[1]}
            focused={focusedId === `remote-screen:${String(activeRemoteEntry[0])}`}
            onToggle={() => toggleFocus(`remote-screen:${String(activeRemoteEntry[0])}`)}
          />
        </div>
      )}
      <section className={`media-grid ${participantGridClass(remotes.size)}`} aria-label={t("participants")}>
        {remotes.size === 0 && !hasScreen && <div className="empty-call"><h2>{t("yourCallReady")}</h2></div>}
        <LocalTile session={session} focused={focusedId === "local-camera"} onToggle={() => toggleFocus("local-camera")} />
        {Array.from(remotes.entries()).map(([identity, remote]) => {
          const id = `remote-camera:${String(identity)}`;
          return <RemoteTile key={String(identity)} remote={remote} focused={focusedId === id} onToggle={() => toggleFocus(id)} />;
        })}
      </section>
    </section>
  );
}
