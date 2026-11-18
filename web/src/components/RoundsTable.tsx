import type { RatedRound } from "@wmr/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { formatDate } from "../lib/format";

type SortKey = "date" | "tournament" | "tier" | "division" | "round" | "rating";
type Dir = "asc" | "desc";
type Scope = "window" | "all";

const PAGE = 50;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; desktop?: boolean }[] =
  [
    { key: "date", label: "Date", desktop: true },
    { key: "tournament", label: "Tournament" },
    { key: "tier", label: "Tier", desktop: true },
    { key: "division", label: "Div", desktop: true },
    { key: "round", label: "Rd", numeric: true, desktop: true },
    { key: "rating", label: "Rating", numeric: true },
  ];

function compare(a: RatedRound, b: RatedRound, key: SortKey): number {
  switch (key) {
    case "rating":
      return a.rating - b.rating;
    case "round":
      return Number(a.round) - Number(b.round);
    case "date":
      return a.date.localeCompare(b.date) || Number(a.round) - Number(b.round);
    default:
      return (a[key] ?? "").localeCompare(b[key] ?? "");
  }
}

function Rating({ r }: { r: RatedRound }) {
  if (r.evaluated && !r.used) {
    return (
      <span className="text-muted">
        <span className="mr-1.5 text-label">dropped</span>
        {r.rating}
      </span>
    );
  }
  return (
    <>
      {r.weight === 2 && (
        <>
          <span className="mr-1.5 text-label text-highlight-text" aria-hidden>
            2×
          </span>
          <span className="sr-only">counts double, </span>
        </>
      )}
      {r.rating}
    </>
  );
}

export default function RoundsTable({ rounds }: { rounds: RatedRound[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({
    key: "date",
    dir: "desc",
  });
  // kept in the URL so a refresh or a shared link shows the same rounds
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get("rounds") === "all" ? "all" : "window";
  const setScope = (next: Scope) =>
    setParams(
      (p) => {
        if (next === "all") p.set("rounds", "all");
        else p.delete("rounds");
        return p;
      },
      { replace: true },
    );
  const [showAll, setShowAll] = useState(false);

  const inWindow = rounds.filter((r) => r.evaluated).length;
  const sorted = useMemo(() => {
    const scoped = scope === "window" ? rounds.filter((r) => r.evaluated) : rounds;
    const out = [...scoped].sort((a, b) => compare(a, b, sort.key));
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rounds, sort, scope]);
  const visible = showAll ? sorted : sorted.slice(0, PAGE);

  function toggle(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "rating" ? "desc" : "asc" },
    );
  }

  const scopes: { key: Scope; label: string }[] = [
    { key: "window", label: `In the window (${inWindow})` },
    { key: "all", label: `All (${rounds.length})` },
  ];

  return (
    <section aria-labelledby="rounds-heading" className="border-t border-rule py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="rounds-heading" className="font-display text-display-m font-semibold">
          Rounds
        </h2>
        {inWindow < rounds.length && (
          <fieldset className="flex gap-1">
            <legend className="sr-only">Which rounds</legend>
            {scopes.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={scope === s.key}
                onClick={() => {
                  setScope(s.key);
                  setShowAll(false);
                }}
                className={`min-h-11 min-w-11 rounded-sm border px-3 text-ui transition-colors duration-150 ease-out ${
                  scope === s.key
                    ? "border-text text-text"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      <p className="mt-2 text-ui text-muted">
        <span className="text-highlight-text">2×</span> counts double · dropped rounds
        don't count against you
        {scope === "all" && " · muted rows don't count"}
      </p>

      <table className="mt-6 w-full text-ui">
        <thead>
          <tr className="border-b border-rule">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={`label font-medium ${c.numeric ? "text-right" : "text-left"} ${
                  c.desktop ? "max-sm:hidden" : ""
                } ${c.key === "date" || c.key === "tournament" ? "pl-3" : "pl-4"} ${
                  c.key === "tournament" ? "sm:pl-4" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={`inline-flex min-h-11 min-w-11 items-center gap-1 uppercase hover:text-text ${
                    c.numeric ? "flex-row-reverse" : ""
                  }`}
                >
                  {c.label}
                  {sort.key === c.key &&
                    (sort.dir === "asc" ? (
                      <ChevronUp size={12} strokeWidth={1.5} aria-hidden />
                    ) : (
                      <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
                    ))}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const doubled = r.weight === 2 && r.used;
            return (
              <tr
                key={`${r.tournament}|${r.date}|${r.round}`}
                className={`border-b border-rule transition-colors duration-150 ease-out hover:bg-surface ${
                  r.evaluated ? "" : "text-muted"
                }`}
              >
                <td
                  className={`whitespace-nowrap border-l-2 py-3 pl-3 align-top max-sm:hidden ${
                    doubled ? "border-highlight" : "border-transparent"
                  }`}
                >
                  {formatDate(r.date)}
                </td>
                <td
                  className={`relative py-3 pl-3 align-top sm:border-l-0 sm:pl-4 max-sm:border-l-2 ${
                    doubled ? "max-sm:border-highlight" : "max-sm:border-transparent"
                  }`}
                >
                  {r.tournamentUrl ? (
                    <a
                      href={r.tournamentUrl}
                      // the whole cell is the tap target
                      title={r.tournament}
                      className="line-clamp-2 underline decoration-muted underline-offset-[3px] after:absolute after:inset-0 hover:decoration-highlight"
                    >
                      {r.tournament}
                    </a>
                  ) : (
                    r.tournament
                  )}
                  {r.pdgaEvaluated === null && <span className="label ml-2">New</span>}
                  <div className="mt-0.5 text-label text-muted sm:hidden">
                    {formatDate(r.date)} · Rd {r.round}
                    {r.division && ` · ${r.division}`} · {r.tier}
                  </div>
                </td>
                <td className="py-3 pl-4 align-top max-sm:hidden">
                  <span className="label border border-rule px-1">{r.tier}</span>
                </td>
                <td className="py-3 pl-4 align-top max-sm:hidden">{r.division}</td>
                <td className="py-3 pl-4 text-right align-top max-sm:hidden">
                  {r.round}
                </td>
                <td className="whitespace-nowrap py-3 pl-4 text-right align-top">
                  <Rating r={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sorted.length > PAGE && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-4 min-h-11 text-ui underline decoration-highlight underline-offset-[3px]"
        >
          {showAll ? `Show the first ${PAGE}` : `Show all ${sorted.length} rounds`}
        </button>
      )}
    </section>
  );
}
