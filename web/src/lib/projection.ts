import {
  calculateRating,
  type NewEvent,
  type PlayerResponse,
  type RatedRound,
} from "@wmr/shared";

export interface EventEffect {
  event: NewEvent;
  /** Points this event moves the projection, in date order. Null when unknown. */
  effect: number | null;
  /** The event's rounds as the projection treats them, in play order. */
  rounds: RatedRound[];
}

export interface Projection {
  /** The headline projected rating. */
  rating: number | null;
  /** Projected minus official; null without an official rating. */
  change: number | null;
  /** Rounds not yet in an official rating. */
  newRoundCount: number;
  events: EventEffect[];
}

const byPlayOrder = (a: RatedRound, b: RatedRound) =>
  a.date.localeCompare(b.date) || Number(a.round) - Number(b.round);

/**
 * The projection is PDGA's official rating plus the change our calculation
 * gets from new rounds. Any steady gap between our math and PDGA's (hole-count
 * weighting, rounding) cancels out, so with no new rounds the projection is
 * exactly the official rating.
 */
export function project(data: PlayerResponse): Projection {
  const { projected, player, newEvents } = data;
  const rounds = projected?.rounds ?? [];
  const isNew = (r: RatedRound) => r.pdgaEvaluated === null;
  const known = rounds.filter((r) => !isNew(r));
  const newRoundCount = rounds.filter(isNew).length;

  // each event's effect is cumulative in date order, so the effects add up
  // to the total change
  let included = known;
  let previous = known.length ? calculateRating(known).rating : null;
  const events = [...newEvents]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((event) => {
      const eventRounds = rounds
        .filter((r) => isNew(r) && r.tournamentUrl === event.tournamentUrl)
        .sort(byPlayOrder);
      if (eventRounds.length === 0) return { event, effect: null, rounds: eventRounds };
      included = [...included, ...eventRounds];
      const next = calculateRating(included).rating;
      const effect = next !== null && previous !== null ? next - previous : null;
      previous = next;
      return { event, effect, rounds: eventRounds };
    });

  const official = player.officialRating;
  if (official === null) {
    return { rating: projected?.rating ?? null, change: null, newRoundCount, events };
  }
  // nothing countable is new (no events, or only XM / unrated ones): the next
  // update can't move the rating
  if (newRoundCount === 0)
    return { rating: official, change: 0, newRoundCount, events };
  const base = known.length ? calculateRating(known).rating : null;
  const change =
    base !== null && projected?.rating != null ? projected.rating - base : 0;
  return { rating: official + change, change, newRoundCount, events };
}
