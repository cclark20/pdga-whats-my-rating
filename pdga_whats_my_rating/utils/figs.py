import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st


def mavg_chart(df: pd.DataFrame):

    df = df.sort_values(by=["date", "round"], ascending=True)
    df["round_label"] = (
        df["date"].astype(str)
        + " "
        + df["tournament"]
        + " Round "
        + df["round"].astype(str)
    )

    fig = go.Figure(
        data=[
            go.Bar(x=df.round_label, y=df.rating, name="Round Rating"),
            go.Scatter(x=df.round_label, y=df.mavg_5, name="Avg 5"),
            go.Scatter(x=df.round_label, y=df.mavg_15, name="Avg 15"),
        ]
    )

    # get min and max ratings for chart axis
    min_rating = df.rating.min()
    max_rating = df.rating.max()

    fig.update_layout(
        title="Round Rating History",
        xaxis={
            "type": "category",
            "showticklabels": False,
            "rangeslider_visible": True,
        },
        bargap=0.5,
        yaxis_range=[min_rating - 25, max_rating + 25],
        hovermode="x unified",
    )
    # fig.update_xaxes(rangebreaks=[dict(values=dt_breaks)])
    return fig


def div_box_chart(df: pd.DataFrame):
    fig = px.box(df, x="division", y="rating")
    fig.update_layout(title="Rating Distribution by Division")
    return fig
