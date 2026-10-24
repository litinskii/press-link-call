import { broadcastPath, KIND, Local, Net, Remote, Room } from "@moq/room";
import type { Participant } from "@press-link-call/shared/room";
import { isSafariFamily } from "./browser-platform";
import { adaptCameraOrientation } from "./camera-orientation";
import { createParticipantId, relayRoomPrefix, relayRoomUrl } from "./room-url";
import { videoConstraints, type VideoQuality } from "./video-quality";

export interface SessionOptions {
  relayUrl: string;
  roomId: string;
  displayName: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
  participantId?: string;
  participants: Participant[];
  videoQuality: VideoQuality;
}

interface SessionRoom {
  remotes: Net.Signals.Getter<Map<Net.Path.Valid, Remote>>;
  close: () => void;
}

export interface MoqSession {
  connection: Net.Connection;
  local: Local;
  room: SessionRoom;
  identity: Net.Path.Valid;
  participantId: string;
  roomUrl: URL;
  connectedOnce: Net.Signals.Signal<boolean>;
  localCameraTrack: Net.Signals.Signal<MediaStreamTrack | undefined>;
  updateParticipants: (participants: Participant[]) => void;
  close: () => void;
}

export function createMoqSession(options: SessionOptions): MoqSession {
  const participantId = options.participantId ?? createParticipantId();
  const participantIdentity = Net.Path.from(participantId);
  const roomPrefix = Net.Path.from(relayRoomPrefix(options.roomId));
  const identity = Net.Path.join(roomPrefix, participantIdentity);
  const roomUrl = relayRoomUrl(options.relayUrl);
  const forceSafariWebTransport = isSafariFamily() && typeof WebTransport !== "undefined";
  if (forceSafariWebTransport) {
    (globalThis as typeof globalThis & { __PRESS_LINK_CALL_FORCE_WEBTRANSPORT__?: boolean })
      .__PRESS_LINK_CALL_FORCE_WEBTRANSPORT__ = true;
  }
  const connection = new Net.Connection({
    url: roomUrl,
    enabled: true,
    share: false,
    websocket: forceSafariWebTransport ? { enabled: false } : undefined,
    delay: {
      initial: Net.Time.Milli(1_000),
      max: Net.Time.Milli(5_000),
      timeout: Net.Time.Milli(15_000),
    },
  });
  const connectedOnce = new Net.Signals.Signal(connection.status.peek() === "connected");
  const stopWatchingStatus = connection.status.subscribe((status) => {
    if (status === "connected") connectedOnce.set(true);
  });

  try {
    const local = new Local({
      connection,
      identity,
      enabled: true,
      user: { id: participantId, name: options.displayName },
    });
    local.webcam.device.preferred.set(options.cameraDeviceId);
    local.microphone.device.preferred.set(options.microphoneDeviceId);
    local.webcam.constraints.set(videoConstraints(options.videoQuality));
    local.cameraEnabled.set(options.cameraEnabled);
    local.microphoneEnabled.set(options.microphoneEnabled);
    const cameraOrientation = adaptCameraOrientation(local);

    const discoveredRoom = new Room({ connection, identity: participantIdentity, prefix: roomPrefix });
    const seededRemotes = new Map<Net.Path.Valid, Remote>();
    const rosterRevision = new Net.Signals.Signal(0);

    const updateParticipants = (participants: Participant[]) => {
      const expected = new Set(participants.filter((participant) => participant.id !== participantId).map((participant) => participant.id));
      let changed = false;

      for (const [remoteIdentity, remote] of seededRemotes) {
        if (expected.has(String(remoteIdentity))) continue;
        remote.close();
        seededRemotes.delete(remoteIdentity);
        changed = true;
      }

      const discovered = discoveredRoom.remotes.peek();
      for (const remoteParticipantId of expected) {
        const remoteIdentity = Net.Path.from(remoteParticipantId);
        if (seededRemotes.has(remoteIdentity) || discovered.has(remoteIdentity)) continue;
        const remote = new Remote({ identity: remoteIdentity, connection });
        remote.attach(KIND.camera, broadcastPath(Net.Path.join(roomPrefix, remoteIdentity), KIND.camera));
        // Cloudflare's draft-16 relay does not replay an existing announcement.
        // The authenticated roster gives us the exact path, so subscribe directly.
        (remote.camera.peek()?.player.in.announced as Net.Signals.Signal<boolean> | undefined)?.set(false);
        seededRemotes.set(remoteIdentity, remote);
        changed = true;
      }

      if (changed) rosterRevision.update((revision) => revision + 1);
    };

    updateParticipants(options.participants);

    const remotes = new Net.Signals.Signal<Map<Net.Path.Valid, Remote>>(new Map(seededRemotes));
    const mergeRemotes = new Net.Signals.Effect((scope) => {
      scope.get(rosterRevision);
      const discovered = scope.get(discoveredRoom.remotes);
      const next = new Map<Net.Path.Valid, Remote>(discovered);
      for (const [remoteIdentity, discoveredRemote] of discovered) {
        const seededRemote = seededRemotes.get(remoteIdentity);
        if (seededRemote) {
          seededRemote.close();
          seededRemotes.delete(remoteIdentity);
        }
        next.set(remoteIdentity, discoveredRemote);
      }
      for (const [remoteIdentity, seededRemote] of seededRemotes) {
        const camera = scope.get(seededRemote.camera);
        if (camera && scope.get(camera.broadcast.out.catalog)) next.set(remoteIdentity, seededRemote);
      }
      remotes.set(next);
    });
    const room: SessionRoom = {
      remotes,
      close: () => {
        mergeRemotes.close();
        seededRemotes.forEach((remote) => remote.close());
        seededRemotes.clear();
        discoveredRoom.close();
      },
    };
    let closed = false;

    return {
      connection,
      local,
      room,
      identity,
      participantId,
      roomUrl,
      connectedOnce,
      localCameraTrack: cameraOrientation.track,
      updateParticipants,
      close: () => {
        if (closed) return;
        closed = true;
        stopWatchingStatus();
        room.close();
        cameraOrientation.close();
        local.close();
        connection.close();
      },
    };
  } catch (error) {
    stopWatchingStatus();
    connection.close(error instanceof Error ? error : new Error("Failed to create MoQ session"));
    throw error;
  }
}
