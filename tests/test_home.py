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
    membership_status="Current (through 31-Dec-2026)",
):
    """Build a mock Player with real fixture data."""
    player = MagicMock()
    player.pdga_no = pdga_no
    player.name = name
    player.cur_rating = cur_rating
    player.rating_change = rating_change
    player.rating_date = rating_date
    player.new_tournaments = new_tournaments
    player.membership_status = membership_status

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
        assert "Player info not available" in at.error[0].value

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
        assert any("No new tournaments" in m for m in markdown_texts)

    def test_no_ratings_detail(self):
        at = self._run_success(fixture_file=None)
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("no data available" in m for m in markdown_texts)


class TestDroppedRounds:
    def _make_df_with_evaluated(self):
        """Build a df where some rounds have PDGA evaluated='Yes' but
        fall outside the 12-month window from the most recent round."""
        rows = []
        # Recent rounds (within 12 months) — will be evaluated
        for i in range(10):
            rows.append(
                {
                    "tournament": f"Recent Tournament {i}",
                    "date": pd.Timestamp("2025-06-01") - pd.DateOffset(months=i),
                    "tier": "A",
                    "division": "MPO",
                    "round": 1,
                    "rating": 1000,
                    "evaluated": "Yes",
                }
            )
        # Old rounds (>12 months ago) — PDGA had them evaluated but they should drop
        for i in range(3):
            rows.append(
                {
                    "tournament": f"Old Tournament {i}",
                    "date": pd.Timestamp("2024-04-01") - pd.DateOffset(months=i),
                    "tier": "A",
                    "division": "MPO",
                    "round": 1,
                    "rating": 1000,
                    "evaluated": "Yes",
                }
            )
        return pd.DataFrame(rows)

    def _run_with_evaluated(self, df):
        mock_player = _make_mock_player()
        mock_player.ratings_detail_df = df
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

    def test_dropped_rounds_displayed(self):
        df = self._make_df_with_evaluated()
        at = self._run_with_evaluated(df)
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Dropped from 12-Month Window" in m for m in markdown_texts)

    def test_no_dropped_rounds_message_when_none_dropped(self):
        df = self._make_df_with_evaluated()
        # Keep only recent rounds — none should be dropped
        df = df[df["date"] >= pd.Timestamp("2024-06-01")].copy()
        at = self._run_with_evaluated(df)
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("No rounds dropped" in m for m in markdown_texts)


class TestDoubleWeightedRounds:
    def test_double_weighted_rounds_displayed(self):
        """The fixture has enough rounds for double-weighting."""
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
            at = _run_with_input("27523")
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Double-Weighted Rounds" in m for m in markdown_texts)


class TestOutlierRounds:
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

    def _make_df_with_outlier(self):
        """Build a df where one round is far below the rest and will be
        dropped as an outlier."""
        rows = []
        for i in range(10):
            rows.append(
                {
                    "tournament": f"Tournament {i}",
                    "date": pd.Timestamp("2025-06-01") - pd.DateOffset(months=i),
                    "tier": "A",
                    "division": "MPO",
                    "round": 1,
                    "rating": 1000,
                }
            )
        # One very low round that should be dropped as an outlier
        rows.append(
            {
                "tournament": "Bad Day",
                "date": pd.Timestamp("2025-03-15"),
                "tier": "A",
                "division": "MPO",
                "round": 1,
                "rating": 700,
            }
        )
        return pd.DataFrame(rows)

    def test_outlier_rounds_displayed(self):
        df = self._make_df_with_outlier()
        at = self._run_success(fixture_file=None)
        # Re-run with our custom df
        mock_player = _make_mock_player()
        mock_player.ratings_detail_df = df
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
            at = _run_with_input("27523")
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("Dropped as Outliers" in m for m in markdown_texts)

    def test_no_outliers_message(self):
        """When all rounds are similar, no outlier section appears."""
        at = self._run_success()
        assert not at.exception
        markdown_texts = [m.value for m in at.markdown]
        assert any("No rounds dropped as outliers" in m for m in markdown_texts)


class TestExpiredMember:
    def _run_expired(self):
        """Run with an expired member who has round data but no official rating."""
        mock_player = _make_mock_player(
            pdga_no="123400",
            name="Expired Player",
            cur_rating=None,
            rating_change=None,
            rating_date=None,
            membership_status="Expired (as of 31-Dec-2025)",
        )
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
            return _run_with_input("123400")

    def test_renders_without_error(self):
        at = self._run_expired()
        assert not at.exception

    def test_shows_membership_warning(self):
        at = self._run_expired()
        assert not at.exception
        assert len(at.warning) >= 1
        assert any("Expired" in w.value for w in at.warning)

    def test_shows_calculated_rating(self):
        at = self._run_expired()
        assert not at.exception
        assert len(at.metric) >= 1
        calc_metric = at.metric[0]
        assert calc_metric.label == "Calculated Unofficial Rating (as of RIGHT NOW)"

    def test_shows_no_official_rating(self):
        at = self._run_expired()
        assert not at.exception
        official_metric = at.metric[1]
        assert official_metric.value == "N/A"


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
