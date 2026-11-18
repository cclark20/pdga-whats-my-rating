import { describe, expect, it, vi } from "vitest";
import {
  createFetcher,
  HttpError,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_RETRIES,
} from "../src/http.ts";

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

function setup(statuses: number[]) {
  const fetch = vi.fn(async () => respond(statuses.shift() ?? 429, { ok: true }));
  const sleep = vi.fn(async (_ms: number) => {});
  const onRetry = vi.fn();
  const fetchJson = createFetcher({ fetch, sleep, onRetry });
  return { fetch, sleep, onRetry, fetchJson };
}

describe("createFetcher", () => {
  it("returns JSON on first success", async () => {
    const { fetchJson, sleep } = setup([200]);
    expect(await fetchJson("https://example.test", "x")).toEqual({ ok: true });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a 429 then succeeds", async () => {
    const { fetchJson, sleep } = setup([429, 200]);
    await fetchJson("https://example.test", "x");
    expect(sleep.mock.calls).toEqual([[INITIAL_BACKOFF_MS]]);
  });

  it("backs off exponentially across multiple 429s", async () => {
    const { fetchJson, sleep } = setup([429, 429, 429, 200]);
    await fetchJson("https://example.test", "x");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(
      [0, 1, 2].map((i) => INITIAL_BACKOFF_MS * 2 ** i),
    );
  });

  it("raises after exhausting retries, with backoff capped", async () => {
    const { fetchJson, sleep } = setup([]);
    await expect(fetchJson("https://example.test", "x")).rejects.toMatchObject({
      status: 429,
    });
    expect(sleep).toHaveBeenCalledTimes(MAX_RETRIES);
    for (const [ms] of sleep.mock.calls) expect(ms).toBeLessThanOrEqual(MAX_BACKOFF_MS);
  });

  it("raises non-429 errors immediately", async () => {
    const { fetchJson, sleep } = setup([500]);
    await expect(fetchJson("https://example.test", "x")).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it("invokes onRetry with the attempt and wait", async () => {
    const { fetchJson, onRetry } = setup([429, 200]);
    await fetchJson("https://example.test", "rounds");
    expect(onRetry).toHaveBeenCalledWith(0, INITIAL_BACKOFF_MS, "rounds");
  });

  it("keeps private URLs out of error messages", async () => {
    const { fetchJson } = setup([500]);
    const err = await fetchJson("https://secret.example/123", "profile").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).message).not.toContain("secret.example");
    expect((err as HttpError).message).toContain("profile");
  });

  it("limits concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const fetch = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return respond(200);
    });
    const fetchJson = createFetcher({ fetch, maxConcurrent: 2 });
    await Promise.all(Array.from({ length: 6 }, (_, i) => fetchJson(`u${i}`, "x")));
    expect(peak).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
