import type { Breakdown, RatedRound, Round } from "./types.ts";

/**
 * Python's round(): ties go to the even neighbour (round(2.5) == 2).
 * Math.round sends ties up, which changes the double-weight count for
 * 10, 18, 26, ... evaluated rounds.
 */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Mirrors pd.DateOffset(years=n): Feb 29 clamps to Feb 28 in non-leap years. */
export function subtractYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const year = y - years;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compareRound(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Population standard deviation (numpy/pandas ddof=0). */
function stdDev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function rollingMean(xs: number[], window: number): number[] {
  return xs.map((_, i) => mean(xs.slice(Math.max(0, i - window + 1), i + 1)));
}

const roundKey = (r: Round) => `${r.tournament}\u0000${r.date}\u0000${r.round}`;

/**
 * PDGA rating algorithm:
 * - 12-month window (extended to 24 months if <8 rounds)
 * - Last 25% double-weighted (only when ≥9 evaluated rounds)
 * - Outlier removal at 2.5 SD / 100 pts below avg (only when ≥7 rounds)
 */
export function calculateRating(input: Round[]): Breakdown {
  // newest first; position is taken before the XM filter, matching the
  // index labels the Python version sliced on
  const sorted = input
    .map((r) => ({ ...r }))
    .sort((a, b) =>
      a.date === b.date ? compareRound(a.round, b.round) : a.date < b.date ? 1 : -1,
    )
    .map((r, pos) => ({ r, pos }))
    .filter(({ r }) => r.tier !== "XM");

  const isUnrated = (r: Round) => r.tournament.toLowerCase().includes("(unrated)");
  // newest first, so the first rated round anchors the window
  const maxDate = sorted.find(({ r }) => !isUnrated(r))?.r.date ?? null;

  const inWindow = (r: Round, years: number) =>
    maxDate !== null && !isUnrated(r) && r.date >= subtractYears(maxDate, years);

  // If <8 rounds in 12 months, extend to 24 months (PDGA rule)
  let windowMonths: 12 | 24 = 12;
  let valid = sorted.map(({ r }) => inWindow(r, 1));
  if (valid.filter(Boolean).length < 8) {
    valid = sorted.map(({ r }) => inWindow(r, 2));
    windowMonths = 24;
  }

  const weights: number[] = valid.map((v) => (v ? 1 : 0));

  // double the last 25% (computed before outlier removal)
  // only when ≥9 evaluated rounds (PDGA rule).
  // NOTE: like the Python version, this marks the newest rows by sorted
  // position, so an XM round there shrinks the set and a recent unrated round
  // can get weight 2. Kept for parity with the accuracy fixtures.
  const evaluatedCount = valid.filter(Boolean).length;
  if (evaluatedCount >= 9) {
    const numDouble = roundHalfEven(evaluatedCount * 0.25);
    sorted.forEach(({ pos }, i) => {
      if (pos < numDouble) weights[i] = 2;
    });
  }

  // iteratively remove outliers — dropping a round shifts the avg/std, which
  // may expose additional outliers. Only when ≥7 counted rounds (PDGA rule).
  // 10 is just a safety cap; typically converges in 2-3 passes.
  let threshold: number | null = null;
  if (weights.filter((w) => w > 0).length >= 7) {
    let current = 0;
    for (let pass = 0; pass < 10; pass++) {
      const counted = sorted
        .filter((_, i) => (weights[i] ?? 0) > 0)
        .map(({ r }) => r.rating);
      if (counted.length === 0) break;
      const std = stdDev(counted);
      if (std === 0) break;
      const avg = mean(counted);
      const next =
        2.5 * std < 100
          ? Math.ceil(avg - Math.floor(2.5 * std)) + 5
          : Math.ceil(avg - 100);
      if (next === current) break;
      current = next;
      sorted.forEach(({ r }, i) => {
        if (r.rating <= current) weights[i] = 0;
      });
    }
    threshold = current;
  }

  const rounds: RatedRound[] = sorted.map(({ r }, i) => ({
    ...r,
    weight: (weights[i] ?? 0) as 0 | 1 | 2,
    evaluated: valid[i] ?? false,
    used: (weights[i] ?? 0) > 0,
    mavg5: 0,
    mavg15: 0,
  }));

  // moving averages run oldest → newest over every non-XM round, in the order
  // rounds were played (so not just the newest-first list reversed)
  const chronological = [...rounds].sort((a, b) =>
    a.date === b.date ? compareRound(a.round, b.round) : a.date < b.date ? -1 : 1,
  );
  const ratings = chronological.map((r) => r.rating);
  const m5 = rollingMean(ratings, 5);
  const m15 = rollingMean(ratings, 15);
  chronological.forEach((r, i) => {
    r.mavg5 = m5[i] ?? r.rating;
    r.mavg15 = m15[i] ?? r.rating;
  });

  const totalWeight = rounds.reduce((s, r) => s + r.weight, 0);
  const weightedSum = rounds.reduce((s, r) => s + r.rating * r.weight, 0);
  const evaluatedRatings = rounds.filter((r) => r.evaluated).map((r) => r.rating);

  return {
    rating: totalWeight === 0 ? null : Math.ceil(weightedSum / totalWeight),
    threshold,
    windowMonths,
    nEvaluated: evaluatedRatings.length,
    nUsed: rounds.filter((r) => r.used).length,
    avg: evaluatedRatings.length ? mean(evaluatedRatings) : null,
    std: evaluatedRatings.length ? stdDev(evaluatedRatings) : null,
    rounds,
  };
}

/**
 * Rounds evaluated in the previous official rating but not the current one.
 *
 * The previous rating is rebuilt from rounds dated before its effective date,
 * so its window is anchored on the latest round it could include.
 * `official` is the calculateRating output for the current rating.
 */
export function agedOutRounds(
  official: Breakdown,
  prevRatingDate: string,
): RatedRound[] {
  const prevRounds = official.rounds.filter((r) => r.date < prevRatingDate);
  if (prevRounds.length === 0) return [];

  const prev = calculateRating(prevRounds);
  const prevEvaluated = new Set(prev.rounds.filter((r) => r.evaluated).map(roundKey));
  return official.rounds.filter((r) => !r.evaluated && prevEvaluated.has(roundKey(r)));
}

/**
 * Rounds PDGA evaluated in the last official rating that our projection no
 * longer evaluates, because new rounds pushed the window forward.
 */
export function droppedFromWindow(projected: Breakdown): RatedRound[] {
  return projected.rounds.filter((r) => r.pdgaEvaluated === true && !r.evaluated);
}
