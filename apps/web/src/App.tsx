import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MAX_PARTICIPANTS, type Participant } from "@press-link-call/shared/room";
import { deriveAuthVerifier, deriveRoomKeys, generateMasterSecret } from "@press-link-call/shared/crypto";
import { PreferencesControls } from "./components/AppChrome";
import { PreJoinDevicePicker, PreJoinPreview, type DeviceSelection } from "./components/DevicePicker";
import { CameraIcon, LeaveIcon, MicIcon } from "./components/icons";
import { ApiError, createRoom, getRoomStatus, joinRoom, leaveRoom } from "./lib/api";
import { translateSupportMessage, type TranslationKey } from "./lib/i18n";
import type { MoqSession } from "./lib/moq-session";
import { usePreferences } from "./lib/preferences";
import {
  createGuestName,
  createParticipantId,
  createRoomId,
  inviteSecretFromHash,
  inviteUrl,
  roomIdFromPathname,
} from "./lib/room-url";

const NAME_KEY = "press-link-call.name";
const PARTICIPANT_ID_KEY = "press-link-call.participant-id";
const WAITING_ROSTER_INTERVAL_MS = 2_000;
const ACTIVE_ROSTER_INTERVAL_MS = 10_000;
const loadCallView = () => import("./components/CallView");
const CallView = lazy(loadCallView);

type Route =
  | { name: "home" }
  | { name: "prejoin"; roomId: string }
  | { name: "ended"; reason: "left" | "expired" };

interface Admission {
  roomId: string;
  authProof: string;
  participant: Participant;
  expiresAt: number;
}

interface JoinOptions extends DeviceSelection {
  displayName: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string;

function readRoute(): Route {
  const roomId = roomIdFromPathname(window.location.pathname);
  if (roomId) return { name: "prejoin", roomId };
  if (window.location.pathname === "/call-ended") {
    const reason = new URLSearchParams(window.location.search).get("reason") === "expired" ? "expired" : "left";
    return { name: "ended", reason };
  }
  return { name: "home" };
}

function browserParticipantId(): string {
  const existing = sessionStorage.getItem(PARTICIPANT_ID_KEY);
  if (existing && /^p-[a-f0-9]{18}$/.test(existing)) return existing;
  const created = createParticipantId();
  sessionStorage.setItem(PARTICIPANT_ID_KEY, created);
  return created;
}

function PageBackground({ children }: { children: React.ReactNode }) {
  return (
    <main className="setup-shell">
      <div className="setup-preferences"><PreferencesControls /></div>
      {children}
    </main>
  );
}

function HomeView({ creating, onCreate }: { creating: boolean; onCreate: () => void }) {
  const { t } = usePreferences();
  return (
    <PageBackground>
      <section className="start-card home-card">
        <span className="start-icon"><CameraIcon /></span>
        <h1>press-link-call</h1>
        <button className="join-button" type="button" disabled={creating} onClick={onCreate}>
          {creating ? t("creating") : t("startCall")} <span>↗</span>
        </button>
      </section>
    </PageBackground>
  );
}

function MessageView({ title, message, action, onAction }: { title: string; message: string; action: string; onAction: () => void }) {
  return (
    <PageBackground>
      <section className="start-card ended-card">
        <span className="start-icon ended-icon"><LeaveIcon /></span>
        <h1>{title}</h1>
        <p>{message}</p>
        <button className="join-button" type="button" onClick={onAction}>{action} <span>→</span></button>
      </section>
    </PageBackground>
  );
}

function errorCopy(error: unknown, t: Translator): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.code === "expired") return { title: t("callExpired"), message: t("callExpiredMessage") };
    if (error.code === "full") return { title: t("callFull"), message: t("callFullMessage", { count: MAX_PARTICIPANTS }) };
    if (error.code === "forbidden") return { title: t("invalidInvite"), message: t("invalidInviteMessage") };
    if (error.code === "not_found") return { title: t("callNotFound"), message: t("callNotFoundMessage") };
    if (error.code === "rate_limited") return { title: t("tryAgainLater"), message: t("tooManyAttempts") };
  }
  return { title: t("couldNotJoin"), message: t("checkConnection") };
}

function PreJoinView({ roomId, onJoin, onHome }: {
  roomId: string;
  onJoin: (options: JoinOptions) => Promise<void>;
  onHome: () => void;
}) {
  const { locale, t } = usePreferences();
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(NAME_KEY) ?? createGuestName(t("guest")));
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [deviceSelection, setDeviceSelection] = useState<DeviceSelection>({});
  const [joining, setJoining] = useState(false);
  const [checking, setChecking] = useState(true);
  const [supportChecking, setSupportChecking] = useState(true);
  const [supportError, setSupportError] = useState<string>();
  const [supportWarning, setSupportWarning] = useState<string>();
  const [terminalError, setTerminalError] = useState<{ title: string; message: string }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void getRoomStatus(roomId, controller.signal)
      .then((status) => {
        if (status.expired) setTerminalError({ title: t("callExpired"), message: t("callExpiredMessage") });
      })
      .catch((statusError: unknown) => {
        if (!controller.signal.aborted) setTerminalError(errorCopy(statusError, t));
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [roomId, t]);

  useEffect(() => {
    let active = true;
    void import("./lib/browser-support").then(({ checkBrowserSupport }) => checkBrowserSupport()).then((support) => {
      if (!active) return;
      if (support.supported) setSupportWarning(support.warning ? translateSupportMessage(locale, support.warning) : undefined);
      else setSupportError(support.message ? translateSupportMessage(locale, support.message) : t("unsupportedBrowser"));
    }).finally(() => {
      if (active) setSupportChecking(false);
    });
    return () => {
      active = false;
    };
  }, [locale, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = displayName.trim() || createGuestName(t("guest"));
    setJoining(true);
    setError(undefined);
    try {
      localStorage.setItem(NAME_KEY, cleanName);
      // Let React unmount the preview and stop its MediaStream before MoQ asks
      // Safari for the real call tracks. iOS can otherwise leave the second
      // camera/microphone request without a usable track.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await onJoin({ displayName: cleanName, cameraEnabled, microphoneEnabled, ...deviceSelection });
    } catch (joinError) {
      const copy = errorCopy(joinError, t);
      if (joinError instanceof ApiError && ["expired", "full", "forbidden", "not_found", "rate_limited"].includes(joinError.code)) {
        setTerminalError(copy);
      } else {
        setError(copy.message);
      }
    } finally {
      setJoining(false);
    }
  }

  if (terminalError) return <MessageView {...terminalError} action={t("returnHome")} onAction={onHome} />;
  if (supportError) return <MessageView title={t("browserNotSupported")} message={supportError} action={t("returnHome")} onAction={onHome} />;

  return (
    <PageBackground>
      <button className="back-button" type="button" onClick={onHome}>← {t("home")}</button>
      <form className="start-card prejoin-card" onSubmit={(event) => void submit(event)}>
        <h1>{t("joinCall")}</h1>

        {!supportChecking && !joining && (
          <PreJoinPreview
            cameraEnabled={cameraEnabled}
            microphoneEnabled={microphoneEnabled}
            selection={deviceSelection}
          />
        )}

        <label className="name-field">
          <span>{t("yourName")}</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={64} autoComplete="name" autoFocus />
        </label>

        <div className="prejoin-controls">
          <button type="button" className={microphoneEnabled ? "selected" : ""} onClick={() => setMicrophoneEnabled((value) => !value)}>
            <MicIcon /><span>{t("microphone")}</span><b>{microphoneEnabled ? t("on") : t("off")}</b>
          </button>
          <button type="button" className={cameraEnabled ? "selected" : ""} onClick={() => setCameraEnabled((value) => !value)}>
            <CameraIcon /><span>{t("camera")}</span><b>{cameraEnabled ? t("on") : t("off")}</b>
          </button>
        </div>

        <PreJoinDevicePicker
          selection={deviceSelection}
          onChange={setDeviceSelection}
        />

        {supportWarning && <p className="compatibility-warning" role="status">{supportWarning}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="join-button" type="submit" disabled={checking || supportChecking || joining}>
          {checking ? t("checkingCall") : supportChecking ? t("checkingBrowser") : joining ? t("joining") : t("joinCall")} <span>→</span>
        </button>
      </form>
    </PageBackground>
  );
}

export default function App() {
  const { t, videoQuality } = usePreferences();
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [session, setSession] = useState<MoqSession | null>(null);
  const [admission, setAdmission] = useState<Admission>();
  const [creating, setCreating] = useState(false);
  const [fatalError, setFatalError] = useState<string>();
  const sessionRef = useRef<MoqSession | null>(null);
  const admissionRef = useRef<Admission | undefined>(undefined);

  function closeSession() {
    sessionRef.current?.close();
    sessionRef.current = null;
    setSession(null);
  }

  function releaseAdmission(keepalive = false) {
    const current = admissionRef.current;
    admissionRef.current = undefined;
    setAdmission(undefined);
    if (current) void leaveRoom(current.roomId, { authProof: current.authProof, participantId: current.participant.id }, keepalive).catch(() => undefined);
  }

  function navigate(path: string, replace = false) {
    if (replace) history.replaceState(undefined, "", path);
    else history.pushState(undefined, "", path);
    setRoute(readRoute());
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    const onPopState = () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      setSession(null);
      const current = admissionRef.current;
      admissionRef.current = undefined;
      setAdmission(undefined);
      if (current) void leaveRoom(current.roomId, { authProof: current.authProof, participantId: current.participant.id }, true).catch(() => undefined);
      setRoute(readRoute());
    };
    const onBeforeUnload = () => {
      const current = admissionRef.current;
      if (current) void leaveRoom(current.roomId, { authProof: current.authProof, participantId: current.participant.id }, true).catch(() => undefined);
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      sessionRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!admission || !session) return;
    let stopped = false;
    let timer: number | undefined;

    const refreshRoster = async () => {
      let delay = ACTIVE_ROSTER_INTERVAL_MS;
      try {
        const response = await joinRoom(admission.roomId, { authProof: admission.authProof, participant: admission.participant });
        if (stopped || sessionRef.current !== session) return;
        session.updateParticipants(response.participants);
        if (response.participants.length <= 1) delay = WAITING_ROSTER_INTERVAL_MS;
      } catch {
        // The media connection has its own recovery UI. A failed roster refresh
        // should not interrupt an otherwise active call.
      }
      if (!stopped) timer = window.setTimeout(() => void refreshRoster(), delay);
    };

    timer = window.setTimeout(() => void refreshRoster(), WAITING_ROSTER_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [admission, session]);

  useEffect(() => {
    if (!admission || !session) return;
    const timer = window.setTimeout(() => {
      sessionRef.current?.close();
      sessionRef.current = null;
      setSession(null);
      admissionRef.current = undefined;
      setAdmission(undefined);
      history.replaceState(undefined, "", "/call-ended?reason=expired");
      setRoute(readRoute());
    }, Math.max(0, admission.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [admission, session]);

  async function createCall() {
    setCreating(true);
    setFatalError(undefined);
    try {
      const roomId = createRoomId();
      const masterSecret = generateMasterSecret();
      const { authKey } = await deriveRoomKeys(masterSecret, roomId);
      const authVerifier = await deriveAuthVerifier(authKey);
      await createRoom({ roomId, authVerifier });
      navigate(inviteUrl(roomId, masterSecret));
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : t("couldNotCreate"));
    } finally {
      setCreating(false);
    }
  }

  async function join(options: JoinOptions) {
    if (route.name !== "prejoin") throw new Error("Missing room");
    const masterSecret = inviteSecretFromHash(window.location.hash);
    if (!masterSecret) throw new ApiError("Invalid invite", 403, "forbidden");
    const { authKey } = await deriveRoomKeys(masterSecret, route.roomId);
    const authProof = await deriveAuthVerifier(authKey);
    const participant: Participant = { id: browserParticipantId(), name: options.displayName };
    const response = await joinRoom(route.roomId, { authProof, participant });

    try {
      const [{ createMoqSession }] = await Promise.all([
        import("./lib/moq-session"),
        loadCallView(),
      ]);
      const created = createMoqSession({
        relayUrl: response.relayUrl,
        roomId: response.relayRoomId,
        displayName: options.displayName,
        cameraEnabled: options.cameraEnabled,
        microphoneEnabled: options.microphoneEnabled,
        cameraDeviceId: options.cameraDeviceId,
        microphoneDeviceId: options.microphoneDeviceId,
        participantId: participant.id,
        participants: response.participants,
        videoQuality,
      });
      const nextAdmission = { roomId: route.roomId, authProof, participant, expiresAt: response.expiresAt };
      sessionRef.current = created;
      admissionRef.current = nextAdmission;
      setAdmission(nextAdmission);
      setSession(created);
      setFatalError(undefined);
    } catch (error) {
      void leaveRoom(route.roomId, { authProof, participantId: participant.id }).catch(() => undefined);
      throw error;
    }
  }

  function leave() {
    closeSession();
    releaseAdmission(true);
    navigate("/call-ended", true);
  }

  function goHome() {
    closeSession();
    releaseAdmission(true);
    navigate("/");
  }

  let content: React.ReactNode;
  const masterSecret = route.name === "prejoin" ? inviteSecretFromHash(window.location.hash) : undefined;
  if (session && route.name === "prejoin" && masterSecret) {
    content = (
      <Suspense fallback={null}>
        <CallView session={session} invite={inviteUrl(route.roomId, masterSecret)} onLeave={leave} />
      </Suspense>
    );
  } else if (route.name === "prejoin" && !masterSecret) {
    content = <MessageView title={t("invalidInvite")} message={t("missingPrivateKey")} action={t("returnHome")} onAction={goHome} />;
  } else if (route.name === "prejoin") {
    content = <PreJoinView key={route.roomId} roomId={route.roomId} onJoin={join} onHome={goHome} />;
  } else if (route.name === "ended") {
    content = route.reason === "expired"
      ? <MessageView title={t("callExpired")} message={t("callLimitMessage")} action={t("returnHome")} onAction={goHome} />
      : <MessageView title={t("callEnded")} message={t("callEndedMessage")} action={t("returnHome")} onAction={goHome} />;
  } else {
    content = <HomeView creating={creating} onCreate={() => void createCall()} />;
  }

  return (
    <>
      {fatalError && <div className="fatal-banner" role="alert">{fatalError}</div>}
      {content}
    </>
  );
}
