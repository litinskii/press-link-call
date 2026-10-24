/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");

describe("production security headers", () => {
  it("allows the blob modules used by MoQ audio worklets", () => {
    expect(headers).toMatch(/script-src[^;]*\bblob:/);
    expect(headers).toMatch(/worker-src[^;]*\bblob:/);
  });
});
