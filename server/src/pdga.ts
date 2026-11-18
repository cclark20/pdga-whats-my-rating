import type { NewEvent, PlayerInfo, Round } from "@wmr/shared";
import { z } from "zod";
import { type Cache, readThrough } from "./cache.ts";
import type { FetchJson } from "./http.ts";

export const PDGA_LIVE_PLAYER_URL =
  "https://www.pdga.com/apps/tournament/live-api/live_results_fetch_player";

const HOUR = 60 * 60 * 1000;
// official data only changes on monthly ratings updates; events and live
// scores change during a tournament weekend
export const TTL = {
  profile: HOUR,
  rounds: HOUR,
  events: HOUR / 4,
  live: HOUR / 4,
};

/** URL templates with a `{pdga_no}` placeholder. PDGA asked us not to publish them. */
export interface PdgaUrls {
  profile: string;
  rounds: string;
  events: string;
}

const eventUrl = (tournId: number) => `https://www.pdga.com/tour/event/${tournId}`;

/**
 * Calendar date of a PDGA timestamp, in UTC. Timestamps without an offset are
 * treated as UTC (as pandas did with utc=True), not as local time.
 */
export function utcDate(timestamp: string): string {
  const hasZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(timestamp);
  const iso = timestamp.includes("T") && !hasZone ? `${timestamp}Z` : timestamp;
  return new Date(iso).toISOString().slice(0, 10);
}

const nullish = <T extends z.ZodType>(schema: T) => schema.nullish();

const ratingSchema = z
  .object({ rating: nullish(z.number()), effectiveDate: nullish(z.string()) })
  .nullish();

const profileSchema = z.object({
  member: z
    .object({
      firstName: nullish(z.string()),
      lastName: nullish(z.string()),
      city: nullish(z.string()),
      stateProv: nullish(z.string()),
      country: nullish(z.string()),
      expDate: nullish(z.string()),
    })
    .nullish(),
  currentRating: ratingSchema,
  previousRating: ratingSchema,
});

const roundsSchema = z
  .array(
    z.object({
      tournId: nullish(z.number()),
      round: z.union([z.number(), z.string()]),
      rating: nullish(z.number()),
      division: nullish(z.string()),
      postedToRating: nullish(z.number()),
      tournament: z
        .object({
          officialName: nullish(z.string()),
          endDate: nullish(z.string()),
          tier: nullish(z.string()),
        })
        .nullish(),
    }),
  )
  .nullable();

const eventsSchema = z
  .array(
    z.object({
      averageRoundRating: nullish(z.number()),
      liveResult: z
        .object({
          resultId: nullish(z.number()),
          tournId: nullish(z.number()),
          division: nullish(z.string()),
          place: nullish(z.number()),
          tournament: z
            .object({
              officialName: nullish(z.string()),
              tier: nullish(z.string()),
              endDate: nullish(z.string()),
            })
            .nullish(),
        })
        .nullish(),
    }),
  )
  .nullable();

const liveSchema = z.object({
  data: z.object({
    Scores: z
      .array(
        z.object({
          Round: z.union([z.number(), z.string()]),
          RoundRating: nullish(z.union([z.number(), z.string()])),
        }),
      )
      .nullish(),
  }),
});

export function parseProfile(pdgaNo: number, data: unknown, today: string): PlayerInfo {
  const { member, currentRating, previousRating } = profileSchema.parse(data);

  const name = [member?.firstName, member?.lastName].filter(Boolean).join(" ");
  const location = [member?.city, member?.stateProv, member?.country]
    .filter(Boolean)
    .join(", ");

  // calendar date as PDGA wrote it, not shifted into UTC
  const expDate = member?.expDate?.slice(0, 10) ?? null;
  const current = expDate !== null && expDate >= today;

  const info: PlayerInfo = {
    pdgaNo,
    name,
    location: location || null,
    membership: expDate ? { current, expDate } : null,
    officialRating: null,
    ratingDate: null,
    ratingChange: null,
    prevRatingDate: null,
  };

  // the profile keeps returning the last rating after membership lapses,
  // but PDGA only shows an official rating for current members
  if (!current || currentRating?.rating == null) return info;

  info.officialRating = currentRating.rating;
  if (currentRating.effectiveDate)
    info.ratingDate = utcDate(currentRating.effectiveDate);
  if (previousRating?.rating != null) {
    info.ratingChange = currentRating.rating - previousRating.rating;
  }
  if (previousRating?.effectiveDate) {
    info.prevRatingDate = utcDate(previousRating.effectiveDate);
  }
  return info;
}

export function parseRounds(data: unknown): Round[] {
  const items = roundsSchema.parse(data) ?? [];
  return items.flatMap((item) => {
    const endDate = item.tournament?.endDate;
    if (item.rating == null || !endDate) return [];
    return [
      {
        tournament: item.tournament?.officialName ?? "",
        tournamentUrl: item.tournId ? eventUrl(item.tournId) : null,
        date: utcDate(endDate),
        tier: item.tournament?.tier ?? "",
        division: item.division ?? null,
        round: String(item.round),
        rating: item.rating,
        pdgaEvaluated: item.postedToRating === 1,
      },
    ];
  });
}

interface PendingEvent {
  event: NewEvent;
  resultId: number;
  tournId: number;
}

/**
 * Events not in the official rating: not already rated, and ending on or
 * after the latest rated round. With no official rounds, every event is new.
 */
export function findNewEvents(data: unknown, official: Round[]): PendingEvent[] {
  const items = eventsSchema.parse(data) ?? [];
  const ratedIds = new Set(
    official.flatMap((r) =>
      r.tournamentUrl ? [r.tournamentUrl.split("/").at(-1)] : [],
    ),
  );
  const lastRated = official.reduce<string | null>(
    (max, r) => (max === null || r.date > max ? r.date : max),
    null,
  );

  return items.flatMap((item) => {
    const result = item.liveResult;
    const endDate = result?.tournament?.endDate;
    if (!result?.resultId || !result.tournId || !endDate) return [];
    const date = utcDate(endDate);
    if (
      ratedIds.has(String(result.tournId)) ||
      (lastRated !== null && date < lastRated)
    ) {
      return [];
    }
    return [
      {
        resultId: result.resultId,
        tournId: result.tournId,
        event: {
          tournament: result.tournament?.officialName ?? "",
          tournamentUrl: eventUrl(result.tournId),
          date,
          tier: result.tournament?.tier ?? "",
          division: result.division ?? null,
          place: result.place ?? null,
          avgRoundRating: item.averageRoundRating ?? null,
          roundsFound: true,
        },
      },
    ];
  });
}

/** Rated rounds from the live scoring API; unrated (null/0) rounds are skipped. */
export function parseLiveScores(data: unknown, event: NewEvent): Round[] {
  const scores = liveSchema.parse(data).data.Scores ?? [];
  return scores.flatMap((score) => {
    const rating = Number(score.RoundRating);
    if (!score.RoundRating || !Number.isFinite(rating)) return [];
    return [
      {
        tournament: event.tournament,
        tournamentUrl: event.tournamentUrl,
        date: event.date,
        tier: event.tier,
        division: event.division,
        round: String(score.Round),
        rating,
        pdgaEvaluated: null,
      },
    ];
  });
}

export interface PlayerData {
  info: PlayerInfo;
  officialRounds: Round[];
  newRounds: Round[];
  newEvents: NewEvent[];
}

export interface PdgaClientOptions {
  urls: PdgaUrls;
  fetchJson: FetchJson;
  cache: Cache;
  today?: () => string;
  logError?: (message: string, err: unknown) => void;
}

export function createPdgaClient(opts: PdgaClientOptions) {
  const cached = readThrough(opts.cache);
  const today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
  const logError = opts.logError ?? (() => {});
  const url = (name: keyof PdgaUrls, pdgaNo: number) =>
    opts.urls[name].replace("{pdga_no}", String(pdgaNo));

  const get = (name: keyof PdgaUrls, pdgaNo: number) =>
    cached(`${name}:${pdgaNo}`, TTL[name], () =>
      opts.fetchJson(url(name, pdgaNo), name),
    );

  async function loadPlayer(pdgaNo: number): Promise<PlayerData> {
    // unknown PDGA numbers 404 here, which surfaces as HttpError; checking the
    // profile first avoids spending two more requests on a bad number
    const info = parseProfile(pdgaNo, await get("profile", pdgaNo), today());
    const [rounds, events] = await Promise.all([
      get("rounds", pdgaNo),
      get("events", pdgaNo),
    ]);
    const officialRounds = parseRounds(rounds);
    const pending = findNewEvents(events, officialRounds);

    const perEvent = await Promise.all(
      pending.map(async ({ event, resultId }) => {
        try {
          const live = await cached(`live:${resultId}`, TTL.live, () =>
            opts.fetchJson(
              `${PDGA_LIVE_PLAYER_URL}?ResultID=${resultId}`,
              `live:${resultId}`,
            ),
          );
          return parseLiveScores(live, event);
        } catch (err) {
          // keep the event listed even when its rounds can't be fetched
          logError(`Failed to fetch live results for ${event.tournament}`, err);
          event.roundsFound = false;
          return [];
        }
      }),
    );

    return {
      info,
      officialRounds,
      newRounds: perEvent.flat(),
      newEvents: pending.map((p) => p.event),
    };
  }

  return { loadPlayer };
}

export type PdgaClient = ReturnType<typeof createPdgaClient>;
