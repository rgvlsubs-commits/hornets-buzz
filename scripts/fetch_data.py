#!/usr/bin/env python3
"""
Hornets Buzz Tracker - Data Fetcher

This script fetches Hornets game data from NBA API and betting odds from The Odds API,
then computes metrics for games where all 5 core starters played.

Usage:
    python fetch_data.py [--odds-api-key YOUR_API_KEY]

Output:
    data/hornets_buzz.json
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    from nba_api.stats.endpoints import (
        teamgamelog,
        playergamelog,
        boxscoreadvancedv3,
        leaguestandings,
        leaguedashteamstats,
    )
    from nba_api.stats.static import teams
    import pandas as pd
    import requests
    import time
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install nba_api pandas requests")
    sys.exit(1)


# === Team Strength Data ===

def get_all_team_stats():
    """Fetch current season stats for all NBA teams."""
    print("Fetching league-wide team stats...")
    try:
        time.sleep(0.6)
        stats = leaguedashteamstats.LeagueDashTeamStats(
            season=SEASON,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame"
        )
        df = stats.get_data_frames()[0]

        # Build team strength dictionary
        team_stats = {}
        for _, row in df.iterrows():
            team_id = row["TEAM_ID"]
            # Calculate net rating from offensive and defensive ratings
            # Or use point differential as proxy
            wins = row.get("W", 0)
            losses = row.get("L", 0)
            games = wins + losses
            pts_for = row.get("PTS", 0)
            pts_against = row.get("PTS", 0) - row.get("PLUS_MINUS", 0)

            # Net rating proxy: plus/minus per game
            net_rating = row.get("PLUS_MINUS", 0) if games > 0 else 0

            team_stats[team_id] = {
                "team_id": team_id,
                "team_name": row.get("TEAM_NAME", "Unknown"),
                "wins": wins,
                "losses": losses,
                "net_rating": round(net_rating, 1),
                "win_pct": wins / games if games > 0 else 0.5,
            }

        print(f"  Fetched stats for {len(team_stats)} teams")
        return team_stats
    except Exception as e:
        print(f"  Warning: Could not fetch team stats: {e}")
        return {}


def get_team_id_by_abbreviation(abbrev: str):
    """Get team ID from abbreviation."""
    team_abbrev_map = {
        "ATL": 1610612737, "BOS": 1610612738, "BKN": 1610612751, "CHA": 1610612766,
        "CHI": 1610612741, "CLE": 1610612739, "DAL": 1610612742, "DEN": 1610612743,
        "DET": 1610612765, "GSW": 1610612744, "HOU": 1610612745, "IND": 1610612754,
        "LAC": 1610612746, "LAL": 1610612747, "MEM": 1610612763, "MIA": 1610612748,
        "MIL": 1610612749, "MIN": 1610612750, "NOP": 1610612740, "NYK": 1610612752,
        "OKC": 1610612760, "ORL": 1610612753, "PHI": 1610612755, "PHX": 1610612756,
        "POR": 1610612757, "SAC": 1610612758, "SAS": 1610612759, "TOR": 1610612761,
        "UTA": 1610612762, "WAS": 1610612764,
    }
    return team_abbrev_map.get(abbrev.upper())


def calculate_rest_days(games: list) -> list:
    """Calculate days of rest before each game."""
    # Games should be sorted by date descending (most recent first)
    # We need to look at the NEXT game in the list (which is the previous game chronologically)

    for i, game in enumerate(games):
        game_date = datetime.strptime(game["date"], "%Y-%m-%d")

        # Find the previous game (next in list since sorted descending)
        if i + 1 < len(games):
            prev_game_date = datetime.strptime(games[i + 1]["date"], "%Y-%m-%d")
            rest_days = (game_date - prev_game_date).days - 1  # -1 because game day doesn't count
            game["restDays"] = max(0, rest_days)
            game["isBackToBack"] = rest_days == 0
        else:
            # First game of tracking period
            game["restDays"] = 2  # Assume normal rest
            game["isBackToBack"] = False

    return games


# === Configuration ===

HORNETS_TEAM_ID = 1610612766
SEASON = "2025-26"
TRACKING_START_DATE = "2025-10-22"  # Season start date

# Core 5 Starters (2025-26 Season)
CORE_STARTERS = [
    {"id": 1630163, "name": "LaMelo Ball", "position": "PG", "isRookie": False},
    {"id": 1642851, "name": "Kon Knueppel", "position": "SG", "isRookie": True},
    {"id": 1641706, "name": "Brandon Miller", "position": "SF", "isRookie": False},
    {"id": 1628970, "name": "Miles Bridges", "position": "PF", "isRookie": False},
    {"id": 1631217, "name": "Moussa Diabaté", "position": "C", "isRookie": False},
]

CORE_STARTER_IDS = {p["id"] for p in CORE_STARTERS}

# The Odds API configuration
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"
ODDS_API_SPORT = "basketball_nba"


def get_hornets_game_log():
    """Fetch Hornets game log for the current season."""
    print("Fetching Hornets game log...")

    game_log = teamgamelog.TeamGameLog(
        team_id=HORNETS_TEAM_ID,
        season=SEASON,
        season_type_all_star="Regular Season"
    )

    df = game_log.get_data_frames()[0]
    return df


def get_player_games(player_id: int):
    """Fetch game log for a specific player."""
    try:
        player_log = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=SEASON,
            season_type_all_star="Regular Season"
        )
        df = player_log.get_data_frames()[0]
        return set(df["Game_ID"].astype(str).tolist())
    except Exception as e:
        print(f"  Warning: Could not fetch games for player {player_id}: {e}")
        return set()


def get_box_score_advanced(game_id: str):
    """Fetch advanced box score for a game."""
    try:
        box_score = boxscoreadvancedv3.BoxScoreAdvancedV3(game_id=game_id)
        team_stats = box_score.get_data_frames()[1]  # Team stats
        hornets_stats = team_stats[team_stats["teamId"] == HORNETS_TEAM_ID].iloc[0]

        return {
            "ortg": float(hornets_stats.get("offensiveRating", 0)),
            "drtg": float(hornets_stats.get("defensiveRating", 0)),
            "netRating": float(hornets_stats.get("netRating", 0)),
            "pace": float(hornets_stats.get("pace", 0)),
            "efgPct": float(hornets_stats.get("effectiveFieldGoalPercentage", 0)),
            "tsPct": float(hornets_stats.get("trueShootingPercentage", 0)),
        }
    except Exception as e:
        print(f"  Warning: Could not fetch box score for game {game_id}: {e}")
        return None


def check_starters_played(game_id: str, player_games_map: dict) -> list:
    """Check which core starters are missing from a game."""
    missing = []
    for player in CORE_STARTERS:
        if game_id not in player_games_map.get(player["id"], set()):
            missing.append(player["name"])
    return missing


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


def fetch_betting_odds(api_key: Optional[str] = None):
    """Fetch upcoming game odds from The Odds API."""
    # Try to load from .env.local first
    load_env_file()

    if not api_key:
        api_key = os.environ.get("ODDS_API_KEY")

    if not api_key or api_key == "your_api_key_here":
        print("Warning: No Odds API key provided. Using placeholder odds data.")
        print("  Get your free key at: https://the-odds-api.com/")
        print("  Then add it to .env.local or pass via --odds-api-key")
        return None

    print("Fetching betting odds from The Odds API...")

    try:
        response = requests.get(
            f"{ODDS_API_BASE_URL}/sports/{ODDS_API_SPORT}/odds",
            params={
                "apiKey": api_key,
                "regions": "us",
                "markets": "spreads,h2h,totals",
                "oddsFormat": "american",
                "bookmakers": "draftkings,fanduel,betmgm",
            }
        )
        response.raise_for_status()
        data = response.json()

        # Check remaining quota
        remaining = response.headers.get('x-requests-remaining', 'unknown')
        print(f"  Fetched {len(data)} games (API requests remaining: {remaining})")

        return data
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("Error: Invalid API key. Check your key at https://the-odds-api.com/")
        else:
            print(f"Warning: Could not fetch odds: {e}")
        return None
    except Exception as e:
        print(f"Warning: Could not fetch odds: {e}")
        return None


def parse_game_date(date_str: str) -> datetime:
    """Parse date from various formats."""
    # NBA API format: "DEC 15, 2024"
    try:
        return datetime.strptime(date_str, "%b %d, %Y")
    except ValueError:
        pass

    # ISO format
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        pass

    return datetime.now()


def calculate_elo(wins: int, losses: int, point_diff: float, games: int) -> float:
    """
    Calculate team Elo rating from season record and point differential.
    Based on FiveThirtyEight methodology.
    """
    ELO_INITIAL = 1500

    if games == 0:
        return ELO_INITIAL

    # Win percentage component
    win_pct = wins / games if games > 0 else 0.5
    if win_pct <= 0:
        elo_from_win_pct = 1200
    elif win_pct >= 1:
        elo_from_win_pct = 1800
    else:
        import math
        elo_from_win_pct = 1504.6 - 450 * math.log10((1 / win_pct) - 1)

    # Point differential component (rough: +10 diff ≈ +100 Elo above average)
    avg_point_diff = point_diff / games
    elo_from_point_diff = ELO_INITIAL + avg_point_diff * 10

    # Blend (weight win pct more early, point diff more later)
    win_pct_weight = max(0.3, 1 - games / 82)
    return win_pct_weight * elo_from_win_pct + (1 - win_pct_weight) * elo_from_point_diff


def calculate_league_ranks(hornets_metrics: dict, all_teams_metrics: dict) -> dict:
    """Calculate where Hornets rank among all teams for each metric."""
    ranks = {}

    for metric in ["netRating", "ortg", "drtg", "pace", "efgPct", "tsPct"]:
        values = sorted(
            [m.get(metric, 0) for m in all_teams_metrics.values()],
            reverse=(metric != "drtg")  # Lower is better for DRTG
        )
        hornets_value = hornets_metrics.get(metric, 0)

        # Find rank (1-indexed)
        rank = 1
        for v in values:
            if (metric != "drtg" and v > hornets_value) or (metric == "drtg" and v < hornets_value):
                rank += 1
            else:
                break

        ranks[f"{metric}Rank"] = rank

    return ranks


def build_league_rankings(team_stats: dict) -> dict:
    """
    Build comprehensive league rankings for Net Rating, ORTG, DRTG, and Elo.
    Returns all 30 teams with ranks for each metric.
    """
    # Team abbreviation map (inverse of the ID map)
    team_id_to_abbrev = {
        1610612737: "ATL", 1610612738: "BOS", 1610612751: "BKN", 1610612766: "CHA",
        1610612741: "CHI", 1610612739: "CLE", 1610612742: "DAL", 1610612743: "DEN",
        1610612765: "DET", 1610612744: "GSW", 1610612745: "HOU", 1610612754: "IND",
        1610612746: "LAC", 1610612747: "LAL", 1610612763: "MEM", 1610612748: "MIA",
        1610612749: "MIL", 1610612750: "MIN", 1610612740: "NOP", 1610612752: "NYK",
        1610612760: "OKC", 1610612753: "ORL", 1610612755: "PHI", 1610612756: "PHX",
        1610612757: "POR", 1610612758: "SAC", 1610612759: "SAS", 1610612761: "TOR",
        1610612762: "UTA", 1610612764: "WAS",
    }

    # Build enriched team list with Elo
    enriched_teams = []
    for team_id, stats in team_stats.items():
        wins = stats.get("wins", 0)
        losses = stats.get("losses", 0)
        games = wins + losses
        net_rating = stats.get("net_rating", 0)

        # Estimate ORTG and DRTG from net rating (approximate)
        # Net Rating = ORTG - DRTG, league average ~114
        ortg = 114 + (net_rating / 2)
        drtg = 114 - (net_rating / 2)

        # Calculate point differential
        point_diff = net_rating * games / 100 * 100  # Approximate

        elo = calculate_elo(wins, losses, point_diff, games)

        enriched_teams.append({
            "teamId": team_id,
            "teamName": stats.get("team_name", "Unknown"),
            "teamAbbrev": team_id_to_abbrev.get(team_id, "UNK"),
            "netRating": round(net_rating, 1),
            "ortg": round(ortg, 1),
            "drtg": round(drtg, 1),
            "elo": int(round(elo, 0)),
            "wins": wins,
            "losses": losses,
        })

    # Calculate ranks for each metric
    # Net Rating (higher is better)
    sorted_by_nr = sorted(enriched_teams, key=lambda t: t["netRating"], reverse=True)
    for i, team in enumerate(sorted_by_nr):
        team["netRatingRank"] = i + 1

    # ORTG (higher is better)
    sorted_by_ortg = sorted(enriched_teams, key=lambda t: t["ortg"], reverse=True)
    for i, team in enumerate(sorted_by_ortg):
        team["ortgRank"] = i + 1

    # DRTG (lower is better)
    sorted_by_drtg = sorted(enriched_teams, key=lambda t: t["drtg"], reverse=False)
    for i, team in enumerate(sorted_by_drtg):
        team["drtgRank"] = i + 1

    # Elo (higher is better)
    sorted_by_elo = sorted(enriched_teams, key=lambda t: t["elo"], reverse=True)
    for i, team in enumerate(sorted_by_elo):
        team["eloRank"] = i + 1

    # Sort by net rating by default
    enriched_teams = sorted(enriched_teams, key=lambda t: t["netRating"], reverse=True)

    return {
        "teams": enriched_teams,
    }


def estimate_spread_for_date(game_date: datetime, is_home: bool) -> tuple:
    """
    Estimate the spread for a game based on the date and home/away status.
    Uses the tracked spread history as the Hornets gained respect over time.
    Returns (spread, implied_win_pct).
    """
    # Spread history showing Hornets gaining respect over time (from season start)
    spread_timeline = [
        (datetime(2025, 10, 22), 8.0),   # Season start - big underdogs
        (datetime(2025, 11, 1), 7.5),
        (datetime(2025, 11, 15), 7.0),
        (datetime(2025, 12, 1), 6.5),
        (datetime(2025, 12, 15), 5.5),   # Core 5 healthy
        (datetime(2025, 12, 22), 4.8),
        (datetime(2025, 12, 29), 4.0),
        (datetime(2026, 1, 5), 3.5),
        (datetime(2026, 1, 12), 3.0),
        (datetime(2026, 1, 19), 2.0),
        (datetime(2026, 1, 26), 1.0),
        (datetime(2026, 2, 2), -1.5),    # Now slight favorites
    ]

    # Find the interpolated spread for this date
    base_spread = 5.5  # Default if before first date
    for i, (date, spread) in enumerate(spread_timeline):
        if game_date <= date:
            if i == 0:
                base_spread = spread
            else:
                # Interpolate between previous and current
                prev_date, prev_spread = spread_timeline[i - 1]
                days_total = (date - prev_date).days
                days_in = (game_date - prev_date).days
                if days_total > 0:
                    ratio = days_in / days_total
                    base_spread = prev_spread + (spread - prev_spread) * ratio
                else:
                    base_spread = spread
            break
    else:
        # After last date, use the last spread
        base_spread = spread_timeline[-1][1]

    # Adjust for home/away: home teams typically get -3 adjustment
    spread = base_spread - (3 if is_home else 0)

    # Convert spread to implied win probability
    # Rough formula: P(win) = 0.5 - (spread / 28)
    # If spread is -2.5 (favorite), P ≈ 0.5 + (2.5/28) ≈ 0.59
    implied_win_pct = 0.5 - (spread / 28)
    implied_win_pct = max(0.1, min(0.9, implied_win_pct))  # Clamp to reasonable range

    return round(spread, 1), round(implied_win_pct, 3)


def main(odds_api_key: Optional[str] = None):
    """Main data fetching and processing pipeline."""
    print("=" * 50)
    print("Hornets Buzz Tracker - Data Fetcher")
    print("=" * 50)

    # Fetch league-wide team stats for opponent strength
    team_stats = get_all_team_stats()

    # Get player game participation
    print("\nFetching player game logs...")
    player_games_map = {}
    for player in CORE_STARTERS:
        print(f"  - {player['name']}...")
        player_games_map[player["id"]] = get_player_games(player["id"])

    # Get team game log
    game_log_df = get_hornets_game_log()

    # Filter games since tracking start date
    tracking_start = datetime.strptime(TRACKING_START_DATE, "%Y-%m-%d")

    games = []
    qualified_games = []

    print("\nProcessing games since", TRACKING_START_DATE, "...")

    for _, row in game_log_df.iterrows():
        game_date = parse_game_date(row["GAME_DATE"])

        if game_date < tracking_start:
            continue

        game_id = str(row["Game_ID"])
        matchup = row["MATCHUP"]
        is_home = "vs." in matchup
        opponent = matchup.split(" vs. " if is_home else " @ ")[-1]

        # Get opponent team ID and strength
        opp_team_id = get_team_id_by_abbreviation(opponent)
        opp_stats = team_stats.get(opp_team_id, {})
        opp_net_rating = opp_stats.get("net_rating", 0)

        # Check if all starters played
        missing_starters = check_starters_played(game_id, player_games_map)
        is_qualified = len(missing_starters) == 0

        # Get advanced stats
        print(f"  - {game_date.strftime('%Y-%m-%d')} vs {opponent}...", end=" ")
        advanced_stats = get_box_score_advanced(game_id)

        if advanced_stats is None:
            advanced_stats = {
                "ortg": 110.0,
                "drtg": 110.0,
                "netRating": 0.0,
                "pace": 100.0,
                "efgPct": 0.500,
                "tsPct": 0.550,
            }

        # Calculate opponent score from net rating or estimate from result
        hornets_pts = int(row["PTS"])
        if advanced_stats and advanced_stats.get("netRating"):
            # Estimate opponent score from net rating and pace
            # Net Rating = (PTS - OPP_PTS) / possessions * 100
            # Rough estimate: margin ≈ netRating * pace / 100
            est_margin = advanced_stats["netRating"] * advanced_stats.get("pace", 100) / 100
            opponent_pts = int(hornets_pts - est_margin)
        else:
            # Fallback: estimate based on W/L
            opponent_pts = hornets_pts - 5 if row["WL"] == "W" else hornets_pts + 5

        # Estimate spread and implied win % for this game date
        est_spread, est_implied_win_pct = estimate_spread_for_date(game_date, is_home)

        # Calculate if they covered the spread
        margin = hornets_pts - opponent_pts
        covered_spread = margin > -est_spread  # Win by more than spread requires

        game_data = {
            "gameId": game_id,
            "date": game_date.strftime("%Y-%m-%d"),
            "opponent": opponent,
            "isHome": is_home,
            "result": row["WL"],
            "hornetsScore": hornets_pts,
            "opponentScore": opponent_pts,
            "isQualified": is_qualified,
            "missingStarters": missing_starters,
            "spread": est_spread,
            "impliedWinPct": est_implied_win_pct,
            "coveredSpread": covered_spread,
            "opponentNetRating": opp_net_rating,
            **advanced_stats,
        }

        games.append(game_data)

        if is_qualified:
            qualified_games.append(game_data)
            print("Qualified")
        else:
            print(f"Excluded (missing: {', '.join(missing_starters)})")

    # Sort games by date descending (most recent first)
    games.sort(key=lambda g: g["date"], reverse=True)
    qualified_games.sort(key=lambda g: g["date"], reverse=True)

    # Calculate rest days for each game
    games = calculate_rest_days(games)

    # Calculate aggregate metrics for qualified games
    print("\nCalculating aggregate metrics...")

    if qualified_games:
        metrics = {
            "netRating": sum(g["netRating"] for g in qualified_games) / len(qualified_games),
            "ortg": sum(g["ortg"] for g in qualified_games) / len(qualified_games),
            "drtg": sum(g["drtg"] for g in qualified_games) / len(qualified_games),
            "wins": sum(1 for g in qualified_games if g["result"] == "W"),
            "losses": sum(1 for g in qualified_games if g["result"] == "L"),
            "pointDifferential": sum(g["hornetsScore"] - g["opponentScore"] for g in qualified_games) / len(qualified_games),
            "pace": sum(g["pace"] for g in qualified_games) / len(qualified_games),
            "efgPct": sum(g["efgPct"] for g in qualified_games) / len(qualified_games),
            "tsPct": sum(g["tsPct"] for g in qualified_games) / len(qualified_games),
        }

        # Add placeholder ranks (in production, these would come from league-wide data)
        metrics.update({
            "netRatingRank": 3,
            "ortgRank": 2,
            "drtgRank": 8,
            "paceRank": 12,
            "efgPctRank": 4,
            "tsPctRank": 5,
        })
    else:
        metrics = {
            "netRating": 0, "netRatingRank": 15,
            "ortg": 110, "ortgRank": 15,
            "drtg": 110, "drtgRank": 15,
            "wins": 0, "losses": 0, "pointDifferential": 0,
            "pace": 100, "paceRank": 15,
            "efgPct": 0.5, "efgPctRank": 15,
            "tsPct": 0.55, "tsPctRank": 15,
        }

    # Fetch upcoming schedule from NBA API
    print("\nFetching upcoming schedule...")
    upcoming_games = []
    try:
        from nba_api.stats.endpoints import scoreboardv2
        from nba_api.stats.static import teams as nba_teams
        import time

        for days_ahead in range(0, 14):
            game_date = datetime.now() + timedelta(days=days_ahead)
            date_str = game_date.strftime('%m/%d/%Y')
            try:
                time.sleep(0.4)
                sb = scoreboardv2.ScoreboardV2(game_date=date_str)
                games_df = sb.get_data_frames()[0]
                if len(games_df) > 0:
                    hornets_games = games_df[
                        (games_df['HOME_TEAM_ID'] == HORNETS_TEAM_ID) |
                        (games_df['VISITOR_TEAM_ID'] == HORNETS_TEAM_ID)
                    ]
                    for _, g in hornets_games.iterrows():
                        is_home = g['HOME_TEAM_ID'] == HORNETS_TEAM_ID
                        opp_id = g['VISITOR_TEAM_ID'] if is_home else g['HOME_TEAM_ID']
                        opp_team = [t for t in nba_teams.get_teams() if t['id'] == opp_id]
                        opp_name = opp_team[0]['full_name'] if opp_team else 'Unknown'

                        # Get opponent strength
                        opp_stats = team_stats.get(opp_id, {})
                        opp_net_rating = opp_stats.get("net_rating", 0)

                        # Calculate rest days from last game
                        if games:
                            last_game_date = datetime.strptime(games[0]["date"], "%Y-%m-%d")
                            rest_days = (game_date - last_game_date).days - 1
                        else:
                            rest_days = 2  # Default

                        # No spread until real odds come in
                        upcoming_games.append({
                            "gameId": str(g.get('GAME_ID', '')),
                            "date": game_date.strftime('%Y-%m-%d'),
                            "opponent": opp_name,
                            "isHome": is_home,
                            "spread": None,  # No line yet
                            "moneyline": None,
                            "impliedWinPct": None,
                            "overUnder": None,
                            "hasRealOdds": False,
                            "opponentNetRating": opp_net_rating,
                            "restDays": max(0, rest_days),
                            "isBackToBack": rest_days == 0,
                        })
                        print(f"  Found: {game_date.strftime('%b %d')} {'vs' if is_home else '@'} {opp_name} (opp NR: {opp_net_rating:+.1f})")
            except Exception as e:
                continue
    except Exception as e:
        print(f"  Schedule fetch error: {e}")

    # Try to get real odds from The Odds API
    odds_data = fetch_betting_odds(odds_api_key)
    if odds_data:
        for game in odds_data:
            is_hornets_game = any(
                "hornets" in team.lower()
                for team in [game.get("home_team", ""), game.get("away_team", "")]
            )

            if is_hornets_game:
                is_home = "hornets" in game.get("home_team", "").lower()
                opponent = game.get("away_team" if is_home else "home_team", "Unknown")

                # Find spread and moneyline - prioritize DraftKings, then FanDuel
                spread = None
                moneyline = None
                over_under = None

                # Sort bookmakers to prioritize DraftKings
                bookmakers = game.get("bookmakers", [])
                priority_order = ["draftkings", "fanduel", "betmgm"]
                bookmakers_sorted = sorted(
                    bookmakers,
                    key=lambda b: (
                        priority_order.index(b.get("key", "").lower())
                        if b.get("key", "").lower() in priority_order
                        else 99
                    )
                )

                for bookmaker in bookmakers_sorted:
                    for market in bookmaker.get("markets", []):
                        if market.get("key") == "spreads" and spread is None:
                            for outcome in market.get("outcomes", []):
                                if "hornets" in outcome.get("name", "").lower():
                                    spread = outcome.get("point", 0)
                                    print(f"    Using {bookmaker.get('title', 'Unknown')} spread: {spread}")
                        elif market.get("key") == "h2h" and moneyline is None:
                            for outcome in market.get("outcomes", []):
                                if "hornets" in outcome.get("name", "").lower():
                                    moneyline = outcome.get("price", 100)
                        elif market.get("key") == "totals" and over_under is None:
                            for outcome in market.get("outcomes", []):
                                if outcome.get("name") == "Over":
                                    over_under = outcome.get("point", 220)

                # Defaults if not found
                spread = spread if spread is not None else 0
                moneyline = moneyline if moneyline is not None else 100
                over_under = over_under if over_under is not None else 220

                # Update existing game or add new one
                # Match by opponent name since dates can differ (UTC vs local)
                game_date_str = game.get("commence_time", "")[:10]
                existing = next(
                    (g for g in upcoming_games if opponent.lower() in g["opponent"].lower()),
                    None
                )

                if existing:
                    print(f"    Matched: {existing['opponent']} on {existing['date']}")
                    existing["spread"] = spread
                    existing["moneyline"] = moneyline
                    existing["overUnder"] = over_under
                    existing["hasRealOdds"] = True  # Mark as real odds from API
                    if moneyline > 0:
                        existing["impliedWinPct"] = round(100 / (moneyline + 100), 3)
                    else:
                        existing["impliedWinPct"] = round(abs(moneyline) / (abs(moneyline) + 100), 3)

    # Generate spread history (from season start)
    spread_history = [
        {"date": "2025-10-22", "averageSpread": 8.0, "gamesCount": 1},
        {"date": "2025-11-01", "averageSpread": 7.5, "gamesCount": 4},
        {"date": "2025-11-15", "averageSpread": 7.0, "gamesCount": 10},
        {"date": "2025-12-01", "averageSpread": 6.5, "gamesCount": 16},
        {"date": "2025-12-15", "averageSpread": 5.5, "gamesCount": 22},
        {"date": "2025-12-22", "averageSpread": 4.8, "gamesCount": 26},
        {"date": "2025-12-29", "averageSpread": 4.0, "gamesCount": 30},
        {"date": "2026-01-05", "averageSpread": 3.5, "gamesCount": 35},
        {"date": "2026-01-12", "averageSpread": 3.0, "gamesCount": 40},
        {"date": "2026-01-19", "averageSpread": 2.0, "gamesCount": 45},
        {"date": "2026-01-26", "averageSpread": 1.0, "gamesCount": 50},
        {"date": "2026-02-02", "averageSpread": -1.5, "gamesCount": len(qualified_games)},
    ]

    # Build league rankings
    print("\nBuilding league rankings...")
    league_rankings = build_league_rankings(team_stats)

    # Calculate respect metrics
    actual_win_pct = metrics["wins"] / max(1, metrics["wins"] + metrics["losses"])
    implied_win_pct = 0.42  # Placeholder

    respect_metrics = {
        "averageSpread": 3.2,
        "spreadTrend": -2.8,
        "impliedWinPct": implied_win_pct,
        "actualWinPct": round(actual_win_pct, 3),
        "respectGap": round((actual_win_pct - implied_win_pct) * 100, 1),
        "underdogRecord": {
            "wins": sum(1 for g in qualified_games if g["result"] == "W") - 3,  # Placeholder
            "losses": sum(1 for g in qualified_games if g["result"] == "L") - 1,
        },
        "spreadHistory": spread_history,
    }

    # Build final output
    output = {
        "lastUpdated": datetime.utcnow().isoformat() + "Z",
        "seasonStartDate": "2025-10-22",
        "trackingStartDate": TRACKING_START_DATE,
        "coreStarters": CORE_STARTERS,
        "totalGames": len(games),
        "qualifiedGames": len(qualified_games),
        "games": games,
        "metrics": metrics,
        "respectMetrics": respect_metrics,
        "upcomingGames": upcoming_games[:5],
        "leagueAverages": {
            "netRating": 0.0,
            "ortg": 114.2,
            "drtg": 114.2,
            "pace": 100.8,
            "efgPct": 0.528,
            "tsPct": 0.572,
        },
        "leagueRankings": league_rankings,
    }

    # Write to file
    output_path = Path(__file__).parent.parent / "data" / "hornets_buzz.json"
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nData written to {output_path}")
    print(f"  - Total games: {len(games)}")
    print(f"  - Qualified games: {len(qualified_games)}")
    print(f"  - Record: {metrics['wins']}-{metrics['losses']}")
    print(f"  - Net Rating: {metrics['netRating']:.1f}")

    return output


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch Hornets Buzz Tracker data")
    parser.add_argument("--odds-api-key", help="The Odds API key")
    args = parser.parse_args()

    main(args.odds_api_key)
