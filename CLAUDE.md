# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Streamlit web app that calculates unofficial PDGA (Professional Disc Golf Association) player ratings by scraping data from pdga.com. It shows a player's calculated rating, rating history charts, and round details. Users enter a PDGA number (or bookmark via query params) and the app scrapes, calculates, and visualizes their rating.

## Commands

- **Install dependencies:** `uv sync`
- **Run the app:** `cd pdga_whats_my_rating && uv run streamlit run Home.py`
- **Lint:** `uv run ruff check .`
- **Format:** `uv run ruff format .`
- **Test:** `uv run pytest`

TypeScript rebuild (in progress, replaces Streamlit; npm workspaces at repo root):

- **Install:** `npm install`
- **Lint + format check + typecheck:** `npm run check` (Biome + `tsc -b`); auto-fix with `npx biome check --write .`
- **Test:** `npm test` (Vitest)
- **Run the app:** `npm run dev` starts the API (http://localhost:3000) and Vite (http://localhost:5173, proxies `/api`). `npm run build && npm start` serves the built SPA from the API server on :3000. Needs `PDGA_PROFILE_URL`, `PDGA_ROUNDS_URL`, `PDGA_EVENTS_URL` in a root `.env` (see `.env.example`; values are the `[pdga_api]` templates from `.streamlit/secrets.toml`). Node runs the `.ts` files directly via type stripping — no build step, so imports must use `.ts` extensions and avoid enums/parameter properties.

## Architecture

- **`shared/src/rating.ts`** — TS port of `rating_calc.py`: `calculateRating()` returns a `Breakdown` (`rating`/`threshold` are `null` when not applicable), plus `agedOutRounds()` and `droppedFromWindow()`. Verified round-for-round against the Python on every fixture. Porting traps kept on purpose: Python's banker's rounding for the double-weight count (`roundHalfEven`), population std dev, and `pd.DateOffset` Feb-29 clamping (`subtractYears`). Deliberate fixes over Python: rounds sort numerically (Python live data sorted `"10"` before `"2"`), and double weight goes to the newest N *evaluated* rounds — Python sliced by row position, so recent XM rounds shrank the doubled set and recent unrated rounds got weight 2. All accuracy fixtures still match.
- **`shared/src/types.ts`** — `Round`/`Breakdown` plus the API contract (`PlayerResponse`, `ApiError`) shared by server and web.
- **`server/`** — Hono API. `pdga.ts` ports `Player` (zod-validated PDGA responses, pure `parse*` functions; profile fetched first so bad numbers cost one request; with no official rounds, every event counts as new). `http.ts` does 429 retry/backoff with a global concurrency limit of 2. `cache.ts` is a read-through TTL cache with in-flight dedupe behind an async `Cache` interface (swap in Redis later). `routes.ts` maps errors to `invalid_pdga_no`/`not_found`/`rate_limited`/`upstream_error`. Logs and errors use labels (`profile`, `live:<id>`), never the private URLs.
- **`web/`** — Vite + React SPA built to `DESIGN.md` (read it before UI changes). Routes: `/` lookup, `/player/:pdgaNo` (old `/?pdga_no=` bookmarks redirect). Tailwind v4 tokens live in `src/index.css` `@theme`. `HistoryChart` (Recharts) is lazy-loaded; dropped rounds are a × mark because `--down`/`--highlight` fail colorblind separation in light mode. `VITE_CONTACT_EMAIL` in the root `.env` enables feedback links (Vite reads the root `.env`; only `VITE_*` reach the browser).

- **`pdga_whats_my_rating/Home.py`** — Streamlit entrypoint. Handles form input, displays metrics, charts, and data tables.
- **`classes/player.py`** — `Player` class that scrapes pdga.com for a player's info, ratings detail, and recent events. Fetches from three sources: player home page, `/details` page, and individual tournament pages for new (not-yet-rated) tournaments.
- **`utils/rating_calc.py`** — `calculate_rating()` implements the PDGA rating algorithm: 12/24-month window, last 25% double-weighted (≥9 rounds), outlier drop at 2.5 SD or 100 points below average (≥7 rounds), excludes XM tier. Returns `(df, rating, threshold, window_months)`.
- **`utils/figs.py`** — Plotly chart builders: rating history bar chart with 5/15 moving averages, and division box plot.

## Workflow

- **Never commit or push directly to main.** Always create a feature branch, push it, and open a PR linked to the relevant issue(s) (use `Fixes #N` in the PR body).
- Always run `uv run ruff check .` and `uv run ruff format --check .` before committing/pushing code. Fix any issues before pushing.

## Key Technical Details

- Python 3.12+, managed with uv
- Web scraping uses `requests` + `BeautifulSoup` + `pandas.read_html`
- Scraping is fragile — relies on PDGA website HTML structure (classes like `current-rating`, `rating-difference`, table layouts)
- Streamlit caching (`@st.cache_data`) is used on `calculate_rating` and `get_data`
- Imports in `Home.py` use relative-style paths (e.g., `from utils.rating_calc import ...`) — the app must be run from inside the `pdga_whats_my_rating/` directory
- Query param `pdga_no` enables bookmarkable player lookups
- Tests use pytest with `pythonpath = ["pdga_whats_my_rating"]` in pyproject.toml
- `tests/conftest.py` patches `st.cache_data` to a no-op for test compatibility
- PDGA rate-limits requests — add delays (3-5s) between requests when scraping multiple players

## PDGA Official Rating Algorithm

Per [PDGA ratings guide](https://pdga.com/ratings/guide):
- **12-month window** from most recent rated round
- **24-month lookback**: if <8 rounds in 12 months, extend window to 24 months
- **Double-weight most recent 25%** only when ≥9 evaluated rounds
- **Outlier removal** only when ≥7 evaluated rounds: drop rounds >2.5 SD or >100 points below average
- **Hole count weighting**: 18-hole = 1x, 27-hole = 1.5x (not yet implemented — requires scraping individual tournament pages)
- **Incomplete rounds** are excluded

### Our implementation vs PDGA

- The `+5` buffer on the outlier threshold is an empirical approximation — helps match PDGA results but the exact rule is unknown
- Outlier removal is iterative: dropping one outlier shifts avg/std, which can expose additional outliers
- The double-weight count (`round(n * 0.25)`) is computed from evaluated rounds before outlier removal, then applied to remaining rounds after removal
- Hole count weighting is not yet implemented — the PDGA ratings detail page doesn't include hole counts (see separate issue)
- One known unexplained gap: Josh (167214) is off by 6 — PDGA drops a round (899) that doesn't trigger any threshold we can compute. Likely an unpublished PDGA rule.

## Testing

- **Unit tests** (`tests/test_rating_calc.py`): test algorithm mechanics (weighting, outlier drops, 12-month window, XM exclusion) with synthetic data
- **Accuracy regression tests** (`tests/test_rating_accuracy.py`): compare `calculate_rating` output against known official PDGA ratings using real player data fixtures
- Fixtures are CSV snapshots stored in `tests/fixtures/player_{pdga_no}_{rating_date}.csv`
- To add a new test case: save the player's ratings detail CSV, add a parametrize tuple with `(filename, official_rating, tolerance)`
- Current accuracy: 5/7 players exact match, 1 off by 1, 1 off by 6 (Josh — unexplained PDGA outlier logic)
