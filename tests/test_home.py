"""
Streamlit UI tests for Home.py using st.testing.

All tests mock the Player class to avoid network requests.
"""

from unittest.mock import MagicMock, patch

import pandas as pd
from streamlit.testing.v1 import AppTest

APP_PATH = "pdga_whats_my_rating/Home.py"
FIXTURES_DIR = "tests/fixtures"


def _make_mock_player(
    pdga_no="27523",
    name="Paul McBeth",
    cur_rating=1047,
    rating_change="+3",
    rating_date="(as of 11-Nov-2025)",
    fixture_file="player_27523_2025-11-11.csv",
    new_tournaments=None,
):
    """Build a mock Player with real fixture data."""
    player = MagicMock()
    player.pdga_no = pdga_no
    player.name = name
    player.cur_rating = cur_rating
    player.rating_change = rating_change
    player.rating_date = rating_date
    player.new_tournaments = new_tournaments

    if fixture_file:
        df = pd.read_csv(f"{FIXTURES_DIR}/{fixture_file}", parse_dates=["date"])
        player.ratings_detail_df = df
    else:
        player.ratings_detail_df = None

    return player


def _run_with_input(pdga_no):
    """Create AppTest, enter a PDGA number, and submit the form."""
    at = AppTest.from_file(APP_PATH)
    at.run()
    at.text_input[0].set_value(pdga_no).run()
    at.button[0].click().run()
    return at


class TestInitialLoad:
    def test_app_loads_without_error(self):
        at = AppTest.from_file(APP_PATH)
        at.run()
        assert not at.exception

    def test_title_displayed(self):
        at = AppTest.from_file(APP_PATH)
        at.run()
        assert at.title[0].value == "What's My Rating?"

    def test_form_elements_present(self):
        at = AppTest.from_file(APP_PATH)
        at.run()
        assert len(at.text_input) == 1
        assert len(at.button) == 1


class TestInvalidInput:
    def test_non_numeric_pdga_number(self):
        at = _run_with_input("abc")
        assert len(at.error) == 1
        assert "must be a valid pdga number" in at.error[0].value

    def test_http_error_generic(self):
        import requests

        response = MagicMock()
        response.status_code = 500
        exc = requests.exceptions.HTTPError(response=response)

        with patch("classes.player.Player.__init__", side_effect=exc):
            at = _run_with_input("99999")
        assert len(at.error) == 1
        assert "player info not available" in at.error[0].value

    def test_http_error_rate_limit(self):
        import requests

        response = MagicMock()
        response.status_code = 429
        exc = requests.exceptions.HTTPError(response=response)

        with patch("classes.player.Player.__init__", side_effect=exc):
            at = _run_with_input("99999")
        assert len(at.error) == 1
        assert "rate limiting" in at.error[0].value


class TestSuccessfulLookup:
    def _run_success(self, **kwargs):
        mock_player = _make_mock_player(**kwargs)
        with (
            patch(
                "classes.player.Player.__init__",
                lambda self, *a, **kw: None,
            ),
            patch(
                "classes.player.Player.__new__",
                lambda cls, *a, **kw: mock_player,
            ),
        ):
            return _run_with_input("27523")

    def test_displays_player_name(self):
        at = self._run_success()
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Paul McBeth" in m for m in markdown_texts)

    def test_displays_metrics(self):
        at = self._run_success()
        assert not at.exception
        assert len(at.metric) == 2
        official = at.metric[1]
        assert official.value == "1047"

    def test_displays_rating_detail_table(self):
        at = self._run_success()
        assert not at.exception
        assert len(at.subheader) == 1
        assert at.subheader[0].value == "Rating Detail"

    def test_displays_stats_section(self):
        at = self._run_success()
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Number of rounds evaluated" in m for m in markdown_texts)
        assert any("NEW TOURNAMENTS:** None" in m for m in markdown_texts)

    def test_no_ratings_detail(self):
        at = self._run_success(fixture_file=None)
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("no data available" in m for m in markdown_texts)


class TestQueryParams:
    def test_auto_loads_from_query_param(self):
        mock_player = _make_mock_player()
        with (
            patch(
                "classes.player.Player.__init__",
                lambda self, *a, **kw: None,
            ),
            patch(
                "classes.player.Player.__new__",
                lambda cls, *a, **kw: mock_player,
            ),
        ):
            at = AppTest.from_file(APP_PATH)
            at.query_params["pdga_no"] = "27523"
            at.run()

        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Paul McBeth" in m for m in markdown_texts)
