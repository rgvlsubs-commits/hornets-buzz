#!/usr/bin/env python3
"""
Backtest Script - Measure MAE and analyze errors by bucket

Analyzes prediction accuracy across different game situations:
- By opponent tier (elite/strong/mid/weak)
- By home/away
- By rest days
- By favorite/underdog status

Outputs:
- Overall MAE
- MAE by bucket
- Identifies systematic biases
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass


@dataclass
class GameResult:
    """A completed game with prediction and actual result."""
    game_id: str
    date: str
    opponent: str
    is_home: bool
    is_qualified: bool

    # Actual results
    actual_margin: int  # Hornets score - Opponent score
    spread: float | None
    covered: bool | None

    # Context
    opponent_net_rating: float
    opponent_pace: float
    rest_days: int
    is_back_to_back: bool
    pace: float

    # For prediction
    net_rating: float


def load_data() -> Dict:
    """Load the hornets_buzz.json data."""
    data_path = Path(__file__).parent.parent / "data" / "hornets_buzz.json"
    with open(data_path) as f:
        return json.load(f)


def classify_opponent(net_rating: float) -> str:
    """Classify opponent tier."""
    if net_rating >= 6.0:
        return 'elite'
    elif net_rating >= 3.0:
        return 'strong'
    elif net_rating >= -3.0:
        return 'mid'
    return 'weak'


def simple_predict_margin(game: Dict, hornets_metrics: Dict) -> float:
    """
    Simple margin prediction using current model logic.

    This replicates the key logic from model.ts in Python for backtesting.
    """
    # Hornets baseline from recent performance
    hornets_nr = hornets_metrics.get('netRating', 0)

    # Opponent strength adjustment
    opp_nr = game.get('opponentNetRating', 0)
    opp_adjustment = -opp_nr

    # Elite opponent penalty
    elite_penalty = -2.0 if opp_nr >= 6.0 else 0

    # Home/away adjustment
    home_adj = 2.5 if game.get('isHome', False) else -2.5

    # Fatigue adjustment
    rest_days = game.get('restDays', 1)
    if rest_days == 0:  # Back-to-back
        fatigue_adj = -3.0
    elif rest_days >= 2:
        fatigue_adj = 1.0
    else:
        fatigue_adj = 0

    # Core 5 risk penalties (survivorship + bench)
    risk_penalty = -1.25 if game.get('isQualified', False) else 0

    # Base prediction
    predicted_margin = hornets_nr + opp_adjustment + elite_penalty + home_adj + fatigue_adj + risk_penalty

    # Pace adjustment
    hornets_pace = game.get('pace', 100)
    opp_pace = game.get('opponentPace', 100)
    combined_pace = hornets_pace + opp_pace
    pace_deviation = combined_pace - 200
    pace_multiplier = 1 - max(0, pace_deviation * 0.02)
    predicted_margin *= pace_multiplier

    # Cap at ±15
    predicted_margin = max(-15, min(15, predicted_margin))

    return predicted_margin


def calculate_rolling_metrics(games: List[Dict], window: int, qualified_only: bool = True) -> Dict:
    """Calculate rolling metrics from games."""
    filtered = [g for g in games if not qualified_only or g.get('isQualified', False)]
    window_games = filtered[:window]

    if not window_games:
        return {'netRating': 0, 'games': 0}

    return {
        'netRating': sum(g.get('netRating', 0) for g in window_games) / len(window_games),
        'games': len(window_games),
    }


def run_backtest(games: List[Dict]) -> Tuple[List[Dict], Dict]:
    """
    Run backtest on all games.

    Returns:
        - List of prediction results
        - Summary statistics
    """
    results = []

    # Sort games by date (oldest first for chronological backtest)
    sorted_games = sorted(games, key=lambda g: g['date'])

    for i, game in enumerate(sorted_games):
        # Use only games BEFORE this one for prediction
        prior_games = sorted_games[:i]
        if len(prior_games) < 5:
            continue  # Need some history

        # Calculate metrics from prior games
        metrics = calculate_rolling_metrics(prior_games[-15:], 15, qualified_only=True)

        # Make prediction
        predicted_margin = simple_predict_margin(game, metrics)

        # Get actual result
        actual_margin = game.get('hornetsScore', 0) - game.get('opponentScore', 0)

        # Calculate error
        error = abs(predicted_margin - actual_margin)

        results.append({
            'game_id': game.get('gameId', ''),
            'date': game.get('date', ''),
            'opponent': game.get('opponent', ''),
            'is_home': game.get('isHome', False),
            'is_qualified': game.get('isQualified', False),
            'predicted_margin': round(predicted_margin, 1),
            'actual_margin': actual_margin,
            'error': round(error, 1),
            'opponent_tier': classify_opponent(game.get('opponentNetRating', 0)),
            'opponent_net_rating': game.get('opponentNetRating', 0),
            'rest_days': game.get('restDays', 1),
            'pace': game.get('pace', 100),
            'opponent_pace': game.get('opponentPace', 100),
            'spread': game.get('spread'),
            'covered': game.get('coveredSpread'),
        })

    # Calculate summary stats
    if not results:
        return results, {}

    errors = [r['error'] for r in results]
    mae = sum(errors) / len(errors)
    rmse = math.sqrt(sum(e**2 for e in errors) / len(errors))

    # ATS accuracy (for games with spreads)
    ats_results = [r for r in results if r['spread'] is not None]
    if ats_results:
        # Predicted cover: predicted_margin + spread > 0
        correct_ats = sum(
            1 for r in ats_results
            if (r['predicted_margin'] + r['spread'] > 0) == (r['actual_margin'] + r['spread'] > 0)
        )
        ats_accuracy = correct_ats / len(ats_results)
    else:
        ats_accuracy = None

    summary = {
        'total_games': len(results),
        'mae': round(mae, 2),
        'rmse': round(rmse, 2),
        'ats_accuracy': round(ats_accuracy * 100, 1) if ats_accuracy else None,
    }

    return results, summary


def analyze_by_bucket(results: List[Dict]) -> Dict[str, Dict]:
    """Analyze errors by different buckets."""
    buckets = {}

    # By opponent tier
    for tier in ['elite', 'strong', 'mid', 'weak']:
        tier_results = [r for r in results if r['opponent_tier'] == tier]
        if tier_results:
            errors = [r['error'] for r in tier_results]
            buckets[f'vs_{tier}'] = {
                'count': len(tier_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in tier_results) / len(tier_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in tier_results) / len(tier_results), 2),
            }

    # By home/away
    for location, is_home in [('home', True), ('away', False)]:
        loc_results = [r for r in results if r['is_home'] == is_home]
        if loc_results:
            errors = [r['error'] for r in loc_results]
            buckets[location] = {
                'count': len(loc_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in loc_results) / len(loc_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in loc_results) / len(loc_results), 2),
            }

    # By rest
    for rest_name, rest_filter in [('back_to_back', lambda r: r['rest_days'] == 0),
                                    ('1_day_rest', lambda r: r['rest_days'] == 1),
                                    ('2plus_rest', lambda r: r['rest_days'] >= 2)]:
        rest_results = [r for r in results if rest_filter(r)]
        if rest_results:
            errors = [r['error'] for r in rest_results]
            buckets[rest_name] = {
                'count': len(rest_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in rest_results) / len(rest_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in rest_results) / len(rest_results), 2),
            }

    # By qualified (Core 5)
    for qual_name, is_qual in [('core5', True), ('missing_starters', False)]:
        qual_results = [r for r in results if r['is_qualified'] == is_qual]
        if qual_results:
            errors = [r['error'] for r in qual_results]
            buckets[qual_name] = {
                'count': len(qual_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in qual_results) / len(qual_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in qual_results) / len(qual_results), 2),
            }

    # By pace (high vs low)
    median_pace = sorted([r['pace'] + r['opponent_pace'] for r in results])[len(results)//2]
    for pace_name, pace_filter in [('high_pace', lambda r: r['pace'] + r['opponent_pace'] > median_pace),
                                   ('low_pace', lambda r: r['pace'] + r['opponent_pace'] <= median_pace)]:
        pace_results = [r for r in results if pace_filter(r)]
        if pace_results:
            errors = [r['error'] for r in pace_results]
            buckets[pace_name] = {
                'count': len(pace_results),
                'mae': round(sum(errors) / len(errors), 2),
                'avg_predicted': round(sum(r['predicted_margin'] for r in pace_results) / len(pace_results), 2),
                'avg_actual': round(sum(r['actual_margin'] for r in pace_results) / len(pace_results), 2),
            }

    return buckets


def identify_biases(buckets: Dict[str, Dict]) -> List[str]:
    """Identify systematic biases from bucket analysis."""
    biases = []

    for bucket_name, stats in buckets.items():
        diff = stats['avg_predicted'] - stats['avg_actual']
        if abs(diff) >= 3:
            direction = "overpredict" if diff > 0 else "underpredict"
            biases.append(f"{bucket_name}: {direction} by {abs(diff):.1f} pts (n={stats['count']})")

    return biases


def main():
    print("=" * 70)
    print("HORNETS BUZZ - BACKTEST ANALYSIS")
    print("=" * 70)

    # Load data
    data = load_data()
    games = data.get('games', [])

    print(f"\nLoaded {len(games)} games")

    # Run backtest
    print("\nRunning backtest...")
    results, summary = run_backtest(games)

    # Print summary
    print("\n" + "=" * 70)
    print("OVERALL RESULTS")
    print("=" * 70)
    print(f"Games analyzed: {summary['total_games']}")
    print(f"MAE: {summary['mae']} points")
    print(f"RMSE: {summary['rmse']} points")
    if summary['ats_accuracy']:
        print(f"ATS Accuracy: {summary['ats_accuracy']}%")

    # Bucket analysis
    print("\n" + "=" * 70)
    print("BUCKET ANALYSIS (Error by Situation)")
    print("=" * 70)

    buckets = analyze_by_bucket(results)

    print(f"\n{'Bucket':<20} {'Count':<8} {'MAE':<8} {'Pred Avg':<10} {'Actual Avg':<10} {'Bias':<8}")
    print("-" * 70)

    for bucket_name, stats in sorted(buckets.items()):
        bias = stats['avg_predicted'] - stats['avg_actual']
        bias_str = f"{bias:+.1f}" if abs(bias) >= 1 else "~0"
        print(f"{bucket_name:<20} {stats['count']:<8} {stats['mae']:<8} {stats['avg_predicted']:>+8.1f}   {stats['avg_actual']:>+8.1f}   {bias_str:<8}")

    # Identify biases
    print("\n" + "=" * 70)
    print("SYSTEMATIC BIASES (>3 pts difference)")
    print("=" * 70)

    biases = identify_biases(buckets)
    if biases:
        for bias in biases:
            print(f"  - {bias}")
    else:
        print("  No major systematic biases detected.")

    # Worst predictions
    print("\n" + "=" * 70)
    print("WORST PREDICTIONS (Top 5 errors)")
    print("=" * 70)

    worst = sorted(results, key=lambda r: r['error'], reverse=True)[:5]
    for r in worst:
        loc = "vs" if r['is_home'] else "@"
        print(f"  {r['date']} {loc} {r['opponent']}: Predicted {r['predicted_margin']:+.1f}, Actual {r['actual_margin']:+d} (Error: {r['error']:.1f})")

    # Save detailed results
    output_path = Path(__file__).parent.parent / "data" / "backtest_results.json"
    with open(output_path, 'w') as f:
        json.dump({
            'summary': summary,
            'buckets': buckets,
            'biases': biases,
            'results': results,
        }, f, indent=2)

    print(f"\nDetailed results saved to: {output_path}")


if __name__ == "__main__":
    main()
