import math

import numpy as np
import pandas as pd
import streamlit as st


@st.cache_data
def calculate_rating(df):
    """
    12 months prior to latest round
    last 25% are worth double
    2.5 SD below rating is dropped
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"], format="mixed")
    df = df.sort_values(by=["date", "round"], ascending=[False, True]).reset_index(
        drop=True
    )
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

    # double the last 25% (computed before outlier removal)
    num_double = round(len(df[valid_dates]) * 0.25)
    df.loc[: (num_double - 1), "weight"] = 2

    # iteratively remove outliers — dropping a round shifts the
    # avg/std, which may expose additional outliers.
    # 10 is just a safety cap; typically converges in 2-3 passes.
    threshold = 0
    for _ in range(10):
        used_mask = df["weight"] > 0
        if used_mask.sum() == 0:
            break
        std = df.loc[used_mask, "rating"].std(ddof=0)
        if std == 0:
            break
        avg = df.loc[used_mask, "rating"].mean()
        if (2.5 * std) < 100:
            new_threshold = math.ceil(avg - math.floor(2.5 * std)) + 5
        else:
            new_threshold = math.ceil(avg - 100)
        if new_threshold == threshold:
            break
        threshold = new_threshold
        df.loc[df["rating"] <= threshold, "weight"] = 0

    # set used col
    df.loc[df["weight"] > 0, "used"] = "Yes"

    # set moving avgs
    avg1 = 5
    avg2 = 15

    df_asc = df.sort_values(by=["date", "round"], ascending=True)
    df["mavg_5"] = df_asc.rating.rolling(avg1, min_periods=1).mean()
    df["mavg_15"] = df_asc.rating.rolling(avg2, min_periods=1).mean()

    # rating
    if df["weight"].sum() == 0:
        return df, 0, threshold

    rating = np.average(df.rating, weights=df.weight)

    return df, int(math.ceil(rating)), threshold
