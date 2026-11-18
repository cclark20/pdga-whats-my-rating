import type { Breakdown, PlayerResponse } from "@wmr/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-rule py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-ui font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="transition-transform duration-150 ease-out group-open:rotate-90"
        />
        {title}
      </summary>
      <div className="mb-4 mt-2 max-w-[65ch] space-y-3 pl-6 text-body text-muted">
        {children}
      </div>
    </details>
  );
}

function Stats({ b, official }: { b: Breakdown; official?: number | null }) {
  const rows: [string, ReactNode][] = [
    ["Rounds evaluated", b.nEvaluated],
    ["Rounds used", b.nUsed],
    ["Window", `${b.windowMonths} months`],
    ["Average of evaluated rounds", b.avg?.toFixed(2) ?? "—"],
    ["Standard deviation", b.std?.toFixed(2) ?? "—"],
    ["Drop threshold", b.threshold ?? "Not applied (fewer than 7 rounds)"],
    ["Calculated rating", b.rating ?? "—"],
  ];
  if (official !== undefined) rows.push(["PDGA official rating", official ?? "—"]);
  return (
    <dl className="grid grid-cols-[auto_auto] justify-start gap-x-8 gap-y-1 text-ui">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className="text-right text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Methodology({ data }: { data: PlayerResponse }) {
  const { projected, official, player } = data;
  return (
    <section aria-labelledby="method-heading" className="border-t border-rule py-12">
      <h2 id="method-heading" className="font-display text-display-m font-semibold">
        How it's calculated
      </h2>
      <div className="mt-6">
        <Collapsible title="The method">
          <p>
            We follow the{" "}
            <a
              href="https://www.pdga.com/ratings/guide"
              className="text-text underline decoration-muted underline-offset-[3px]"
            >
              PDGA ratings guide
            </a>
            . A rating averages your rated rounds from the 12 months before your most
            recent one. With fewer than 8 rounds in that time, the window extends to 24
            months.
          </p>
          <p>
            With 9 or more rounds, your most recent quarter count double. With 7 or
            more, a round far below your usual level is dropped, so one bad day doesn't
            sink you. "Far below" depends on how consistent you are: the steadier your
            rounds, the closer the cutoff, but never more than 100 points under your
            average. XM-tier and unrated events don't count.
          </p>
          <p>
            PDGA doesn't publish its exact cutoff. Ours (2.5 standard deviations under
            your average, plus 5) matches PDGA's results in our testing.
          </p>
        </Collapsible>

        {projected && (
          <Collapsible title="Projected rating">
            <p>
              Your official rounds plus any events PDGA hasn't rated yet. The projection
              shown above is PDGA's official rating plus the change this calculation
              gets from your new rounds, so a steady gap between our math and PDGA's
              doesn't carry into it.
            </p>
            <Stats b={projected} />
          </Collapsible>
        )}

        {official && (
          <Collapsible title="Official rating, recalculated">
            <p>
              The same calculation over only the rounds in your current official rating.
              It should match PDGA's number. When it doesn't, the gap is usually
              hole-count weighting, which we don't model.
            </p>
            <Stats b={official} official={player.officialRating} />
          </Collapsible>
        )}

        <Collapsible title="Limitations">
          <p>
            This is an unofficial estimate and can differ from the official rating by a
            point or so. PDGA weights rounds by hole count (a 27-hole round counts
            1.5×), which we don't do yet, and rounds submitted after a ratings deadline
            won't appear until the following update.
          </p>
          <p>
            Round ratings for new events come from live scoring and can change before
            PDGA finalizes them.
          </p>
        </Collapsible>
      </div>
    </section>
  );
}
