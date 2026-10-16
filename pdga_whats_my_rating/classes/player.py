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

PDGA_AUTH_URL = "https://api.pdga.com/services/json/user/login"
PDGA_PLAYERS_URL = "https://api.pdga.com/services/json/players"


PDGA_LOGOUT_URL = "https://api.pdga.com/services/json/user/logout"


def _pdga_login(username: str, password: str) -> requests.Session:
    response = requests.post(
        PDGA_AUTH_URL,
        json={"username": username, "password": password},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    session = requests.Session()
    session.cookies.set(data["session_name"], data["sessid"])
    session.headers.update({"X-CSRF-Token": data["token"]})
    return session


def _pdga_logout(session: requests.Session) -> None:
    try:
        session.post(PDGA_LOGOUT_URL, timeout=REQUEST_TIMEOUT)
    except Exception:
        logger.debug("PDGA logout request failed (non-critical)")


def _request_with_retry(
    url: str,
    *,
    session: requests.Session | None = None,
    timeout: int = REQUEST_TIMEOUT,
    on_retry: Callable[[int, float], None] | None = None,
) -> requests.Response:
    getter = session.get if session is not None else requests.get
    last_response = None
    for attempt in range(MAX_RETRIES + 1):
        response = getter(url, timeout=timeout)
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
        username: str,
        password: str,
        members_api_url: str,
        on_retry: Callable[[int, float], None] | None = None,
    ):
        self.pdga_no = pdga_no
        self._on_retry = on_retry
        self._members_api_url = members_api_url

        self.name = None
        self.location = None
        self.cur_rating = None
        self.rating_change = None
        self.rating_date = None
        self.membership_status = None
        self.ratings_detail_df = None
        self.official_ratings_detail_df = None
        self.new_tournaments = None

        session = _pdga_login(username, password)
        try:
            self._fetch_basic_info(session)
        finally:
            _pdga_logout(session)
        self._fetch_ratings_detail()
        if self.ratings_detail_df is not None:
            self.official_ratings_detail_df = self.ratings_detail_df.copy()
        self._fetch_rating_change()

    def _fetch_basic_info(self, session: requests.Session):
        response = _request_with_retry(
            f"{PDGA_PLAYERS_URL}?pdga_number={self.pdga_no}",
            session=session,
            on_retry=self._on_retry,
        )
        data = response.json()
        players = data.get("players", [])
        if not players:
            resp = requests.Response()
            resp.status_code = 404
            raise requests.exceptions.HTTPError(response=resp)
        p = players[0]

        self.name = f"{p['first_name']} {p['last_name']}"

        location_parts = [p.get("city"), p.get("state_prov"), p.get("country")]
        self.location = ", ".join(part for part in location_parts if part)

        self.cur_rating = int(p["rating"]) if p.get("rating") else None

        date_str = p.get("rating_effective_date")
        if date_str:
            dt = pd.to_datetime(date_str)
            self.rating_date = f"(as of {dt.day}-{dt.strftime('%b-%Y')})"

        status = p.get("membership_status", "")
        self.membership_status = status.capitalize() if status else None

    def _fetch_ratings_detail(self):
        url = f"{self._members_api_url}/{self.pdga_no}/rating-detail"
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

    def _fetch_rating_change(self):
        url = f"{self._members_api_url}/{self.pdga_no}/rating-history"
        try:
            response = _request_with_retry(url, on_retry=self._on_retry)
            history = response.json()
            if len(history) >= 2:
                delta = history[0]["rating"] - history[1]["rating"]
                self.rating_change = f"+{delta}" if delta > 0 else str(delta)
        except Exception:
            logger.exception("Failed to fetch rating history for %s", self.pdga_no)
