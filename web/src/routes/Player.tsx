import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import Hero from "../components/Hero";
import Lookup from "../components/Lookup";
import Methodology from "../components/Methodology";
import NewEvents from "../components/NewEvents";
import Notice from "../components/Notice";
import PlayerNotices from "../components/PlayerNotices";
import RoundsTable from "../components/RoundsTable";
import WhatsCounting from "../components/WhatsCounting";
import { fetchPlayer, PlayerLoadError } from "../lib/api";
import { mailto } from "../lib/contact";
import { project } from "../lib/projection";

// recharts is most of the bundle; load it after the numbers are on screen
const HistoryChart = lazy(() => import("../components/HistoryChart"));

/** Same geometry as the hero, so nothing jumps when the data lands. */
function LoadingHero({ pdgaNo }: { pdgaNo: string }) {
  return (
    <section aria-busy="true" aria-label="Loading rating summary" className="py-12">
      <p className="mb-1 font-display text-display-l font-semibold text-muted">
        PDGA #{pdgaNo}
      </p>
      <p className="label">&nbsp;</p>
      <div className="mt-12 grid gap-12 sm:grid-cols-2 sm:gap-0">
        {["Official", "Projected · unofficial"].map((label, i) => (
          <div
            key={label}
            className={i === 0 ? "sm:border-r sm:border-rule sm:pr-12" : "sm:pl-12"}
          >
            <div className="label mb-3">{label}</div>
            <span className="font-display text-display-hero-sm font-semibold text-muted sm:text-display-xl">
              —
            </span>
          </div>
        ))}
      </div>
      <p className="mt-12 text-body text-muted" aria-live="polite">
        Loading PDGA data. New events can take a few seconds.
      </p>
    </section>
  );
}

function ErrorMessage({ error, pdgaNo }: { error: unknown; pdgaNo: string }) {
  const code = error instanceof PlayerLoadError ? error.code : "upstream_error";
  const message = error instanceof Error ? error.message : "Couldn't load player data.";
  const link =
    code !== "rate_limited" &&
    mailto(
      `What's My Rating - Error (PDGA #${pdgaNo})`,
      `PDGA Number: ${pdgaNo}\nError: ${code}\n\nPlease describe what happened:\n`,
    );
  return (
    // announced on arrival, and tied to the reopened lookup input
    <div id="lookup-error" role="alert" className="py-12">
      <Notice>
        {code === "not_found"
          ? `No PDGA player #${pdgaNo}. Check the number and try again.`
          : message}
        {link && code !== "not_found" && (
          <>
            {" "}
            If it keeps happening,{" "}
            <a
              href={link}
              className="text-text underline decoration-muted underline-offset-[3px]"
            >
              let me know
            </a>
            .
          </>
        )}
      </Notice>
    </div>
  );
}

export default function Player() {
  const { pdgaNo = "" } = useParams();
  const query = useQuery({
    queryKey: ["player", pdgaNo],
    queryFn: () => fetchPlayer(pdgaNo),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const projection = useMemo(
    () => (query.data ? project(query.data) : null),
    [query.data],
  );

  const name = query.data?.player.name;
  useEffect(() => {
    document.title = name ? `${name} · What's My Rating?` : "What's My Rating?";
  }, [name]);

  return (
    <>
      <Lookup
        key={`${pdgaNo}:${query.isError}`}
        current={pdgaNo}
        open={query.isError}
        describedBy={query.isError ? "lookup-error" : undefined}
      />
      {query.isPending && <LoadingHero pdgaNo={pdgaNo} />}
      {query.isError && <ErrorMessage error={query.error} pdgaNo={pdgaNo} />}
      {query.data && projection && (
        <>
          <Hero data={query.data} projection={projection} />
          <PlayerNotices data={query.data} />
          {query.data.projected ? (
            <>
              <NewEvents
                events={projection.events}
                baseline={query.data.player.officialRating}
                threshold={query.data.projected.threshold}
              />
              <WhatsCounting data={query.data} />
              <Suspense
                fallback={
                  <div className="aspect-[4/3] border-t border-rule sm:aspect-[21/9]" />
                }
              >
                <HistoryChart breakdown={query.data.projected} />
              </Suspense>
              <RoundsTable rounds={query.data.projected.rounds} />
              <Methodology data={query.data} />
            </>
          ) : (
            <div className="border-t border-rule py-12">
              <Notice>
                No rated rounds yet. Once this player has a rated event, it shows up
                here.
              </Notice>
            </div>
          )}
        </>
      )}
    </>
  );
}
