#!/usr/bin/env python3
"""
Fetch Historical Closing Lines for League Walk-Forward Backtest

Uses The Odds API historical endpoint to get closing spreads for all
games in data/league_walkforward.json. Merges closing lines into the
existing walk-forward data.

Requires: ODDS_API_KEY env var (20K plan or higher for historical access)
Cost: ~1,040 credits (104 game dates × 10 credits per date)

Usage:
    python scripts/fetch_historical_odds.py
    python scripts/fetch_historical_odds.py --dry-run   # show cost estimate only
"""

import json
import os
import sys
import time
import argparse
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional


ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"
SPORT = "basketball_nba"


def load_env():
    """Load API key from .env.local or environment."""
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

    return os.environ.get("ODDS_API_KEY")


def fetch_historical_odds(api_key: str, date_str: str) -> Optional[Dict]:
    """
    Fetch closing odds for all NBA games on a given date.

    We request the snapshot at 6pm ET on game day — close to tip-off for
    most games, giving us near-closing lines.

    Returns dict keyed by a normalized matchup key → spread data.
    """
    # Request snapshot at 11pm UTC (6pm ET) — near tip-off for most games
    iso_date = f"{date_str}T23:00:00Z"

    try:
        response = requests.get(
            f"{ODDS_API_BASE_URL}/historical/sports/{SPORT}/odds",
            params={
                "apiKey": api_key,
                "regions": "us",
                "markets": "spreads",
                "oddsFormat": "american",
                "date": iso_date,
            },
            timeout=15,
        )

        remaining = response.headers.get("x-requests-remaining", "?")
        used = response.headers.get("x-requests-used", "?")

        if response.status_code == 422:
            # No data available for this date
            return None, remaining, used
        response.raise_for_status()

        data = response.json()
        actual_timestamp = data.get("timestamp", "")
        games = data.get("data", [])

        # Parse into a lookup: "AWAY @ HOME" → {home_spread, away_spread}
        odds_lookup = {}
        for game in games:
            home_team = game.get("home_team", "")
            away_team = game.get("away_team", "")
            key = f"{away_team} @ {home_team}"

            # Find best available spread (prefer DraftKings > FanDuel > any)
            spread = extract_best_spread(game.get("bookmakers", []), home_team)
            if spread is not None:
                odds_lookup[key] = {
                    "homeSpread": spread,
                    "awaySpread": -spread,
                    "source": "the-odds-api-historical",
                }

        return odds_lookup, remaining, used

    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("ERROR: Invalid API key or insufficient plan (need 20K+)")
            sys.exit(1)
        elif e.response.status_code == 429:
            print("ERROR: Rate limited. Wait and retry.")
            sys.exit(1)
        return None, "?", "?"
    except Exception as e:
        print(f"  Warning: {e}")
        return None, "?", "?"


def extract_best_spread(bookmakers: List[Dict], home_team: str) -> Optional[float]:
    """Extract home team spread from best available bookmaker."""
    preferred = ["draftkings", "fanduel", "betmgm", "pointsbetus", "bovada"]

    # Sort bookmakers by preference
    bm_by_key = {bm["key"]: bm for bm in bookmakers}

    for pref in preferred:
        if pref in bm_by_key:
            return get_spread_from_bookmaker(bm_by_key[pref], home_team)

    # Fallback: first bookmaker with spread data
    for bm in bookmakers:
        spread = get_spread_from_bookmaker(bm, home_team)
        if spread is not None:
            return spread

    return None


def get_spread_from_bookmaker(bookmaker: Dict, home_team: str) -> Optional[float]:
    """Get the home team spread from a bookmaker's data."""
    for market in bookmaker.get("markets", []):
        if market.get("key") != "spreads":
            continue
        for outcome in market.get("outcomes", []):
            if outcome.get("name") == home_team:
                return outcome.get("point")
    return None


# NBA team name normalization (Odds API uses full names, walk-forward uses abbreviations)
ABBREV_TO_FULL = {
    "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets", "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets", "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
    "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat", "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans", "NYK": "New York Knicks", "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors", "UTA": "Utah Jazz", "WAS": "Washington Wizards",
}


def main():
    parser = argparse.ArgumentParser(description="Fetch historical closing lines")
    parser.add_argument("--dry-run", action="store_true", help="Show cost estimate only")
    args = parser.parse_args()

    api_key = load_env()
    if not api_key or api_key == "your_api_key_here":
        print("ERROR: Set ODDS_API_KEY in .env.local or environment")
        print("  Subscribe at: https://the-odds-api.com/#get-access")
        sys.exit(1)

    # Load walk-forward data
    wf_path = Path(__file__).parent.parent / "data" / "league_walkforward.json"
    if not wf_path.exists():
        print("ERROR: data/league_walkforward.json not found")
        print("  Run: python scripts/fetch_league_walkforward.py")
        sys.exit(1)

    wf_data = json.loads(wf_path.read_text())
    games = wf_data["games"]

    # Group games by date
    games_by_date: Dict[str, List[Dict]] = {}
    for g in games:
        games_by_date.setdefault(g["date"], []).append(g)

    dates = sorted(games_by_date.keys())
    estimated_credits = len(dates) * 10

    print(f"=== HISTORICAL ODDS FETCH ===")
    print(f"Games: {len(games)}")
    print(f"Unique dates: {len(dates)}")
    print(f"Estimated credits: {estimated_credits}")
    print(f"Date range: {dates[0]} to {dates[-1]}")
    print()

    if args.dry_run:
        print("(dry run — no API calls made)")
        return

    # Fetch odds date by date
    total_matched = 0
    total_missed = 0
    remaining = "?"

    for i, date in enumerate(dates):
        date_games = games_by_date[date]
        time.sleep(0.5)  # rate limit courtesy

        result, remaining, used = fetch_historical_odds(api_key, date)

        if result is None:
            print(f"  [{i+1}/{len(dates)}] {date}: no data (credits remaining: {remaining})")
            total_missed += len(date_games)
            continue

        # Match odds to walk-forward games
        matched = 0
        for g in date_games:
            home_full = ABBREV_TO_FULL.get(g["homeAbbrev"], "")
            away_full = ABBREV_TO_FULL.get(g["awayAbbrev"], "")
            key = f"{away_full} @ {home_full}"

            if key in result:
                g["closingSpread"] = result[key]["homeSpread"]
                matched += 1

        total_matched += matched
        missed = len(date_games) - matched
        total_missed += missed

        status = f"matched {matched}/{len(date_games)}"
        if missed > 0:
            status += f" (missed {missed})"
        print(f"  [{i+1}/{len(dates)}] {date}: {status} | odds snapshots: {len(result)} | remaining: {remaining}")

    print()
    print(f"=== RESULTS ===")
    print(f"Total matched: {total_matched}/{len(games)} ({total_matched/len(games)*100:.1f}%)")
    print(f"Total missed: {total_missed}")
    print(f"Credits remaining: {remaining}")

    # Save updated walk-forward data
    output_path = Path(__file__).parent.parent / "data" / "league_walkforward.json"
    wf_data["metadata"]["closingLinesAdded"] = datetime.utcnow().isoformat() + "Z"
    wf_data["metadata"]["closingLinesMatched"] = total_matched
    wf_data["metadata"]["closingLinesMissed"] = total_missed
    output_path.write_text(json.dumps(wf_data, indent=2))
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
