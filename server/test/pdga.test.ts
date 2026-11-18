import type { NewEvent, Round } from "@wmr/shared";
import { describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../src/cache.ts";
import { HttpError } from "../src/http.ts";
import {
  createPdgaClient,
  findNewEvents,
  parseLiveScores,
  parseProfile,
  parseRounds,
  utcDate,
} from "../src/pdga.ts";

const URLS = {
  profile: "https://example.test/{pdga_no}/profile",
  rounds: "https://example.test/{pdga_no}/rounds",
  events: "https://example.test/{pdga_no}/events",
};

const OFFICIAL: Round[] = [
  {
    tournament: "Fall Colors - All Pro",
    tournamentUrl: "https://www.pdga.com/tour/event/98279",
    date: "2026-11-08",
    tier: "A",
    division: "MA1",
    round: "1",
    rating: 932,
    pdgaEvaluated: true,
  },
];

function result(tournId: number, resultId: number, endDate: string, name = "Event") {
  return {
    liveResult: {
      resultId,
      tournId,
      division: "MA2",
      place: 3,
      tournament: {
        tournId,
        officialName: name,
        tier: "A",
        endDate: `${endDate}T00:00:00+00:00`,
      },
    },
    averageRoundRating: 925,
  };
}

function overview(
  expDate: string,
  current: number | null = 927,
  previous: number | null = 914,
) {
  const rating = (value: number | null, date: string) =>
    value === null ? null : { rating: value, effectiveDate: `${date}T00:00:00+00:00` };
  return {
    member: {
      firstName: "Casey",
      lastName: "Clark",
      city: "Richmond",
      stateProv: "VA",
      country: "US",
      expDate: `${expDate}T00:00:00+00:00`,
    },
    currentRating: rating(current, "2026-11-10"),
    previousRating: rating(previous, "2026-07-14"),
  };
}

const roundItem = {
  tournId: 98279,
  round: 1,
  rating: 932,
  division: "MA1",
  postedToRating: 1,
  usedInGross: 1,
  tournament: {
    officialName: "Fall Colors - All Pro",
    endDate: "2026-11-08T00:00:00+00:00",
    tier: "A",
  },
};

const TODAY = "2026-11-16";

describe("utcDate", () => {
  it("reads the UTC calendar date", () => {
    expect(utcDate("2026-11-15T00:00:00+00:00")).toBe("2026-11-15");
    expect(utcDate("2026-11-15T23:00:00-05:00")).toBe("2026-11-16");
    expect(utcDate("2026-11-15")).toBe("2026-11-15");
  });

  it("treats timestamps without an offset as UTC", () => {
    expect(utcDate("2026-11-15T00:00:00")).toBe("2026-11-15");
  });
});

describe("parseProfile", () => {
  it("parses a current member", () => {
    const info = parseProfile(167210, overview("2026-12-31"), TODAY);
    expect(info).toEqual({
      pdgaNo: 167210,
      name: "Casey Clark",
      location: "Richmond, VA, US",
      membership: { current: true, expDate: "2026-12-31" },
      officialRating: 927,
      ratingDate: "2026-11-10",
      ratingChange: 13,
      prevRatingDate: "2026-07-14",
    });
  });

  it("gives expired members no official rating", () => {
    // overview still returns the last rating after membership lapses
    const info = parseProfile(1, overview("2022-12-31", 851, 906), TODAY);
    expect(info.membership).toEqual({ current: false, expDate: "2022-12-31" });
    expect(info.officialRating).toBeNull();
    expect(info.ratingDate).toBeNull();
    expect(info.ratingChange).toBeNull();
  });

  it("reports a rating drop as a negative change", () => {
    expect(parseProfile(1, overview("2026-12-31", 941, 948), TODAY).ratingChange).toBe(
      -7,
    );
  });

  it("handles no previous rating", () => {
    const info = parseProfile(1, overview("2026-12-31", 927, null), TODAY);
    expect(info.officialRating).toBe(927);
    expect(info.ratingChange).toBeNull();
  });

  it("rejects a response in an unexpected shape", () => {
    expect(() => parseProfile(1, { member: "nope" }, TODAY)).toThrow();
  });
});

describe("parseRounds", () => {
  it("maps rounds to the shared shape", () => {
    expect(parseRounds([roundItem])).toEqual(OFFICIAL);
  });

  it("returns no rounds for an empty response", () => {
    expect(parseRounds(null)).toEqual([]);
    expect(parseRounds([])).toEqual([]);
  });

  it("skips rounds with no rating", () => {
    expect(parseRounds([{ ...roundItem, rating: null }])).toEqual([]);
  });
});

describe("findNewEvents", () => {
  it("finds events not yet in the rating", () => {
    const pending = findNewEvents(
      [
        result(98281, 111, "2026-11-15", "Fall Colors - All Am"),
        result(98279, 222, "2026-11-08"), // already in rating detail
      ],
      OFFICIAL,
    );
    expect(pending.map((p) => p.event.tournament)).toEqual(["Fall Colors - All Am"]);
    expect(pending[0]?.resultId).toBe(111);
  });

  it("skips events older than the latest rated round", () => {
    expect(findNewEvents([result(90000, 333, "2025-01-01")], OFFICIAL)).toEqual([]);
  });

  it("treats every event as new when there are no official rounds", () => {
    const pending = findNewEvents([result(90000, 333, "2025-01-01")], []);
    expect(pending).toHaveLength(1);
  });
});

describe("parseLiveScores", () => {
  const event: NewEvent = {
    tournament: "Fall Colors - All Am",
    tournamentUrl: "https://www.pdga.com/tour/event/98281",
    date: "2026-11-15",
    tier: "A",
    division: "MA2",
    place: 3,
    avgRoundRating: 925,
    roundsFound: true,
  };

  it("adds one round per rated score", () => {
    const rounds = parseLiveScores(
      {
        data: {
          Scores: [
            { Round: 1, RoundRating: 968 },
            { Round: 2, RoundRating: 881 },
            { Round: 3, RoundRating: 925 },
          ],
        },
      },
      event,
    );
    expect(rounds.map((r) => r.rating)).toEqual([968, 881, 925]);
    expect(rounds.map((r) => r.round)).toEqual(["1", "2", "3"]);
    expect(rounds.every((r) => r.pdgaEvaluated === null)).toBe(true);
  });

  it("skips unrated rounds", () => {
    const rounds = parseLiveScores(
      {
        data: {
          Scores: [
            { Round: 1, RoundRating: 968 },
            { Round: 2, RoundRating: null },
          ],
        },
      },
      event,
    );
    expect(rounds).toHaveLength(1);
  });
});

/** Fake fetcher answering by label; `live:<id>` for live results. */
function fakeFetch(responses: Record<string, unknown>) {
  return vi.fn(async (_url: string, label: string) => {
    const value = responses[label];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new HttpError(404, label);
    return value;
  });
}

function client(responses: Record<string, unknown>) {
  const fetchJson = fakeFetch(responses);
  const pdga = createPdgaClient({
    urls: URLS,
    fetchJson,
    cache: new MemoryCache(),
    today: () => TODAY,
  });
  return { pdga, fetchJson };
}

describe("createPdgaClient", () => {
  const responses = {
    profile: overview("2026-12-31"),
    rounds: [roundItem],
    events: [result(98281, 111, "2026-11-15", "Fall Colors - All Am")],
    "live:111": { data: { Scores: [{ Round: 1, RoundRating: 968 }] } },
  };

  it("loads official rounds plus rounds from new events", async () => {
    const { pdga } = client(responses);
    const data = await pdga.loadPlayer(167210);
    expect(data.info.name).toBe("Casey Clark");
    expect(data.officialRounds).toHaveLength(1);
    expect(data.newRounds.map((r) => r.rating)).toEqual([968]);
    expect(data.newEvents.map((e) => e.tournament)).toEqual(["Fall Colors - All Am"]);
  });

  it("fills in the PDGA number in URL templates", async () => {
    const { pdga, fetchJson } = client(responses);
    await pdga.loadPlayer(167210);
    expect(fetchJson).toHaveBeenCalledWith(
      "https://example.test/167210/profile",
      "profile",
    );
  });

  it("keeps the event listed when live scores fail", async () => {
    const { pdga } = client({ ...responses, "live:111": new Error("live api down") });
    const data = await pdga.loadPlayer(167210);
    expect(data.newEvents).toHaveLength(1);
    expect(data.newEvents[0]?.roundsFound).toBe(false);
    expect(data.newRounds).toEqual([]);
  });

  it("serves repeat lookups from cache", async () => {
    const { pdga, fetchJson } = client(responses);
    await pdga.loadPlayer(167210);
    await pdga.loadPlayer(167210);
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });

  it("stops after the profile 404s for an unknown number", async () => {
    const { pdga, fetchJson } = client({});
    await expect(pdga.loadPlayer(9)).rejects.toMatchObject({ status: 404 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
});
