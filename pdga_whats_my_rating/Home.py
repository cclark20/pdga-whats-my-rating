from urllib.parse import quote

import pandas as pd
import requests
import streamlit as st
from classes.player import Player
from utils import figs
from utils.rating_calc import calculate_rating

_EMAIL = "caseyclark20@gmail.com"


def _mailto(subject, body=""):
    return f"mailto:{_EMAIL}?subject={quote(subject)}&body={quote(body)}"


st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")
_feedback_subject = quote("What's My Rating - Feedback")
st.sidebar.markdown(f"[📬 Send Feedback](mailto:{_EMAIL}?subject={_feedback_subject})")

# seed widget state from query param on first load only
auto_load = False
if "pdga_input" not in st.session_state:
    pdga_from_query = st.query_params.get("pdga_no", "")
    if pdga_from_query:
        st.session_state["pdga_input"] = pdga_from_query
        auto_load = True

# actual page layout and content
st.title("What's My Rating?")
with st.form("form"):
    pdga_no = st.text_input("Enter your PDGA number:", key="pdga_input")
    submit = st.form_submit_button("Get Data")


def show_player(pdga_no):
    try:
        int(pdga_no)
    except ValueError:
        st.error("must be a valid pdga number")
        return

    st.query_params["pdga_no"] = pdga_no
    try:
        player = Player(pdga_no)
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 429:
            st.error(
                "PDGA.com is rate limiting requests."
                " Please wait a minute and try again."
            )
        else:
            status = e.response.status_code if e.response is not None else "unknown"
            link = _mailto(
                f"What's My Rating - Error (PDGA #{pdga_no})",
                f"PDGA Number: {pdga_no}\n"
                f"Error: HTTP {status}\n\n"
                "Please describe what happened:\n",
            )
            st.error(
                f"Player info not available for PDGA number"
                f" {pdga_no}.\n"
                " Are you sure this is a valid PDGA number?"
                f" If so, please [let me know]({link})!"
            )
        print(e)
        return
    except Exception as e:
        link = _mailto(
            f"What's My Rating - Error (PDGA #{pdga_no})",
            f"PDGA Number: {pdga_no}\n\nPlease describe what happened:\n",
        )
        st.error(
            f"Player info not available for PDGA number"
            f" {pdga_no}.\n"
            " Are you sure this is a valid PDGA number?"
            f" If so, please [let me know]({link})!"
        )
        print(e)
        return

    if player.ratings_detail_df is None:
        st.markdown(f"### [{player.name}](https://pdga.com/player/{pdga_no})")
        st.write(
            "no data available. could be an expired member"
            " or they haven't played tournaments"
            " in a while."
        )
        return

    df = player.ratings_detail_df

    # save original PDGA evaluated status before calculate_rating overwrites it
    has_original_evaluated = "evaluated" in df.columns
    if has_original_evaluated:
        original_evaluated = df[["tournament", "date", "round", "evaluated"]].copy()
        original_evaluated["date"] = pd.to_datetime(
            original_evaluated["date"], format="mixed"
        )
        original_evaluated = original_evaluated.rename(
            columns={"evaluated": "pdga_evaluated"}
        )

    official_rating = player.cur_rating
    df, calc_rating, drop_thres = calculate_rating(df)

    st.markdown(
        f"### [{player.name}](https://pdga.com/player/{pdga_no})"
        " \n💡*bookmark this page to save this search!*"
    )
    col1, col2 = st.columns(2)
    col1.metric(
        "Calculated Unofficial Rating (as of RIGHT NOW)",
        calc_rating,
        (calc_rating - official_rating),
    )
    eval_mask = df["evaluated"] == "Yes"
    n_evaluated = len(df[eval_mask])
    n_used = len(df[df["used"] == "Yes"])

    if player.new_tournaments is None and calc_rating != official_rating:
        diff = abs(calc_rating - official_rating)
        link = _mailto(
            f"What's My Rating - Rating Discrepancy (PDGA #{pdga_no})",
            f"PDGA Number: {pdga_no}\n"
            f"Calculated Rating: {calc_rating}\n"
            f"Official Rating: {official_rating}\n"
            f"Difference: {diff}\n"
            f"Rounds Evaluated: {n_evaluated}\n"
            f"Rounds Used: {n_used}\n",
        )
        col1.markdown(
            f"*You have no new rounds, so our calculation"
            f" should match your official rating exactly,"
            f" but we're off by {diff}."
            f" Please [let me know]({link})"
            f" so I can improve the algorithm!*"
        )
    col2.metric(
        f"Official Rating {player.rating_date}",
        official_rating,
        player.rating_change,
    )

    avg_rating = df.loc[eval_mask, "rating"].mean()
    std_dev = df.loc[eval_mask, "rating"].std(ddof=0)

    with st.expander("Rating Explanation"):
        st.markdown(f"""
- **Number of rounds evaluated:** {n_evaluated}
- **Number of rounds used:** {n_used}
- **Raw Average Rating:** {avg_rating:.2f}
- **Std Dev:** {std_dev:.2f}
- **Drop Threshold:** ~{int(drop_thres)} \
*((average rating - 2.5 SD) + 5) or (average rating - 100)*
        """)

        # new tournaments
        st.markdown("#### New Tournaments")
        if player.new_tournaments is not None:
            st.caption(
                "These tournaments are not yet included in your official rating."
            )
            st.dataframe(
                player.new_tournaments,
                hide_index=True,
            )
        else:
            st.markdown("**No new tournaments** since your last official rating.")

        # double-weighted rounds
        st.markdown("#### Double-Weighted Rounds")
        double_weighted = df[df["weight"] == 2]
        if not double_weighted.empty:
            st.caption(
                f"The most recent 25% of evaluated rounds"
                f" ({len(double_weighted)} rounds) count double"
                f" in the rating calculation."
            )
            st.dataframe(
                double_weighted[["tournament", "date", "round", "rating", "tier"]],
                hide_index=True,
            )
        else:
            st.markdown(
                "**No rounds are double-weighted** (fewer than 9 evaluated rounds)."
            )

        # rounds dropped from 12-month window
        if has_original_evaluated:
            merged = df.merge(
                original_evaluated,
                on=["tournament", "date", "round"],
                how="left",
            )
            dropped = merged[
                (merged["pdga_evaluated"] == "Yes") & (merged["evaluated"] == "No")
            ]
            if not dropped.empty:
                st.markdown("#### Rounds Dropped from 12-Month Window")
                st.caption(
                    "These rounds were in your last official rating"
                    " but have since fallen outside the 12-month"
                    " window."
                )
                st.dataframe(
                    dropped[["tournament", "date", "round", "rating", "tier"]],
                    hide_index=True,
                )
            else:
                st.markdown(
                    "**No rounds dropped from the 12-month window**"
                    " since your last official rating."
                )

        # rounds dropped as outliers
        outliers = df[(df["evaluated"] == "Yes") & (df["used"] == "No")]
        if not outliers.empty:
            st.markdown("#### Rounds Dropped as Outliers")
            st.caption(
                "These rounds are within the 12-month window but"
                " were dropped because their rating is at or below"
                f" the drop threshold (~{int(drop_thres)})."
            )
            st.dataframe(
                outliers[["tournament", "date", "round", "rating", "tier"]],
                hide_index=True,
            )
        else:
            st.markdown("**No rounds dropped as outliers.**")

    # graphs
    col1, col2 = st.columns(2)

    # rating w moving avg
    fig1 = figs.mavg_chart(df)
    col1.plotly_chart(fig1, width="stretch")

    # boxplots
    fig2 = figs.div_box_chart(df)
    col2.plotly_chart(fig2, width="stretch")

    st.subheader("Rating Detail")
    st.dataframe(
        df.drop(columns=["mavg_5", "mavg_15"]),
        hide_index=True,
        width="stretch",
    )


if submit or auto_load:
    show_player(pdga_no)
