# DESIGN.md — What's My Rating?

Read this before writing or changing any frontend code. When a choice isn't covered here, pick the most restrained option and note the decision at the bottom of this file.

## Direction

**Sports data editorial.** The reference points are FiveThirtyEight, The Athletic, and the stats pages of a good newspaper sports section. The page should feel like a well-edited data story about one player, not like a SaaS dashboard.

What that means in practice:

- Typography carries the hierarchy. Use size, weight, and the serif/sans contrast instead of boxes, shadows, and color.
- Structure comes from hairline rules and whitespace, not cards.
- Color is restrained and semantic. Neutrals do almost all the work. Color appears only where it means something: up, down, or "this round counts extra."
- Numbers are the heroes. Ratings are set large and in tabular figures, and they never jitter.

## Typography

Use two families only, both from Google Fonts.

| Role | Family | Notes |
| --- | --- | --- |
| Display (player name, hero ratings, section heads) | **Newsreader** | Use the optical-size axis; display sizes at 600 weight |
| UI and body (labels, tables, inputs, body copy) | **IBM Plex Sans** | 400 / 500 / 600 |

All numbers everywhere use `font-variant-numeric: tabular-nums lining-nums;`.

Type scale (rem, 16px base):

| Token | Size / line height | Use |
| --- | --- | --- |
| `display-xl` | 4.5 / 1.0 | Hero rating numbers (2.75 on mobile) |
| `display-l` | 2.5 / 1.1 | Player name |
| `display-m` | 1.5 / 1.2 | Section headings |
| `body` | 1.0 / 1.5 | Prose, notes |
| `ui` | 0.875 / 1.4 | Tables, inputs, buttons |
| `label` | 0.75 / 1.3 | Uppercase, letter-spacing 0.06em, muted. Column headers, stat labels |

## Color

Define colors as CSS custom properties and map them into Tailwind. Never use raw hex values in components. The theme defaults to dark, with light available via a toggle and `prefers-color-scheme`.

| Token | Dark (default) | Light | Role |
| --- | --- | --- | --- |
| `--bg` | `#111214` | `#FAF8F4` | Page background |
| `--surface` | `#18191C` | `#FFFFFF` | Inputs, table row hover, popovers |
| `--rule` | `#2A2C30` | `#E3DFD7` | Hairlines, borders, gridlines |
| `--text` | `#ECEAE4` | `#16171A` | Primary text |
| `--muted` | `#9A978F` | `#6B6860` | Labels, secondary text, axes |
| `--up` | `#5BB98B` | `#1A7D4C` | Rating increases, rounds above the player's rating |
| `--down` | `#E0675A` | `#C2412F` | Rating decreases, rounds below the player's rating |
| `--highlight` | `#F0B44C` | `#B7791F` | Double-weighted rounds (marks: bars, dots), focus ring, link hover underline |
| `--highlight-text` | `#F0B44C` | `#9A6416` | Amber as text, such as the "2×" marker. The light value is darker because amber text needs 4.5:1 |

Rules:

- `--up`, `--down`, and `--highlight` are never used decoratively. If something is colored, a user should be able to say what the color means.
- Never use color alone to carry meaning. Pair it with an arrow, a sign (+/−), or a label.
- Text contrast must meet WCAG AA in both themes.
- Dropped rounds are never `--down`. Dropping a round protects the rating, so it is shown in `--muted`, never as a penalty.

## Spacing, shape, and layout

- **Spacing:** use a 4px base and only these steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Radius:** 2px on inputs and buttons, 0 everywhere else. Do not use pill shapes.
- **Shadows:** none. Use a 1px `--rule` border where separation is needed.
- **Width:** single column, max 1040px content width, centered. Use a 16px side gutter on mobile and 32px on desktop.
- **Sections:** separate each section with a full-width 1px `--rule` line and 48px vertical space. Never nest a bordered container inside another.

## Page structure

The page is a story, ordered by what users want to know:

1. **Masthead.** A small "What's My Rating?" wordmark in Newsreader at the left, with the theme toggle at the right. Keep it to one thin row.
2. **Lookup.** A PDGA number input with a button on one line. After a search, collapse it into a compact "PDGA #167210 · change" line.
3. **Hero.**
   - Player name in `display-l`, linking to their PDGA profile.
   - Two numbers side by side in `display-xl`: **Official** and **Projected**, labeled "OFFICIAL · Nov 10, 2026" and "PROJECTED · UNOFFICIAL".
   - The delta sits beside each number as `↑ 1` in `--up` or `↓ 12` in `--down`, with a muted caption naming its baseline: "since Jul 14" or "vs official". With no new rounds, Projected shows no delta.
   - The projection is PDGA's official rating plus the change our calculation gets from new rounds, so with no new rounds it equals official.
   - One sentence of plain-English context below, for example "Your new event adds 2 points, if live ratings hold."
4. **Your new event(s).** Shown only when there are events PDGA hasn't rated yet, and it is the first section after the hero. Each event gets a verdict: its effect on the projection as a Delta, each round with an ↑/↓ against the player's rating, and one sentence on how its rounds count. Say once that live-scoring ratings can shift.
5. **What's counting.** A compact view of the rating window: a summary sentence, then the double-weighted rounds (marked with `--highlight-text`) and any dropped rounds, framed as "not held against you". History that explains the past, such as rounds leaving the window or rounds that aged out at the last update, sits in collapsed disclosures that show a count. Empty groups are omitted. This answers "which rounds matter?"
6. **History.** The round rating chart (see Charts).
7. **Rounds.** The table (see Tables).
8. **How it's calculated.** Footnote-style collapsible sections in muted `body` text. These contain the methodology, the stats (average, standard deviation, threshold formula), and the caveat that the calculation can differ from the official rating by about 1 point.

**Notices** such as API limitations appear as a single muted line with a small icon, placed near the content they affect. Do not use full-width colored banners, and a notice must never outweigh the hero.

## Components

- **Buttons.** The primary button has a `--text` fill with `--bg` text (inverted), 2px radius, `ui` size, and 500 weight. The secondary button is text-only with an underline on hover. Use one primary button per view.
- **Inputs.** Use a `--surface` fill with a 1px `--rule` border. On focus, show a 2px `--highlight` ring. Labels sit above inputs in `label` style.
- **Delta.** Show an arrow and a number in `--up` or `--down` as plain text. Do not put a background pill behind it.
- **Tier badge.** Show the tier letter (A/B/C/L) in `label` style inside a 1px `--rule` box. Keep it monochrome.
- **Collapsible.** Use a chevron and a heading with no box. The open state reveals content indented 16px.
- **Icons.** Use Lucide at 16px with a 1.5 stroke, sparingly. Do not use emoji anywhere in the UI.
- **Tap targets.** Every control is at least 44×44px: buttons, sort headers, disclosures, and toggles. Links in list and table rows stretch to cover their row or cell. Inline links inside prose are the only exception.

## Tables

- Use horizontal rules only, with no vertical lines and no zebra striping. Row hover uses `--surface`.
- Column headers use `label` style.
- Right-align numeric columns and set them in tabular figures.
- Format dates as `Jun 21, 2026` and never show times.
- Use visual markers instead of the text columns "evaluated," "used," and "weight":
  - A double-weighted round gets a 2px `--highlight` bar on the row's left edge and a "2×" marker.
  - A dropped round shows its rating in `--muted` with a small "dropped" label. Do not use a strikethrough or `--down`.
  - Rounds that are not evaluated appear in `--muted`.
- The tournament name links to the PDGA event. Do not use a separate link-icon column.
- Sort newest first by default, and make columns sortable.
- Default to the rounds in the rating window, with a toggle to show all. When showing all, show the first 50 and offer the rest behind a button.
- On mobile, keep only tournament and rating as columns. Date, round, division, and tier go on a second line under the tournament.

## Charts

- **Library:** Recharts, or Observable Plot if more control is needed. Do not use Plotly.
- **Round history:** use a dot plot over time, not 150 bars.
  - Rounds inside the current rating window are drawn in `--text`.
  - Double-weighted rounds are drawn in `--highlight`.
  - Older rounds are drawn in `--muted` at 50% opacity.
  - Dropped rounds are drawn as a `--muted` ×, not a dot, so the shape carries the meaning without reading as a penalty.
  - Overlay two moving averages: the 15-round average as a 2px `--text` line and the 5-round average as a 2px `--muted` line. Plot one point per event date so the lines don't spike within a multi-round event.
  - Show the drop threshold as a dashed `--muted` horizontal rule across the rating window only. Name its value in the legend, not inside the plot, where it collides with the average lines.
  - Offer a range control above the chart: the rating window (the default), 3 years (when the history is longer), and all.
- **Styling:**
  - Use horizontal gridlines only, in `--rule`. Do not draw a chart border or background.
  - Axes and tick labels use `--muted` in `label` size with tabular figures.
  - Label series directly at the line end instead of using a legend wherever possible.
  - Tooltips show a `--surface` box with a 1px `--rule` border, `ui` size, the round name, date, and rating.

## Motion

- Keep motion minimal, with 150ms ease-out for hover and focus.
- Do not use count-up animations on ratings.
- Respect `prefers-reduced-motion` by disabling all transitions.

## Responsive

- Below 640px, the hero numbers stack vertically and shrink to 2.75rem.
- On mobile, tables keep tournament, date, and rating, and the rest move into an expandable row detail.
- Charts keep their aspect ratio and reduce tick density instead of shrinking the text.
- There must be no horizontal page scroll at 375px width.

## Banned

Do not use any of the following:

- Gradients of any kind, including in charts.
- Glassmorphism, blur, glow, or drop shadows.
- Cards inside cards, or cards as the default container.
- Emoji in the UI.
- Purple or indigo as an accent.
- The Inter, Roboto, or system-default font stacks as the primary type.
- Centered hero layouts or gradient text.
- Pill-shaped badges or buttons.
- Default shadcn/ui styling. If shadcn primitives are used, they must be restyled to these tokens.
- Marketing-style copy such as "Unlock insights," "Supercharge," or exclamation points.

## Copy voice

The copy should read like a stats editor wrote it: plain, specific, and short.

- Prefer "Projected 915, up 1 from official" over "Great news! Your rating is going up!"
- Use sentence case everywhere except `label` text, which is uppercase.

## Review checklist (run after every UI change)

1. Screenshot the page at 1280px and 375px wide, in both themes.
2. Confirm the hero numbers are the first thing the eye lands on.
3. Confirm every colored element maps to up, down, or highlight.
4. Check the page against the Banned list.
5. Confirm numbers align in their columns and use tabular figures.
6. Fix anything that fails before reporting done.

## Tailwind mapping (reference)

```js
// tailwind.config.js (theme.extend)
colors: {
  bg: 'var(--bg)', surface: 'var(--surface)', rule: 'var(--rule)',
  text: 'var(--text)', muted: 'var(--muted)',
  up: 'var(--up)', down: 'var(--down)', highlight: 'var(--highlight)',
},
fontFamily: {
  display: ['Newsreader', 'Georgia', 'serif'],
  sans: ['"IBM Plex Sans"', 'Helvetica Neue', 'Arial', 'sans-serif'],
},
borderRadius: { none: '0', sm: '2px' },
```

```css
:root, :root[data-theme="dark"] {
  --bg:#111214; --surface:#18191C; --rule:#2A2C30; --text:#ECEAE4; --muted:#9A978F;
  --up:#5BB98B; --down:#E0675A; --highlight:#F0B44C;
}
:root[data-theme="light"] {
  --bg:#FAF8F4; --surface:#FFFFFF; --rule:#E3DFD7; --text:#16171A; --muted:#6B6860;
  --up:#1A7D4C; --down:#C2412F; --highlight:#B7791F; --highlight-text:#9A6416;
}
body { background: var(--bg); color: var(--text); font-variant-numeric: tabular-nums lining-nums; }
```

## Decisions log

- 2026-10-16: Chose the sports data editorial direction, with a dark default and a light toggle.
- 2026-11-18: Dropped the What if section and the division comparison chart from scope.
- 2026-11-18: The history chart overlays 5- and 15-round moving averages instead of a single rating line, and dropped rounds use a × mark (see Charts).
- 2026-11-18: On mobile, tables show tier, division, and round as a second line under the tournament instead of an expandable row.
- 2026-11-18: The All rounds table shows the newest 50 rounds, with a button to show the rest. Some players have more than 1,000 rounds.
- 2026-11-18: The history chart loads lazily so the hero numbers render without waiting for the charting library.
- 2026-11-18 (critique pass, phone-first per PRODUCT.md):
  - Added the new-event verdict section and named each hero delta's baseline.
  - Projected now equals official plus the change from new rounds.
  - Reframed dropped rounds as protective (`--muted`, no strikethrough).
  - History now sits behind disclosures, and the Rounds table defaults to the window.
  - Set a 44px tap-target floor.
  - Added `--highlight-text` and darkened light `--up` to `#1A7D4C`, so both meet AA as text.
- 2026-11-18 (second critique pass):
  - On phones, Projected is the first figure; Official follows as a compact line with a muted change caption. Desktop keeps them side by side.
  - New-event rounds show signed points against the rating, colored only beyond ±5.
  - The chart rings new rounds, labels in-window unrated rounds "Not counted", lists only the marks it shows, and hides the 15-round line below 15 rounds.
  - Chart range and table scope live in the URL (`?range=`, `?rounds=all`).
  - The routine 1–2 point recalculation gap is explained in "How it's calculated" rather than as a notice.
