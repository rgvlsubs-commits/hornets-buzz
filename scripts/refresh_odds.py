#!/usr/bin/env python3
"""
Lightweight odds-only refresh script.
Only updates betting lines without re-fetching game results or stats.
Uses 1 API request per call (same as full refresh, but much faster).

Usage:
    python refresh_odds.py [--odds-api-key YOUR_API_KEY]
"""

import json
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
import requests

# Constants
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"
DATA_FILE = Path(__file__).parent.parent / "data" / "hornets_buzz.json"


def fetch_betting_odds(api_key: str | None = None) -> dict | None:
    """Fetch current betting odds from The Odds API."""
    if not api_key:
        api_key = os.environ.get("ODDS_API_KEY")

    if not api_key or api_key == "your_api_key_here":
        print("Warning: No Odds API key provided")
        print("  Get your free key at: https://the-odds-api.com/")
        return None

    try:
        url = f"{ODDS_API_BASE_URL}/sports/basketball_nba/odds"
        params = {
            "apiKey": api_key,
            "regions": "us",
            "markets": "spreads,h2h",
            "oddsFormat": "american",
            "bookmakers": "draftkings,fanduel,betmgm"
        }

        response = requests.get(url, params=params, timeout=30)

        if response.status_code == 401:
            print("Error: Invalid API key")
            return None

        response.raise_for_status()

        # Check remaining requests
        remaining = response.headers.get("x-requests-remaining", "unknown")
        used = response.headers.get("x-requests-used", "unknown")
        print(f"  API requests: {used} used, {remaining} remaining this month")

        return response.json()

    except requests.RequestException as e:
        print(f"Error fetching odds: {e}")
        return None


def update_odds_in_data(odds_data: list) -> bool:
    """Update the existing JSON file with new odds."""
    if not DATA_FILE.exists():
        print(f"Error: Data file not found at {DATA_FILE}")
        return False

    # Load existing data
    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    if "upcomingGames" not in data:
        print("Error: No upcomingGames in data file")
        return False

    # Build odds lookup by team names
    odds_lookup = {}
    for game in odds_data:
        home_team = game.get("home_team", "")
        away_team = game.get("away_team", "")

        # Find Hornets games
        if "Hornets" in home_team or "Hornets" in away_team:
            opponent = away_team if "Hornets" in home_team else home_team
            is_home = "Hornets" in home_team

            # Extract odds from bookmakers
            spread = None
            moneyline = None
            opening_spread = None

            for bookmaker in game.get("bookmakers", []):
                for market in bookmaker.get("markets", []):
                    if market["key"] == "spreads":
                        for outcome in market.get("outcomes", []):
                            if "Hornets" in outcome.get("name", ""):
                                spread = outcome.get("point")
                                break
                    elif market["key"] == "h2h":
                        for outcome in market.get("outcomes", []):
                            if "Hornets" in outcome.get("name", ""):
                                moneyline = outcome.get("price")
                                break

                # Use first bookmaker's odds
                if spread is not None:
                    break

            if spread is not None or moneyline is not None:
                odds_lookup[opponent] = {
                    "spread": spread,
                    "moneyline": moneyline,
                    "is_home": is_home,
                    "game_time": game.get("commence_time"),
                }

    # Update upcoming games
    updates = 0
    for upcoming in data["upcomingGames"]:
        opponent = upcoming.get("opponent", "")

        # Try to match opponent
        matched_key = None
        for key in odds_lookup:
            if opponent in key or key in opponent:
                matched_key = key
                break

        if matched_key:
            odds = odds_lookup[matched_key]
            old_spread = upcoming.get("spread")
            new_spread = odds["spread"]

            if old_spread != new_spread:
                print(f"  {opponent}: Spread {old_spread} -> {new_spread}")
                updates += 1

            # Track opening spread if not already set
            if upcoming.get("openingSpread") is None and old_spread is not None:
                upcoming["openingSpread"] = old_spread

            # Calculate spread movement
            if upcoming.get("openingSpread") is not None and new_spread is not None:
                upcoming["spreadMovement"] = round(new_spread - upcoming["openingSpread"], 1)

            upcoming["spread"] = new_spread
            upcoming["moneyline"] = odds["moneyline"]

    # Update timestamp
    data["lastUpdated"] = datetime.now().isoformat()
    data["oddsLastUpdated"] = datetime.now().isoformat()

    # Save updated data
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"  Updated {updates} game(s) with new odds")
    return True


def main(odds_api_key: str | None = None):
    print("=" * 50)
    print("ODDS REFRESH")
    print("=" * 50)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    print("Fetching current odds...")
    odds_data = fetch_betting_odds(odds_api_key)

    if not odds_data:
        print("Failed to fetch odds")
        return False

    print(f"  Found {len(odds_data)} NBA games")

    print("Updating data file...")
    success = update_odds_in_data(odds_data)

    if success:
        print()
        print("Odds refresh complete!")

    return success


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh betting odds only")
    parser.add_argument("--odds-api-key", help="The Odds API key")
    args = parser.parse_args()

    success = main(args.odds_api_key)
    sys.exit(0 if success else 1)
