import requests
from bs4 import BeautifulSoup
import pandas as pd
from io import StringIO


class Player:
    def __init__(self, pdga_no: int):
        self.pdga_no = pdga_no
        self.name = None
        self.location = None
        self.cur_rating = None
        self.rating_change = None
        self.rating_date = None
        self.ratings_detail_df = None
        self.new_tournaments = None

        self.home_soup = None

        self._fetch_basic_info()
        self._fetch_ratings_detail()
        if self.ratings_detail_df is not None:
            self._fetch_recent_events()
            if self.new_tournaments is not None:
                self._add_new_tournaments()

    def _fetch_basic_info(self):
        URL = f"https://www.pdga.com/player/{self.pdga_no}"
        response = requests.get(URL)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        self.home_soup = soup

        self.name = soup.title.string.split(" | ")[0]

        location = soup.find("li", {"class": "location"})
        self.location = location.text.split(": ")[1] if location else None

        cur_rating = soup.find("li", {"class": "current-rating"})
        self.cur_rating = int(cur_rating.contents[2]) if cur_rating else None

        rating_change = soup.find("a", {"class": "rating-difference"})
        self.rating_change = rating_change.text if rating_change else None

        rating_date = soup.find("small", {"class": "rating-date"})
        self.rating_date = rating_date.text if rating_date else None

    def _fetch_ratings_detail(self):
        URL = f"https://www.pdga.com/player/{self.pdga_no}/details"
        response = requests.get(URL)
        response.raise_for_status()
        try:
            df = pd.read_html(StringIO(response.text))[0]
        except:
            self.ratings_detail_df = None
            return

        df = df[
            [
                "Tournament",
                "Date",
                "Tier",
                "Division",
                "Round",
                "Rating",
                "Evaluated",
                "Included",
            ]
        ]
        df["Date"] = df["Date"].apply(lambda x: x.split(" to ")[-1])

        df["Date"] = pd.to_datetime(df["Date"], format="mixed")
        df = df.sort_values(by=["Date", "Round"], ascending=False).reset_index(
            drop=True
        )

        self.ratings_detail_df = df.rename(
            columns={
                "Tournament": "tournament",
                "Date": "date",
                "Tier": "tier",
                "Division": "division",
                "Round": "round",
                "Rating": "rating",
                "Evaluated": "evaluated",
                "Included": "used",
            }
        )

    def _fetch_recent_events(self):
        soup = self.home_soup

        tables = soup.find_all("table")
        dfs = []
        for t in tables:
            table = pd.read_html(StringIO(str(t)))[0]
            if "Division" not in table.columns:
                dfs.append(table)
        df = pd.concat(dfs)
        df = df.dropna(subset="Points")

        min_date = pd.to_datetime(
            self.rating_date.split()[-1].strip(")"),
            format="%d-%b-%Y",
        )

        df["last_date"] = df["Dates"].str.split(" to ").str[-1]
        df["last_date"] = pd.to_datetime(df["last_date"], format="%d-%b-%Y")

        new_tournaments = df[df.last_date > min_date].reset_index(drop=True)

        if len(new_tournaments) > 0:
            self.new_tournaments = new_tournaments.drop(columns=["last_date"])

    def _add_new_tournaments(self):
        soup = self.home_soup
        tourns = self.new_tournaments

        new_rows = []
        for t in range(len(tourns)):
            href = soup.find("a", string=tourns.loc[t, "Tournament"])["href"]
            tour_page = requests.get(f"https://www.pdga.com{href}")
            tour_page.raise_for_status()
            tour_soup = BeautifulSoup(tour_page.text, "html.parser")

            for table in tour_soup.find_all("table")[1:]:
                df = pd.read_html(StringIO(str(table)))[0]
                if "PDGA#" not in df:
                    df["PDGA#"] = 0
                df["PDGA#"] = df["PDGA#"].fillna(0).astype(int)
                if int(self.pdga_no) in df["PDGA#"].values.tolist():
                    ratings = [col for col in df if col.startswith("Unnamed")]

                    # print(df[df["PDGA#"] == int(self.pdga_no)])
                    for i, rating in enumerate(ratings):
                        if df[df["PDGA#"] == int(self.pdga_no)][rating].values[0] > 0:

                            row_df = pd.DataFrame(
                                [
                                    {
                                        "tournament": tourns.loc[t, "Tournament"],
                                        "date": tourns.loc[t, "Dates"].split(" to ")[
                                            -1
                                        ],
                                        "tier": tourns.loc[t, "Tier"],
                                        "division": href.split("#")[-1],
                                        "round": i + 1,
                                        "rating": int(
                                            df[df["PDGA#"] == int(self.pdga_no)][
                                                rating
                                            ].values[0]
                                        ),
                                        "evaluated": None,
                                        "used": None,
                                        "weight": None,
                                    }
                                ]
                            )

                            new_rows.append(row_df)

                    break
            else:
                continue

        if len(new_rows) > 0:
            new_df = pd.concat(new_rows)

        self.ratings_detail_df = pd.concat([self.ratings_detail_df, new_df])

    # TODO: finish the logic to get world ranking
    # def get_world_ranking(self):
    #     URL = "https://www.pdga.com/players/stats?Year=2024&player_Class=All&order=player_Rating&sort=desc&page="
    #     page_no = 0

    #     # get total num of records
    #     first_page_url = URL + str(page_no)
    #     first_page_response = requests.get(first_page_url)
    #     first_page_soup = BeautifulSoup(first_page_response.text)

    #     total_records = int(
    #         first_page_soup.find("div", {"class": "view-footer"}).text.split(" ")[-1]
    #     )
    #     records_per_page = 20

    #     # calculate number of pages
    #     total_pages = -total_records // records_per_page


# 27734 - 966
