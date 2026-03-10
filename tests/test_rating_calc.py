import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from utils.rating_calc import calculate_rating


def make_df(ratings, dates=None, tiers=None, rounds=None, tournaments=None):
    """Helper to build a ratings DataFrame for testing."""
    n = len(ratings)
    if dates is None:
        base = datetime.now()
        dates = [base - timedelta(days=i * 14) for i in range(n)]
    if tiers is None:
        tiers = ["A"] * n
    if rounds is None:
        rounds = [1] * n
    if tournaments is None:
        tournaments = ["Test Tournament"] * n
    return pd.DataFrame(
        {
            "rating": ratings,
            "date": pd.to_datetime(dates),
            "tier": tiers,
            "round": rounds,
            "tournament": tournaments,
        }
    )


class TestCalculateRating:
    def test_basic_rating_calculation(self):
        """Rating should be close to the average of input ratings."""
        ratings = [900, 910, 920, 905, 915, 895, 910, 920]
        df = make_df(ratings)
        _, calc_rating, _, _ = calculate_rating(df)
        # Should be in the ballpark of the input ratings
        assert 890 <= calc_rating <= 930

    def test_weighted_average(self):
        """Most recent 25% of rounds should be double-weighted (≥9 rounds)."""
        # 9 rounds: last 25% (2 most recent) are double-weighted
        ratings = [1000, 1000, 900, 900, 900, 900, 900, 900, 900]
        df = make_df(ratings)
        _, calc_rating, _, _ = calculate_rating(df)
        # weighted avg = (1000*2 + 1000*2 + 900*7) / 11 = 10300/11 = 937
        assert calc_rating == math.ceil(10300 / 11)

    def test_xm_tier_excluded(self):
        """XM tier rounds should be excluded from calculation."""
        ratings = [900, 910, 920, 905, 800]
        tiers = ["A", "A", "A", "A", "XM"]
        df = make_df(ratings, tiers=tiers)
        result_df, calc_rating, _, _ = calculate_rating(df)
        assert "XM" not in result_df["tier"].values
        # Without the 800 XM round, rating should be higher
        assert calc_rating > 800

    def test_unrated_tournament_excluded(self):
        """Tournaments with '(Unrated)' in the name should be excluded."""
        ratings = [900, 910, 920, 905, 800]
        tournaments = [
            "Tournament A",
            "Tournament B",
            "Tournament C",
            "Tournament D",
            "SOMD ICE BOWL (Unrated)",
        ]
        df = make_df(ratings, tournaments=tournaments)
        result_df, calc_rating, _, _ = calculate_rating(df)
        assert "(Unrated)" not in " ".join(result_df["tournament"].values)
        # Without the 800 unrated round, rating should be higher
        assert calc_rating > 800

    def test_12_month_window(self):
        """Rounds older than 12 months should not be evaluated."""
        now = datetime.now()
        dates = [
            now - timedelta(days=30),
            now - timedelta(days=60),
            now - timedelta(days=90),
            now - timedelta(days=120),
            now - timedelta(days=150),
            now - timedelta(days=180),
            now - timedelta(days=210),
            now - timedelta(days=240),
            now - timedelta(days=400),  # older than 12 months
        ]
        ratings = [900, 910, 920, 905, 915, 895, 910, 920, 500]
        df = make_df(ratings, dates=dates)
        result_df, calc_rating, _, _ = calculate_rating(df)
        old_row = result_df[result_df["rating"] == 500].iloc[0]
        assert old_row["evaluated"] == "No"
        assert old_row["weight"] == 0
        # Rating should not be dragged down by the old 500
        assert calc_rating > 850

    def test_outlier_removal_std_threshold(self):
        """Rounds below 2.5 SD + 5 buffer should be dropped."""
        ratings = [950, 950, 950, 950, 950, 950, 950, 950, 600]
        df = make_df(ratings)
        result_df, _, threshold, _ = calculate_rating(df)
        outlier_row = result_df[result_df["rating"] == 600].iloc[0]
        assert outlier_row["used"] == "No"
        assert outlier_row["weight"] == 0

    def test_outlier_100_point_threshold(self):
        """When 2.5 SD > 100, use 100-point threshold instead."""
        # High variance so 2.5*SD > 100
        ratings = [1000, 900, 800, 1000, 900, 800, 1000, 900, 800]
        df = make_df(ratings)
        std = np.std(ratings, ddof=0)
        assert (2.5 * std) >= 100
        result_df, _, threshold, _ = calculate_rating(df)
        # 800s are dropped on first pass, then threshold shifts
        # on second pass based on remaining [1000, 900] rounds
        assert all(result_df[result_df["rating"] == 800]["weight"] == 0)

    def test_used_column_reflects_weights(self):
        """'used' column should be 'Yes' only for weight > 0."""
        ratings = [900, 910, 920, 905, 915, 895, 910, 920]
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        for _, row in result_df.iterrows():
            if row["weight"] > 0:
                assert row["used"] == "Yes"
            else:
                assert row["used"] == "No"

    def test_moving_averages_present(self):
        """Result should have mavg_5 and mavg_15 columns."""
        ratings = [900, 910, 920, 930, 940]
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        assert "mavg_5" in result_df.columns
        assert "mavg_15" in result_df.columns
        assert not result_df["mavg_5"].isna().any()
        assert not result_df["mavg_15"].isna().any()

    def test_double_weight_count(self):
        """Last 25% of evaluated rounds should have weight=2."""
        ratings = [900 + i * 5 for i in range(12)]
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        evaluated = result_df[result_df["evaluated"] == "Yes"]
        expected_double = round(len(evaluated) * 0.25)
        actual_double = len(result_df[result_df["weight"] == 2])
        assert actual_double == expected_double

    def test_returns_tuple_of_four(self):
        """calculate_rating returns (df, rating, threshold, window_months)."""
        ratings = [900, 910, 920, 905]
        df = make_df(ratings)
        result = calculate_rating(df)
        assert len(result) == 4
        assert isinstance(result[0], pd.DataFrame)
        assert isinstance(result[1], int)
        assert isinstance(result[2], (int, float))
        assert result[3] in (12, 24)

    def test_no_double_weight_below_9_rounds(self):
        """With <9 rounds, no double-weighting should be applied."""
        ratings = [1000, 1000, 900, 900, 900, 900, 900, 900]  # 8 rounds
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        assert (result_df["weight"] == 2).sum() == 0

    def test_double_weight_at_9_rounds(self):
        """With exactly 9 rounds, double-weighting should apply."""
        ratings = [1000, 1000, 900, 900, 900, 900, 900, 900, 900]
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        double_weighted = result_df[result_df["weight"] == 2]
        assert len(double_weighted) == round(9 * 0.25)  # 2 rounds

    def test_no_outlier_removal_below_7_rounds(self):
        """With <7 rounds, outliers should NOT be removed."""
        ratings = [950, 950, 950, 950, 950, 600]  # 6 rounds, 600 is an outlier
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        outlier_row = result_df[result_df["rating"] == 600].iloc[0]
        assert outlier_row["used"] == "Yes"
        assert outlier_row["weight"] > 0

    def test_outlier_removal_at_7_rounds(self):
        """With ≥7 rounds, outliers should be removed."""
        ratings = [950, 950, 950, 950, 950, 950, 600]  # 7 rounds
        df = make_df(ratings)
        result_df, _, _, _ = calculate_rating(df)
        outlier_row = result_df[result_df["rating"] == 600].iloc[0]
        assert outlier_row["used"] == "No"
        assert outlier_row["weight"] == 0

    def test_24_month_lookback(self):
        """With <8 rounds in 12 months, extend window to 24 months."""
        now = datetime.now()
        dates = [
            now - timedelta(days=30),
            now - timedelta(days=60),
            now - timedelta(days=90),
            now - timedelta(days=120),
            now - timedelta(days=150),
            # 5 rounds in 12 months, need to look back further
            now - timedelta(days=400),
            now - timedelta(days=420),
            now - timedelta(days=440),
            now - timedelta(days=460),
            now - timedelta(days=480),
        ]
        ratings = [900, 910, 920, 905, 915, 890, 885, 895, 880, 870]
        df = make_df(ratings, dates=dates)
        result_df, _, _, window_months = calculate_rating(df)
        assert window_months == 24
        # Rounds from 12-24 months ago should be evaluated
        old_rows = result_df[result_df["rating"].isin([890, 885, 895, 880, 870])]
        assert (old_rows["evaluated"] == "Yes").all()

    def test_no_lookback_when_enough_rounds(self):
        """With ≥8 rounds in 12 months, use standard 12-month window."""
        now = datetime.now()
        dates = [now - timedelta(days=i * 14) for i in range(10)]
        dates.append(now - timedelta(days=400))  # old round
        ratings = [900 + i * 5 for i in range(10)] + [800]
        df = make_df(ratings, dates=dates)
        result_df, _, _, window_months = calculate_rating(df)
        assert window_months == 12
        old_row = result_df[result_df["rating"] == 800].iloc[0]
        assert old_row["evaluated"] == "No"

    def test_24_month_lookback_still_few(self):
        """With <8 rounds even in 24 months, use what's available."""
        now = datetime.now()
        dates = [
            now - timedelta(days=30),
            now - timedelta(days=60),
            now - timedelta(days=400),
            now - timedelta(days=420),
            now - timedelta(days=440),
        ]
        ratings = [900, 910, 890, 885, 895]
        df = make_df(ratings, dates=dates)
        result_df, _, _, window_months = calculate_rating(df)
        assert window_months == 24
        assert (result_df["evaluated"] == "Yes").all()
