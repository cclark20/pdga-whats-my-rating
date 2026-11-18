import { describe, expect, it } from "vitest";
import {
  agedOutRounds,
  calculateRating,
  droppedFromWindow,
  roundHalfEven,
  subtractYears,
} from "../src/rating.ts";
import { daysAgo, makeRounds } from "./helpers.ts";

const byRating = (rating: number) => (r: { rating: number }) => r.rating === rating;

describe("calculateRating", () => {
  it("rating is close to the average of input ratings", () => {
    const { rating } = calculateRating(
      makeRounds([900, 910, 920, 905, 915, 895, 910, 920]),
    );
    expect(rating).toBeGreaterThanOrEqual(890);
    expect(rating).toBeLessThanOrEqual(930);
  });

  it("double-weights the most recent 25% (≥9 rounds)", () => {
    // 9 rounds: last 25% (2 most recent) are double-weighted
    const { rating } = calculateRating(
      makeRounds([1000, 1000, 900, 900, 900, 900, 900, 900, 900]),
    );
    // weighted avg = (1000*2 + 1000*2 + 900*7) / 11
    expect(rating).toBe(Math.ceil(10300 / 11));
  });

  it("excludes XM tier rounds", () => {
    const result = calculateRating(
      makeRounds([900, 910, 920, 905, 800], { tiers: ["A", "A", "A", "A", "XM"] }),
    );
    expect(result.rounds.some((r) => r.tier === "XM")).toBe(false);
    expect(result.rating).toBeGreaterThan(800);
  });

  it("does not evaluate '(Unrated)' tournaments", () => {
    const result = calculateRating(
      makeRounds([900, 910, 920, 905, 800], {
        tournaments: [
          "Tournament A",
          "Tournament B",
          "Tournament C",
          "Tournament D",
          "SOMD ICE BOWL (Unrated)",
        ],
      }),
    );
    const unrated = result.rounds.find(
      (r) => r.tournament === "SOMD ICE BOWL (Unrated)",
    );
    expect(unrated?.evaluated).toBe(false);
    expect(unrated?.weight).toBe(0);
    expect(result.rating).toBeGreaterThan(800);
  });

  it("does not evaluate rounds older than 12 months", () => {
    const dates = [30, 60, 90, 120, 150, 180, 210, 240, 400].map(daysAgo);
    const result = calculateRating(
      makeRounds([900, 910, 920, 905, 915, 895, 910, 920, 500], { dates }),
    );
    const old = result.rounds.find(byRating(500));
    expect(old?.evaluated).toBe(false);
    expect(old?.weight).toBe(0);
    expect(result.rating).toBeGreaterThan(850);
  });

  it("drops rounds below the 2.5 SD (+5) threshold", () => {
    const result = calculateRating(
      makeRounds([950, 950, 950, 950, 950, 950, 950, 950, 600]),
    );
    const outlier = result.rounds.find(byRating(600));
    expect(outlier?.used).toBe(false);
    expect(outlier?.weight).toBe(0);
  });

  it("uses the 100-point threshold when 2.5 SD > 100", () => {
    const ratings = [1000, 900, 800, 1000, 900, 800, 1000, 900, 800];
    const m = ratings.reduce((a, b) => a + b) / ratings.length;
    const std = Math.sqrt(
      ratings.reduce((s, x) => s + (x - m) ** 2, 0) / ratings.length,
    );
    expect(2.5 * std).toBeGreaterThanOrEqual(100);
    const result = calculateRating(makeRounds(ratings));
    // 800s are dropped on first pass, then threshold shifts
    // on second pass based on remaining [1000, 900] rounds
    expect(result.rounds.filter(byRating(800)).every((r) => r.weight === 0)).toBe(true);
  });

  it("marks used only when weight > 0", () => {
    const result = calculateRating(
      makeRounds([900, 910, 920, 905, 915, 895, 910, 920]),
    );
    for (const r of result.rounds) expect(r.used).toBe(r.weight > 0);
  });

  it("computes moving averages for every round", () => {
    const result = calculateRating(makeRounds([900, 910, 920, 930, 940]));
    for (const r of result.rounds) {
      expect(Number.isFinite(r.mavg5)).toBe(true);
      expect(Number.isFinite(r.mavg15)).toBe(true);
    }
    // newest round's 5-round average covers all five
    expect(result.rounds[0]?.mavg5).toBe(920);
    // oldest round averages only itself
    expect(result.rounds.at(-1)?.mavg5).toBe(940);
  });

  it("orders moving averages by play order within an event", () => {
    const result = calculateRating(
      makeRounds([900, 1000], {
        dates: ["2026-01-01", "2026-01-01"],
        rounds: ["1", "2"],
      }),
    );
    // round 1 is played first, so it averages only itself
    expect(result.rounds.find((r) => r.round === "1")?.mavg5).toBe(900);
    expect(result.rounds.find((r) => r.round === "2")?.mavg5).toBe(950);
  });

  it("double-weights round(25%) of evaluated rounds", () => {
    const result = calculateRating(
      makeRounds(Array.from({ length: 12 }, (_, i) => 900 + i * 5)),
    );
    const doubled = result.rounds.filter((r) => r.weight === 2).length;
    expect(doubled).toBe(roundHalfEven(result.nEvaluated * 0.25));
  });

  it("returns a breakdown with rating, threshold and window", () => {
    const result = calculateRating(makeRounds([900, 910, 920, 905]));
    expect(Number.isInteger(result.rating)).toBe(true);
    // fewer than 7 rounds: no outlier removal, so no threshold
    expect(result.threshold).toBeNull();
    expect([12, 24]).toContain(result.windowMonths);
  });

  it("does not double-weight below 9 rounds", () => {
    const result = calculateRating(
      makeRounds([1000, 1000, 900, 900, 900, 900, 900, 900]),
    );
    expect(result.rounds.filter((r) => r.weight === 2)).toHaveLength(0);
  });

  it("double-weights at exactly 9 rounds", () => {
    const result = calculateRating(
      makeRounds([1000, 1000, 900, 900, 900, 900, 900, 900, 900]),
    );
    expect(result.rounds.filter((r) => r.weight === 2)).toHaveLength(2);
  });

  it("uses banker's rounding for the double-weight count", () => {
    // 10 rounds → round(2.5) == 2 in Python; Math.round would give 3
    const result = calculateRating(makeRounds(Array(10).fill(900)));
    expect(result.rounds.filter((r) => r.weight === 2)).toHaveLength(2);
  });

  it("doesn't let recent XM rounds shrink the double-weighted set", () => {
    const ratings = Array(12).fill(900);
    const tiers = ["XM", "XM", "XM", ...Array(9).fill("A")];
    const result = calculateRating(makeRounds(ratings, { tiers }));
    // 9 evaluated rounds → round(2.25) = 2 doubled, all of them real rounds
    expect(result.nEvaluated).toBe(9);
    expect(result.rounds.filter((r) => r.weight === 2)).toHaveLength(2);
  });

  it("doesn't double-weight a recent unrated round", () => {
    const tournaments = ["Ice Bowl (Unrated)", ...Array(10).fill("Event")];
    const result = calculateRating(makeRounds(Array(11).fill(900), { tournaments }));
    const unrated = result.rounds.find((r) => r.tournament.includes("Unrated"));
    expect(unrated?.weight).toBe(0);
    // 10 evaluated → round(2.5) = 2 doubled, both rated
    expect(result.rounds.filter((r) => r.weight === 2 && r.evaluated)).toHaveLength(2);
  });

  it("does not remove outliers below 7 rounds", () => {
    const result = calculateRating(makeRounds([950, 950, 950, 950, 950, 600]));
    const outlier = result.rounds.find(byRating(600));
    expect(outlier?.used).toBe(true);
    expect(outlier?.weight).toBeGreaterThan(0);
  });

  it("removes outliers at 7 rounds", () => {
    const result = calculateRating(makeRounds([950, 950, 950, 950, 950, 950, 600]));
    const outlier = result.rounds.find(byRating(600));
    expect(outlier?.used).toBe(false);
    expect(outlier?.weight).toBe(0);
  });

  it("extends to 24 months with <8 rounds in 12", () => {
    const dates = [30, 60, 90, 120, 150, 400, 420, 440, 460, 480].map(daysAgo);
    const result = calculateRating(
      makeRounds([900, 910, 920, 905, 915, 890, 885, 895, 880, 870], { dates }),
    );
    expect(result.windowMonths).toBe(24);
    const old = result.rounds.filter((r) =>
      [890, 885, 895, 880, 870].includes(r.rating),
    );
    expect(old.every((r) => r.evaluated)).toBe(true);
  });

  it("keeps the 12-month window with ≥8 rounds", () => {
    const dates = [
      ...Array.from({ length: 10 }, (_, i) => daysAgo(i * 14)),
      daysAgo(400),
    ];
    const ratings = [...Array.from({ length: 10 }, (_, i) => 900 + i * 5), 800];
    const result = calculateRating(makeRounds(ratings, { dates }));
    expect(result.windowMonths).toBe(12);
    expect(result.rounds.find(byRating(800))?.evaluated).toBe(false);
  });

  it("uses what's available with <8 rounds even in 24 months", () => {
    const dates = [30, 60, 400, 420, 440].map(daysAgo);
    const result = calculateRating(makeRounds([900, 910, 890, 885, 895], { dates }));
    expect(result.windowMonths).toBe(24);
    expect(result.rounds.every((r) => r.evaluated)).toBe(true);
  });

  it("returns a null rating when nothing counts", () => {
    const result = calculateRating(makeRounds([900, 910], { tiers: ["XM", "XM"] }));
    expect(result.rating).toBeNull();
    expect(result.avg).toBeNull();
  });

  it("sorts newest first, rounds ascending within a date", () => {
    const result = calculateRating(
      makeRounds([900, 910, 920], {
        dates: ["2026-01-01", "2026-01-01", "2026-02-01"],
        rounds: ["10", "2", "1"],
      }),
    );
    expect(result.rounds.map((r) => r.round)).toEqual(["1", "2", "10"]);
  });
});

describe("subtractYears", () => {
  it("clamps Feb 29 like pd.DateOffset", () => {
    expect(subtractYears("2028-02-29", 1)).toBe("2027-02-28");
    expect(subtractYears("2028-02-29", 4)).toBe("2024-02-29");
    expect(subtractYears("2026-11-08", 1)).toBe("2025-11-08");
  });
});

describe("agedOutRounds", () => {
  // mirrors 167210: previous rating 14-Jul-2026, current 10-Nov-2026
  const DATES = [
    "2026-11-08",
    "2026-06-21",
    "2026-06-06",
    "2026-05-26",
    "2026-04-26",
    "2026-04-12",
    "2026-04-11",
    "2026-04-03",
    "2026-02-21",
    "2025-09-14",
    "2025-07-20",
    "2025-06-29",
    "2025-06-14",
    "2024-11-10",
  ];
  const official = () =>
    calculateRating(
      makeRounds(Array(DATES.length).fill(920), {
        dates: DATES,
        tournaments: DATES.map((d) => `Event ${d}`),
      }),
    );

  it("returns only rounds between the two windows", () => {
    // prev window starts 21-Jun-2025 (from its latest round), current window
    // starts 08-Nov-2025; only rounds in between aged out
    const aged = agedOutRounds(official(), "2026-07-14");
    expect(aged.map((r) => r.date).sort()).toEqual([
      "2025-06-29",
      "2025-07-20",
      "2025-09-14",
    ]);
  });

  it("returns nothing when no rounds were added since the previous rating", () => {
    const older = calculateRating(
      official().rounds.filter((r) => r.date < "2026-07-01"),
    );
    expect(agedOutRounds(older, "2026-07-14")).toEqual([]);
  });

  it("returns nothing with no rounds before the previous rating", () => {
    expect(agedOutRounds(official(), "2020-01-01")).toEqual([]);
  });

  it("handles the window shrinking from 24 to 12 months", () => {
    // previous rating used the 24-month window (<8 rounds in 12 months);
    // once enough recent rounds exist, the older rounds age out
    const dates = [
      ...Array.from(
        { length: 9 },
        (_, i) => `2026-${String(i + 2).padStart(2, "0")}-01`,
      ),
      "2025-06-01",
      "2025-03-01", // in prev 12-month window
      "2024-12-01",
      "2024-09-01", // only in prev 24-month window
    ];
    const current = calculateRating(
      makeRounds(Array(dates.length).fill(920), {
        dates,
        tournaments: dates.map((d) => `E ${d}`),
      }),
    );
    expect(current.windowMonths).toBe(12);

    const aged = agedOutRounds(current, "2026-01-15");
    expect(aged.map((r) => r.date).sort()).toEqual([
      "2024-09-01",
      "2024-12-01",
      "2025-03-01",
      "2025-06-01",
    ]);
  });
});

describe("droppedFromWindow", () => {
  it("returns rounds PDGA evaluated that fell out of the projected window", () => {
    const rounds = makeRounds(Array(10).fill(920), {
      dates: [
        ...Array.from(
          { length: 9 },
          (_, i) => `2026-${String(i + 2).padStart(2, "0")}-01`,
        ),
        "2025-06-01",
      ],
      tournaments: Array.from({ length: 10 }, (_, i) => `E ${i}`),
    }).map((r) => ({ ...r, pdgaEvaluated: true }));
    const dropped = droppedFromWindow(calculateRating(rounds));
    expect(dropped.map((r) => r.date)).toEqual(["2025-06-01"]);
  });
});
