import pandas as pd
import requests
import streamlit as st
from classes.player import Player
from utils import figs
from utils.rating_calc import calculate_rating

st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")

CONTINUE = True

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

if submit or auto_load:
    try:
        int(pdga_no)
    except ValueError:
        CONTINUE = False
        st.error("must be a valid pdga number")

    if CONTINUE:
        st.session_state["pdga_no"] = pdga_no
        st.query_params["pdga_no"] = pdga_no
        try:
            player = Player(pdga_no)
        except requests.exceptions.HTTPError as e:
            CONTINUE = False
            if e.response is not None and e.response.status_code == 429:
                st.error(
                    "PDGA.com is rate limiting requests."
                    " Please wait a minute and try again."
                )
            else:
                st.error(
                    f"player info not available for pdga number"
                    f" {pdga_no}\n"
                    " Are you sure this is a valid PDGA number?"
                    " If this is a valid PDGA number,"
                    " please reach out to me! Thanks."
                )
            print(e)
        except Exception as e:
            CONTINUE = False
            st.error(
                f"player info not available for pdga number"
                f" {pdga_no}\n"
                " Are you sure this is a valid PDGA number?"
                " If this is a valid PDGA number,"
                " please reach out to me! Thanks."
            )
            print(e)

    if CONTINUE:
        if player.ratings_detail_df is not None:
            df = player.ratings_detail_df
            df["date"] = pd.to_datetime(df["date"], format="mixed")
            df = df.sort_values(by=["date", "round"], ascending=False).reset_index(
                drop=True
            )

            official_rating = player.cur_rating
            df, calc_rating, drop_thres = calculate_rating(df, official_rating)

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
            if player.new_tournaments is None:
                col1.markdown(
                    "*If you have no new rounds and this is > 2 points"
                    " off your official rating,"
                    " please reach out to me!*"
                )
            col2.metric(
                f"Official Rating {player.rating_date}",
                official_rating,
                player.rating_change,
            )

            eval_mask = df["evaluated"] == "Yes"
            n_evaluated = len(df[eval_mask])
            n_used = len(df[df["used"] == "Yes"])
            avg_rating = df.loc[eval_mask, "rating"].mean()
            std_dev = df.loc[eval_mask, "rating"].std(ddof=0)
            new_tourns = (
                ", ".join(player.new_tournaments["Tournament"].values.tolist())
                if player.new_tournaments is not None
                else "None"
            )

            st.markdown(f"""
#### other stuff
- **Number of rounds evaluated:** {n_evaluated}
- **Number of rounds used:** {n_used}
- **Raw Average Rating:** {avg_rating:.2f}
- **Std Dev:** {std_dev:.2f}
- **Drop Threshold:** ~{int(drop_thres)} \
*((average rating - 2.5 SD) + 5) or (average rating - 100)*
- **NEW TOURNAMENTS:** {new_tourns}
            """)

            # if st.button("Enter a New Tournament"):
            #     switch_page("Enter New Tournament")

            # graphs
            col1, col2 = st.columns(2)

            # rating w moving avg
            fig1 = figs.mavg_chart(df)
            col1.plotly_chart(fig1, use_container_width=True)

            # boxplots
            fig2 = figs.div_box_chart(df)
            col2.plotly_chart(fig2, use_container_width=True)

            st.subheader("Rating Detail")
            st.dataframe(
                df.drop(columns=["mavg_5", "mavg_15"]),
                hide_index=True,
                use_container_width=True,
            )

        else:
            st.markdown(f"### [{player.name}](https://pdga.com/player/{pdga_no})")
            st.write(
                "no data available. could be an expired member"
                " or they haven't played tournaments"
                " in a while."
            )
