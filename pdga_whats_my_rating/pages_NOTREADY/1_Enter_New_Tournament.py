import streamlit as st
from streamlit_extras.switch_page_button import switch_page
import pandas as pd
import time

st.set_page_config(page_title="Enter New Tournament")

st.title("Enter a New Tournament")
if st.button("Back to Home"):
    switch_page("Home")

# First form to input basic tournament info
tournament_name = st.text_input("Tournament")
division = st.selectbox("Division", ["MA1", "MA2", "MA3", "MA4", "MPO"])
num_rounds = st.selectbox("Number of Rounds", [2, 3, 4, 5, 1])

# Second form to input ratings for each round
st.subheader("Enter Round Ratings")
round_data = []
for i in range(num_rounds):
    round_num = i + 1
    col1, col2 = st.columns(2)

    with col1:
        round_date = st.date_input(f"Round {round_num} Date", format="MM/DD/YYYY")
    with col2:
        round_rating = st.number_input(
            f"Round {round_num} Rating", min_value=0, max_value=1200
        )
    round_data.append({"round": round_num, "rating": round_rating, "date": round_date})

# display df
df = pd.DataFrame(round_data)
df["tournament"] = tournament_name
df["division"] = division
df = df[["tournament", "date", "division", "round", "rating"]]
st.write(df)


if st.button("Submit"):
    data = pd.read_csv("data/casey_ratings.csv")
    final = pd.concat([data, df])
    final.to_csv("data/casey_ratings.csv", index=False)

    st.success("Ratings saved")
    time.sleep(1)
    switch_page("Home")
