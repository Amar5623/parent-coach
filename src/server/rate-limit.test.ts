import { describe, expect, it } from "vitest";
import { clientKey, DEFAULT_RATE_LIMITS, RateLimiter, readRateLimitConfig } from "./rate-limit";

function clock(start = Date.UTC(2026, 10, 18, 12, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("limits requests per key per minute and frees them as the window slides", () => {
    const c = clock();
    const limiter = new RateLimiter({ perMinute: 2, perIpPerDay: 0, totalPerDay: 0 }, c.now);

    expect(limiter.check("a").ok).toBe(true);
    c.advance(10_000);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("a")).toEqual({ ok: false, code: "rate_limited", retryAfterSeconds: 50 });
    expect(limiter.check("b").ok).toBe(true);

    c.advance(50_000);
    expect(limiter.check("a").ok).toBe(true);
  });

  it("caps each key per day and resets at UTC midnight", () => {
    const c = clock(Date.UTC(2026, 10, 18, 23, 0, 0));
    const limiter = new RateLimiter({ perMinute: 0, perIpPerDay: 2, totalPerDay: 0 }, c.now);

    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a")).toEqual({ ok: false, code: "daily_limit", retryAfterSeconds: 3600 });
    expect(limiter.check("b").ok).toBe(true);

    c.advance(3_600_000);
    expect(limiter.check("a").ok).toBe(true);
  });

  it("caps the total across all keys per day", () => {
    const limiter = new RateLimiter({ perMinute: 0, perIpPerDay: 0, totalPerDay: 3 }, clock().now);
    expect(["a", "b", "c"].map((k) => limiter.check(k).ok)).toEqual([true, true, true]);
    expect(limiter.check("d")).toMatchObject({ ok: false, code: "daily_limit" });
  });

  it("does not count rejected requests against the daily totals", () => {
    const c = clock();
    const limiter = new RateLimiter({ perMinute: 1, perIpPerDay: 0, totalPerDay: 2 }, c.now);
    limiter.check("a");
    expect(limiter.check("a").ok).toBe(false); // per-minute rejection
    expect(limiter.check("b").ok).toBe(true); // total is 2, not 3
  });

  it("allows everything when all limits are 0", () => {
    const limiter = new RateLimiter({ perMinute: 0, perIpPerDay: 0, totalPerDay: 0 }, clock().now);
    for (let i = 0; i < 50; i++) expect(limiter.check("a").ok).toBe(true);
  });
});

describe("readRateLimitConfig", () => {
  it("uses defaults when unset or invalid and accepts 0", () => {
    expect(readRateLimitConfig({})).toEqual(DEFAULT_RATE_LIMITS);
    expect(
      readRateLimitConfig({ RATE_LIMIT_PER_MINUTE: "5", DAILY_LIMIT_PER_IP: "abc", DAILY_LIMIT_TOTAL: "0" }),
    ).toEqual({ perMinute: 5, perIpPerDay: DEFAULT_RATE_LIMITS.perIpPerDay, totalPerDay: 0 });
    expect(readRateLimitConfig({ RATE_LIMIT_PER_MINUTE: "-1" }).perMinute).toBe(DEFAULT_RATE_LIMITS.perMinute);
  });
});

describe("clientKey", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip", () => {
    const req = (headers: Record<string, string>) => new Request("http://x", { headers });
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientKey(req({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientKey(req({}))).toBe("unknown");
  });
});
