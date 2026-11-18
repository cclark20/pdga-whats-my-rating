import { type Breakdown, type RatedRound, subtractYears } from "@wmr/shared";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateMs, formatDate } from "../lib/format";
import { useMediaQuery } from "../lib/useMediaQuery";

type Status = "double" | "window" | "dropped" | "excluded" | "older";

interface Point {
  x: number;
  rating: number;
  mavg5: number;
  mavg15: number;
  status: Status;
  /** Not in an official rating yet (live scoring). */
  isNew: boolean;
  round: RatedRound;
}

const STATUS_LABEL: Record<Status, string> = {
  window: "In window",
  double: "Counts double",
  dropped: "Dropped",
  excluded: "Not counted",
  older: "Before the window",
};

const STATUS_ORDER: Status[] = ["window", "double", "dropped", "excluded", "older"];

function statusOf(r: RatedRound, windowStart: string | undefined): Status {
  if (!r.evaluated) {
    // inside the window but not evaluated: an unrated event
    return windowStart && r.date >= windowStart ? "excluded" : "older";
  }
  if (!r.used) return "dropped";
  return r.weight === 2 ? "double" : "window";
}

type Range = "window" | "3y" | "all";

/**
 * Dot marks. Dropped rounds are a muted ×: they don't count against the player,
 * so they read as set aside, not as a penalty, and the shape alone tells them apart.
 */
function Mark({ status, cx, cy }: { status: Status; cx: number; cy: number }) {
  switch (status) {
    case "dropped":
      return (
        <path
          d={`M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx - 4},${cy + 4}L${cx + 4},${cy - 4}`}
          stroke="var(--muted)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
    case "double":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill="var(--highlight)"
          stroke="var(--bg)"
          strokeWidth={2}
        />
      );
    case "window":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill="var(--text)"
          stroke="var(--bg)"
          strokeWidth={2}
        />
      );
    case "excluded":
      return (
        <circle
          cx={cx}
          cy={cy}
          r={3.5}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.5}
        />
      );
    default:
      return <circle cx={cx} cy={cy} r={3} fill="var(--muted)" opacity={0.5} />;
  }
}

/** Ring around rounds that are new since the last update. */
function NewRing({ cx, cy }: { cx: number; cy: number }) {
  return (
    <circle cx={cx} cy={cy} r={8.5} fill="none" stroke="var(--text)" strokeWidth={1} />
  );
}

function Dot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <g>
      {/* hit target well beyond the mark, so hovering doesn't need pixel aim */}
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      {payload.isNew && <NewRing cx={cx} cy={cy} />}
      <Mark status={payload.status} cx={cx} cy={cy} />
    </g>
  );
}

function TooltipBox({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const point = payload?.[0]?.payload as Point | undefined;
  if (!active || !point?.round) return null;
  const { round } = point;
  return (
    <div className="max-w-64 border border-rule bg-surface px-3 py-2 text-ui">
      <div className="font-medium">{round.tournament}</div>
      <div className="text-muted">
        {formatDate(round.date)} · Rd {round.round}
      </div>
      <div className="mt-1">
        {round.rating}{" "}
        <span className="text-muted">
          · {STATUS_LABEL[point.status]}
          {point.status === "excluded" && " (unrated event)"}
          {point.isNew && " · new, live rating"}
        </span>
      </div>
    </div>
  );
}

function LegendKey({ status }: { status: Status }) {
  return (
    <svg width={12} height={12} aria-hidden className="shrink-0">
      <Mark status={status} cx={6} cy={6} />
    </svg>
  );
}

function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width={16} height={12} aria-hidden className="shrink-0">
      <line
        x1={0}
        x2={16}
        y1={6}
        y2={6}
        stroke={color}
        strokeWidth={dashed ? 1.5 : 2}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

/**
 * Calendar ticks on month boundaries, spaced so there are at most `max`.
 * Recharts otherwise ticks every data point, which collides when several
 * rounds share a date.
 */
function timeTicks(
  from: number,
  to: number,
  max = 7,
): { ticks: number[]; yearly: boolean } {
  const months = (to - from) / (30.44 * 86_400_000);
  const step = [1, 2, 3, 6, 12, 24, 36, 60].find((m) => months / m <= max) ?? 120;
  const d = new Date(from);
  // month index counted from year 0, rounded up to the first multiple of step
  let index = d.getUTCFullYear() * 12 + d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0);
  index = Math.ceil(index / step) * step;
  const at = (i: number) => Date.UTC(Math.floor(i / 12), i % 12, 1);
  const ticks: number[] = [];
  for (let i = index; at(i) <= to; i += step) ticks.push(at(i));
  return { ticks, yearly: step >= 12 };
}

const roundTo = (n: number, step: number, dir: "up" | "down") =>
  (dir === "up" ? Math.ceil(n / step) : Math.floor(n / step)) * step;

const RANGES: Range[] = ["window", "3y", "all"];

export default function HistoryChart({ breakdown }: { breakdown: Breakdown }) {
  const newest = breakdown.rounds[0]?.date;
  const windowEnd = breakdown.rounds.find((r) => r.evaluated)?.date ?? newest;
  const windowStart =
    windowEnd && subtractYears(windowEnd, breakdown.windowMonths / 12);

  const all = useMemo<Point[]>(
    () =>
      breakdown.rounds
        .map((r) => ({
          x: dateMs(r.date),
          rating: r.rating,
          mavg5: r.mavg5,
          mavg15: r.mavg15,
          status: statusOf(r, windowStart),
          isNew: r.pdgaEvaluated === null,
          round: r,
        }))
        // play order, so the averages draw left to right
        .sort((a, b) => a.x - b.x || Number(a.round.round) - Number(b.round.round)),
    [breakdown, windowStart],
  );

  const first = all[0];
  const spanYears =
    first && all.length > 1
      ? ((all.at(-1)?.x ?? 0) - first.x) / (365.25 * 86_400_000)
      : 0;

  const wide = useMediaQuery("(min-width: 640px)");
  // kept in the URL so a refresh or a shared link shows the same view
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("range") as Range | null;
  const range: Range = fromUrl && RANGES.includes(fromUrl) ? fromUrl : "window";
  const setRange = (next: Range) =>
    setParams(
      (p) => {
        if (next === "window") p.delete("range");
        else p.set("range", next);
        return p;
      },
      { replace: true },
    );

  const points = useMemo(() => {
    if (!newest || range === "all") return all;
    const from = range === "window" ? windowStart : subtractYears(newest, 3);
    return from ? all.filter((p) => p.round.date >= from) : all;
  }, [all, range, newest, windowStart]);

  // one average per event date (after that day's last round), so the lines
  // trace the trend instead of spiking within a multi-round event
  const trend = useMemo(
    () => points.filter((p, i) => points[i + 1]?.x !== p.x),
    [points],
  );

  const start = points[0];
  const last = points.at(-1);
  if (!start || !last) return null;

  // a 15-round average over fewer than 15 rounds is just the overall mean
  const show15 = breakdown.rounds.length >= 15;
  const present = new Set(points.map((p) => p.status));
  const anyNew = points.some((p) => p.isNew);

  const values = points.flatMap((p) => [
    p.rating,
    p.mavg5,
    ...(show15 ? [p.mavg15] : []),
  ]);
  if (breakdown.threshold !== null) values.push(breakdown.threshold);
  const yMin = roundTo(Math.min(...values) - 10, 50, "down");
  const yMax = roundTo(Math.max(...values) + 10, 50, "up");

  // put the higher average's end label above its line and the lower one below,
  // so the two never collide where the lines converge
  const fiveOnTop = last.mavg5 >= last.mavg15;

  const pad = Math.max((last.x - start.x) * 0.02, 3 * 86_400_000);
  const { ticks, yearly } = timeTicks(start.x, last.x, wide ? 7 : 4);

  const ranges: { key: Range; label: string; show: boolean }[] = [
    { key: "window", label: `${breakdown.windowMonths} months`, show: true },
    { key: "3y", label: "3 years", show: spanYears > 3 },
    { key: "all", label: "All", show: true },
  ];

  return (
    <section aria-labelledby="history-heading" className="border-t border-rule py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="history-heading" className="font-display text-display-m font-semibold">
          Round history
        </h2>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Date range</legend>
          {ranges
            .filter((r) => r.show)
            .map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                className={`min-h-11 min-w-11 rounded-sm border px-3 text-ui transition-colors duration-150 ease-out ${
                  range === r.key
                    ? "border-text text-text"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {r.label}
              </button>
            ))}
        </fieldset>
      </div>

      <ul
        className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-label text-muted"
        aria-label="Legend: rounds"
      >
        {STATUS_ORDER.filter((s) => present.has(s)).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <LegendKey status={s} />
            {STATUS_LABEL[s]}
          </li>
        ))}
        {anyNew && (
          <li className="flex items-center gap-1.5">
            <svg width={20} height={20} aria-hidden className="shrink-0">
              <NewRing cx={10} cy={10} />
            </svg>
            New since the last update
          </li>
        )}
      </ul>
      <ul
        className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-label text-muted"
        aria-label="Legend: lines"
      >
        {show15 && (
          <li className="flex items-center gap-1.5">
            <LineKey color="var(--text)" />
            15-round avg
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <LineKey color="var(--muted)" />
          5-round avg
        </li>
        {breakdown.threshold !== null && (
          <li className="flex items-center gap-1.5">
            <LineKey color="var(--muted)" dashed />
            Drop at {breakdown.threshold}
          </li>
        )}
      </ul>

      <div
        className="mt-4 w-full"
        role="img"
        aria-label={`Round ratings over time, ${points.length} rounds. Every round is listed in the Rounds table below.`}
      >
        {/* sizing by aspect, not a percentage height, so the first measure is never 0 */}
        <ResponsiveContainer width="100%" aspect={wide ? 21 / 9 : 4 / 3}>
          <ComposedChart
            // the chart is a picture here; the table is the accessible version
            accessibilityLayer={false}
            data={points}
            margin={{ top: 16, right: wide ? 72 : 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--rule)" />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              // a little air past the first and newest rounds so edge dots aren't clipped
              domain={[start.x - pad, last.x + pad]}
              ticks={ticks}
              tickFormatter={(ms: number) =>
                new Date(ms).toLocaleDateString("en-US", {
                  month: yearly ? undefined : "short",
                  year: "numeric",
                  timeZone: "UTC",
                })
              }
              minTickGap={8}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickCount={Math.min(8, (yMax - yMin) / 50 + 1)}
              allowDecimals={false}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {breakdown.threshold !== null && windowStart && windowEnd && (
              <ReferenceLine
                segment={[
                  {
                    x: Math.max(dateMs(windowStart), start.x),
                    y: breakdown.threshold,
                  },
                  { x: dateMs(windowEnd), y: breakdown.threshold },
                ]}
                stroke="var(--muted)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
            )}
            <Line
              data={trend}
              dataKey="mavg5"
              stroke="var(--muted)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              strokeLinejoin="round"
            >
              <LabelList
                dataKey="mavg5"
                content={(p) =>
                  wide && p.index === trend.length - 1 ? (
                    <text
                      x={Number(p.x) + 8}
                      y={Number(p.y) + (fiveOnTop ? -6 : 14)}
                      fill="var(--muted)"
                      fontSize={12}
                    >
                      5-rd avg
                    </text>
                  ) : null
                }
              />
            </Line>
            {show15 && (
              <Line
                data={trend}
                dataKey="mavg15"
                stroke="var(--text)"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                strokeLinejoin="round"
              >
                <LabelList
                  dataKey="mavg15"
                  content={(p) =>
                    wide && p.index === trend.length - 1 ? (
                      <text
                        x={Number(p.x) + 8}
                        y={Number(p.y) + (fiveOnTop ? 14 : -6)}
                        fill="var(--muted)"
                        fontSize={12}
                      >
                        15-rd avg
                      </text>
                    ) : null
                  }
                />
              </Line>
            )}
            <Scatter dataKey="rating" shape={Dot} isAnimationActive={false} />
            <Tooltip
              content={TooltipBox}
              shared={false}
              cursor={false}
              // pinned to the top, so on a phone it never sits under the finger
              position={{ y: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
