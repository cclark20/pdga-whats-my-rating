import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from utils.rating_calc import calculate_rating


def make_df(ratings, dates=None, tiers=None, rounds=None):
    """Helper to build a ratings DataFrame for testing."""
    n = len(ratings)
    if dates is None:
        base = datetime.now()
        dates = [base - timedelta(days=i * 14) for i in range(n)]
    if tiers is None:
        tiers = ["A"] * n
    if rounds is None:
        rounds = [1] * n
    return pd.DataFrame(
        {
            "rating": ratings,
            "date": pd.to_datetime(dates),
            "tier": tiers,
            "round": rounds,
        }
    )


class TestCalculateRating:
    def test_basic_rating_calculation(self):
        """Rating should be close to the average of input ratings."""
        ratings = [900, 910, 920, 905, 915, 895, 910, 920]
        df = make_df(ratings)
        _, calc_rating, _ = calculate_rating(df, 910)
        # Should be in the ballpark of the input ratings
        assert 890 <= calc_rating <= 930

    def test_weighted_average(self):
        """Most recent 25% of rounds should be double-weighted."""
        # 8 rounds: last 25% (2 most recent) are double-weighted
        ratings = [1000, 1000, 900, 900, 900, 900, 900, 900]
        df = make_df(ratings)
        _, calc_rating, _ = calculate_rating(df, 950)
        # weighted avg = (1000*2 + 1000*2 + 900*6) / 10 = 940
        assert calc_rating == math.ceil(9400 / 10)

    def test_xm_tier_excluded(self):
        """XM tier rounds should be excluded from calculation."""
        ratings = [900, 910, 920, 905, 800]
        tiers = ["A", "A", "A", "A", "XM"]
        df = make_df(ratings, tiers=tiers)
        result_df, calc_rating, _ = calculate_rating(df, 900)
        assert "XM" not in result_df["tier"].values
        # Without the 800 XM round, rating should be higher
        assert calc_rating > 800

    def test_12_month_window(self):
        """Rounds older than 12 months should not be evaluated."""
        now = datetime.now()
        dates = [
            now - timedelta(days=30),
            now - timedelta(days=60),
            now - timedelta(days=90),
            now - timedelta(days=120),
            now - timedelta(days=400),  # older than 12 months
        ]
        ratings = [900, 910, 920, 905, 500]
        df = make_df(ratings, dates=dates)
        result_df, calc_rating, _ = calculate_rating(df, 900)
        old_row = result_df[result_df["rating"] == 500].iloc[0]
        assert old_row["evaluated"] == "No"
        assert old_row["weight"] == 0
        # Rating should not be dragged down by the old 500
        assert calc_rating > 850

    def test_outlier_removal_std_threshold(self):
        """Rounds below 2.5 SD + 5 buffer should be dropped."""
        ratings = [950, 950, 950, 950, 950, 950, 950, 950, 600]
        df = make_df(ratings)
        result_df, _, threshold = calculate_rating(df, 950)
        outlier_row = result_df[result_df["rating"] == 600].iloc[0]
        assert outlier_row["used"] == "No"
        assert outlier_row["weight"] == 0

    def test_outlier_100_point_threshold(self):
        """When 2.5 SD > 100, use 100-point threshold instead."""
        # High variance so 2.5*SD > 100
        ratings = [1000, 900, 800, 1000, 900, 800, 1000, 900, 800]
        df = make_df(ratings)
        std = np.std(ratings, ddof=0)
        avg = np.mean(ratings)
        assert (2.5 * std) >= 100
        _, _, threshold = calculate_rating(df, 900)
        assert threshold == math.ceil(avg - 100)

    def test_used_column_reflects_weights(self):
        """'used' column should be 'Yes' only for weight > 0."""
        ratings = [900, 910, 920, 905, 915, 895, 910, 920]
        df = make_df(ratings)
        result_df, _, _ = calculate_rating(df, 910)
        for _, row in result_df.iterrows():
            if row["weight"] > 0:
                assert row["used"] == "Yes"
            else:
                assert row["used"] == "No"

    def test_moving_averages_present(self):
        """Result should have mavg_5 and mavg_15 columns."""
        ratings = [900, 910, 920, 930, 940]
        df = make_df(ratings)
        result_df, _, _ = calculate_rating(df, 920)
        assert "mavg_5" in result_df.columns
        assert "mavg_15" in result_df.columns
        assert not result_df["mavg_5"].isna().any()
        assert not result_df["mavg_15"].isna().any()

    def test_double_weight_count(self):
        """Last 25% of evaluated rounds should have weight=2."""
        ratings = [900 + i * 5 for i in range(12)]
        df = make_df(ratings)
        result_df, _, _ = calculate_rating(df, 930)
        evaluated = result_df[result_df["evaluated"] == "Yes"]
        expected_double = round(len(evaluated) * 0.25)
        actual_double = len(result_df[result_df["weight"] == 2])
        assert actual_double == expected_double

    def test_returns_tuple_of_three(self):
        """calculate_rating returns (df, rating, threshold)."""
        ratings = [900, 910, 920, 905]
        df = make_df(ratings)
        result = calculate_rating(df, 900)
        assert len(result) == 3
        assert isinstance(result[0], pd.DataFrame)
        assert isinstance(result[1], int)
        assert isinstance(result[2], (int, float))
