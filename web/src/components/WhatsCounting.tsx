import { type PlayerResponse, type RatedRound, subtractYears } from "@wmr/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, plural } from "../lib/format";

const shortDate = (date: string) => formatDate(date).replace(/, \d{4}$/, "");

function RoundList({
  rounds,
  rating,
}: {
  rounds: RatedRound[];
  rating?: (r: RatedRound) => ReactNode;
}) {
  return (
    <ul className="text-ui">
      {rounds.map((r) => (
        <li
          key={`${r.tournament}|${r.date}|${r.round}`}
          className="relative grid min-h-11 grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[7rem_1fr_3rem_4rem]"
        >
          <span className="text-muted max-sm:hidden">{formatDate(r.date)}</span>
          <span>
            {r.tournamentUrl ? (
              <a
                href={r.tournamentUrl}
                // the whole row is the tap target
                title={r.tournament}
                className="line-clamp-2 underline decoration-muted underline-offset-[3px] after:absolute after:inset-0 hover:decoration-highlight"
              >
                {r.tournament}
              </a>
            ) : (
              <span className="line-clamp-2">{r.tournament}</span>
            )}
            {r.pdgaEvaluated === null && <span className="label">New</span>}
            <span className="block text-label text-muted sm:hidden">
              {formatDate(r.date)} · Rd {r.round}
            </span>
          </span>
          <span className="text-muted max-sm:hidden">Rd {r.round}</span>
          <span className="text-right">{rating ? rating(r) : r.rating}</span>
        </li>
      ))}
    </ul>
  );
}

/** A group that matters right now: always open. */
function Group({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule py-6">
      <h3 className="text-ui font-semibold">{title}</h3>
      {note && <p className="mt-1 text-ui text-muted">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** History that explains the past: collapsed behind a count. */
function Disclosure({
  title,
  note,
  children,
}: {
  title: string;
  note: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group border-t border-rule">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-3 text-ui font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="shrink-0 transition-transform duration-150 ease-out group-open:rotate-90"
        />
        {title}
      </summary>
      <div className="pb-6 pl-6">
        <p className="text-ui text-muted">{note}</p>
        <div className="mt-2">{children}</div>
      </div>
    </details>
  );
}

export default function WhatsCounting({ data }: { data: PlayerResponse }) {
  const { projected, agedOut, droppedFromWindow, player } = data;
  if (!projected) return null;

  const evaluated = projected.rounds.filter((r) => r.evaluated);
  const doubled = projected.rounds.filter((r) => r.used && r.weight === 2);
  const dropped = evaluated.filter((r) => !r.used);
  const windowEnd = evaluated[0]?.date;
  const windowStart =
    windowEnd && subtractYears(windowEnd, projected.windowMonths / 12);

  // one way of counting everywhere: N in the window, M count, the rest dropped
  const counted =
    dropped.length > 0
      ? `; ${projected.nUsed} count and ${dropped.length} ${dropped.length === 1 ? "is" : "are"} dropped`
      : "";
  const summary = [
    `${plural(evaluated.length, "round")} in the ${projected.windowMonths}-month window${
      windowStart && windowEnd
        ? ` (${formatDate(windowStart)} to ${formatDate(windowEnd)})`
        : ""
    }${counted}.`,
    doubled.length > 0
      ? `The ${doubled.length} most recent count double.`
      : "With fewer than 9 rounds, none count double.",
    projected.threshold === null
      ? "With fewer than 7 rounds, none are dropped."
      : dropped.length > 0
        ? `Rounds at or below ${projected.threshold} are dropped, so they don't count against you.`
        : `Nothing is at or below the drop threshold of ${projected.threshold}.`,
  ].join(" ");

  return (
    <section aria-labelledby="counting-heading" className="border-t border-rule py-12">
      <h2 id="counting-heading" className="font-display text-display-m font-semibold">
        What's counting
      </h2>
      <p className="mt-3 max-w-[65ch] text-body text-muted">{summary}</p>

      <div className="mt-6">
        {doubled.length > 0 && (
          <Group
            title="Counting double"
            note="The most recent 25% of rounds in the window."
          >
            <RoundList
              rounds={doubled}
              rating={(r) => (
                <>
                  <span className="mr-1 text-label text-highlight-text" aria-hidden>
                    2×
                  </span>
                  <span className="sr-only">counts double, </span>
                  {r.rating}
                </>
              )}
            />
          </Group>
        )}

        {dropped.length > 0 && (
          <Group
            title="Dropped, not held against you"
            note={`Rounds at or below ${projected.threshold} in the window don't count, so they can't pull your rating down.`}
          >
            <RoundList
              rounds={dropped}
              rating={(r) => (
                <span className="text-muted">
                  {r.rating}
                  <span className="sr-only"> (dropped)</span>
                </span>
              )}
            />
          </Group>
        )}

        {droppedFromWindow.length > 0 && (
          <Disclosure
            title={`${plural(droppedFromWindow.length, "round")} leaving at the next update`}
            note="These count in your official rating, but your new rounds move the window past them."
          >
            <RoundList rounds={droppedFromWindow} />
          </Disclosure>
        )}

        {agedOut.length > 0 && player.prevRatingDate && player.ratingDate && (
          <Disclosure
            title={`${plural(agedOut.length, "round")} aged out at the ${shortDate(player.ratingDate)} update`}
            note={`Counted in your ${formatDate(player.prevRatingDate)} rating, but not in the ${formatDate(player.ratingDate)} one.`}
          >
            <RoundList rounds={agedOut} />
          </Disclosure>
        )}
      </div>
    </section>
  );
}
