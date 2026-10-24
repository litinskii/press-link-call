import { DurableObject } from "cloudflare:workers";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ROOM_CREATIONS = 20;

export class RateLimitDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_limit (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        window_started_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const now = Date.now();
    const row = this.ctx.storage.sql.exec<{ window_started_at: number; attempts: number }>(
      "SELECT window_started_at, attempts FROM rate_limit WHERE singleton = 1",
    ).toArray()[0];

    if (!row || now - row.window_started_at >= WINDOW_MS) {
      this.ctx.storage.sql.exec(
        "INSERT INTO rate_limit (singleton, window_started_at, attempts) VALUES (1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1",
        now,
      );
      await this.ctx.storage.setAlarm(now + WINDOW_MS);
      return new Response(null, { status: 204 });
    }

    if (row.attempts >= MAX_ROOM_CREATIONS) {
      return Response.json({ error: "Too many rooms created", code: "rate_limited" }, { status: 429 });
    }

    this.ctx.storage.sql.exec("UPDATE rate_limit SET attempts = attempts + 1 WHERE singleton = 1");
    return new Response(null, { status: 204 });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
