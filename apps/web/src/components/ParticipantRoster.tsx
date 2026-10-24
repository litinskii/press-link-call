import type { Remote } from "@moq/room";
import { useValue } from "@moq/signals/react";
import type { MoqSession } from "../lib/moq-session";
import { usePreferences } from "../lib/preferences";
import { MAX_PARTICIPANTS, participantCount } from "../lib/room";
import { useSignalMap } from "../lib/use-signal-map";
import { MicIcon } from "./icons";

function avatarText(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function Presence({ name, microphoneOn, local = false }: { name: string; microphoneOn: boolean; local?: boolean }) {
  const { t } = usePreferences();
  return (
    <li>
      <span className="roster-avatar" aria-hidden="true">{avatarText(name)}</span>
      <span className="roster-name">{name}{local && <em>{t("you")}</em>}</span>
      <span className={`roster-microphone ${microphoneOn ? "on" : "off"}`} title={microphoneOn ? t("microphoneOn") : t("microphoneOff")}>
        <MicIcon />
      </span>
    </li>
  );
}

function RemotePresence({ remote }: { remote: Remote }) {
  const { t } = usePreferences();
  const name = useValue(remote.user.name) ?? t("guest");
  const preview = useValue(remote.preview);
  return <Presence name={name} microphoneOn={Boolean(preview.audio)} />;
}

export function ParticipantCounter({ session }: { session: MoqSession }) {
  const remotes = useSignalMap(session.room.remotes);

  return (
    <span className="participant-counter" aria-live="polite">
      {participantCount(remotes.size)} / {MAX_PARTICIPANTS}
      <span aria-hidden="true">●</span>
    </span>
  );
}

export function ParticipantRoster({ session }: { session: MoqSession }) {
  const { t } = usePreferences();
  const remotes = useSignalMap(session.room.remotes);
  const localName = useValue(session.local.user.name) ?? t("you");
  const localPreview = useValue(session.local.preview);
  const count = participantCount(remotes.size);

  return (
    <section className="participant-roster" aria-label={t("participants")}>
      <div className="roster-heading">
        <h3>{t("people")}</h3>
        <span>{count} / {MAX_PARTICIPANTS}</span>
      </div>
      <ul>
        <Presence name={localName} microphoneOn={Boolean(localPreview.audio)} local />
        {Array.from(remotes.entries()).map(([identity, remote]) => (
          <RemotePresence key={String(identity)} remote={remote} />
        ))}
      </ul>
    </section>
  );
}
