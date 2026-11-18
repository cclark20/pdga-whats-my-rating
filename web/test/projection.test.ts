import type { NewEvent, Round } from "@wmr/shared";
import { calculateRating } from "@wmr/shared";
import { describe, expect, it } from "vitest";
import { project } from "../src/lib/projection";
import { playerResponse } from "./fixtures";

const event = (date: string, name: string): NewEvent => ({
  tournament: name,
  tournamentUrl: `https://www.pdga.com/tour/event/${name}`,
  date,
  tier: "B",
  division: "MA1",
  place: 1,
  avgRoundRating: null,
  roundsFound: true,
});

const newRound = (e: NewEvent, round: string, rating: number): Round => ({
  tournament: e.tournament,
  tournamentUrl: e.tournamentUrl,
  date: e.date,
  tier: "B",
  round,
  rating,
  pdgaEvaluated: null,
});

/** Add new events to the fixture, recomputing the projected breakdown. */
function withNewEvents(officialOffset: number, events: [NewEvent, number[]][]) {
  const data = playerResponse();
  const known = data.official?.rounds ?? [];
  const added = events.flatMap(([e, ratings]) =>
    ratings.map((rating, i) => newRound(e, String(i + 1), rating)),
  );
  data.projected = calculateRating([...known, ...added]);
  data.newEvents = events.map(([e]) => e);
  // PDGA's official number differs from our recalculation by a steady offset
  data.player.officialRating = (data.official?.rating ?? 0) + officialOffset;
  return data;
}

describe("project", () => {
  it("holds at the official rating with no new rounds, even with an offset", () => {
    const data = withNewEvents(1, []);
    const p = project(data);
    expect(p.rating).toBe(data.player.officialRating);
    expect(p.change).toBe(0);
    expect(p.newRoundCount).toBe(0);
  });

  it("adds the change from new rounds to PDGA's official rating", () => {
    const data = withNewEvents(3, [[event("2026-11-15", "A"), [990, 990, 990]]]);
    const p = project(data);
    const ours = (data.projected?.rating ?? 0) - (data.official?.rating ?? 0);
    expect(p.change).toBe(ours);
    // the steady 3-point offset carries through instead of leaking into the change
    expect(p.rating).toBe((data.player.officialRating ?? 0) + ours);
  });

  it("splits the change across events in date order", () => {
    const data = withNewEvents(0, [
      [event("2026-11-22", "Later"), [880]],
      [event("2026-11-15", "Earlier"), [990, 990]],
    ]);
    const p = project(data);
    expect(p.events.map((e) => e.event.tournament)).toEqual(["Earlier", "Later"]);
    const sum = p.events.reduce((s, e) => s + (e.effect ?? 0), 0);
    expect(sum).toBe(p.change);
  });

  it("leaves an event without posted rounds out of the effect", () => {
    const pending = { ...event("2026-11-15", "Pending"), roundsFound: false };
    const data = withNewEvents(0, []);
    data.newEvents = [pending];
    const p = project(data);
    expect(p.events[0]?.effect).toBeNull();
    expect(p.change).toBe(0);
  });

  it("holds at official when new events add no countable rounds (e.g. XM)", () => {
    const xm = { ...event("2026-11-15", "Worlds"), tier: "XM" };
    const data = withNewEvents(-1, []);
    data.newEvents = [xm];
    const p = project(data);
    expect(p.rating).toBe(data.player.officialRating);
    expect(p.change).toBe(0);
  });

  it("uses the calculated rating when there is no official one", () => {
    const data = withNewEvents(0, []);
    data.player.officialRating = null;
    const p = project(data);
    expect(p.rating).toBe(data.projected?.rating);
    expect(p.change).toBeNull();
  });
});
