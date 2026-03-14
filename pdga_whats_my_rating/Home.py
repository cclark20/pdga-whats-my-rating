import logging
from urllib.parse import quote

import pandas as pd
import requests
import streamlit as st
from classes.player import Player
from utils import figs
from utils.rating_calc import calculate_rating

logger = logging.getLogger(__name__)

try:
    _EMAIL = st.secrets["CONTACT_EMAIL"]
except (KeyError, FileNotFoundError):
    _EMAIL = ""


def _mailto(subject, body=""):
    if not _EMAIL:
        return None
    return f"mailto:{_EMAIL}?subject={quote(subject)}&body={quote(body)}"


st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")
if _EMAIL:
    _feedback_subject = quote("What's My Rating - Feedback")
    st.sidebar.markdown(
        f"[📬 Send Feedback](mailto:{_EMAIL}?subject={_feedback_subject})"
    )

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
        player = Player(
            pdga_no,
            on_retry=lambda attempt, wait: st.warning(
                f"PDGA.com rate limit hit. Retrying in {wait:.0f}s..."
                f" (attempt {attempt + 1})"
            ),
        )
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 429:
            st.error(
                "PDGA.com is rate limiting requests."
                " Please wait a minute and try again."
            )
        else:
            msg = (
                f"Player info not available for PDGA number"
                f" {pdga_no}.\n"
                " Are you sure this is a valid PDGA number?"
            )
            status = e.response.status_code if e.response is not None else "unknown"
            link = _mailto(
                f"What's My Rating - Error (PDGA #{pdga_no})",
                f"PDGA Number: {pdga_no}\n"
                f"Error: HTTP {status}\n\n"
                "Please describe what happened:\n",
            )
            if link:
                msg += f" If so, please [let me know]({link})!"
            st.error(msg)
        logger.exception("Failed to load player %s", pdga_no)
        return
    except Exception:
        msg = (
            f"Player info not available for PDGA number"
            f" {pdga_no}.\n"
            " Are you sure this is a valid PDGA number?"
        )
        link = _mailto(
            f"What's My Rating - Error (PDGA #{pdga_no})",
            f"PDGA Number: {pdga_no}\n\nPlease describe what happened:\n",
        )
        if link:
            msg += f" If so, please [let me know]({link})!"
        st.error(msg)
        logger.exception("Failed to load player %s", pdga_no)
        return

    if player.ratings_detail_df is None:
        st.markdown(f"### [{player.name}](https://pdga.com/player/{pdga_no})")
        st.write(
            "no data available. this player may not have played any rated tournaments."
        )
        return

    if player.membership_status and "Current" not in player.membership_status:
        st.warning(
            f"⚠️ Membership status: **{player.membership_status}**. "
            "This player has no official rating, but we can still calculate "
            "an unofficial rating from their round history."
        )

    # Compute official rating explanation from PDGA data (before new tournaments)
    official_df = None
    official_calc_rating = None
    official_drop_thres = None
    official_window_months = None
    if player.official_ratings_detail_df is not None and player.cur_rating is not None:
        (
            official_df,
            official_calc_rating,
            official_drop_thres,
            official_window_months,
        ) = calculate_rating(player.official_ratings_detail_df)

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
    df, calc_rating, drop_thres, window_months = calculate_rating(df)

    st.markdown(
        f"### [{player.name}](https://pdga.com/player/{pdga_no})"
        " \n💡*bookmark this page to save this search!*"
    )
    col1, col2 = st.columns(2)
    delta = (calc_rating - official_rating) if official_rating is not None else None
    col1.metric(
        "Calculated Unofficial Rating (as of RIGHT NOW)",
        calc_rating,
        delta,
    )
    eval_mask = df["evaluated"] == "Yes"
    n_evaluated = len(df[eval_mask])
    n_used = len(df[df["used"] == "Yes"])

    if official_rating is not None:
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
            if diff <= 2:
                msg = (
                    f"*You have no new rounds, so our calculation"
                    f" should match your official rating exactly,"
                    f" but we're off by {diff}. Small differences"
                    f" are usually due to rounding or minor aspects"
                    f" of the PDGA algorithm we can't fully replicate"
                    f" (e.g. hole count weighting).*"
                )
            else:
                msg = (
                    f"*You have no new rounds, so our calculation"
                    f" should match your official rating exactly,"
                    f" but we're off by {diff}. Small differences"
                    f" can happen due to rounding, but this gap is"
                    f" larger than expected."
                )
                if link:
                    msg += (
                        f" Please [let me know]({link}) so I can improve the algorithm!"
                    )
                msg += "*"
            col1.markdown(msg)
        col2.metric(
            f"Official Rating {player.rating_date}",
            official_rating,
            player.rating_change,
        )
    else:
        col2.metric("Official Rating", "N/A")

    avg_rating = df.loc[eval_mask, "rating"].mean()
    std_dev = df.loc[eval_mask, "rating"].std(ddof=0)

    if official_df is not None and player.cur_rating is not None:
        with st.expander("Official Rating Explanation"):
            o_eval_mask = official_df["evaluated"] == "Yes"
            o_n_evaluated = len(official_df[o_eval_mask])
            o_n_used = len(official_df[official_df["used"] == "Yes"])
            o_avg_rating = official_df.loc[o_eval_mask, "rating"].mean()
            o_std_dev = official_df.loc[o_eval_mask, "rating"].std(ddof=0)

            st.markdown(f"""
- **Official Rating:** {player.cur_rating}
- **Number of rounds evaluated:** {o_n_evaluated}
- **Number of rounds used:** {o_n_used}
- **Raw Average Rating:** {o_avg_rating:.2f}
- **Std Dev:** {o_std_dev:.2f}
- **Drop Threshold:** ~{int(official_drop_thres)} \
*((average rating - 2.5 SD) + 5) or (average rating - 100)*
            """)

            # Double-weighted rounds
            st.markdown("#### Double-Weighted Rounds")
            o_double_weighted = official_df[official_df["weight"] == 2]
            if not o_double_weighted.empty:
                st.caption(
                    f"The most recent 25% of evaluated rounds"
                    f" ({len(o_double_weighted)} rounds) count double"
                    f" in the rating calculation."
                )
                st.dataframe(
                    o_double_weighted[
                        ["tournament", "date", "round", "rating", "tier"]
                    ],
                    hide_index=True,
                )
            else:
                st.markdown(
                    "**No rounds are double-weighted** (fewer than 9 evaluated rounds)."
                )

            # Rounds dropped as outliers
            st.markdown("#### Rounds Dropped as Outliers")
            o_outliers = official_df[
                (official_df["evaluated"] == "Yes") & (official_df["used"] == "No")
            ]
            if not o_outliers.empty:
                st.caption(
                    f"These rounds are within the {official_window_months}-month"
                    " window but were dropped because their rating is at or below"
                    f" the drop threshold (~{int(official_drop_thres)})."
                )
                st.dataframe(
                    o_outliers[["tournament", "date", "round", "rating", "tier"]],
                    hide_index=True,
                )
            else:
                st.markdown("**No rounds dropped as outliers.**")

            # Rounds aged out of window
            st.markdown("#### Rounds Aged Out of Window")
            o_max_date = official_df.loc[
                ~official_df.tournament.str.contains(
                    "(Unrated)", case=False, na=False, regex=False
                ),
                "date",
            ].max()
            aged_out_lookback = (
                pd.DateOffset(years=2)
                if official_window_months == 12
                else pd.DateOffset(years=3)
            )
            aged_out_min = o_max_date - aged_out_lookback
            aged_out = official_df[
                (official_df["evaluated"] == "No")
                & (official_df["date"] >= aged_out_min)
            ]
            if not aged_out.empty:
                st.caption(
                    "These rounds were likely included in a previous official"
                    f" rating but have since fallen outside the"
                    f" {official_window_months}-month evaluation window."
                )
                st.dataframe(
                    aged_out[["tournament", "date", "round", "rating", "tier"]],
                    hide_index=True,
                )
            else:
                st.markdown(
                    "**No rounds have recently aged out** of the evaluation window."
                )

            # Accuracy note
            if official_calc_rating != player.cur_rating:
                diff = abs(official_calc_rating - player.cur_rating)
                st.info(
                    f"Our reconstruction of the official rating gives"
                    f" **{official_calc_rating}**, which differs from PDGA's"
                    f" **{player.cur_rating}** by {diff} point(s). This is"
                    f" likely due to rounding or minor aspects of the PDGA"
                    f" algorithm we can't fully replicate (e.g. hole count"
                    f" weighting)."
                )

    with st.expander("Calculated Rating Explanation"):
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
                st.markdown(f"#### Rounds Dropped from {window_months}-Month Window")
                st.caption(
                    "These rounds were in your last official rating"
                    f" but have since fallen outside the {window_months}-month"
                    " evaluation window."
                )
                st.dataframe(
                    dropped[["tournament", "date", "round", "rating", "tier"]],
                    hide_index=True,
                )
            else:
                st.markdown(
                    f"**No rounds dropped from the {window_months}-month window**"
                    " since your last official rating."
                )

        # rounds dropped as outliers
        outliers = df[(df["evaluated"] == "Yes") & (df["used"] == "No")]
        if not outliers.empty:
            st.markdown("#### Rounds Dropped as Outliers")
            st.caption(
                f"These rounds are within the {window_months}-month window but"
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

    st.markdown(
        "---\n"
        "This app will always be free. If you want to support,"
        " [☕ buy me a coffee!](https://buymeacoffee.com/cclark)"
    )


if submit or auto_load:
    show_player(pdga_no)
