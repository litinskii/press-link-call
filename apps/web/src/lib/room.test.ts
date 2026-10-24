import { describe, expect, it } from "vitest";
import { MAX_PARTICIPANTS, participantCount, participantGridClass } from "./room";

describe("multi-user room layout", () => {
  it("counts the local participant together with remotes", () => {
    expect(participantCount(0)).toBe(1);
    expect(participantCount(9)).toBe(MAX_PARTICIPANTS);
  });

  it("selects layouts for one through ten participants", () => {
    expect(Array.from({ length: 10 }, (_, remoteCount) => participantGridClass(remoteCount))).toEqual([
      "count-1",
      "count-2",
      "count-3",
      "count-4",
      "count-5",
      "count-6",
      "count-7",
      "count-8",
      "count-9",
      "count-10",
    ]);
  });

  it("keeps the ten-person layout if a development room is over capacity", () => {
    expect(participantGridClass(10)).toBe("count-10");
  });
});
