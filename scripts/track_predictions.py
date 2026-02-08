#!/usr/bin/env python3
"""
NBA Spread Prediction Tracker

Records predictions vs actual outcomes for forward-testing.
Run this before games to record predictions, then after to record results.

Usage:
    python track_predictions.py record    # Record today's predictions
    python track_predictions.py update    # Update results for past predictions
    python track_predictions.py report    # Generate accuracy report

Output:
    data/prediction_tracker.json
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List

try:
    from nba_api.stats.endpoints import scoreboardv2, leaguedashteamstats
    from nba_api.stats.static import teams as nba_teams
    import requests
    import time
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

# Load model constants (matching model.ts)
ELO_INITIAL = 1500
ELO_HOME_ADVANTAGE = 70
ELO_TO_SPREAD = 28
NR_HOME_ADVANTAGE = 2.5
ELO_WEIGHT = 0.55
NR_WEIGHT = 0.45

TRACKER_FILE = Path(__file__).parent.parent / "data" / "prediction_tracker.json"
HORNETS_TEAM_ID = 1610612766
SEASON = "2025-26"


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


def load_tracker() -> Dict:
    """Load existing tracker data."""
    if TRACKER_FILE.exists():
        with open(TRACKER_FILE) as f:
            return json.load(f)
    return {
        "predictions": [],
        "last_updated": None,
        "summary": {
            "total": 0,
            "su_correct": 0,
            "ats_correct": 0,
            "with_real_spreads": 0,
        }
    }


def save_tracker(data: Dict):
    """Save tracker data."""
    TRACKER_FILE.parent.mkdir(exist_ok=True)
    data["last_updated"] = datetime.now().isoformat()
    with open(TRACKER_FILE, "w") as f:
        json.dump(data, f, indent=2)


def fetch_team_stats() -> Dict:
    """Fetch current team stats for predictions."""
    print("Fetching team stats...")
    try:
        time.sleep(0.6)
        stats = leaguedashteamstats.LeagueDashTeamStats(
            season=SEASON,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame"
        )
        df = stats.get_data_frames()[0]

        team_stats = {}
        for _, row in df.iterrows():
            team_id = row["TEAM_ID"]
            wins = row.get("W", 0)
            losses = row.get("L", 0)
            games = wins + losses
            net_rating = row.get("PLUS_MINUS", 0)

            team_stats[team_id] = {
                "wins": wins,
                "losses": losses,
                "net_rating": net_rating,
            }
        return team_stats
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return {}


def calculate_elo(wins: int, losses: int, net_rating: float) -> float:
    """Calculate Elo from record and net rating."""
    import math
    games = wins + losses
    if games == 0:
        return ELO_INITIAL

    win_pct = wins / games
    if win_pct <= 0:
        elo_from_win_pct = 1200
    elif win_pct >= 1:
        elo_from_win_pct = 1800
    else:
        elo_from_win_pct = 1504.6 - 450 * math.log10((1 / win_pct) - 1)

    elo_from_nr = ELO_INITIAL + net_rating * 10

    win_pct_weight = max(0.3, 1 - games / 82)
    return win_pct_weight * elo_from_win_pct + (1 - win_pct_weight) * elo_from_nr


def predict_spread(home_stats: Dict, away_stats: Dict, is_home: bool) -> float:
    """Predict spread using our model."""
    home_elo = calculate_elo(home_stats["wins"], home_stats["losses"], home_stats["net_rating"])
    away_elo = calculate_elo(away_stats["wins"], away_stats["losses"], away_stats["net_rating"])

    elo_diff = home_elo - away_elo + ELO_HOME_ADVANTAGE
    elo_prediction = elo_diff / ELO_TO_SPREAD

    nr_diff = home_stats["net_rating"] - away_stats["net_rating"] + NR_HOME_ADVANTAGE
    nr_prediction = nr_diff

    return (elo_prediction * ELO_WEIGHT) + (nr_prediction * NR_WEIGHT)


def fetch_current_odds(api_key: str) -> Dict:
    """Fetch current spreads from The Odds API."""
    if not api_key:
        return {}

    try:
        response = requests.get(
            "https://api.the-odds-api.com/v4/sports/basketball_nba/odds",
            params={
                "apiKey": api_key,
                "regions": "us",
                "markets": "spreads",
                "oddsFormat": "american",
            }
        )
        if response.status_code == 200:
            data = response.json()
            spreads = {}
            for game in data:
                home = game.get("home_team", "")
                for bookmaker in game.get("bookmakers", []):
                    if bookmaker.get("key") == "draftkings":
                        for market in bookmaker.get("markets", []):
                            if market.get("key") == "spreads":
                                for outcome in market.get("outcomes", []):
                                    if outcome.get("name") == home:
                                        spreads[home] = outcome.get("point", 0)
                        break
            return spreads
        return {}
    except Exception as e:
        print(f"Error fetching odds: {e}")
        return {}


def record_predictions():
    """Record predictions for upcoming games."""
    load_env_file()
    api_key = os.environ.get("ODDS_API_KEY")

    tracker = load_tracker()
    team_stats = fetch_team_stats()
    current_odds = fetch_current_odds(api_key)

    team_id_to_name = {t["id"]: t["full_name"] for t in nba_teams.get_teams()}

    print("\nFetching upcoming games...")

    # Get games for next 3 days
    new_predictions = 0
    for days_ahead in range(0, 3):
        game_date = datetime.now() + timedelta(days=days_ahead)
        date_str = game_date.strftime('%m/%d/%Y')

        try:
            time.sleep(0.5)
            sb = scoreboardv2.ScoreboardV2(game_date=date_str)
            games_df = sb.get_data_frames()[0]

            if len(games_df) == 0:
                continue

            for _, g in games_df.iterrows():
                game_id = str(g.get('GAME_ID', ''))
                home_id = g['HOME_TEAM_ID']
                away_id = g['VISITOR_TEAM_ID']

                # Skip if already recorded
                existing = [p for p in tracker["predictions"] if p["game_id"] == game_id]
                if existing:
                    continue

                home_name = team_id_to_name.get(home_id, "Unknown")
                away_name = team_id_to_name.get(away_id, "Unknown")

                home_stats = team_stats.get(home_id, {"wins": 0, "losses": 0, "net_rating": 0})
                away_stats = team_stats.get(away_id, {"wins": 0, "losses": 0, "net_rating": 0})

                predicted_margin = predict_spread(home_stats, away_stats, True)

                # Get actual spread if available
                actual_spread = current_odds.get(home_name)

                prediction = {
                    "game_id": game_id,
                    "date": game_date.strftime('%Y-%m-%d'),
                    "home_team": home_name,
                    "home_team_id": home_id,
                    "away_team": away_name,
                    "away_team_id": away_id,
                    "predicted_margin": round(predicted_margin, 1),
                    "actual_spread": actual_spread,
                    "has_real_spread": actual_spread is not None,
                    "recorded_at": datetime.now().isoformat(),
                    "result": None,  # Filled in later
                    "home_score": None,
                    "away_score": None,
                }

                tracker["predictions"].append(prediction)
                new_predictions += 1

                spread_str = f"spread: {actual_spread}" if actual_spread else "no spread yet"
                print(f"  {game_date.strftime('%b %d')}: {away_name} @ {home_name}")
                print(f"    Predicted: {predicted_margin:+.1f}, {spread_str}")

        except Exception as e:
            continue

    tracker["summary"]["total"] = len(tracker["predictions"])
    save_tracker(tracker)
    print(f"\nRecorded {new_predictions} new predictions")
    print(f"Total tracked: {tracker['summary']['total']}")


def update_results():
    """Update results for past predictions."""
    tracker = load_tracker()

    pending = [p for p in tracker["predictions"] if p["result"] is None]
    if not pending:
        print("No pending predictions to update")
        return

    print(f"Checking results for {len(pending)} games...")

    team_name_to_id = {t["full_name"]: t["id"] for t in nba_teams.get_teams()}

    for pred in pending:
        game_date = datetime.strptime(pred["date"], "%Y-%m-%d")

        # Skip future games
        if game_date.date() >= datetime.now().date():
            continue

        try:
            time.sleep(0.5)
            date_str = game_date.strftime('%m/%d/%Y')
            sb = scoreboardv2.ScoreboardV2(game_date=date_str)
            games_df = sb.get_data_frames()[0]

            for _, g in games_df.iterrows():
                if str(g.get('GAME_ID', '')) == pred["game_id"]:
                    # Game found - check if finished
                    game_status = g.get('GAME_STATUS_ID', 0)
                    if game_status == 3:  # Finished
                        home_score = g.get('HOME_TEAM_SCORE', 0)
                        away_score = g.get('AWAY_TEAM_SCORE', 0)

                        if home_score and away_score:
                            pred["home_score"] = int(home_score)
                            pred["away_score"] = int(away_score)
                            pred["actual_margin"] = int(home_score) - int(away_score)

                            # Determine results
                            pred["su_correct"] = (
                                (pred["predicted_margin"] > 0 and pred["actual_margin"] > 0) or
                                (pred["predicted_margin"] < 0 and pred["actual_margin"] < 0)
                            )

                            if pred["actual_spread"] is not None:
                                cover_margin = pred["actual_margin"] + pred["actual_spread"]
                                pred_cover = pred["predicted_margin"] + pred["actual_spread"]
                                pred["ats_correct"] = (
                                    (pred_cover > 0 and cover_margin > 0) or
                                    (pred_cover < 0 and cover_margin < 0)
                                )
                            else:
                                pred["ats_correct"] = None

                            pred["result"] = "complete"
                            print(f"  {pred['away_team']} @ {pred['home_team']}: {away_score}-{home_score}")

                    break
        except Exception as e:
            continue

    # Update summary
    completed = [p for p in tracker["predictions"] if p["result"] == "complete"]
    tracker["summary"]["total"] = len(tracker["predictions"])
    tracker["summary"]["completed"] = len(completed)
    tracker["summary"]["su_correct"] = sum(1 for p in completed if p.get("su_correct"))
    tracker["summary"]["ats_correct"] = sum(1 for p in completed if p.get("ats_correct"))
    tracker["summary"]["with_real_spreads"] = sum(1 for p in completed if p.get("has_real_spread"))

    save_tracker(tracker)
    print(f"\nUpdated {len(completed)} completed games")


def generate_report():
    """Generate accuracy report."""
    tracker = load_tracker()

    completed = [p for p in tracker["predictions"] if p["result"] == "complete"]
    with_spreads = [p for p in completed if p.get("has_real_spread")]

    print("\n" + "=" * 50)
    print("PREDICTION TRACKER REPORT")
    print("=" * 50)

    print(f"\nTotal predictions: {len(tracker['predictions'])}")
    print(f"Completed games: {len(completed)}")
    print(f"Games with real spreads: {len(with_spreads)}")

    if completed:
        su_correct = sum(1 for p in completed if p.get("su_correct"))
        su_pct = su_correct / len(completed) * 100

        print(f"\n--- STRAIGHT-UP ---")
        print(f"Correct: {su_correct}/{len(completed)} ({su_pct:.1f}%)")

    if with_spreads:
        ats_games = [p for p in with_spreads if p.get("ats_correct") is not None]
        if ats_games:
            ats_correct = sum(1 for p in ats_games if p.get("ats_correct"))
            ats_pct = ats_correct / len(ats_games) * 100

            print(f"\n--- AGAINST THE SPREAD (Real Spreads Only) ---")
            print(f"Correct: {ats_correct}/{len(ats_games)} ({ats_pct:.1f}%)")
            print(f"Break-even: 52.4%")

            if ats_pct > 52.4:
                print(f"[+] Above break-even by {ats_pct - 52.4:.1f}%")
            else:
                print(f"[-] Below break-even by {52.4 - ats_pct:.1f}%")

    # Recent predictions
    recent = sorted(completed, key=lambda p: p["date"], reverse=True)[:10]
    if recent:
        print(f"\n--- RECENT RESULTS ---")
        for p in recent:
            su = "[+]" if p.get("su_correct") else "[-]"
            ats = "[+]" if p.get("ats_correct") else "[-]" if p.get("ats_correct") is False else "N/A"
            print(f"{p['date']}: {p['away_team'][:3]}@{p['home_team'][:3]} "
                  f"Pred:{p['predicted_margin']:+.1f} Actual:{p.get('actual_margin', 'N/A')} "
                  f"SU:{su} ATS:{ats}")

    print("\n" + "=" * 50)


def main():
    if len(sys.argv) < 2:
        print("Usage: python track_predictions.py [record|update|report]")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "record":
        record_predictions()
    elif command == "update":
        update_results()
    elif command == "report":
        generate_report()
    else:
        print(f"Unknown command: {command}")
        print("Use: record, update, or report")
        sys.exit(1)


if __name__ == "__main__":
    main()
