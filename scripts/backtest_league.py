#!/usr/bin/env python3
"""
League-Wide Backtest - Test model on ALL NBA games

Fetches game data across the league to see if model biases
are Hornets-specific or general issues.
"""

import json
import math
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple

# NBA API
from nba_api.stats.endpoints import leaguegamefinder, teamgamelogs, leaguedashteamstats
from nba_api.stats.static import teams as nba_teams


SEASON = "2025-26"


def get_all_team_stats() -> Dict[int, Dict]:
    """Get current stats for all teams."""
    print("Fetching team stats (advanced)...")
    time.sleep(0.5)

    # Use Advanced measure type to get NET_RATING, PACE, etc.
    stats = leaguedashteamstats.LeagueDashTeamStats(
        season=SEASON,
        season_type_all_star="Regular Season",
        measure_type_detailed_defense="Advanced"
    )

    df = stats.get_data_frames()[0]
    team_stats = {}

    for _, row in df.iterrows():
        team_id = row['TEAM_ID']
        games = row['GP']
        if games == 0:
            continue

        team_stats[team_id] = {
            'team_name': row['TEAM_NAME'],
            'wins': row['W'],
            'losses': row['L'],
            'net_rating': row.get('NET_RATING', 0),
            'ortg': row.get('OFF_RATING', 110),
            'drtg': row.get('DEF_RATING', 110),
            'pace': row.get('PACE', 100),
        }

    return team_stats


def get_league_games(limit: int = 500) -> List[Dict]:
    """Get recent NBA games."""
    print(f"Fetching up to {limit} NBA games...")
    time.sleep(0.5)

    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=SEASON,
        season_type_nullable="Regular Season",
        league_id_nullable="00"
    )

    df = finder.get_data_frames()[0]

    # Group by game ID to get both teams
    games_by_id = {}
    for _, row in df.iterrows():
        game_id = row['GAME_ID']
        if game_id not in games_by_id:
            games_by_id[game_id] = []
        games_by_id[game_id].append(row)

    games = []
    for game_id, rows in list(games_by_id.items())[:limit]:
        if len(rows) != 2:
            continue

        # Determine home/away
        row1, row2 = rows
        if '@' in str(row1.get('MATCHUP', '')):
            away_row, home_row = row1, row2
        else:
            home_row, away_row = row1, row2

        games.append({
            'game_id': game_id,
            'date': str(row1['GAME_DATE']),
            'home_team_id': home_row['TEAM_ID'],
            'away_team_id': away_row['TEAM_ID'],
            'home_team': home_row['TEAM_NAME'],
            'away_team': away_row['TEAM_NAME'],
            'home_score': home_row['PTS'],
            'away_score': away_row['PTS'],
            'home_win': home_row['WL'] == 'W',
        })

    print(f"  Found {len(games)} complete games")
    return games


def classify_opponent(net_rating: float) -> str:
    """Classify opponent tier."""
    if net_rating >= 6.0:
        return 'elite'
    elif net_rating >= 3.0:
        return 'strong'
    elif net_rating >= -3.0:
        return 'mid'
    return 'weak'


def predict_margin(home_team_stats: Dict, away_team_stats: Dict) -> float:
    """
    Predict margin from home team's perspective.

    Uses simplified version of our model logic:
    - Net rating differential
    - Home court advantage
    - Elite opponent penalty
    - Margin cap
    - Pace adjustment
    """
    # Net rating differential
    home_nr = home_team_stats.get('net_rating', 0)
    away_nr = away_team_stats.get('net_rating', 0)
    nr_diff = home_nr - away_nr

    # Home court advantage (2.5 pts)
    home_advantage = 2.5

    # Elite penalty (if opponent is elite)
    elite_penalty = -2.0 if away_nr >= 6.0 else 0

    # Base prediction
    predicted_margin = nr_diff + home_advantage + elite_penalty

    # Pace adjustment
    home_pace = home_team_stats.get('pace', 100)
    away_pace = away_team_stats.get('pace', 100)
    combined_pace = home_pace + away_pace
    pace_deviation = combined_pace - 200
    pace_multiplier = 1 - max(0, pace_deviation * 0.02)
    predicted_margin *= pace_multiplier

    # Cap at ±15
    predicted_margin = max(-15, min(15, predicted_margin))

    return predicted_margin


def run_league_backtest(games: List[Dict], team_stats: Dict[int, Dict]) -> Tuple[List[Dict], Dict]:
    """Run backtest on league games."""
    results = []

    for game in games:
        home_id = game['home_team_id']
        away_id = game['away_team_id']

        home_stats = team_stats.get(home_id, {})
        away_stats = team_stats.get(away_id, {})

        if not home_stats or not away_stats:
            continue

        # Predict from home team perspective
        predicted_margin = predict_margin(home_stats, away_stats)

        # Actual margin (home perspective)
        actual_margin = game['home_score'] - game['away_score']

        # Error
        error = abs(predicted_margin - actual_margin)

        results.append({
            'game_id': game['game_id'],
            'date': game['date'],
            'home_team': game['home_team'],
            'away_team': game['away_team'],
            'home_nr': home_stats.get('net_rating', 0),
            'away_nr': away_stats.get('net_rating', 0),
            'home_pace': home_stats.get('pace', 100),
            'away_pace': away_stats.get('pace', 100),
            'predicted_margin': round(predicted_margin, 1),
            'actual_margin': actual_margin,
            'error': round(error, 1),
            'home_tier': classify_opponent(home_stats.get('net_rating', 0)),
            'away_tier': classify_opponent(away_stats.get('net_rating', 0)),
            'predicted_correct': (predicted_margin > 0) == (actual_margin > 0),
        })

    # Summary
    if not results:
        return results, {}

    errors = [r['error'] for r in results]
    mae = sum(errors) / len(errors)
    rmse = math.sqrt(sum(e**2 for e in errors) / len(errors))

    # Straight-up accuracy
    correct = sum(1 for r in results if r['predicted_correct'])
    accuracy = correct / len(results)

    summary = {
        'total_games': len(results),
        'mae': round(mae, 2),
        'rmse': round(rmse, 2),
        'straight_up_accuracy': round(accuracy * 100, 1),
    }

    return results, summary


def analyze_league_buckets(results: List[Dict]) -> Dict[str, Dict]:
    """Analyze errors by bucket."""
    buckets = {}

    # By matchup type (elite vs elite, elite vs weak, etc.)
    matchup_types = [
        ('elite_vs_elite', lambda r: r['home_tier'] == 'elite' and r['away_tier'] == 'elite'),
        ('elite_vs_weak', lambda r: (r['home_tier'] == 'elite' and r['away_tier'] == 'weak') or
                                     (r['home_tier'] == 'weak' and r['away_tier'] == 'elite')),
        ('mid_vs_mid', lambda r: r['home_tier'] == 'mid' and r['away_tier'] == 'mid'),
        ('close_matchup', lambda r: abs(r['home_nr'] - r['away_nr']) < 3),
        ('mismatch', lambda r: abs(r['home_nr'] - r['away_nr']) > 8),
    ]

    for name, filter_fn in matchup_types:
        filtered = [r for r in results if filter_fn(r)]
        if filtered:
            errors = [r['error'] for r in filtered]
            buckets[name] = {
                'count': len(filtered),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in filtered) / len(filtered), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in filtered) / len(filtered), 2),
            }

    # By pace
    median_pace = sorted([r['home_pace'] + r['away_pace'] for r in results])[len(results)//2]
    for pace_name, pace_filter in [
        ('high_pace', lambda r: r['home_pace'] + r['away_pace'] > median_pace + 5),
        ('low_pace', lambda r: r['home_pace'] + r['away_pace'] < median_pace - 5),
        ('normal_pace', lambda r: abs((r['home_pace'] + r['away_pace']) - median_pace) <= 5),
    ]:
        pace_results = [r for r in results if pace_filter(r)]
        if pace_results:
            errors = [r['error'] for r in pace_results]
            buckets[pace_name] = {
                'count': len(pace_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in pace_results) / len(pace_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in pace_results) / len(pace_results), 2),
            }

    # Home favorite vs underdog
    for fav_name, fav_filter in [
        ('home_favorite', lambda r: r['predicted_margin'] > 3),
        ('home_underdog', lambda r: r['predicted_margin'] < -3),
        ('toss_up', lambda r: abs(r['predicted_margin']) <= 3),
    ]:
        fav_results = [r for r in results if fav_filter(r)]
        if fav_results:
            errors = [r['error'] for r in fav_results]
            correct = sum(1 for r in fav_results if r['predicted_correct'])
            buckets[fav_name] = {
                'count': len(fav_results),
                'mae': round(sum(errors) / len(errors), 2),
                'accuracy': round(correct / len(fav_results) * 100, 1),
                'avg_predicted': round(sum(r['predicted_margin'] for r in fav_results) / len(fav_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in fav_results) / len(fav_results), 2),
            }

    return buckets


def main():
    print("=" * 70)
    print("LEAGUE-WIDE BACKTEST")
    print("=" * 70)

    # Get team stats
    team_stats = get_all_team_stats()
    print(f"  Loaded stats for {len(team_stats)} teams")

    # Get games
    games = get_league_games(limit=600)

    # Run backtest
    print("\nRunning backtest...")
    results, summary = run_league_backtest(games, team_stats)

    # Print summary
    print("\n" + "=" * 70)
    print("LEAGUE-WIDE RESULTS")
    print("=" * 70)
    print(f"Games analyzed: {summary['total_games']}")
    print(f"MAE: {summary['mae']} points")
    print(f"RMSE: {summary['rmse']} points")
    print(f"Straight-up Accuracy: {summary['straight_up_accuracy']}%")

    # Bucket analysis
    print("\n" + "=" * 70)
    print("BUCKET ANALYSIS")
    print("=" * 70)

    buckets = analyze_league_buckets(results)

    print(f"\n{'Bucket':<20} {'Count':<8} {'MAE':<8} {'Pred Avg':<10} {'Actual Avg':<10} {'Bias':<8}")
    print("-" * 70)

    for bucket_name, stats in sorted(buckets.items()):
        bias = stats['avg_predicted'] - stats['avg_actual']
        bias_str = f"{bias:+.1f}" if abs(bias) >= 1 else "~0"
        acc = f" ({stats.get('accuracy', '-')}%)" if 'accuracy' in stats else ""
        print(f"{bucket_name:<20} {stats['count']:<8} {stats['mae']:<8} {stats['avg_predicted']:>+8.1f}   {stats['avg_actual']:>+8.1f}   {bias_str:<8}{acc}")

    # Compare to Hornets
    print("\n" + "=" * 70)
    print("COMPARISON: LEAGUE vs HORNETS")
    print("=" * 70)

    # Load Hornets backtest
    hornets_path = Path(__file__).parent.parent / "data" / "backtest_results.json"
    if hornets_path.exists():
        with open(hornets_path) as f:
            hornets_data = json.load(f)
        hornets_summary = hornets_data.get('summary', {})

        print(f"\n{'Metric':<25} {'League':<15} {'Hornets':<15} {'Diff':<10}")
        print("-" * 65)
        print(f"{'MAE':<25} {summary['mae']:<15} {hornets_summary.get('mae', 'N/A'):<15} {summary['mae'] - hornets_summary.get('mae', 0):+.2f}")
        print(f"{'RMSE':<25} {summary['rmse']:<15} {hornets_summary.get('rmse', 'N/A'):<15} {summary['rmse'] - hornets_summary.get('rmse', 0):+.2f}")
    else:
        print("(Run backtest.py first for Hornets comparison)")

    # Worst predictions
    print("\n" + "=" * 70)
    print("WORST PREDICTIONS (Top 5 errors)")
    print("=" * 70)

    worst = sorted(results, key=lambda r: r['error'], reverse=True)[:5]
    for r in worst:
        print(f"  {r['date']}: {r['away_team']} @ {r['home_team']}: Predicted {r['predicted_margin']:+.1f}, Actual {r['actual_margin']:+d} (Error: {r['error']:.1f})")

    # Save results
    output_path = Path(__file__).parent.parent / "data" / "backtest_league_results.json"
    with open(output_path, 'w') as f:
        json.dump({
            'summary': summary,
            'buckets': buckets,
            'sample_results': results[:50],  # Save sample, not all
        }, f, indent=2)

    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
