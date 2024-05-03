import requests
import pandas as pd
from io import StringIO
import streamlit as st
from bs4 import BeautifulSoup

from classes.player import Player


# TODO
def get_date(row):
    if len(row["Date"].split(" to ")) == 1:
        return row["Date"]
    elif "league" in row["Tournament"].lower():
        return row["Date"].split(" to ")[-1]

    start_date, end_date = row["Date"].split(" to ")

    start_day, month = start_date.split("-")
    end_day, end_month, year = end_date.split("-")
    num_days = int(end_day) - int(start_day) + 1
    diffs = list(range(num_days, -1, -1))
    if row["Round"] - 1 > len(diffs):
        print(row)
        diffs = list(range(num_days + 1, -1, -1))

    # calculate day based on round number
    round_day = max(int(end_day) + diffs[row["Round"] - 1], int(start_day))

    return f"{round_day}-{month}-{year}"


# @st.cache_data
# def get_player_info(pdga_no):
#     return Player.from_pdga_no(pdga_no)


@st.cache_data
def get_data(pdga_no):
    URL = f"https://www.pdga.com/player/{pdga_no}/details"
    response = requests.get(URL)
    try:
        df = pd.read_html(StringIO(response.text))[0]
    except:
        return None

    df = df[
        ["Tournament", "Date", "Division", "Round", "Rating", "Evaluated", "Included"]
    ]
    df["Date"] = df["Date"].apply(lambda x: x.split(" to ")[-1])

    # df["Date"] = df.apply(get_date, axis=1)

    df["Date"] = pd.to_datetime(df["Date"], format="mixed")
    df = df.sort_values(by=["Date", "Round"], ascending=False).reset_index(drop=True)

    df = df.rename(
        columns={
            "Tournament": "tournament",
            "Date": "date",
            "Division": "division",
            "Round": "round",
            "Rating": "rating",
            "Evaluated": "evaluated",
            "Included": "used",
        }
    )

    return df
