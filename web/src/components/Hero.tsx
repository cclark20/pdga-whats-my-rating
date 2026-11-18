import type { PlayerResponse } from "@wmr/shared";
import { ArrowUpRight } from "lucide-react";
import { formatDate, plural } from "../lib/format";
import type { Projection } from "../lib/projection";
import Delta from "./Delta";

const shortDate = (date: string) => formatDate(date).replace(/, \d{4}$/, "");

function contextLine(data: PlayerResponse, p: Projection): string {
  const { player, newEvents } = data;
  if (p.rating === null) return "";
  if (player.officialRating === null) {
    return `Calculated from your round history: ${plural(data.projected?.nUsed ?? 0, "round")}.`;
  }
  if (p.newRoundCount === 0) {
    if (newEvents.length > 0) {
      return `Nothing new counts toward your rating yet, so it holds at ${player.officialRating}.`;
    }
    const since = player.ratingDate
      ? ` since the ${shortDate(player.ratingDate)} update`
      : "";
    return `No new rated rounds${since}, so your rating holds at ${player.officialRating}.`;
  }
  const n = p.events.filter((e) => e.rounds.length > 0).length;
  const one = n === 1;
  const subject = one ? "Your new event" : `Your ${n} new events`;
  const change = p.change ?? 0;
  if (change === 0)
    return `${subject} ${one ? "leaves" : "leave"} your rating unchanged.`;
  const verb = change > 0 ? (one ? "adds" : "add") : one ? "takes off" : "take off";
  return `${subject} ${verb} ${plural(Math.abs(change), "point")}, if live ratings hold.`;
}

export default function Hero({
  data,
  projection,
}: {
  data: PlayerResponse;
  projection: Projection;
}) {
  const { player } = data;
  const official = player.officialRating;
  const showProjectedDelta =
    projection.change !== null && projection.newRoundCount > 0 && official !== null;
  const officialCaption = player.prevRatingDate
    ? `since ${shortDate(player.prevRatingDate)}`
    : "";

  return (
    <section aria-label="Rating summary" className="py-12">
      <h1 className="mb-1 font-display text-display-l font-semibold">
        <a
          href={`https://www.pdga.com/player/${player.pdgaNo}`}
          className="group inline-flex min-h-11 items-center gap-2 no-underline hover:underline"
        >
          {player.name || `PDGA #${player.pdgaNo}`}
          <ArrowUpRight
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className="shrink-0 text-muted transition-colors duration-150 ease-out group-hover:text-text"
          />
          <span className="sr-only"> (PDGA profile)</span>
        </a>
      </h1>
      {player.location && <p className="label">{player.location}</p>}

      {/* Phones lead with the projection, the answer people come for; desktop
          reads official → projected left to right. */}
      <div className="mt-10 flex flex-col gap-8 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-0">
        <div className="sm:order-2 sm:pl-12">
          <div className="label mb-3">Projected · unofficial</div>
          <div className="flex items-baseline gap-4">
            <span className="font-display text-display-hero-sm font-semibold sm:text-display-xl">
              {projection.rating ?? "—"}
            </span>
            {showProjectedDelta && (
              <span className="flex flex-col">
                <Delta value={projection.change ?? 0} versus="official" />
                <span className="text-label text-muted">vs official</span>
              </span>
            )}
          </div>
        </div>

        <div className="sm:order-1 sm:border-r sm:border-rule sm:pr-12">
          <div className="label mb-1 sm:mb-3">
            {official !== null && player.ratingDate
              ? `Official · ${formatDate(player.ratingDate)}`
              : "Official"}
          </div>
          {/* phone: one compact line; desktop: a hero figure like the projection */}
          <div className="flex items-baseline gap-3 sm:gap-4">
            <span className="font-display text-display-m font-semibold sm:text-display-xl">
              {official ?? "—"}
            </span>
            {player.ratingChange !== null && (
              <>
                <span className="text-ui text-muted sm:hidden">
                  {player.ratingChange > 0 ? "↑" : player.ratingChange < 0 ? "↓" : "±"}
                  {Math.abs(player.ratingChange)} {officialCaption}
                </span>
                <span className="flex flex-col max-sm:hidden">
                  <Delta value={player.ratingChange} versus="previous official" />
                  {officialCaption && (
                    <span className="text-label text-muted">{officialCaption}</span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-10 text-body text-muted sm:mt-12">
        {contextLine(data, projection)}
      </p>
    </section>
  );
}
