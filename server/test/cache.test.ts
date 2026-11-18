import { describe, expect, it, vi } from "vitest";
import { MemoryCache, readThrough } from "../src/cache.ts";

describe("MemoryCache", () => {
  it("expires entries after their TTL", async () => {
    let now = 0;
    const cache = new MemoryCache({ now: () => now });
    await cache.set("k", 1, 100);
    now = 99;
    expect(await cache.get("k")).toBe(1);
    now = 100;
    expect(await cache.get("k")).toBeUndefined();
  });

  it("evicts the oldest entry past maxEntries", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set("a", 1, 1000);
    await cache.set("b", 2, 1000);
    await cache.set("c", 3, 1000);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("c")).toBe(3);
  });
});

describe("readThrough", () => {
  it("loads once, then serves from cache", async () => {
    const cached = readThrough(new MemoryCache());
    const load = vi.fn(async () => "v");
    expect(await cached("k", 1000, load)).toBe("v");
    expect(await cached("k", 1000, load)).toBe("v");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent loads of the same key", async () => {
    const cached = readThrough(new MemoryCache());
    const load = vi.fn(() => new Promise((r) => setTimeout(() => r("v"), 5)));
    const results = await Promise.all([
      cached("k", 1000, load),
      cached("k", 1000, load),
    ]);
    expect(results).toEqual(["v", "v"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cached = readThrough(new MemoryCache());
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("v");
    await expect(cached("k", 1000, load)).rejects.toThrow("down");
    expect(await cached("k", 1000, load)).toBe("v");
  });
});
