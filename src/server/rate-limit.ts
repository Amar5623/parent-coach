/**
 * Small in-memory request limiter for model calls, so a public demo can't
 * burn through the Groq key.
 *
 * Three independent limits, each configurable by env var (0 disables it):
 * - per client IP per minute (sliding window)
 * - per client IP per UTC day
 * - total per UTC day, across everyone
 *
 * State lives in the server process. On a single `next start` server that is
 * exact; on serverless hosts (e.g. Vercel) each warm instance keeps its own
 * counts, so treat the limits as best-effort, not a hard billing guarantee.
 * Groq's own key limits remain the hard backstop.
 */

export interface RateLimitConfig {
  perMinute: number;
  perIpPerDay: number;
  totalPerDay: number;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; code: "rate_limited" | "daily_limit"; retryAfterSeconds: number };

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  perMinute: 10,
  perIpPerDay: 100,
  totalPerDay: 1000,
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Sweep idle per-minute entries once the map grows past this. */
const SWEEP_THRESHOLD = 5_000;

function readLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readRateLimitConfig(env: Record<string, string | undefined> = process.env): RateLimitConfig {
  return {
    perMinute: readLimit(env.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMITS.perMinute),
    perIpPerDay: readLimit(env.DAILY_LIMIT_PER_IP, DEFAULT_RATE_LIMITS.perIpPerDay),
    totalPerDay: readLimit(env.DAILY_LIMIT_TOTAL, DEFAULT_RATE_LIMITS.totalPerDay),
  };
}

/**
 * Best-effort client identifier. Vercel and most proxies set
 * `x-forwarded-for`; the first entry is the original client.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export class RateLimiter {
  private recent = new Map<string, number[]>();
  private day = -1;
  private dayTotal = 0;
  private dayByKey = new Map<string, number>();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** Checks all limits for `key` and, if allowed, counts the request. */
  check(key: string): LimitResult {
    const now = this.now();
    const today = Math.floor(now / DAY_MS);
    if (today !== this.day) {
      this.day = today;
      this.dayTotal = 0;
      this.dayByKey.clear();
    }
    const untilTomorrow = Math.ceil(((today + 1) * DAY_MS - now) / 1000);
    const { perMinute, perIpPerDay, totalPerDay } = this.config;

    if (totalPerDay > 0 && this.dayTotal >= totalPerDay) {
      return { ok: false, code: "daily_limit", retryAfterSeconds: untilTomorrow };
    }
    const keyToday = this.dayByKey.get(key) ?? 0;
    if (perIpPerDay > 0 && keyToday >= perIpPerDay) {
      return { ok: false, code: "daily_limit", retryAfterSeconds: untilTomorrow };
    }

    let stamps: number[] = [];
    if (perMinute > 0) {
      stamps = (this.recent.get(key) ?? []).filter((t) => now - t < MINUTE_MS);
      if (stamps.length >= perMinute) {
        this.recent.set(key, stamps);
        const retryAfterSeconds = Math.max(1, Math.ceil((stamps[0] + MINUTE_MS - now) / 1000));
        return { ok: false, code: "rate_limited", retryAfterSeconds };
      }
      stamps.push(now);
      this.recent.set(key, stamps);
      if (this.recent.size > SWEEP_THRESHOLD) this.sweep(now);
    }

    this.dayTotal += 1;
    this.dayByKey.set(key, keyToday + 1);
    return { ok: true };
  }

  private sweep(now: number): void {
    for (const [key, stamps] of this.recent) {
      if (stamps.every((t) => now - t >= MINUTE_MS)) this.recent.delete(key);
    }
  }
}
