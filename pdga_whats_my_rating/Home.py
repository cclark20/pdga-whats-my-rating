import streamlit as st
from streamlit_extras.switch_page_button import switch_page
import pandas as pd
import plotly.graph_objects as go

from utils.rating_calc import calculate_rating
from utils import figs
from classes.player import Player

st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")

CONTINUE = True

pdga_from_query = st.query_params.get("pdga_no", None)

if "player" not in st.session_state:
    st.session_state["player"] = None


# actual page layout and content
st.title("What's My Rating?")
with st.form("form"):
    pdga_no = st.text_input(
        "Enter your PDGA number:", pdga_from_query if pdga_from_query else ""
    )
    submit = st.form_submit_button("Get Data")

if submit or pdga_from_query:
    try:
        int(pdga_no)
    except:
        CONTINUE = False
        st.error("must be a valid pdga number")

    if CONTINUE:
        st.query_params["pdga_no"] = pdga_no
        try:
            player = Player(pdga_no)
            st.session_state["player"] = player
        except Exception as e:
            CONTINUE = False
            st.error(
                f"player info not available for pdga number {pdga_no}\n Are you sure this is a valid PDGA number?"
                " If this is a valid PDGA number, please reach out to me! Thanks."
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

            st.markdown(f"### [{player.name}](https://pdga.com/player/{pdga_no})")
            col1, col2 = st.columns(2)
            col1.metric(
                "Calculated Unofficial Rating (as of RIGHT NOW)",
                calc_rating,
                (calc_rating - official_rating),
            )
            if player.new_tournaments is None:
                col1.markdown(
                    "*If you have no new rounds and this is > 2 points off your official rating, please reach out to me!*"
                )
            col2.metric(
                f"Official Rating {player.rating_date}",
                official_rating,
                player.rating_change,
            )

            st.markdown(
                f"""
            #### other stuff 
            - **Number of rounds evaluated:** {len(df[df['evaluated'] == "Yes"])}
            - **Number of rounds used:** {len(df[df['used'] == "Yes"])}
            - **Raw Average Rating:** {df.loc[df["evaluated"] == "Yes", "rating"].mean():.2f}
            - **Std Dev:** {df.loc[df["evaluated"] == "Yes", "rating"].std(ddof=0):.2f}
            - **Drop Threshold:** ~{int(drop_thres)} *((average rating - 2.5 SD) + 5) or (average rating - 100)*
            - **NEW TOURNAMENTS:** {", ".join(player.new_tournaments["Tournament"].values.tolist()) if player.new_tournaments is not None else "None"}
                """
            )

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
                "no data available. could be an expired member or they haven't played tournaments in a while."
            )
