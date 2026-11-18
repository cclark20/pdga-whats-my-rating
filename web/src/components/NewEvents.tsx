import type { RatedRound } from "@wmr/shared";
import { formatDate, plural } from "../lib/format";
import type { EventEffect } from "../lib/projection";
import Delta from "./Delta";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** How the event's rounds count, in one sentence. */
function verdict(rounds: RatedRound[], threshold: number | null): string {
  const n = rounds.length;
  const doubled = rounds.filter((r) => r.used && r.weight === 2).length;
  const dropped = rounds.filter((r) => r.evaluated && !r.used).length;
  const parts: string[] = [];
  if (doubled === n)
    parts.push(n === 1 ? "It counts double" : `All ${n} rounds count double`);
  else if (doubled > 0) parts.push(`${doubled} of ${n} rounds count double`);
  if (dropped > 0) {
    parts.push(
      `${plural(dropped, "round")} ${dropped === 1 ? "falls" : "fall"} at or below ${threshold} and won't count against you`,
    );
  }
  return parts.length ? `${parts.join("; ")}.` : "";
}

/** Points within this band of the rating are noise, so they stay neutral. */
const NEUTRAL_BAND = 5;

function RoundCell({ r, baseline }: { r: RatedRound; baseline: number | null }) {
  const dropped = r.evaluated && !r.used;
  const diff = baseline === null ? null : r.rating - baseline;
  const tone =
    diff === null || Math.abs(diff) <= NEUTRAL_BAND
      ? "text-muted"
      : diff > 0
        ? "text-up"
        : "text-down";
  return (
    <li className="flex items-baseline gap-1.5">
      <span className="text-label text-muted">Rd {r.round}</span>
      <span className={dropped ? "text-muted" : ""}>{r.rating}</span>
      {dropped ? (
        <span className="text-label text-muted">not counted</span>
      ) : (
        diff !== null && (
          <span className={tone}>
            {diff > 0 ? "+" : diff < 0 ? "−" : "±"}
            {Math.abs(diff)}
            <span className="sr-only"> against your rating</span>
          </span>
        )
      )}
    </li>
  );
}

/** Why an event has no rounds in the projection. */
function missingReason(event: EventEffect["event"]): string {
  if (event.tier === "XM") {
    return "XM events don't count toward ratings, so this one won't change yours.";
  }
  if (!event.roundsFound) {
    return "Round ratings aren't posted yet, so this event isn't in the projection.";
  }
  return "No rated rounds from this event yet.";
}

export default function NewEvents({
  events,
  baseline,
  threshold,
}: {
  events: EventEffect[];
  /** Each round's +/− is against this rating. */
  baseline: number | null;
  threshold: number | null;
}) {
  if (events.length === 0) return null;
  const many = events.length > 1;

  return (
    <section aria-labelledby="new-heading" className="border-t border-rule py-12">
      <h2 id="new-heading" className="font-display text-display-m font-semibold">
        {many ? "Your new events" : "Your new event"}
      </h2>
      <p className="mt-2 max-w-[65ch] text-ui text-muted">
        Not in your official rating yet. Round ratings come from live scoring and can
        shift a few points when PDGA finalizes the event.
        {baseline !== null &&
          events.some((e) => e.rounds.length > 0) &&
          ` Each round's +/− is against your ${baseline} rating.`}
      </p>

      <ul className="mt-6 space-y-8">
        {events.map(({ event, effect, rounds }) => (
          <li key={event.tournamentUrl}>
            {/* the header row is the tap target for the event link */}
            <div className="relative flex min-h-11 items-start justify-between gap-4">
              <div>
                <a
                  href={event.tournamentUrl}
                  className="text-body font-semibold underline decoration-muted underline-offset-[3px] after:absolute after:inset-0 hover:decoration-highlight"
                >
                  {event.tournament}
                </a>
                <p className="mt-0.5 text-ui text-muted">
                  {[
                    formatDate(event.date),
                    event.division,
                    event.place ? `${ordinal(event.place)} place` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {effect !== null && (
                <div className="shrink-0 text-right">
                  <Delta value={effect} versus="your projection" />
                  <div className="text-label text-muted">this event</div>
                </div>
              )}
            </div>

            {rounds.length > 0 ? (
              <>
                <ul
                  className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-ui"
                  aria-label="Rounds"
                >
                  {rounds.map((r) => (
                    <RoundCell key={r.round} r={r} baseline={baseline} />
                  ))}
                </ul>
                <p className="mt-2 text-ui text-muted">{verdict(rounds, threshold)}</p>
              </>
            ) : (
              <p className="mt-3 text-ui text-muted">{missingReason(event)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
