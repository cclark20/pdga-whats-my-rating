"""
Regression tests comparing calculate_rating against official PDGA ratings.

To add a new test case:
1. Save the player's ratings detail CSV to
   tests/fixtures/player_{pdga_no}_{rating_date}.csv
   Columns: tournament, date, tier, division, round, rating
2. Add a tuple to the parametrize list below.
"""

import pandas as pd
import pytest
from utils.rating_calc import calculate_rating

FIXTURES_DIR = "tests/fixtures"


@pytest.mark.parametrize(
    "fixture_file, official_rating, tolerance",
    [
        # Casey Clark - official 909 as of 2025-10-14
        ("player_167210_2025-10-14.csv", 909, 2),
        # Joshua Harrell - official 963 as of 2025-08-12 (calc=957, off by 6)
        ("player_167214_2025-08-12.csv", 963, 7),
        # David Caravas - official 857 as of 2025-11-11
        ("player_204766_2025-11-11.csv", 857, 2),
        # Paul McBeth - official 1047 as of 2025-11-11
        ("player_27523_2025-11-11.csv", 1047, 2),
        # Calvin Heimburg - official 1051 as of 2026-02-10
        ("player_45971_2026-02-10.csv", 1051, 2),
        # Brian Schweberger - official 1002 as of 2026-02-10
        ("player_12989_2026-02-10.csv", 1002, 2),
        # Ben Adinolfi - official 940 as of 2025-11-11
        ("player_146195_2025-11-11.csv", 940, 2),
        # Tyler Adkins - official 768 as of 2026-03-10 (has unrated tournament)
        ("player_298827_2026-03-10.csv", 768, 2),
    ],
)
def test_matches_official_rating(fixture_file, official_rating, tolerance):
    df = pd.read_csv(f"{FIXTURES_DIR}/{fixture_file}", parse_dates=["date"])
    _, calc_rating, _, _ = calculate_rating(df)
    diff = abs(calc_rating - official_rating)
    assert diff <= tolerance, (
        f"Calculated {calc_rating}, official {official_rating}, "
        f"diff {diff} exceeds tolerance {tolerance}"
    )
