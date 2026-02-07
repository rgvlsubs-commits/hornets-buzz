#!/usr/bin/env python3
"""
NBA Spread Prediction Model Backtester

Tests prediction models against actual NBA results to evaluate accuracy.
Implements and compares:
1. Our current weighted net rating model
2. Elo-based model (538 style)
3. Hybrid model combining both approaches

References:
- FiveThirtyEight Elo: https://fivethirtyeight.com/methodology/how-our-nba-predictions-work/
- Bart Torvik T-Rank: https://barttorvik.com/
"""

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import time

try:
    from nba_api.stats.endpoints import leaguegamefinder, teamgamelog, boxscoreadvancedv3
    from nba_api.stats.static import teams
    import pandas as pd
except ImportError:
    print("Install: pip install nba_api pandas")
    exit(1)


# === Model Parameters ===

# Elo parameters (from 538)
ELO_K_FACTOR = 20
ELO_HOME_ADVANTAGE = 70  # Elo points
ELO_FATIGUE_PENALTY = 46  # Back-to-back penalty
ELO_INITIAL = 1500
ELO_TO_SPREAD = 28  # ~28 Elo points = 1 point spread

# Net Rating parameters
NR_HOME_ADVANTAGE = 2.5  # Points
NR_FATIGUE_PENALTY = 3.0  # Points for back-to-back

# Rolling window weights (current model)
WINDOW_WEIGHTS = {
    'last4': 0.40,
    'last7': 0.30,
    'last10': 0.20,
    'season': 0.10,
}


@dataclass
class TeamState:
    """Track team state for predictions"""
    team_id: int
    name: str
    elo: float = ELO_INITIAL
    games: list = field(default_factory=list)
    last_game_date: Optional[str] = None

    def get_rolling_net_rating(self, window: int) -> float:
        """Get net rating for last N games"""
        recent = self.games[-window:] if len(self.games) >= window else self.games
        if not recent:
            return 0.0
        return sum(g['net_rating'] for g in recent) / len(recent)

    def get_weighted_net_rating(self) -> float:
        """Get weighted net rating like our current model"""
        nr4 = self.get_rolling_net_rating(4)
        nr7 = self.get_rolling_net_rating(7)
        nr10 = self.get_rolling_net_rating(10)
        nr_season = self.get_rolling_net_rating(len(self.games))

        return (
            nr4 * WINDOW_WEIGHTS['last4'] +
            nr7 * WINDOW_WEIGHTS['last7'] +
            nr10 * WINDOW_WEIGHTS['last10'] +
            nr_season * WINDOW_WEIGHTS['season']
        )

    def is_back_to_back(self, game_date: str) -> bool:
        """Check if this is a back-to-back game"""
        if not self.last_game_date:
            return False
        try:
            last = datetime.strptime(self.last_game_date, "%Y-%m-%d")
            current = datetime.strptime(game_date, "%Y-%m-%d")
            return (current - last).days == 1
        except:
            return False


@dataclass
class Prediction:
    """Single game prediction"""
    game_id: str
    date: str
    home_team: str
    away_team: str
    spread: float  # Positive = home favored

    # Predictions
    elo_pred_spread: float = 0.0
    nr_pred_spread: float = 0.0
    hybrid_pred_spread: float = 0.0

    # Actual result
    home_score: int = 0
    away_score: int = 0
    actual_margin: int = 0  # Home - Away

    # Evaluation
    elo_error: float = 0.0
    nr_error: float = 0.0
    hybrid_error: float = 0.0

    elo_covered: Optional[bool] = None
    nr_covered: Optional[bool] = None
    hybrid_covered: Optional[bool] = None


def elo_win_probability(elo_diff: float) -> float:
    """Convert Elo difference to win probability (538 formula)"""
    return 1.0 / (1.0 + 10 ** (-elo_diff / 400))


def elo_to_spread(elo_diff: float) -> float:
    """Convert Elo difference to point spread"""
    return elo_diff / ELO_TO_SPREAD


def update_elo(winner_elo: float, loser_elo: float, margin: int,
               winner_home: bool) -> tuple[float, float]:
    """
    Update Elo ratings after a game (538 formula)

    Margin of victory multiplier:
    ((MOV + 3) ^ 0.8) / (7.5 + 0.006 * EloDiff)
    """
    # Adjust for home court
    elo_diff = winner_elo - loser_elo
    if winner_home:
        elo_diff += ELO_HOME_ADVANTAGE
    else:
        elo_diff -= ELO_HOME_ADVANTAGE

    # Expected win probability
    expected = elo_win_probability(elo_diff)

    # Margin of victory multiplier (538 formula)
    mov_mult = ((abs(margin) + 3) ** 0.8) / (7.5 + 0.006 * abs(elo_diff))

    # Elo shift
    shift = ELO_K_FACTOR * mov_mult * (1 - expected)

    new_winner_elo = winner_elo + shift
    new_loser_elo = loser_elo - shift

    return new_winner_elo, new_loser_elo


def fetch_nba_games(season: str = "2025-26", start_date: str = "2025-10-01"):
    """Fetch all NBA games for backtesting"""
    print(f"Fetching NBA games for {season} season...")

    all_games = []
    nba_teams = {t['id']: t for t in teams.get_teams()}

    # Fetch games using leaguegamefinder
    time.sleep(0.5)
    game_finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        league_id_nullable='00',
        season_type_nullable='Regular Season'
    )

    games_df = game_finder.get_data_frames()[0]

    # Group by game ID to get both teams
    game_ids = games_df['GAME_ID'].unique()

    print(f"Found {len(game_ids)} games")

    for game_id in game_ids:
        game_rows = games_df[games_df['GAME_ID'] == game_id]
        if len(game_rows) != 2:
            continue

        # Determine home/away
        row1 = game_rows.iloc[0]
        row2 = game_rows.iloc[1]

        # Home team has 'vs.' in matchup
        if 'vs.' in row1['MATCHUP']:
            home_row, away_row = row1, row2
        else:
            home_row, away_row = row2, row1

        game_date = home_row['GAME_DATE']

        # Skip if before start date
        if game_date < start_date:
            continue

        all_games.append({
            'game_id': game_id,
            'date': game_date,
            'home_team_id': home_row['TEAM_ID'],
            'away_team_id': away_row['TEAM_ID'],
            'home_team': nba_teams.get(home_row['TEAM_ID'], {}).get('nickname', 'Unknown'),
            'away_team': nba_teams.get(away_row['TEAM_ID'], {}).get('nickname', 'Unknown'),
            'home_score': int(home_row['PTS']),
            'away_score': int(away_row['PTS']),
            'home_wl': home_row['WL'],
        })

    # Sort by date
    all_games.sort(key=lambda g: g['date'])

    return all_games


def run_backtest(games: list, verbose: bool = False) -> dict:
    """
    Run backtest on historical games

    Returns metrics for each model
    """
    # Initialize team states
    team_states = {}
    for t in teams.get_teams():
        team_states[t['id']] = TeamState(
            team_id=t['id'],
            name=t['nickname']
        )

    predictions = []

    for i, game in enumerate(games):
        home_id = game['home_team_id']
        away_id = game['away_team_id']

        home_state = team_states.get(home_id)
        away_state = team_states.get(away_id)

        if not home_state or not away_state:
            continue

        # Skip first few games per team (need history)
        if len(home_state.games) < 4 or len(away_state.games) < 4:
            # Still update state
            margin = game['home_score'] - game['away_score']

            # Update Elo
            if margin > 0:
                home_state.elo, away_state.elo = update_elo(
                    home_state.elo, away_state.elo, margin, True
                )
            else:
                away_state.elo, home_state.elo = update_elo(
                    away_state.elo, home_state.elo, -margin, False
                )

            # Add to game history (placeholder net rating)
            home_state.games.append({'net_rating': margin / 2, 'date': game['date']})
            away_state.games.append({'net_rating': -margin / 2, 'date': game['date']})
            home_state.last_game_date = game['date']
            away_state.last_game_date = game['date']
            continue

        # === Make Predictions ===

        # 1. Elo-based prediction
        elo_diff = home_state.elo - away_state.elo + ELO_HOME_ADVANTAGE

        # Fatigue adjustments
        if home_state.is_back_to_back(game['date']):
            elo_diff -= ELO_FATIGUE_PENALTY
        if away_state.is_back_to_back(game['date']):
            elo_diff += ELO_FATIGUE_PENALTY

        elo_pred_spread = elo_to_spread(elo_diff)

        # 2. Net Rating prediction (our current model)
        home_nr = home_state.get_weighted_net_rating()
        away_nr = away_state.get_weighted_net_rating()
        nr_diff = home_nr - away_nr + NR_HOME_ADVANTAGE

        # Fatigue adjustments
        if home_state.is_back_to_back(game['date']):
            nr_diff -= NR_FATIGUE_PENALTY
        if away_state.is_back_to_back(game['date']):
            nr_diff += NR_FATIGUE_PENALTY

        nr_pred_spread = nr_diff

        # 3. Hybrid model (blend Elo and NR)
        # Weight: 40% Elo, 60% Net Rating (Elo for stability, NR for recency)
        hybrid_pred_spread = 0.4 * elo_pred_spread + 0.6 * nr_pred_spread

        # Estimate what the spread "should" be based on Elo
        # (In reality, we'd use actual Vegas lines)
        estimated_spread = elo_pred_spread * 0.8  # Conservative estimate

        # Create prediction
        actual_margin = game['home_score'] - game['away_score']

        pred = Prediction(
            game_id=game['game_id'],
            date=game['date'],
            home_team=game['home_team'],
            away_team=game['away_team'],
            spread=estimated_spread,
            elo_pred_spread=elo_pred_spread,
            nr_pred_spread=nr_pred_spread,
            hybrid_pred_spread=hybrid_pred_spread,
            home_score=game['home_score'],
            away_score=game['away_score'],
            actual_margin=actual_margin,
        )

        # Calculate errors (predicted spread vs actual margin)
        pred.elo_error = abs(elo_pred_spread - actual_margin)
        pred.nr_error = abs(nr_pred_spread - actual_margin)
        pred.hybrid_error = abs(hybrid_pred_spread - actual_margin)

        # Did we predict the right side?
        pred.elo_covered = (elo_pred_spread > 0) == (actual_margin > 0) if actual_margin != 0 else None
        pred.nr_covered = (nr_pred_spread > 0) == (actual_margin > 0) if actual_margin != 0 else None
        pred.hybrid_covered = (hybrid_pred_spread > 0) == (actual_margin > 0) if actual_margin != 0 else None

        predictions.append(pred)

        if verbose and i % 100 == 0:
            print(f"Processed {i}/{len(games)} games...")

        # === Update team states with actual result ===
        margin = actual_margin

        # Update Elo
        if margin > 0:
            home_state.elo, away_state.elo = update_elo(
                home_state.elo, away_state.elo, margin, True
            )
        else:
            away_state.elo, home_state.elo = update_elo(
                away_state.elo, home_state.elo, -margin, False
            )

        # Add to game history (use actual net rating estimate)
        home_state.games.append({'net_rating': margin, 'date': game['date']})
        away_state.games.append({'net_rating': -margin, 'date': game['date']})
        home_state.last_game_date = game['date']
        away_state.last_game_date = game['date']

    # === Calculate metrics ===
    if not predictions:
        return {'error': 'No predictions made'}

    valid_preds = [p for p in predictions if p.elo_covered is not None]

    metrics = {
        'total_games': len(predictions),
        'evaluated_games': len(valid_preds),

        # Mean Absolute Error
        'elo_mae': sum(p.elo_error for p in predictions) / len(predictions),
        'nr_mae': sum(p.nr_error for p in predictions) / len(predictions),
        'hybrid_mae': sum(p.hybrid_error for p in predictions) / len(predictions),

        # Accuracy (picking the right side)
        'elo_accuracy': sum(1 for p in valid_preds if p.elo_covered) / len(valid_preds),
        'nr_accuracy': sum(1 for p in valid_preds if p.nr_covered) / len(valid_preds),
        'hybrid_accuracy': sum(1 for p in valid_preds if p.hybrid_covered) / len(valid_preds),

        # Root Mean Square Error
        'elo_rmse': math.sqrt(sum(p.elo_error**2 for p in predictions) / len(predictions)),
        'nr_rmse': math.sqrt(sum(p.nr_error**2 for p in predictions) / len(predictions)),
        'hybrid_rmse': math.sqrt(sum(p.hybrid_error**2 for p in predictions) / len(predictions)),
    }

    # Final Elo ratings
    top_teams = sorted(team_states.values(), key=lambda t: t.elo, reverse=True)[:10]
    metrics['top_elo_teams'] = [(t.name, round(t.elo, 1)) for t in top_teams]

    return metrics, predictions, team_states


def analyze_results(metrics: dict, predictions: list):
    """Analyze and print backtest results"""
    print("\n" + "=" * 60)
    print("BACKTEST RESULTS")
    print("=" * 60)

    print(f"\nGames analyzed: {metrics['total_games']}")
    print(f"Games with valid predictions: {metrics['evaluated_games']}")

    print("\n--- Mean Absolute Error (lower is better) ---")
    print(f"Elo Model:    {metrics['elo_mae']:.2f} points")
    print(f"NR Model:     {metrics['nr_mae']:.2f} points")
    print(f"Hybrid Model: {metrics['hybrid_mae']:.2f} points")

    print("\n--- Accuracy (picking winner) ---")
    print(f"Elo Model:    {metrics['elo_accuracy']*100:.1f}%")
    print(f"NR Model:     {metrics['nr_accuracy']*100:.1f}%")
    print(f"Hybrid Model: {metrics['hybrid_accuracy']*100:.1f}%")

    print("\n--- RMSE (lower is better) ---")
    print(f"Elo Model:    {metrics['elo_rmse']:.2f}")
    print(f"NR Model:     {metrics['nr_rmse']:.2f}")
    print(f"Hybrid Model: {metrics['hybrid_rmse']:.2f}")

    print("\n--- Top 10 Teams by Elo ---")
    for i, (name, elo) in enumerate(metrics['top_elo_teams'], 1):
        print(f"{i:2}. {name}: {elo}")

    # Recommendations
    print("\n" + "=" * 60)
    print("RECOMMENDATIONS")
    print("=" * 60)

    best_mae = min(metrics['elo_mae'], metrics['nr_mae'], metrics['hybrid_mae'])
    best_acc = max(metrics['elo_accuracy'], metrics['nr_accuracy'], metrics['hybrid_accuracy'])

    if metrics['hybrid_mae'] == best_mae:
        print("- Hybrid model has lowest MAE - recommend using blended approach")
    elif metrics['elo_mae'] == best_mae:
        print("- Elo model has lowest MAE - consider weighting Elo higher")
    else:
        print("- NR model has lowest MAE - current approach is solid")

    if metrics['hybrid_accuracy'] == best_acc:
        print("- Hybrid model best at picking winners")

    print("\nSuggested model improvements:")
    print("1. Add fatigue adjustment (back-to-back penalty)")
    print("2. Incorporate Elo for long-term team strength")
    print("3. Use margin of victory multiplier for recency weighting")
    print("4. Add travel distance penalty")
    print("5. Consider altitude bonus for Denver home games")


def main():
    print("NBA Prediction Model Backtester")
    print("-" * 40)

    # Fetch games
    games = fetch_nba_games(season="2025-26", start_date="2025-10-22")

    if not games:
        print("No games found!")
        return

    print(f"\nFetched {len(games)} games from 2025-26 season")
    print(f"Date range: {games[0]['date']} to {games[-1]['date']}")

    # Run backtest
    print("\nRunning backtest...")
    metrics, predictions, team_states = run_backtest(games, verbose=True)

    # Analyze results
    analyze_results(metrics, predictions)

    # Save results
    output = {
        'metrics': metrics,
        'model_params': {
            'elo_k_factor': ELO_K_FACTOR,
            'elo_home_advantage': ELO_HOME_ADVANTAGE,
            'elo_fatigue_penalty': ELO_FATIGUE_PENALTY,
            'nr_home_advantage': NR_HOME_ADVANTAGE,
            'nr_fatigue_penalty': NR_FATIGUE_PENALTY,
            'window_weights': WINDOW_WEIGHTS,
        },
        'run_date': datetime.now().isoformat(),
    }

    output_path = Path(__file__).parent.parent / "data" / "backtest_results.json"
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
