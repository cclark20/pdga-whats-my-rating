# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Streamlit web app that calculates unofficial PDGA (Professional Disc Golf Association) player ratings by scraping data from pdga.com. It shows a player's calculated rating, rating history charts, and round details. Users enter a PDGA number (or bookmark via query params) and the app scrapes, calculates, and visualizes their rating.

## Commands

- **Install dependencies:** `uv sync`
- **Run the app:** `cd pdga_whats_my_rating && uv run streamlit run Home.py`
- **Lint:** `uv run ruff check .`
- **Format:** `uv run ruff format .`

## Architecture

- **`pdga_whats_my_rating/Home.py`** — Streamlit entrypoint. Handles form input, displays metrics, charts, and data tables.
- **`classes/player.py`** — `Player` class that scrapes pdga.com for a player's info, ratings detail, and recent events. Fetches from three sources: player home page, `/details` page, and individual tournament pages for new (not-yet-rated) tournaments.
- **`utils/rating_calc.py`** — `calculate_rating()` implements the PDGA rating algorithm: 12-month window, last 25% double-weighted, outlier drop at 2.5 SD (or 100 points) below average, excludes XM tier.
- **`utils/figs.py`** — Plotly chart builders: rating history bar chart with 5/15 moving averages, and division box plot.

## Key Technical Details

- Python 3.12+, managed with uv
- Web scraping uses `requests` + `BeautifulSoup` + `pandas.read_html`
- Scraping is fragile — relies on PDGA website HTML structure (classes like `current-rating`, `rating-difference`, table layouts)
- Streamlit caching (`@st.cache_data`) is used on `calculate_rating` and `get_data`
- Imports in `Home.py` use relative-style paths (e.g., `from utils.rating_calc import ...`) — the app must be run from inside the `pdga_whats_my_rating/` directory
- Query param `pdga_no` enables bookmarkable player lookups
- No test suite exists yet (`tests/` contains only `__init__.py`)
- The rating algorithm's +5 buffer on the outlier threshold is an approximation of PDGA's actual calculation
