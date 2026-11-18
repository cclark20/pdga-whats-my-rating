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
