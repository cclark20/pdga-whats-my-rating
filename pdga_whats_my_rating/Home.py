import requests
import streamlit as st
from classes.player import Player
from utils import figs
from utils.rating_calc import calculate_rating

st.set_page_config(page_title="What's My Rating?", page_icon="🥏", layout="wide")

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
            st.error(
                f"player info not available for pdga number"
                f" {pdga_no}\n"
                " Are you sure this is a valid PDGA number?"
                " If this is a valid PDGA number,"
                " please reach out to me! Thanks."
            )
        print(e)
        return
    except Exception as e:
        st.error(
            f"player info not available for pdga number"
            f" {pdga_no}\n"
            " Are you sure this is a valid PDGA number?"
            " If this is a valid PDGA number,"
            " please reach out to me! Thanks."
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
