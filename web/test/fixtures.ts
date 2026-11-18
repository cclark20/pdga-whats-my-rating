import { calculateRating, type PlayerResponse, type Round } from "@wmr/shared";

const round = (date: string, rating: number, extra: Partial<Round> = {}): Round => ({
  tournament: `Event ${date}`,
  tournamentUrl: `https://www.pdga.com/tour/event/${date.replaceAll("-", "")}`,
  date,
  tier: "B",
  division: "MA1",
  round: "1",
  rating,
  pdgaEvaluated: true,
  ...extra,
});

const officialRounds = Array.from({ length: 10 }, (_, i) =>
  round(`2026-${String(i + 1).padStart(2, "0")}-01`, 900 + i),
);

/** A current member with official rounds and no new events. */
export function playerResponse(
  overrides: Partial<PlayerResponse["player"]> = {},
): PlayerResponse {
  const official = calculateRating(officialRounds);
  return {
    player: {
      pdgaNo: 167210,
      name: "Casey Clark",
      location: "Richmond, VA, US",
      membership: { current: true, expDate: "2026-12-31" },
      officialRating: official.rating,
      ratingDate: "2026-11-10",
      ratingChange: 3,
      prevRatingDate: "2026-07-14",
      ...overrides,
    },
    official,
    projected: official,
    newEvents: [],
    agedOut: [],
    droppedFromWindow: [],
  };
}
