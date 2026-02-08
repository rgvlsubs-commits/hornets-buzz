#!/usr/bin/env python3
"""
NBA Spread Prediction Model - Backtest

This script backtests our spread prediction model against historical NBA games.
It simulates predictions using only data that would have been available before each game.

Usage:
    python backtest.py [--sample-pct 0.25] [--odds-api-key YOUR_KEY]

Output:
    - Console report with accuracy metrics
    - data/backtest_results.json with detailed results
"""

import json
import os
import sys
import random
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, asdict

try:
    from nba_api.stats.endpoints import (
        leaguegamelog,
        leaguedashteamstats,
    )
    import pandas as pd
    import requests
    import time
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install nba_api pandas requests")
    sys.exit(1)


# === Configuration ===
SEASON = "2025-26"
SEASON_START = datetime(2025, 10, 22)

# Model parameters (must match lib/model.ts)
ELO_INITIAL = 1500
ELO_HOME_ADVANTAGE = 70  # Elo points (~2.5 actual points)
ELO_TO_SPREAD = 28  # ~28 Elo points = 1 point spread
NR_HOME_ADVANTAGE = 2.5  # Points

# Blend weights
ELO_WEIGHT = 0.55
NR_WEIGHT = 0.45

# Rolling window weights
WINDOW_WEIGHTS = {
    "last4": 0.40,
    "last7": 0.30,
    "last10": 0.20,
    "season": 0.10,
}


@dataclass
class TeamState:
    """Tracks a team's cumulative stats up to a point in time."""
    team_id: int
    team_name: str
    wins: int = 0
    losses: int = 0
    total_points_for: int = 0
    total_points_against: int = 0
    games: List[Dict] = None  # Recent games for rolling calcs

    def __post_init__(self):
        if self.games is None:
            self.games = []

    @property
    def point_diff(self) -> float:
        games_played = self.wins + self.losses
        if games_played == 0:
            return 0
        return (self.total_points_for - self.total_points_against) / games_played

    @property
    def net_rating(self) -> float:
        """Estimate net rating from point differential."""
        # Rough conversion: 1 point diff ≈ 1.0 net rating
        return self.point_diff

    def get_rolling_net_rating(self, window: int) -> float:
        """Get average net rating over last N games."""
        recent = self.games[-window:] if len(self.games) >= window else self.games
        if not recent:
            return 0
        return sum(g["net_rating"] for g in recent) / len(recent)

    def get_elo(self) -> float:
        """Calculate Elo rating from record and point differential."""
        games_played = self.wins + self.losses
        if games_played == 0:
            return ELO_INITIAL

        win_pct = self.wins / games_played
        if win_pct <= 0:
            elo_from_win_pct = 1200
        elif win_pct >= 1:
            elo_from_win_pct = 1800
        else:
            elo_from_win_pct = 1504.6 - 450 * math.log10((1 / win_pct) - 1)

        total_point_diff = self.total_points_for - self.total_points_against
        elo_from_point_diff = ELO_INITIAL + (total_point_diff / max(1, games_played)) * 10

        # Blend (weight win pct more early, point diff more later)
        win_pct_weight = max(0.3, 1 - games_played / 82)
        return win_pct_weight * elo_from_win_pct + (1 - win_pct_weight) * elo_from_point_diff


@dataclass
class BacktestResult:
    """Result for a single game backtest."""
    game_id: str
    date: str
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    actual_margin: int  # Home team perspective
    closing_spread: float  # Home team perspective (negative = home favored)
    predicted_margin: float  # Our model's prediction
    elo_component: float
    nr_component: float
    # Outcomes
    actual_winner: str
    predicted_winner: str
    winner_correct: bool
    actual_ats: str  # "home", "away", or "push"
    predicted_ats: str
    ats_correct: bool
    margin_error: float  # |predicted - actual|
    spread_error: float  # |predicted - spread|


def load_env_file():
    """Load environment variables from .env.local file."""
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()


def fetch_all_games() -> pd.DataFrame:
    """Fetch all NBA games for the season."""
    print("Fetching all NBA games for the season...")

    try:
        time.sleep(0.6)
        game_log = leaguegamelog.LeagueGameLog(
            season=SEASON,
            season_type_all_star="Regular Season",
            player_or_team_abbreviation="T"
        )
        df = game_log.get_data_frames()[0]
        print(f"  Fetched {len(df)} team-game records")
        return df
    except Exception as e:
        print(f"Error fetching games: {e}")
        return pd.DataFrame()


def fetch_historical_odds(api_key: str, date_str: str) -> Dict:
    """Fetch historical odds for a specific date from The Odds API."""
    try:
        # The Odds API historical endpoint
        url = f"https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds"

        response = requests.get(url, params={
            "apiKey": api_key,
            "regions": "us",
            "markets": "spreads",
            "oddsFormat": "american",
            "date": f"{date_str}T23:00:00Z",  # Late evening UTC to get closing lines
        })

        if response.status_code == 200:
            data = response.json()
            remaining = response.headers.get('x-requests-remaining', 'unknown')
            return {"data": data.get("data", []), "remaining": remaining}
        elif response.status_code == 422:
            # Date might be in the future or no data
            return {"data": [], "remaining": "unknown"}
        else:
            print(f"    Odds API error for {date_str}: {response.status_code}")
            return {"data": [], "remaining": "unknown"}
    except Exception as e:
        print(f"    Odds fetch error for {date_str}: {e}")
        return {"data": [], "remaining": "unknown"}


def parse_spreads_from_odds(odds_data: List[Dict], team_abbrev_map: Dict) -> Dict[str, float]:
    """
    Parse spread data from The Odds API response.
    Returns dict mapping "AWAY@HOME" to home team spread.
    """
    spreads = {}

    for game in odds_data:
        home_team = game.get("home_team", "")
        away_team = game.get("away_team", "")

        # Find spread from bookmakers (prefer DraftKings, then FanDuel)
        home_spread = None
        bookmakers = game.get("bookmakers", [])

        # Sort by preference
        priority = {"draftkings": 0, "fanduel": 1, "betmgm": 2}
        bookmakers_sorted = sorted(
            bookmakers,
            key=lambda b: priority.get(b.get("key", "").lower(), 99)
        )

        for bookmaker in bookmakers_sorted:
            for market in bookmaker.get("markets", []):
                if market.get("key") == "spreads" and home_spread is None:
                    for outcome in market.get("outcomes", []):
                        if outcome.get("name") == home_team:
                            home_spread = outcome.get("point", 0)
                            break
            if home_spread is not None:
                break

        if home_spread is not None:
            # Map team names to abbreviations
            home_abbrev = team_abbrev_map.get(home_team.lower())
            away_abbrev = team_abbrev_map.get(away_team.lower())

            if home_abbrev and away_abbrev:
                key = f"{away_abbrev}@{home_abbrev}"
                spreads[key] = home_spread

    return spreads


# Team name to abbreviation mapping for The Odds API
TEAM_NAME_TO_ABBREV = {
    "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN",
    "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
    "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET",
    "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
    "los angeles clippers": "LAC", "la clippers": "LAC",
    "los angeles lakers": "LAL", "la lakers": "LAL",
    "memphis grizzlies": "MEM", "miami heat": "MIA", "milwaukee bucks": "MIL",
    "minnesota timberwolves": "MIN", "new orleans pelicans": "NOP",
    "new york knicks": "NYK", "oklahoma city thunder": "OKC", "orlando magic": "ORL",
    "philadelphia 76ers": "PHI", "phoenix suns": "PHX", "portland trail blazers": "POR",
    "sacramento kings": "SAC", "san antonio spurs": "SAS", "toronto raptors": "TOR",
    "utah jazz": "UTA", "washington wizards": "WAS",
}


def estimate_spread_from_teams(home_elo: float, away_elo: float) -> float:
    """
    Estimate spread when we don't have actual odds data.
    Returns spread from home team perspective (negative = home favored).
    """
    elo_diff = home_elo - away_elo + ELO_HOME_ADVANTAGE
    return -elo_diff / ELO_TO_SPREAD


def predict_spread(
    home_team: TeamState,
    away_team: TeamState,
) -> Tuple[float, float, float]:
    """
    Predict the spread for a game using our model.
    Returns (predicted_margin, elo_component, nr_component) from home team perspective.
    """

    # === Elo Component ===
    home_elo = home_team.get_elo()
    away_elo = away_team.get_elo()

    elo_diff = home_elo - away_elo + ELO_HOME_ADVANTAGE
    elo_prediction = elo_diff / ELO_TO_SPREAD

    # === Net Rating Component ===
    # Weighted rolling net ratings
    home_nr = (
        home_team.get_rolling_net_rating(4) * WINDOW_WEIGHTS["last4"] +
        home_team.get_rolling_net_rating(7) * WINDOW_WEIGHTS["last7"] +
        home_team.get_rolling_net_rating(10) * WINDOW_WEIGHTS["last10"] +
        home_team.net_rating * WINDOW_WEIGHTS["season"]
    )

    away_nr = (
        away_team.get_rolling_net_rating(4) * WINDOW_WEIGHTS["last4"] +
        away_team.get_rolling_net_rating(7) * WINDOW_WEIGHTS["last7"] +
        away_team.get_rolling_net_rating(10) * WINDOW_WEIGHTS["last10"] +
        away_team.net_rating * WINDOW_WEIGHTS["season"]
    )

    nr_diff = home_nr - away_nr + NR_HOME_ADVANTAGE
    nr_prediction = nr_diff

    # === Combine ===
    predicted_margin = (elo_prediction * ELO_WEIGHT) + (nr_prediction * NR_WEIGHT)

    return predicted_margin, elo_prediction, nr_prediction


def run_backtest(
    sample_pct: float = 0.25,
    odds_api_key: Optional[str] = None,
    use_estimated_spreads: bool = False,
) -> Tuple[List[BacktestResult], Dict]:
    """
    Run the backtest on a sample of NBA games.

    Args:
        sample_pct: Fraction of games to sample (0.25 = 25%)
        odds_api_key: The Odds API key for historical spreads
        use_estimated_spreads: If True, estimate spreads when API data unavailable

    Returns:
        Tuple of (results list, metadata dict)
    """

    # Fetch all games
    games_df = fetch_all_games()
    if games_df.empty:
        print("No games to backtest!")
        return [], {}

    # Convert to list of unique games (each game appears twice, once per team)
    games_by_id = {}
    for _, row in games_df.iterrows():
        game_id = str(row["GAME_ID"])
        if game_id not in games_by_id:
            games_by_id[game_id] = {
                "game_id": game_id,
                "date": row["GAME_DATE"],
                "matchup": row["MATCHUP"],
                "team_id": row["TEAM_ID"],
                "team_abbrev": row["TEAM_ABBREVIATION"],
                "pts": int(row["PTS"]),
                "wl": row["WL"],
                "plus_minus": int(row["PLUS_MINUS"]),
            }
        else:
            # Second team - determine home/away
            existing = games_by_id[game_id]
            if "vs." in row["MATCHUP"]:
                # This team is home
                games_by_id[game_id] = {
                    "game_id": game_id,
                    "date": row["GAME_DATE"],
                    "home_team_id": row["TEAM_ID"],
                    "home_abbrev": row["TEAM_ABBREVIATION"],
                    "home_pts": int(row["PTS"]),
                    "away_team_id": existing["team_id"],
                    "away_abbrev": existing["team_abbrev"],
                    "away_pts": existing["pts"],
                }
            else:
                # Existing is home
                games_by_id[game_id] = {
                    "game_id": game_id,
                    "date": existing["date"] if "date" in existing else row["GAME_DATE"],
                    "home_team_id": existing["team_id"],
                    "home_abbrev": existing["team_abbrev"],
                    "home_pts": existing["pts"],
                    "away_team_id": row["TEAM_ID"],
                    "away_abbrev": row["TEAM_ABBREVIATION"],
                    "away_pts": int(row["PTS"]),
                }

    # Filter to complete games only
    complete_games = [g for g in games_by_id.values() if "home_team_id" in g]
    print(f"Found {len(complete_games)} complete games")

    # Sort by date
    complete_games.sort(key=lambda g: g["date"])

    # Sample games (skip first 20 games so teams have history)
    eligible_games = complete_games[20:]
    sample_size = int(len(eligible_games) * sample_pct)
    sampled_games = random.sample(eligible_games, sample_size)
    sampled_games.sort(key=lambda g: g["date"])

    print(f"Sampled {len(sampled_games)} games ({sample_pct*100:.0f}%) for backtest")

    # Fetch historical spreads for sampled games
    historical_spreads = {}  # Maps "AWAY@HOME" to spread
    api_remaining = "N/A"

    if odds_api_key and not use_estimated_spreads:
        # Group sampled games by date
        games_by_date = {}
        for game in sampled_games:
            date = game["date"][:10]  # YYYY-MM-DD format
            if date not in games_by_date:
                games_by_date[date] = []
            games_by_date[date].append(game)

        print(f"\nFetching historical spreads for {len(games_by_date)} unique dates...")
        print("(This uses API quota - ~500 free requests/month)")

        api_remaining = "unknown"
        dates_fetched = 0

        for date_str, date_games in sorted(games_by_date.items()):
            # Rate limit
            time.sleep(0.5)

            odds_response = fetch_historical_odds(odds_api_key, date_str)
            odds_data = odds_response.get("data", [])
            api_remaining = odds_response.get("remaining", api_remaining)

            if odds_data:
                date_spreads = parse_spreads_from_odds(odds_data, TEAM_NAME_TO_ABBREV)
                historical_spreads.update(date_spreads)
                dates_fetched += 1

                if dates_fetched % 10 == 0:
                    print(f"  Fetched {dates_fetched}/{len(games_by_date)} dates (API remaining: {api_remaining})")

        print(f"  Fetched spreads for {dates_fetched} dates")
        print(f"  API requests remaining: {api_remaining}")

    # Metadata for tracking spread sources
    spread_metadata = {
        "real_spreads": 0,
        "estimated_spreads": 0,
        "api_remaining": api_remaining if odds_api_key else "N/A",
    }

    # Initialize team states
    team_states: Dict[int, TeamState] = {}

    # Team name mapping
    team_names = {
        1610612737: "Atlanta Hawks", 1610612738: "Boston Celtics",
        1610612751: "Brooklyn Nets", 1610612766: "Charlotte Hornets",
        1610612741: "Chicago Bulls", 1610612739: "Cleveland Cavaliers",
        1610612742: "Dallas Mavericks", 1610612743: "Denver Nuggets",
        1610612765: "Detroit Pistons", 1610612744: "Golden State Warriors",
        1610612745: "Houston Rockets", 1610612754: "Indiana Pacers",
        1610612746: "LA Clippers", 1610612747: "Los Angeles Lakers",
        1610612763: "Memphis Grizzlies", 1610612748: "Miami Heat",
        1610612749: "Milwaukee Bucks", 1610612750: "Minnesota Timberwolves",
        1610612740: "New Orleans Pelicans", 1610612752: "New York Knicks",
        1610612760: "Oklahoma City Thunder", 1610612753: "Orlando Magic",
        1610612755: "Philadelphia 76ers", 1610612756: "Phoenix Suns",
        1610612757: "Portland Trail Blazers", 1610612758: "Sacramento Kings",
        1610612759: "San Antonio Spurs", 1610612761: "Toronto Raptors",
        1610612762: "Utah Jazz", 1610612764: "Washington Wizards",
    }

    # Process all games in order to build team states
    results: List[BacktestResult] = []
    games_processed = 0

    # Cache for historical spreads
    spread_cache: Dict[str, float] = {}

    print("\nRunning backtest...")

    for game in complete_games:
        home_id = game["home_team_id"]
        away_id = game["away_team_id"]

        # Initialize team states if needed
        if home_id not in team_states:
            team_states[home_id] = TeamState(
                team_id=home_id,
                team_name=team_names.get(home_id, f"Team {home_id}")
            )
        if away_id not in team_states:
            team_states[away_id] = TeamState(
                team_id=away_id,
                team_name=team_names.get(away_id, f"Team {away_id}")
            )

        home_state = team_states[home_id]
        away_state = team_states[away_id]

        # Is this game in our sample?
        if game in sampled_games:
            games_processed += 1

            # Get or estimate the spread
            game_date = game["date"]
            matchup_key = f"{game['away_abbrev']}@{game['home_abbrev']}"

            # First check if we have real historical spread
            if matchup_key in historical_spreads:
                closing_spread = historical_spreads[matchup_key]
                spread_metadata["real_spreads"] += 1
            elif matchup_key in spread_cache:
                closing_spread = spread_cache[matchup_key]
                spread_metadata["estimated_spreads"] += 1
            else:
                # Estimate from pre-game Elos
                closing_spread = estimate_spread_from_teams(home_state.get_elo(), away_state.get_elo())
                spread_cache[matchup_key] = closing_spread
                spread_metadata["estimated_spreads"] += 1

            # Make prediction using only pre-game data
            predicted_margin, elo_comp, nr_comp = predict_spread(home_state, away_state)

            # Actual outcome
            actual_margin = game["home_pts"] - game["away_pts"]

            # Determine winners
            actual_winner = "home" if actual_margin > 0 else "away" if actual_margin < 0 else "tie"
            predicted_winner = "home" if predicted_margin > 0 else "away" if predicted_margin < 0 else "tie"

            # ATS outcome (spread is from home perspective, negative = home favored)
            # Home covers if: actual_margin > -spread (they beat the spread)
            margin_vs_spread = actual_margin + closing_spread  # Positive = home covered
            if abs(margin_vs_spread) < 0.5:
                actual_ats = "push"
            elif margin_vs_spread > 0:
                actual_ats = "home"
            else:
                actual_ats = "away"

            # Predicted ATS
            predicted_vs_spread = predicted_margin + closing_spread
            if abs(predicted_vs_spread) < 0.5:
                predicted_ats = "push"
            elif predicted_vs_spread > 0:
                predicted_ats = "home"
            else:
                predicted_ats = "away"

            result = BacktestResult(
                game_id=game["game_id"],
                date=game_date,
                home_team=game["home_abbrev"],
                away_team=game["away_abbrev"],
                home_score=game["home_pts"],
                away_score=game["away_pts"],
                actual_margin=actual_margin,
                closing_spread=round(closing_spread, 1),
                predicted_margin=round(predicted_margin, 1),
                elo_component=round(elo_comp, 1),
                nr_component=round(nr_comp, 1),
                actual_winner=actual_winner,
                predicted_winner=predicted_winner,
                winner_correct=(actual_winner == predicted_winner),
                actual_ats=actual_ats,
                predicted_ats=predicted_ats,
                ats_correct=(actual_ats == predicted_ats or actual_ats == "push"),
                margin_error=abs(predicted_margin - actual_margin),
                spread_error=abs(predicted_margin - (-closing_spread)),
            )
            results.append(result)

            if games_processed % 25 == 0:
                print(f"  Processed {games_processed}/{len(sampled_games)} sampled games...")

        # Update team states with game results (always, for all games)
        home_won = game["home_pts"] > game["away_pts"]

        home_state.wins += 1 if home_won else 0
        home_state.losses += 0 if home_won else 1
        home_state.total_points_for += game["home_pts"]
        home_state.total_points_against += game["away_pts"]
        home_state.games.append({
            "pts_for": game["home_pts"],
            "pts_against": game["away_pts"],
            "net_rating": game["home_pts"] - game["away_pts"],
        })
        if len(home_state.games) > 15:
            home_state.games = home_state.games[-15:]

        away_state.wins += 0 if home_won else 1
        away_state.losses += 1 if home_won else 0
        away_state.total_points_for += game["away_pts"]
        away_state.total_points_against += game["home_pts"]
        away_state.games.append({
            "pts_for": game["away_pts"],
            "pts_against": game["home_pts"],
            "net_rating": game["away_pts"] - game["home_pts"],
        })
        if len(away_state.games) > 15:
            away_state.games = away_state.games[-15:]

    return results, spread_metadata


def analyze_results(results: List[BacktestResult]) -> Dict:
    """Analyze backtest results and compute metrics."""

    if not results:
        return {"error": "No results to analyze"}

    n = len(results)

    # Straight-up accuracy
    su_correct = sum(1 for r in results if r.winner_correct)
    su_accuracy = su_correct / n

    # ATS accuracy (excluding pushes)
    ats_games = [r for r in results if r.actual_ats != "push"]
    ats_correct = sum(1 for r in ats_games if r.ats_correct)
    ats_accuracy = ats_correct / len(ats_games) if ats_games else 0

    # Mean Absolute Error
    mae_margin = sum(r.margin_error for r in results) / n
    mae_spread = sum(r.spread_error for r in results) / n

    # Root Mean Square Error
    rmse_margin = math.sqrt(sum(r.margin_error ** 2 for r in results) / n)

    # Elo vs NR component analysis
    elo_only_results = []
    nr_only_results = []
    for r in results:
        # If we used only Elo
        elo_pred_winner = "home" if r.elo_component > 0 else "away"
        elo_correct = (elo_pred_winner == r.actual_winner)
        elo_only_results.append(elo_correct)

        # If we used only NR
        nr_pred_winner = "home" if r.nr_component > 0 else "away"
        nr_correct = (nr_pred_winner == r.actual_winner)
        nr_only_results.append(nr_correct)

    elo_only_accuracy = sum(elo_only_results) / n
    nr_only_accuracy = sum(nr_only_results) / n

    # By margin of prediction (confidence)
    high_conf = [r for r in results if abs(r.predicted_margin) >= 7]
    med_conf = [r for r in results if 3 <= abs(r.predicted_margin) < 7]
    low_conf = [r for r in results if abs(r.predicted_margin) < 3]

    high_conf_acc = sum(1 for r in high_conf if r.winner_correct) / len(high_conf) if high_conf else 0
    med_conf_acc = sum(1 for r in med_conf if r.winner_correct) / len(med_conf) if med_conf else 0
    low_conf_acc = sum(1 for r in low_conf if r.winner_correct) / len(low_conf) if low_conf else 0

    return {
        "sample_size": n,
        "straight_up": {
            "correct": su_correct,
            "total": n,
            "accuracy": round(su_accuracy * 100, 1),
        },
        "against_the_spread": {
            "correct": ats_correct,
            "total": len(ats_games),
            "pushes": n - len(ats_games),
            "accuracy": round(ats_accuracy * 100, 1),
        },
        "error_metrics": {
            "mae_vs_actual": round(mae_margin, 2),
            "mae_vs_spread": round(mae_spread, 2),
            "rmse": round(rmse_margin, 2),
        },
        "component_analysis": {
            "hybrid_accuracy": round(su_accuracy * 100, 1),
            "elo_only_accuracy": round(elo_only_accuracy * 100, 1),
            "nr_only_accuracy": round(nr_only_accuracy * 100, 1),
            "elo_weight": ELO_WEIGHT,
            "nr_weight": NR_WEIGHT,
        },
        "by_confidence": {
            "high": {
                "games": len(high_conf),
                "accuracy": round(high_conf_acc * 100, 1),
                "threshold": "±7+ points",
            },
            "medium": {
                "games": len(med_conf),
                "accuracy": round(med_conf_acc * 100, 1),
                "threshold": "±3-7 points",
            },
            "low": {
                "games": len(low_conf),
                "accuracy": round(low_conf_acc * 100, 1),
                "threshold": "±0-3 points",
            },
        },
    }


def print_report(analysis: Dict, results: List[BacktestResult]):
    """Print a formatted backtest report."""

    print("\n" + "=" * 60)
    print("NBA SPREAD PREDICTION MODEL - BACKTEST REPORT")
    print("=" * 60)

    print(f"\nSample Size: {analysis['sample_size']} games")
    print(f"Season: {SEASON}")

    print("\n--- STRAIGHT-UP ACCURACY ---")
    su = analysis["straight_up"]
    print(f"Correct: {su['correct']}/{su['total']} ({su['accuracy']}%)")

    print("\n--- AGAINST THE SPREAD ---")
    ats = analysis["against_the_spread"]
    print(f"Correct: {ats['correct']}/{ats['total']} ({ats['accuracy']}%)")
    print(f"Pushes: {ats['pushes']}")
    breakeven = 52.4
    print(f"Break-even for betting: {breakeven}%")
    if ats["accuracy"] > breakeven:
        print(f"[+] Above break-even by {ats['accuracy'] - breakeven:.1f}%")
    else:
        print(f"[-] Below break-even by {breakeven - ats['accuracy']:.1f}%")

    print("\n--- ERROR METRICS ---")
    err = analysis["error_metrics"]
    print(f"Mean Absolute Error (vs actual margin): {err['mae_vs_actual']} points")
    print(f"Mean Absolute Error (vs spread): {err['mae_vs_spread']} points")
    print(f"Root Mean Square Error: {err['rmse']} points")

    print("\n--- COMPONENT ANALYSIS ---")
    comp = analysis["component_analysis"]
    print(f"Hybrid Model (55% Elo + 45% NR): {comp['hybrid_accuracy']}%")
    print(f"Elo Only: {comp['elo_only_accuracy']}%")
    print(f"Net Rating Only: {comp['nr_only_accuracy']}%")

    if comp["hybrid_accuracy"] >= max(comp["elo_only_accuracy"], comp["nr_only_accuracy"]):
        print("[+] Hybrid model outperforms individual components")
    else:
        best = "Elo" if comp["elo_only_accuracy"] > comp["nr_only_accuracy"] else "Net Rating"
        print(f"[-] {best} alone performs better than hybrid")

    print("\n--- BY PREDICTION CONFIDENCE ---")
    conf = analysis["by_confidence"]
    print(f"High confidence ({conf['high']['threshold']}): {conf['high']['accuracy']}% ({conf['high']['games']} games)")
    print(f"Medium confidence ({conf['medium']['threshold']}): {conf['medium']['accuracy']}% ({conf['medium']['games']} games)")
    print(f"Low confidence ({conf['low']['threshold']}): {conf['low']['accuracy']}% ({conf['low']['games']} games)")

    # Show some examples
    print("\n--- SAMPLE PREDICTIONS ---")
    print(f"{'Date':<12} {'Matchup':<15} {'Actual':<10} {'Predicted':<10} {'Spread':<8} {'Result'}")
    print("-" * 70)
    for r in results[:10]:
        matchup = f"{r.away_team}@{r.home_team}"
        actual = f"{r.away_score}-{r.home_score}"
        pred = f"{r.predicted_margin:+.1f}"
        spread = f"{r.closing_spread:+.1f}"
        result = "[+]" if r.winner_correct else "[-]"
        ats_result = "[+]" if r.ats_correct else "[-]"
        print(f"{r.date:<12} {matchup:<15} {actual:<10} {pred:<10} {spread:<8} SU:{result} ATS:{ats_result}")

    print("\n" + "=" * 60)


def main(sample_pct: float = 0.25, odds_api_key: Optional[str] = None):
    """Main backtest execution."""

    load_env_file()
    if not odds_api_key:
        odds_api_key = os.environ.get("ODDS_API_KEY")

    print("=" * 60)
    print("NBA Spread Prediction Model - Backtest")
    print("=" * 60)
    print(f"Season: {SEASON}")
    print(f"Sample: {sample_pct * 100:.0f}% of games")
    print(f"Model: {ELO_WEIGHT*100:.0f}% Elo + {NR_WEIGHT*100:.0f}% Net Rating")

    # Run backtest
    use_real_spreads = odds_api_key is not None
    results, spread_metadata = run_backtest(
        sample_pct=sample_pct,
        odds_api_key=odds_api_key,
        use_estimated_spreads=not use_real_spreads,
    )

    if not results:
        print("Backtest failed - no results")
        return

    # Print spread source info
    print(f"\nSpread data sources:")
    print(f"  Real historical spreads: {spread_metadata.get('real_spreads', 0)}")
    print(f"  Estimated spreads: {spread_metadata.get('estimated_spreads', 0)}")
    if spread_metadata.get('api_remaining') != "N/A":
        print(f"  API requests remaining: {spread_metadata.get('api_remaining')}")

    # Analyze
    analysis = analyze_results(results)

    # Print report
    print_report(analysis, results)

    # Save results
    output_path = Path(__file__).parent.parent / "data" / "backtest_results.json"
    output_data = {
        "run_date": datetime.now().isoformat(),
        "season": SEASON,
        "sample_pct": sample_pct,
        "model_weights": {
            "elo": ELO_WEIGHT,
            "net_rating": NR_WEIGHT,
            "window_weights": WINDOW_WEIGHTS,
        },
        "spread_metadata": spread_metadata,
        "analysis": analysis,
        "sample_results": [asdict(r) for r in results[:50]],  # First 50 for inspection
    }

    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"\nResults saved to {output_path}")

    return analysis


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Backtest NBA spread prediction model")
    parser.add_argument("--sample-pct", type=float, default=0.25, help="Fraction of games to sample (default: 0.25)")
    parser.add_argument("--odds-api-key", help="The Odds API key for historical spreads")
    args = parser.parse_args()

    main(sample_pct=args.sample_pct, odds_api_key=args.odds_api_key)
