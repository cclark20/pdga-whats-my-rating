import logging
import time
from collections.abc import Callable

import pandas as pd
import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 10
MAX_RETRIES = 4
INITIAL_BACKOFF = 2  # seconds
MAX_BACKOFF = 30  # seconds

PDGA_LIVE_PLAYER_URL = (
    "https://www.pdga.com/apps/tournament/live-api/live_results_fetch_player"
)

# PDGA asks API consumers to identify themselves
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "pdga-whats-my-rating (github.com/cclark20/pdga-whats-my-rating)",
}


def _format_date(date_str: str) -> str:
    dt = pd.to_datetime(date_str)
    return f"{dt.day:02d}-{dt.strftime('%b-%Y')}"


def _request_with_retry(
    url: str,
    *,
    timeout: int = REQUEST_TIMEOUT,
    on_retry: Callable[[int, float], None] | None = None,
) -> requests.Response:
    last_response = None
    for attempt in range(MAX_RETRIES + 1):
        response = requests.get(url, timeout=timeout, headers=HEADERS)
        if response.status_code != 429:
            response.raise_for_status()
            return response
        last_response = response
        if attempt < MAX_RETRIES:
            wait_time = min(INITIAL_BACKOFF * 2**attempt, MAX_BACKOFF)
            if on_retry is not None:
                on_retry(attempt, wait_time)
            time.sleep(wait_time)
    last_response.raise_for_status()
    return last_response  # unreachable, satisfies type checker


class Player:
    def __init__(
        self,
        pdga_no: int,
        *,
        api_urls: dict[str, str],
        on_retry: Callable[[int, float], None] | None = None,
    ):
        self.pdga_no = pdga_no
        self._on_retry = on_retry
        self._api_urls = api_urls

        self.name = None
        self.location = None
        self.cur_rating = None
        self.rating_change = None
        self.rating_date = None
        self.membership_status = None
        self.ratings_detail_df = None
        self.official_ratings_detail_df = None
        self.new_tournaments = None

        self._fetch_basic_info()
        self._fetch_ratings_detail()
        if self.ratings_detail_df is not None:
            self.official_ratings_detail_df = self.ratings_detail_df.copy()
            self._fetch_new_rounds()

    def _url(self, name: str) -> str:
        # URL templates live in app secrets; PDGA asked us not to publish them
        return self._api_urls[name].format(pdga_no=self.pdga_no)

    def _fetch_basic_info(self):
        # unknown PDGA numbers return 404, which raise_for_status surfaces
        url = self._url("profile")
        data = _request_with_retry(url, on_retry=self._on_retry).json()
        member = data.get("member") or {}

        self.name = f"{member.get('firstName', '')} {member.get('lastName', '')}"

        location_parts = [
            member.get("city"),
            member.get("stateProv"),
            member.get("country"),
        ]
        self.location = ", ".join(part for part in location_parts if part)

        # the profile keeps returning the last rating after membership lapses,
        # but PDGA only shows an official rating for current members
        exp_date = member.get("expDate")
        is_current = False
        if exp_date:
            is_current = pd.to_datetime(exp_date).date() >= pd.Timestamp.now().date()
            if is_current:
                self.membership_status = f"Current (through {_format_date(exp_date)})"
            else:
                self.membership_status = f"Expired (as of {_format_date(exp_date)})"

        current = data.get("currentRating")
        if not is_current or not current:
            return

        self.cur_rating = current.get("rating")
        if current.get("effectiveDate"):
            self.rating_date = f"(as of {_format_date(current['effectiveDate'])})"

        previous = data.get("previousRating")
        if previous and previous.get("rating") is not None:
            delta = current["rating"] - previous["rating"]
            self.rating_change = f"+{delta}" if delta > 0 else str(delta)

    def _fetch_ratings_detail(self):
        url = self._url("rounds")
        response = _request_with_retry(url, on_retry=self._on_retry)
        data = response.json()

        if not data:
            self.ratings_detail_df = None
            return

        rows = []
        for item in data:
            tourn = item.get("tournament", {})
            end_date = tourn.get("endDate", "")
            tourn_id = item.get("tournId")
            rows.append(
                {
                    "tournament": tourn.get("officialName"),
                    "tournament_url": f"https://www.pdga.com/tour/event/{tourn_id}"
                    if tourn_id
                    else None,
                    "date": pd.to_datetime(end_date) if end_date else None,
                    "tier": tourn.get("tier"),
                    "division": item.get("division"),
                    "round": str(item.get("round")),
                    "rating": item.get("rating"),
                    "evaluated": "Yes" if item.get("postedToRating") == 1 else "No",
                    "used": "Yes" if item.get("usedInGross") == 1 else "No",
                }
            )

        df = pd.DataFrame(rows)
        df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
        self.ratings_detail_df = df

    def _fetch_new_rounds(self):
        """Add rounds from events not yet in the official rating.

        The events endpoint lists every event but only has the average round
        rating. Its resultId is the live API's ResultID, which gives per-round
        ratings.
        """
        url = self._url("events")
        response = _request_with_retry(url, on_retry=self._on_retry)
        results = response.json() or []

        official = self.official_ratings_detail_df
        rated_ids = {
            int(u.rsplit("/", 1)[-1]) for u in official["tournament_url"].dropna()
        }
        last_rated_date = official["date"].max()

        events = []
        new_rows = []
        for item in results:
            result = item.get("liveResult", {})
            tourn = result.get("tournament", {})
            tourn_id = result.get("tournId")
            if not tourn.get("endDate") or not result.get("resultId"):
                continue
            end_date = pd.to_datetime(tourn["endDate"], utc=True).tz_localize(None)
            if tourn_id in rated_ids or end_date < last_rated_date:
                continue

            tourn_name = tourn.get("officialName")
            tourn_url = f"https://www.pdga.com/tour/event/{tourn_id}"
            events.append(
                {
                    "tournament": tourn_name,
                    "tournament_url": tourn_url,
                    "date": end_date,
                    "tier": tourn.get("tier"),
                    "division": result.get("division"),
                    "place": result.get("place"),
                    "avg_round_rating": item.get("averageRoundRating"),
                }
            )
            try:
                live = _request_with_retry(
                    f"{PDGA_LIVE_PLAYER_URL}?ResultID={result['resultId']}",
                    on_retry=self._on_retry,
                )
                scores = live.json()["data"].get("Scores", [])
            except Exception:
                logger.exception("Failed to fetch tournament: %s", tourn_name)
                continue

            for score in scores:
                if not score.get("RoundRating"):
                    continue
                new_rows.append(
                    {
                        "tournament": tourn_name,
                        "tournament_url": tourn_url,
                        "date": end_date,
                        "tier": tourn.get("tier"),
                        "division": result.get("division"),
                        "round": str(score.get("Round")),
                        "rating": int(score["RoundRating"]),
                        "evaluated": None,
                        "used": None,
                    }
                )

        if events:
            self.new_tournaments = pd.DataFrame(events)
        if new_rows:
            self.ratings_detail_df = pd.concat(
                [self.ratings_detail_df, pd.DataFrame(new_rows)], ignore_index=True
            )
