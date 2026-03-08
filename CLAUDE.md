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

## Architecture

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
