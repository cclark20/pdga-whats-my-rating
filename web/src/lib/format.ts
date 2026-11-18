const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-06-21` → `Jun 21, 2026`. Dates are calendar dates, so format in UTC. */
export function formatDate(date: string): string {
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}

/** `YYYY-MM-DD` → milliseconds, for chart x positions. */
export const dateMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
