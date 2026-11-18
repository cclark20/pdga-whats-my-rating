/** A rated round as it comes from PDGA, before our calculation runs. */
export interface Round {
  tournament: string;
  tournamentUrl?: string | null;
  /** Tournament end date, `YYYY-MM-DD`. */
  date: string;
  tier: string;
  division?: string | null;
  round: string;
  rating: number;
  /**
   * PDGA's own "evaluated" flag for this round in the official rating.
   * Null for rounds not yet in an official rating.
   */
  pdgaEvaluated?: boolean | null;
}

/** A round annotated with how our calculation treated it. */
export interface RatedRound extends Round {
  /** 0 = not counted, 1 = counted, 2 = counted double. */
  weight: 0 | 1 | 2;
  /** Inside the rating window. */
  evaluated: boolean;
  /** Evaluated and not dropped as an outlier. */
  used: boolean;
  /** Moving averages over this round and the 4 / 14 before it (chronological). */
  mavg5: number;
  mavg15: number;
}

export interface Breakdown {
  /** Null when no rounds count (e.g. only XM or unrated rounds). */
  rating: number | null;
  /** Outlier drop threshold; null when outlier removal didn't apply (<7 rounds). */
  threshold: number | null;
  windowMonths: 12 | 24;
  nEvaluated: number;
  nUsed: number;
  /** Mean and population std dev of evaluated rounds; null when none. */
  avg: number | null;
  std: number | null;
  /** Newest first. */
  rounds: RatedRound[];
}

export interface PlayerInfo {
  pdgaNo: number;
  name: string;
  location: string | null;
  /** Null when PDGA has no expiration date on file. */
  membership: { current: boolean; expDate: string } | null;
  /** Null for expired members: PDGA only shows a rating for current members. */
  officialRating: number | null;
  /** Effective date of the official rating, `YYYY-MM-DD`. */
  ratingDate: string | null;
  /** Official rating minus the previous official rating. */
  ratingChange: number | null;
  /** Effective date of the previous official rating, `YYYY-MM-DD`. */
  prevRatingDate: string | null;
}

/** An event that isn't in the official rating yet. */
export interface NewEvent {
  tournament: string;
  tournamentUrl: string;
  date: string;
  tier: string;
  division: string | null;
  place: number | null;
  avgRoundRating: number | null;
  /** False when per-round ratings couldn't be fetched from live scoring. */
  roundsFound: boolean;
}

export interface PlayerResponse {
  player: PlayerInfo;
  /** Our reconstruction of the current official rating; null without one. */
  official: Breakdown | null;
  /** Official rounds plus new events; null when the player has no rated rounds. */
  projected: Breakdown | null;
  newEvents: NewEvent[];
  /** Rounds in the previous official rating that aged out of the current one. */
  agedOut: RatedRound[];
  /** Rounds in the current official rating that the projection no longer counts. */
  droppedFromWindow: RatedRound[];
}

export type ApiErrorCode =
  | "invalid_pdga_no"
  | "not_found"
  | "rate_limited"
  | "upstream_error";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
