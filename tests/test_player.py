from unittest.mock import MagicMock, patch

import pandas as pd
from classes.player import Player

API_URLS = {
    "profile": "https://example.test/{pdga_no}/profile",
    "rounds": "https://example.test/{pdga_no}/rounds",
    "events": "https://example.test/{pdga_no}/events",
}


def _official_df():
    return pd.DataFrame(
        [
            {
                "tournament": "Fall Colors - All Pro",
                "tournament_url": "https://www.pdga.com/tour/event/98279",
                "date": pd.Timestamp("2026-11-08"),
                "tier": "A",
                "division": "MA1",
                "round": "1",
                "rating": 932,
                "evaluated": "Yes",
                "used": "Yes",
            }
        ]
    )


def _result(tourn_id, result_id, end_date, name="Event"):
    return {
        "liveResult": {
            "resultId": result_id,
            "tournId": tourn_id,
            "division": "MA2",
            "place": 3,
            "tournament": {
                "tournId": tourn_id,
                "officialName": name,
                "tier": "A",
                "endDate": f"{end_date}T00:00:00+00:00",
            },
        },
        "averageRoundRating": 925,
    }


def _make_player():
    player = Player.__new__(Player)
    player.pdga_no = 167210
    player._on_retry = None
    player._api_urls = API_URLS
    player.new_tournaments = None
    player.ratings_detail_df = _official_df()
    player.official_ratings_detail_df = _official_df()
    return player


def _fake_requests(results, live_scores):
    def fake(url, **kwargs):
        response = MagicMock()
        if url.endswith("/events"):
            response.json.return_value = results
        else:
            result_id = int(url.split("ResultID=")[-1])
            response.json.return_value = {"data": {"Scores": live_scores[result_id]}}
        return response

    return fake


class TestFetchNewRounds:
    def test_adds_rounds_from_new_event(self):
        player = _make_player()
        results = [
            _result(98281, 111, "2026-11-15", name="Fall Colors - All Am"),
            _result(98279, 222, "2026-11-08"),  # already in rating detail
        ]
        scores = {
            111: [
                {"Round": 1, "RoundRating": 968},
                {"Round": 2, "RoundRating": 881},
                {"Round": 3, "RoundRating": 925},
            ]
        }
        with patch(
            "classes.player._request_with_retry",
            side_effect=_fake_requests(results, scores),
        ):
            player._fetch_new_rounds()

        assert len(player.new_tournaments) == 1
        assert player.new_tournaments.iloc[0]["tournament"] == "Fall Colors - All Am"

        df = player.ratings_detail_df
        new = df[df["tournament"] == "Fall Colors - All Am"]
        assert new["rating"].tolist() == [968, 881, 925]
        assert new["round"].tolist() == ["1", "2", "3"]
        assert new["evaluated"].isna().all()
        assert len(player.official_ratings_detail_df) == 1

    def test_skips_old_unrated_events(self):
        player = _make_player()
        results = [_result(90000, 333, "2025-01-01")]
        with patch(
            "classes.player._request_with_retry",
            side_effect=_fake_requests(results, {}),
        ):
            player._fetch_new_rounds()

        assert player.new_tournaments is None
        assert len(player.ratings_detail_df) == 1

    def test_skips_unrated_rounds(self):
        player = _make_player()
        results = [_result(98281, 111, "2026-11-15")]
        scores = {
            111: [
                {"Round": 1, "RoundRating": 968},
                {"Round": 2, "RoundRating": None},
            ]
        }
        with patch(
            "classes.player._request_with_retry",
            side_effect=_fake_requests(results, scores),
        ):
            player._fetch_new_rounds()

        assert len(player.new_tournaments) == 1
        assert len(player.ratings_detail_df) == 2

    def test_live_api_failure_keeps_event_listed(self):
        player = _make_player()
        results = [_result(98281, 111, "2026-11-15")]

        def fake(url, **kwargs):
            if url.endswith("/events"):
                response = MagicMock()
                response.json.return_value = results
                return response
            raise ConnectionError("live api down")

        with patch("classes.player._request_with_retry", side_effect=fake):
            player._fetch_new_rounds()

        assert len(player.new_tournaments) == 1
        assert len(player.ratings_detail_df) == 1


def _overview(exp_date, current=927, previous=914):
    def rating(value, date):
        if value is None:
            return None
        return {"rating": value, "effectiveDate": f"{date}T00:00:00+00:00"}

    return {
        "member": {
            "firstName": "Casey",
            "lastName": "Clark",
            "city": "Richmond",
            "stateProv": "VA",
            "country": "US",
            "expDate": f"{exp_date}T00:00:00+00:00",
        },
        "currentRating": rating(current, "2026-11-10"),
        "previousRating": rating(previous, "2026-07-14"),
    }


def _fetch_overview(overview):
    player = _make_player()
    player.cur_rating = None
    player.rating_change = None
    player.rating_date = None
    player.membership_status = None
    response = MagicMock()
    response.json.return_value = overview
    with patch("classes.player._request_with_retry", return_value=response):
        player._fetch_basic_info()
    return player


@patch("classes.player.pd.Timestamp.now", return_value=pd.Timestamp("2026-11-16"))
class TestFetchBasicInfo:
    def test_current_member(self, _now):
        player = _fetch_overview(_overview("2026-12-31"))

        assert player.name == "Casey Clark"
        assert player.location == "Richmond, VA, US"
        assert player.membership_status == "Current (through 31-Dec-2026)"
        assert player.cur_rating == 927
        assert player.rating_date == "(as of 10-Nov-2026)"
        assert player.rating_change == "+13"

    def test_expired_member_has_no_official_rating(self, _now):
        # overview still returns the last rating after membership lapses
        player = _fetch_overview(_overview("2022-12-31", current=851, previous=906))

        assert player.membership_status == "Expired (as of 31-Dec-2022)"
        assert player.cur_rating is None
        assert player.rating_date is None
        assert player.rating_change is None

    def test_rating_drop(self, _now):
        player = _fetch_overview(_overview("2026-12-31", current=941, previous=948))

        assert player.rating_change == "-7"

    def test_no_previous_rating(self, _now):
        player = _fetch_overview(_overview("2026-12-31", previous=None))

        assert player.cur_rating == 927
        assert player.rating_change is None
