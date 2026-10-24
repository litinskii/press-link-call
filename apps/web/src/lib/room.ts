export { MAX_PARTICIPANTS } from "@press-link-call/shared/room";
import { MAX_PARTICIPANTS } from "@press-link-call/shared/room";

export function participantCount(remoteCount: number): number {
  return remoteCount + 1;
}

export function participantGridClass(remoteCount: number): string {
  return `count-${Math.min(participantCount(remoteCount), MAX_PARTICIPANTS)}`;
}
