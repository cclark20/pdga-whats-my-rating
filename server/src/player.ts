import {
  agedOutRounds,
  calculateRating,
  droppedFromWindow,
  type PlayerResponse,
} from "@wmr/shared";
import type { PlayerData } from "./pdga.ts";

/** Run the rating calculation over fetched PDGA data. */
export function buildPlayerResponse(data: PlayerData): PlayerResponse {
  const { info, officialRounds, newRounds, newEvents } = data;

  // reconstruct the current official rating from PDGA's rounds, before new events
  const official =
    info.officialRating !== null && officialRounds.length > 0
      ? calculateRating(officialRounds)
      : null;

  const allRounds = [...officialRounds, ...newRounds];
  const projected = allRounds.length > 0 ? calculateRating(allRounds) : null;

  return {
    player: info,
    official,
    projected,
    newEvents,
    agedOut:
      official && info.prevRatingDate
        ? agedOutRounds(official, info.prevRatingDate)
        : [],
    droppedFromWindow: projected ? droppedFromWindow(projected) : [],
  };
}
