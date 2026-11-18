import type { PlayerResponse, Round } from "@wmr/shared";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../src/http.ts";
import type { PdgaClient, PlayerData } from "../src/pdga.ts";
import { createApp } from "../src/routes.ts";

const round = (date: string, rating: number, extra: Partial<Round> = {}): Round => ({
  tournament: `Event ${date}`,
  tournamentUrl: null,
  date,
  tier: "B",
  round: "1",
  rating,
  pdgaEvaluated: true,
  ...extra,
});

const DATA: PlayerData = {
  info: {
    pdgaNo: 167210,
    name: "Casey Clark",
    location: "Richmond, VA, US",
    membership: { current: true, expDate: "2026-12-31" },
    officialRating: 920,
    ratingDate: "2026-11-10",
    ratingChange: 3,
    prevRatingDate: "2026-07-14",
  },
  officialRounds: [round("2026-11-01", 920), round("2026-10-01", 920)],
  newRounds: [round("2026-11-15", 980, { pdgaEvaluated: null })],
  newEvents: [],
};

function app(loadPlayer: PdgaClient["loadPlayer"]) {
  return createApp({ pdga: { loadPlayer: vi.fn(loadPlayer) } });
}

describe("GET /api/player/:pdgaNo", () => {
  it("returns official and projected breakdowns", async () => {
    const res = await app(async () => DATA).request("/api/player/167210");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlayerResponse;
    expect(body.player.name).toBe("Casey Clark");
    expect(body.official?.rating).toBe(920);
    expect(body.official?.rounds).toHaveLength(2);
    expect(body.projected?.rounds).toHaveLength(3);
    expect(body.projected?.rating).toBe(940);
  });

  it("skips the official breakdown without an official rating", async () => {
    const data = {
      ...DATA,
      info: { ...DATA.info, officialRating: null, prevRatingDate: null },
    };
    const body = (await (
      await app(async () => data).request("/api/player/1")
    ).json()) as PlayerResponse;
    expect(body.official).toBeNull();
    expect(body.agedOut).toEqual([]);
    expect(body.projected).not.toBeNull();
  });

  it("returns a null projection for a player with no rounds", async () => {
    const data = { ...DATA, officialRounds: [], newRounds: [] };
    const res = await app(async () => data).request("/api/player/1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlayerResponse;
    expect(body.projected).toBeNull();
    expect(body.official).toBeNull();
  });

  it.each([
    ["abc", 400, "invalid_pdga_no"],
    ["12.5", 400, "invalid_pdga_no"],
  ])("rejects %s", async (pdgaNo, status, error) => {
    const load = vi.fn();
    const res = await createApp({ pdga: { loadPlayer: load } }).request(
      `/api/player/${pdgaNo}`,
    );
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    [new HttpError(404, "profile"), 404, "not_found"],
    [new HttpError(429, "rounds"), 503, "rate_limited"],
    [new HttpError(500, "events"), 502, "upstream_error"],
    [new Error("bad shape"), 502, "upstream_error"],
  ])("maps %s to %i", async (err, status, error) => {
    const res = await app(async () => {
      throw err;
    }).request("/api/player/167210");
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error });
  });
});

describe("GET /api/health", () => {
  it("responds ok", async () => {
    const res = await app(async () => DATA).request("/api/health");
    expect(await res.json()).toEqual({ ok: true });
  });
});
