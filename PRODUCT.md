# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily amateur PDGA members, right after they've played a rated event. They want to know how that event will move their rating before PDGA publishes its next monthly update. Most open the app on a phone, often still at the course or in the car after a round. Desktop use is secondary.

Pros and casual check-ins are welcome, but they aren't the case to design for first.

## Product Purpose

What's My Rating? shows a player their official PDGA rating, explains how it was calculated, and projects what it will be at the next update. The projection includes events that PDGA hasn't rated yet.

Success is a player who enters their PDGA number and, within a few seconds, knows two things:

- their projected rating and how far it is from official;
- which rounds are driving it: what counts double, what's dropped, and what's aging out.

## Positioning

PDGA's site shows the official rating and the rounds behind it, but not what happens next. This app reruns the published rating algorithm on the official rounds plus not-yet-rated events, using per-round ratings from PDGA live scoring.

It is checked against reality: our recalculation of the current official rating is compared with PDGA's number. Accuracy fixtures from real players match exactly or within a point, with one known unexplained gap.

## Operating Context

- **Ratings update monthly.** PDGA publishes updates on a fixed schedule. Interest peaks right after an event and around update day.
- **Live scoring is provisional.** Round ratings for a just-finished event come from live scoring and can change before PDGA finalizes them.
- **Lookup is by PDGA number.** A player's page lives at `/player/{pdga_no}` and is meant to be bookmarked. Old `/?pdga_no=` links from the Streamlit app still work.
- **PDGA data comes from the PDGA APIs** under an Authorized Developer arrangement, and PDGA rate-limits requests. The server caches upstream calls and limits concurrency.

## Capabilities and Constraints

- **Algorithm:**
  - 12-month window from the most recent rated round, extended to 24 months when fewer than 8 rounds fall in 12.
  - The most recent 25% of rounds count double, with 9 or more rounds.
  - Iterative outlier removal at 2.5 SD (+5, an empirical buffer) or 100 points below the average, with 7 or more rounds.
  - XM-tier and "(Unrated)" events are excluded.
  - Hole-count weighting (27 holes = 1.5×) is not implemented.
- **Explanations shown:**
  - new events not yet rated;
  - double-weighted rounds;
  - outliers;
  - rounds leaving the window;
  - rounds that aged out at the last update;
  - full round history with 5- and 15-round moving averages.
- **Expired members:** PDGA shows no official rating for expired members; the app still projects from round history.
- **Stack:** TypeScript end to end.
  - `shared/` holds the algorithm and the API types.
  - `server/` is a Hono API that holds the private PDGA URLs and caches.
  - `web/` is a Vite + React SPA.
- **Deployment target:** Railway, not yet set up. Caching, a database, or Redis may follow.
- **Out of scope for now:** a "what if" hypothetical-round calculator and a division comparison chart. Both were considered and dropped.

## Brand Commitments

- **Always free.** The only monetization is an optional "Buy me a coffee" link.
- **PDGA attribution.**
  - Credit PDGA as the data source and state that the app is a PDGA Authorized Developer.
  - Label every result as unofficial.
  - Never publish, log, or expose the private PDGA API URLs.
- **No accounts.** No sign-up or login. The PDGA number in the URL is the whole identity.
- **Name:** "What's My Rating?"

## Evidence on Hand

- **Accuracy fixtures:** real players' ratings-detail snapshots with their official ratings (`tests/fixtures/*.csv`). These are 8 cases: 5 exact, 1 off by 1, and 1 known gap of 6 (PDGA #167214, an unpublished PDGA outlier rule).
- **Test players:** a list of PDGA numbers for manual testing across cases (`numbers-for-testing.txt`).
- **Logo:** a PDGA logo asset in the repo root (`Pdga-logo-blue-words.svg.webp`). Its permitted use hasn't been confirmed.
- **Absences:** no user testimonials, usage analytics, or press. Don't invent any.

## Product Principles

1. **Answer "what will my rating be?" first.** Everything else explains that number.
2. **Show the why, not just the what.** Every projected change should trace back to specific rounds.
3. **Be honest about uncertainty.** Say when our calculation differs from official, when live ratings are provisional, and what the algorithm doesn't model.
4. **Respect PDGA's data and rules.** Attribute it, rate-limit ourselves, and never present an estimate as official.
5. **Zero friction.** No accounts, no paywall, and a bookmarkable page that loads fast on a phone.
