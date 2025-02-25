import pandas as pd
import numpy as np
import math
import streamlit as st


@st.cache_data
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

    df = df[df.tier != "XM"]

    # set valid dates to 1
    max_date = df["date"].max()
    min_date = max_date - pd.DateOffset(years=1)
    valid_dates = df["date"] >= min_date
    df.loc[valid_dates, "weight"] = 1
    df.loc[valid_dates, "evaluated"] = "Yes"

    # double the last 25%
    num_double = math.floor((len(df[valid_dates]) * 0.25))
    df.loc[: (num_double - 1), "weight"] = 2

    # remove outliers
    std = math.floor(df.loc[valid_dates, "rating"].std(ddof=0))
    avg = df.loc[valid_dates, "rating"].mean()
    threshold = math.ceil(avg - (2.5 * std))
    low_ratings = df["rating"] <= threshold
    df.loc[low_ratings, "weight"] = 0

    # set used col
    df.loc[df["weight"] > 0, "used"] = "Yes"

    # set moving avgs
    avg1 = 5
    avg2 = 15

    df["mavg_5"] = (
        df.sort_values(by=["date", "round"], ascending=True)
        .rating.rolling(avg1, min_periods=1)
        .mean()
    )
    df["mavg_15"] = (
        df.sort_values(by=["date", "round"], ascending=True)
        .rating.rolling(avg2, min_periods=1)
        .mean()
    )

    # rating
    rating = np.average(df.rating, weights=df.weight)

    return df, int(math.ceil(rating)), threshold
