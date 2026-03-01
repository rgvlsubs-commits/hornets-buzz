#!/usr/bin/env python3
"""
League-Wide Walk-Forward Data Fetcher

Fetches all 2025-26 NBA games and computes walk-forward rolling stats
for every team. For each game, snapshots both teams' stats BEFORE updating
with the result — ensuring zero look-ahead bias.

Output: data/league_walkforward.json

Usage: python scripts/fetch_league_walkforward.py
"""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from nba_api.stats.endpoints import leaguegamefinder, teamgamelogs
from nba_api.stats.static import teams as nba_teams


SEASON = "2025-26"
MIN_PRIOR_GAMES = 10  # Skip games where either team has < 10 prior games
HORNETS_TEAM_ID = 1610612766

# NBA team ID → abbreviation lookup
TEAM_ID_TO_ABBREV = {t["id"]: t["abbreviation"] for t in nba_teams.get_teams()}
TEAM_ID_TO_NAME = {t["id"]: t["full_name"] for t in nba_teams.get_teams()}


class TeamState:
    """Track per-team state for walk-forward simulation."""

    def __init__(self, team_id: int):
        self.team_id = team_id
        self.abbrev = TEAM_ID_TO_ABBREV.get(team_id, "UNK")
        self.name = TEAM_ID_TO_NAME.get(team_id, "Unknown")
        self.wins = 0
        self.losses = 0
        self.total_point_diff = 0
        self.games: List[Dict] = []  # chronological list of {nr, pace, date}
        self.last_game_date: Optional[str] = None

    @property
    def games_played(self) -> int:
        return len(self.games)

    def rolling_nr(self, window: int) -> float:
        """Average net rating over the last `window` games."""
        if not self.games:
            return 0.0
        recent = self.games[-window:]
        return sum(g["nr"] for g in recent) / len(recent)

    def rolling_pace(self, window: int = 10) -> float:
        """Average pace over the last `window` games."""
        if not self.games:
            return 100.0
        recent = self.games[-window:]
        return sum(g["pace"] for g in recent) / len(recent)

    def rest_days(self, game_date: str) -> int:
        """Days since last game."""
        if not self.last_game_date:
            return 3  # default for first game
        try:
            last = datetime.strptime(self.last_game_date, "%Y-%m-%d")
            current = datetime.strptime(game_date, "%Y-%m-%d")
            return (current - last).days
        except (ValueError, TypeError):
            return 3

    def is_back_to_back(self, game_date: str) -> bool:
        return self.rest_days(game_date) == 1

    def snapshot(self, game_date: str) -> Optional[Dict]:
        """Take a snapshot of current state BEFORE this game. Returns None if < MIN_PRIOR_GAMES."""
        if self.games_played < MIN_PRIOR_GAMES:
            return None

        gp = self.games_played
        return {
            "gamesPlayed": gp,
            "wins": self.wins,
            "losses": self.losses,
            "totalPointDiff": self.total_point_diff,
            "rollingNR": {
                "last4": round(self.rolling_nr(4), 2),
                "last7": round(self.rolling_nr(7), 2),
                "last10": round(self.rolling_nr(10), 2),
                "season": round(self.rolling_nr(gp), 2),
            },
            "pace": round(self.rolling_pace(10), 1),
            "isBackToBack": self.is_back_to_back(game_date),
            "restDays": self.rest_days(game_date),
        }

    def update(self, game_date: str, nr: float, pace: float, won: bool, point_diff: int):
        """Update state AFTER the game."""
        self.games.append({"nr": nr, "pace": pace, "date": game_date})
        self.last_game_date = game_date
        self.total_point_diff += point_diff
        if won:
            self.wins += 1
        else:
            self.losses += 1


def fetch_game_results() -> List[Dict]:
    """Fetch all game results for the season via leaguegamefinder."""
    print("Fetching game results (leaguegamefinder)...")
    time.sleep(0.6)

    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=SEASON,
        season_type_nullable="Regular Season",
        league_id_nullable="00",
    )
    df = finder.get_data_frames()[0]
    print(f"  Raw rows: {len(df)}")

    # Group by game ID to pair home/away
    games_by_id: Dict[str, List] = {}
    for _, row in df.iterrows():
        gid = row["GAME_ID"]
        if gid not in games_by_id:
            games_by_id[gid] = []
        games_by_id[gid].append(row)

    games = []
    for gid, rows in games_by_id.items():
        if len(rows) != 2:
            continue

        r1, r2 = rows[0], rows[1]

        # Determine home/away: home team has "vs." in MATCHUP
        if "vs." in str(r1.get("MATCHUP", "")):
            home_row, away_row = r1, r2
        elif "vs." in str(r2.get("MATCHUP", "")):
            home_row, away_row = r2, r1
        else:
            # Fallback: check for "@"
            if "@" in str(r1.get("MATCHUP", "")):
                away_row, home_row = r1, r2
            else:
                home_row, away_row = r1, r2

        games.append({
            "game_id": gid,
            "date": str(home_row["GAME_DATE"]),
            "home_team_id": int(home_row["TEAM_ID"]),
            "away_team_id": int(away_row["TEAM_ID"]),
            "home_score": int(home_row["PTS"]),
            "away_score": int(away_row["PTS"]),
            "home_wl": home_row["WL"],
        })

    # Sort chronologically
    games.sort(key=lambda g: g["date"])
    print(f"  Paired games: {len(games)}")
    return games


def fetch_advanced_gamelogs() -> Dict[str, Dict]:
    """
    Fetch per-game advanced stats (ORTG, DRTG, NR, Pace) for every team.
    Returns dict keyed by (team_id, game_id) → {nr, pace, ortg, drtg}.
    """
    print("Fetching advanced game logs (teamgamelogs)...")
    time.sleep(0.6)

    logs = teamgamelogs.TeamGameLogs(
        season_nullable=SEASON,
        season_type_nullable="Regular Season",
        measure_type_player_game_logs_nullable="Advanced",
    )
    df = logs.get_data_frames()[0]
    print(f"  Advanced log rows: {len(df)}")

    lookup: Dict[str, Dict] = {}
    for _, row in df.iterrows():
        team_id = int(row["TEAM_ID"])
        game_id = str(row["GAME_ID"])
        key = f"{team_id}_{game_id}"

        nr = float(row.get("NET_RATING", 0) or 0)
        pace = float(row.get("PACE", 100) or 100)
        ortg = float(row.get("OFF_RATING", 110) or 110)
        drtg = float(row.get("DEF_RATING", 110) or 110)

        lookup[key] = {"nr": nr, "pace": pace, "ortg": ortg, "drtg": drtg}

    return lookup


def build_walkforward(games: List[Dict], adv_lookup: Dict[str, Dict]) -> List[Dict]:
    """
    Walk through games chronologically, snapshot both teams BEFORE updating,
    then update with the result. Returns list of predictable game records.
    """
    # Initialize team states for all 30 teams
    team_states: Dict[int, TeamState] = {}
    for t in nba_teams.get_teams():
        team_states[t["id"]] = TeamState(t["id"])

    output_games = []
    skipped_early = 0
    skipped_no_adv = 0

    for game in games:
        home_id = game["home_team_id"]
        away_id = game["away_team_id"]
        game_id = game["game_id"]
        game_date = game["date"]

        home_state = team_states.get(home_id)
        away_state = team_states.get(away_id)
        if not home_state or not away_state:
            continue

        # Snapshot BEFORE updating (walk-forward: no look-ahead)
        home_snap = home_state.snapshot(game_date)
        away_snap = away_state.snapshot(game_date)

        # Look up advanced stats for this game
        home_adv = adv_lookup.get(f"{home_id}_{game_id}")
        away_adv = adv_lookup.get(f"{away_id}_{game_id}")

        # Determine per-game NR and pace
        # Prefer advanced stats; fallback to score-based estimate
        home_score = game["home_score"]
        away_score = game["away_score"]
        margin = home_score - away_score

        if home_adv:
            home_nr = home_adv["nr"]
            home_pace = home_adv["pace"]
        else:
            home_nr = margin / 2.0  # rough estimate
            home_pace = 100.0
            skipped_no_adv += 1

        if away_adv:
            away_nr = away_adv["nr"]
            away_pace = away_adv["pace"]
        else:
            away_nr = -margin / 2.0
            away_pace = 100.0

        # Update team states with this game's result
        home_won = home_score > away_score
        home_state.update(game_date, home_nr, home_pace, home_won, margin)
        away_state.update(game_date, away_nr, away_pace, not home_won, -margin)

        # Only output if both teams had enough prior games for a snapshot
        if home_snap is None or away_snap is None:
            skipped_early += 1
            continue

        is_hornets = home_id == HORNETS_TEAM_ID or away_id == HORNETS_TEAM_ID

        output_games.append({
            "gameId": game_id,
            "date": game_date,
            "homeTeamId": home_id,
            "awayTeamId": away_id,
            "homeAbbrev": TEAM_ID_TO_ABBREV.get(home_id, "UNK"),
            "awayAbbrev": TEAM_ID_TO_ABBREV.get(away_id, "UNK"),
            "homeScore": home_score,
            "awayScore": away_score,
            "actualMargin": margin,
            "homeSnapshot": home_snap,
            "awaySnapshot": away_snap,
            "isHornetsGame": is_hornets,
        })

    print(f"  Skipped (< {MIN_PRIOR_GAMES} prior games): {skipped_early}")
    if skipped_no_adv > 0:
        print(f"  Missing advanced stats (used fallback): {skipped_no_adv}")
    print(f"  Predictable games: {len(output_games)}")

    return output_games


def main():
    print("=" * 60)
    print("LEAGUE-WIDE WALK-FORWARD DATA FETCH")
    print(f"Season: {SEASON}")
    print("=" * 60)

    # Step 1: Fetch game results
    games = fetch_game_results()

    # Step 2: Fetch advanced game logs
    adv_lookup = fetch_advanced_gamelogs()

    # Step 3: Build walk-forward dataset
    print("\nBuilding walk-forward dataset...")
    output_games = build_walkforward(games, adv_lookup)

    # Count stats
    hornets_count = sum(1 for g in output_games if g["isHornetsGame"])
    non_hornets_count = len(output_games) - hornets_count

    # Save output
    output = {
        "metadata": {
            "season": SEASON,
            "generatedAt": datetime.now().isoformat(),
            "totalGamesInSeason": len(games),
            "predictableGames": len(output_games),
            "hornetsGames": hornets_count,
            "nonHornetsGames": non_hornets_count,
            "minPriorGames": MIN_PRIOR_GAMES,
        },
        "games": output_games,
    }

    output_path = Path(__file__).parent.parent / "data" / "league_walkforward.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(output_games)} games to {output_path}")
    print(f"  Hornets games: {hornets_count}")
    print(f"  Non-Hornets games: {non_hornets_count}")
    print("Done!")


if __name__ == "__main__":
    main()
