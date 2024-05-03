import pandas as pd
import numpy as np
import math


def calculate_rating(df, current_rating):
    """
    12 months prior to latest round
    last 25% are worth double
    2.5 SD below rating is dropped
    """
    df = df.sort_values(by=["date", "round"], ascending=False).reset_index(drop=True)
    df["weight"] = 0  # init weights at 0
    df["evaluated"] = "No"
    df["used"] = "No"

    # set valid dates to 1
    max_date = df["date"].max()
    min_date = max_date - pd.DateOffset(years=1)
    valid_dates = df["date"] >= min_date
    df.loc[valid_dates, "weight"] = 1
    df.loc[valid_dates, "evaluated"] = "Yes"

    # double the last 25%
    num_double = math.ceil(len(df[valid_dates]) * 0.25)
    df.loc[: (num_double - 1), "weight"] = 2

    # remove outliers
    std = df.loc[valid_dates, "rating"].std()
    low_ratings = df["rating"] <= (current_rating - 2.5 * std)
    df.loc[low_ratings, "weight"] = 0

    # set used col
    df.loc[df["weight"] > 0, "used"] = "Yes"

    # rating
    rating = np.average(df.rating, weights=df.weight)

    return df, int(math.ceil(rating)), math.floor(current_rating - 2.5 * std)
