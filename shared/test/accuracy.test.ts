/**
 * Regression tests comparing calculateRating against official PDGA ratings.
 *
 * To add a new test case:
 * 1. Save the player's ratings detail CSV to
 *    tests/fixtures/player_{pdga_no}_{rating_date}.csv
 *    Columns: tournament, date, tier, division, round, rating
 * 2. Add a row to the table below.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateRating } from "../src/rating.ts";
import { readFixture } from "./helpers.ts";

const FIXTURES_DIR = fileURLToPath(new URL("../../tests/fixtures/", import.meta.url));

describe("matches official rating", () => {
  it.each([
    // Casey Clark - official 909 as of 2025-10-14
    ["player_167210_2025-10-14.csv", 909, 2],
    // Joshua Harrell - official 963 as of 2025-08-12 (calc=957, off by 6)
    ["player_167214_2025-08-12.csv", 963, 7],
    // David Caravas - official 857 as of 2025-11-11
    ["player_204766_2025-11-11.csv", 857, 2],
    // Paul McBeth - official 1047 as of 2025-11-11
    ["player_27523_2025-11-11.csv", 1047, 2],
    // Calvin Heimburg - official 1051 as of 2026-02-10
    ["player_45971_2026-02-10.csv", 1051, 2],
    // Brian Schweberger - official 1002 as of 2026-02-10
    ["player_12989_2026-02-10.csv", 1002, 2],
    // Ben Adinolfi - official 940 as of 2025-11-11
    ["player_146195_2025-11-11.csv", 940, 2],
    // Tyler Adkins - official 768 as of 2026-03-10 (has unrated tournament)
    ["player_298827_2026-03-10.csv", 768, 2],
  ])("%s", (file, official, tolerance) => {
    const { rating } = calculateRating(readFixture(FIXTURES_DIR + file));
    expect(rating).not.toBeNull();
    expect(Math.abs((rating ?? 0) - official)).toBeLessThanOrEqual(tolerance);
  });
});
