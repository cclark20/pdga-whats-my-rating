import streamlit as st
from streamlit_extras.switch_page_button import switch_page
import pandas as pd

from utils.rating_calc import calculate_rating

from classes.player import Player

st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")

CONTINUE = True

if "player" not in st.session_state:
    st.session_state["player"] = None


# actual page layout and content
st.title("What's My Rating?")
with st.form("form"):
    pdga_no = st.text_input("Enter your PDGA number:")
    submit = st.form_submit_button("Get Data")

if submit:
    try:
        int(pdga_no)
    except:
        CONTINUE = False
        st.error("must be a valid pdga number")

    if CONTINUE:
        try:
            player = Player(pdga_no)
            st.session_state["player"] = player
        except Exception as e:
            CONTINUE = False
            st.error(
                f"player info not available for pdga number {pdga_no}\nAre you sure this is a valid PDGA number?"
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
                "Calculated Rating (as of RIGHT NOW)",
                calc_rating,
                (calc_rating - official_rating),
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
            - **Drop Threshold:** {int(drop_thres)} *(current official rating - 2.5 SD)*
            - **NEW TOURNAMENTS:** {", ".join(player.new_tournaments["Tournament"].values.tolist())}
                """
            )

            # if st.button("Enter a New Tournament"):
            #     switch_page("Enter New Tournament")

            edited_df = st.data_editor(df, hide_index=True)

        else:
            st.markdown(f"### [{player.name}](https://pdga.com/player/{pdga_no})")
            st.write(
                "no data available. could be an expired member or they haven't played tournaments in a while."
            )
