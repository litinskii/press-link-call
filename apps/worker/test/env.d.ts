declare module "cloudflare:workers" {
  interface ProvidedEnv {
    ROOMS: DurableObjectNamespace<import("../src/durable-object").RoomDurableObject>;
    RATE_LIMITS: DurableObjectNamespace<import("../src/rate-limit").RateLimitDurableObject>;
    ASSETS: Fetcher;
    MOQ_RELAY_URL: string;
    MOQ_RELAY_ID: string;
    MOQ_RELAY_TOKEN?: string;
  }
}
