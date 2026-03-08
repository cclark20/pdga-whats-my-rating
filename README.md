# What's My Rating?

A web app that calculates unofficial [PDGA](https://www.pdga.com/) player ratings in real time. Enter a PDGA number and get a calculated rating that includes rounds played since the last official rating update, along with rating history charts and round details.

## How It Works

1. Scrapes the player's profile and ratings detail page from pdga.com
2. Fetches any new tournament results not yet reflected in the official rating
3. Runs the PDGA rating algorithm: 12-month window, last 25% double-weighted, outlier removal at 2.5 SD / 100 points below average
4. Displays the calculated rating alongside the official rating, with charts and a full round breakdown

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

## Run the App

```bash
cd pdga_whats_my_rating
uv run streamlit run Home.py
```

You can bookmark a player lookup by adding `?pdga_no=12345` to the URL.

## Development

```bash
# Lint
uv run ruff check .

# Format check
uv run ruff format --check .

# Run tests
uv run pytest
```
