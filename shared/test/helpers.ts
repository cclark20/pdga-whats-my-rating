import { readFileSync } from "node:fs";
import type { Round } from "../src/types.ts";

/** `YYYY-MM-DD` for `days` before today (UTC). */
export function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

interface MakeRoundsOpts {
  dates?: string[];
  tiers?: string[];
  rounds?: string[];
  tournaments?: string[];
}

/** Build rounds for testing; defaults to one round every 14 days back from today. */
export function makeRounds(ratings: number[], opts: MakeRoundsOpts = {}): Round[] {
  return ratings.map((rating, i) => ({
    rating,
    date: opts.dates?.[i] ?? daysAgo(i * 14),
    tier: opts.tiers?.[i] ?? "A",
    round: opts.rounds?.[i] ?? "1",
    tournament: opts.tournaments?.[i] ?? "Test Tournament",
  }));
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

/** Read a ratings-detail fixture CSV (tournament,date,tier,division,round,rating). */
export function readFixture(path: string): Round[] {
  const [header, ...lines] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const cols = parseCsvLine(header ?? "");
  return lines.map((line) => {
    const row = Object.fromEntries(parseCsvLine(line).map((v, i) => [cols[i], v]));
    return {
      tournament: row.tournament ?? "",
      date: (row.date ?? "").slice(0, 10),
      tier: row.tier ?? "",
      division: row.division ?? null,
      round: row.round ?? "",
      rating: Number(row.rating),
    };
  });
}
