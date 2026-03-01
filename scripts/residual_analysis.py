#!/usr/bin/env python3
"""
Style Dimension Residual Analysis

Checks whether opponent style dimensions correlate with the model's
prediction errors. If the model systematically misses in certain style
matchups, this analysis will surface it.

Analyzes:
- Pearson r between each style dimension and prediction residual
- High/low bucket splits (median) for directional bias and MAE
- Detail drill-downs for dimensions with |r| > 0.20

Outputs:
- Console: formatted tables
- data/residual_analysis.json: full results
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple


# ---------------------------------------------------------------------------
# Data loading & prediction (reused from backtest.py)
# ---------------------------------------------------------------------------

def load_data() -> Dict:
    """Load the hornets_buzz.json data."""
    data_path = Path(__file__).parent.parent / "data" / "hornets_buzz.json"
    with open(data_path) as f:
        return json.load(f)


def calculate_rolling_metrics(games: List[Dict], window: int, qualified_only: bool = True) -> Dict:
    """Calculate rolling metrics from prior games."""
    filtered = [g for g in games if not qualified_only or g.get('isQualified', False)]
    window_games = filtered[:window]
    if not window_games:
        return {'netRating': 0, 'games': 0}
    return {
        'netRating': sum(g.get('netRating', 0) for g in window_games) / len(window_games),
        'games': len(window_games),
    }


def simple_predict_margin(game: Dict, hornets_metrics: Dict) -> float:
    """Replicate model prediction logic (matches backtest.py)."""
    hornets_nr = hornets_metrics.get('netRating', 0)
    opp_nr = game.get('opponentNetRating', 0)
    opp_adjustment = -opp_nr
    elite_penalty = -2.0 if opp_nr >= 6.0 else 0
    mid_vs_mid_adj = -1.0 if -3.0 <= opp_nr < 3.0 else 0
    home_adj = 2.0 if game.get('isHome', False) else -2.0
    rest_days = game.get('restDays', 1)
    if rest_days == 0:
        fatigue_adj = -1.5
    elif rest_days >= 2:
        fatigue_adj = 1.0
    else:
        fatigue_adj = 0
    risk_penalty = -0.5 if game.get('isQualified', False) else 0
    predicted_margin = hornets_nr + opp_adjustment + elite_penalty + mid_vs_mid_adj + home_adj + fatigue_adj + risk_penalty
    hornets_pace = game.get('pace', 100)
    opp_pace = game.get('opponentPace', 100)
    combined_pace = hornets_pace + opp_pace
    pace_deviation = combined_pace - 200
    pace_multiplier = 1 - max(0, pace_deviation * 0.03)
    predicted_margin *= pace_multiplier
    predicted_margin = max(-15, min(15, predicted_margin))
    return predicted_margin


# ---------------------------------------------------------------------------
# Backtest loop — Core 5 games only
# ---------------------------------------------------------------------------

STYLE_DIMENSIONS = [
    ('opponentPace',         'Opp Pace'),
    ('opponentThreePtRate',  'Opp 3PT Rate'),
    ('opponentFtRate',       'Opp FT Rate'),
    ('opponentOrebPerGame',  'Opp OREB/g'),
    ('opponentTovPerGame',   'Opp TOV/g'),
    ('opponentStlPerGame',   'Opp STL/g'),
    ('opponentDefFg3Pct',    'Opp Def 3PT%'),
]

INTERACTION_DIMENSIONS = [
    ('pace_delta',    'Pace Delta'),
    ('combined_pace', 'Combined Pace'),
]

ALL_DIMENSIONS = STYLE_DIMENSIONS + INTERACTION_DIMENSIONS


def run_residual_backtest(games: List[Dict]) -> List[Dict]:
    """Run chronological backtest, return results for Core 5 games only."""
    sorted_games = sorted(games, key=lambda g: g['date'])
    results = []

    for i, game in enumerate(sorted_games):
        prior_games = sorted_games[:i]
        if len(prior_games) < 5:
            continue

        # Core 5 only — non-qualified games are confounded by roster noise
        if not game.get('isQualified', False):
            continue

        metrics = calculate_rolling_metrics(prior_games[-15:], 15, qualified_only=True)
        predicted_margin = simple_predict_margin(game, metrics)
        actual_margin = game.get('hornetsScore', 0) - game.get('opponentScore', 0)
        residual = actual_margin - predicted_margin  # positive = underpredicted

        result = {
            'game_id': game.get('gameId', ''),
            'date': game.get('date', ''),
            'opponent': game.get('opponent', ''),
            'is_home': game.get('isHome', False),
            'predicted_margin': round(predicted_margin, 2),
            'actual_margin': actual_margin,
            'residual': round(residual, 2),
            # Style dimensions from JSON
            'opponentPace': game.get('opponentPace', 0.0),
            'opponentThreePtRate': game.get('opponentThreePtRate', 0.0),
            'opponentFtRate': game.get('opponentFtRate', 0.0),
            'opponentOrebPerGame': game.get('opponentOrebPerGame', 0.0),
            'opponentTovPerGame': game.get('opponentTovPerGame', 0.0),
            'opponentStlPerGame': game.get('opponentStlPerGame', 0.0),
            'opponentDefFg3Pct': game.get('opponentDefFg3Pct', 0.0),
            # Interaction terms
            'pace_delta': round(game.get('pace', 100) - game.get('opponentPace', 100), 2),
            'combined_pace': round(game.get('pace', 100) + game.get('opponentPace', 100), 2),
        }
        results.append(result)

    return results


# ---------------------------------------------------------------------------
# Statistics — no scipy/statsmodels
# ---------------------------------------------------------------------------

def pearson_r(xs: List[float], ys: List[float]) -> Tuple[float, float]:
    """Compute Pearson r and approximate two-tailed p-value.

    P-value uses the t-distribution approximation:
        t = r * sqrt(n-2) / sqrt(1 - r^2)
    with the Abramowitz & Stegun rational approximation for the
    cumulative t-distribution.
    """
    n = len(xs)
    if n < 3:
        return 0.0, 1.0

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    dx = [x - mean_x for x in xs]
    dy = [y - mean_y for y in ys]

    sum_dxdy = sum(a * b for a, b in zip(dx, dy))
    sum_dx2 = sum(a * a for a in dx)
    sum_dy2 = sum(b * b for b in dy)

    denom = math.sqrt(sum_dx2 * sum_dy2)
    if denom == 0:
        return 0.0, 1.0

    r = sum_dxdy / denom
    r = max(-1.0, min(1.0, r))  # clamp floating-point noise

    # t-statistic
    df = n - 2
    if abs(r) >= 1.0:
        return r, 0.0
    t_stat = abs(r) * math.sqrt(df / (1.0 - r * r))

    # Approximate two-tailed p-value using the regularized incomplete beta function
    # For the t-distribution: p = I_{df/(df+t^2)}(df/2, 1/2)
    # Use a simple numerical approximation via the normal for large df,
    # and a series expansion otherwise.
    p_value = _t_to_p(t_stat, df)

    return r, p_value


def _t_to_p(t: float, df: int) -> float:
    """Approximate two-tailed p-value for |t| with df degrees of freedom.

    Uses the regularized incomplete beta function relationship:
        p = betai(df/2, 0.5, df/(df + t^2))
    Implemented with a continued-fraction expansion.
    """
    if df <= 0 or t <= 0:
        return 1.0

    x = df / (df + t * t)
    a = df / 2.0
    b = 0.5

    # Regularized incomplete beta via continued fraction (Lentz's method)
    p = _betai(a, b, x)
    return max(0.0, min(1.0, p))


def _betai(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta function I_x(a, b) via continued fraction."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0

    # Front factor (same for both branches)
    bt = math.exp(
        math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        + a * math.log(x) + b * math.log(1.0 - x)
    )

    # Use continued fraction; if x < (a+1)/(a+b+2) use direct, else 1-I_{1-x}(b,a)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _beta_cf(a, b, x) / a
    else:
        return 1.0 - bt * _beta_cf(b, a, 1.0 - x) / b


def _beta_cf(a: float, b: float, x: float) -> float:
    """Continued fraction for the incomplete beta function (Numerical Recipes)."""
    max_iter = 200
    eps = 1e-14
    fpmin = 1e-30

    qab = a + b
    qap = a + 1.0
    qam = a - 1.0

    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < fpmin:
        d = fpmin
    d = 1.0 / d
    h = d

    for m in range(1, max_iter + 1):
        m2 = 2 * m
        # Even step
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        h *= d * c

        # Odd step
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fpmin:
            d = fpmin
        c = 1.0 + aa / c
        if abs(c) < fpmin:
            c = fpmin
        d = 1.0 / d
        delta = d * c
        h *= delta

        if abs(delta - 1.0) < eps:
            break

    return h


def median(values: List[float]) -> float:
    """Return the median of a list."""
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2 == 0:
        return (s[mid - 1] + s[mid]) / 2.0
    return s[mid]


# ---------------------------------------------------------------------------
# Analysis functions
# ---------------------------------------------------------------------------

def correlation_analysis(results: List[Dict]) -> List[Dict]:
    """Compute Pearson r between each style dimension and the residual."""
    residuals = [r['residual'] for r in results]
    table = []

    for key, label in ALL_DIMENSIONS:
        values = [r[key] for r in results]
        # Check if dimension has any variance
        if len(set(values)) <= 1:
            table.append({
                'dimension': label,
                'key': key,
                'r': 0.0,
                'p_value': 1.0,
                'significant': False,
                'n': len(values),
                'note': 'no variance',
            })
            continue

        r, p = pearson_r(values, residuals)
        table.append({
            'dimension': label,
            'key': key,
            'r': round(r, 4),
            'p_value': round(p, 4),
            'significant': p < 0.05,
            'n': len(values),
        })

    # Sort by |r| descending
    table.sort(key=lambda x: abs(x['r']), reverse=True)
    return table


def bucket_analysis(results: List[Dict]) -> Dict[str, Dict]:
    """For each style dimension, split at median and compare."""
    buckets = {}

    for key, label in ALL_DIMENSIONS:
        values = [r[key] for r in results]
        if len(set(values)) <= 1:
            continue

        med = median(values)

        high = [r for r in results if r[key] > med]
        low = [r for r in results if r[key] <= med]

        # Avoid empty buckets (can happen if many values equal median)
        if not high or not low:
            # Fallback: split at strict median index
            sorted_by_dim = sorted(results, key=lambda r: r[key])
            mid = len(sorted_by_dim) // 2
            low = sorted_by_dim[:mid]
            high = sorted_by_dim[mid:]

        def bucket_stats(group: List[Dict]) -> Dict:
            residuals = [r['residual'] for r in group]
            errors = [abs(r['residual']) for r in group]
            return {
                'count': len(group),
                'mean_residual': round(sum(residuals) / len(residuals), 2) if residuals else 0,
                'mae': round(sum(errors) / len(errors), 2) if errors else 0,
                'mean_dim_value': round(sum(r[key] for r in group) / len(group), 3) if group else 0,
            }

        buckets[label] = {
            'key': key,
            'median': round(med, 3),
            'high': bucket_stats(high),
            'low': bucket_stats(low),
            'bias_diff': round(
                (sum(r['residual'] for r in high) / len(high) if high else 0) -
                (sum(r['residual'] for r in low) / len(low) if low else 0), 2
            ),
        }

    return buckets


def detail_top_correlations(results: List[Dict], corr_table: List[Dict], threshold: float = 0.20) -> Dict[str, List[Dict]]:
    """For dimensions with |r| > threshold, list games sorted by that dimension."""
    details = {}

    for entry in corr_table:
        if abs(entry['r']) < threshold:
            continue

        key = entry['key']
        label = entry['dimension']
        sorted_results = sorted(results, key=lambda r: r[key])

        details[label] = [{
            'date': r['date'],
            'opponent': r['opponent'],
            'dim_value': r[key],
            'residual': r['residual'],
            'predicted': r['predicted_margin'],
            'actual': r['actual_margin'],
        } for r in sorted_results]

    return details


# ---------------------------------------------------------------------------
# Printing
# ---------------------------------------------------------------------------

def check_style_data_present(results: List[Dict]) -> bool:
    """Check if style dimension fields have real data (not all defaults)."""
    style_keys = [key for key, _ in STYLE_DIMENSIONS if key != 'opponentPace']
    for key in style_keys:
        values = set(r[key] for r in results)
        if values != {0.0} and values != {0}:
            return True
    return False


def print_correlation_table(corr_table: List[Dict]):
    print(f"\n{'Dimension':<16} {'r':>8} {'p-value':>10} {'Sig?':>6} {'n':>5}")
    print("-" * 50)
    for entry in corr_table:
        sig = "***" if entry.get('significant') else ""
        note = entry.get('note', '')
        if note:
            print(f"{entry['dimension']:<16} {'—':>8} {'—':>10} {note:>6} {entry['n']:>5}")
        else:
            print(f"{entry['dimension']:<16} {entry['r']:>8.4f} {entry['p_value']:>10.4f} {sig:>6} {entry['n']:>5}")


def print_bucket_table(buckets: Dict[str, Dict]):
    print(f"\n{'Dimension':<16} {'Split':>8} {'Grp':>5} {'Count':>6} {'Mean Res':>9} {'MAE':>7} {'Bias Diff':>10}")
    print("-" * 70)
    for label, data in buckets.items():
        print(f"{label:<16} {data['median']:>8.3f} {'High':>5} {data['high']['count']:>6} {data['high']['mean_residual']:>+9.2f} {data['high']['mae']:>7.2f} {data['bias_diff']:>+10.2f}")
        print(f"{'':16} {'':>8} {'Low':>5} {data['low']['count']:>6} {data['low']['mean_residual']:>+9.2f} {data['low']['mae']:>7.2f}")


def print_detail(details: Dict[str, List[Dict]]):
    for label, games in details.items():
        print(f"\n--- {label} (|r| > 0.20) ---")
        print(f"{'Date':<12} {'Opp':<5} {'Value':>8} {'Resid':>8} {'Pred':>8} {'Actual':>8}")
        print("-" * 55)
        for g in games:
            print(f"{g['date']:<12} {g['opponent']:<5} {g['dim_value']:>8.3f} {g['residual']:>+8.2f} {g['predicted']:>+8.2f} {g['actual']:>+8d}")


def print_summary(results: List[Dict], corr_table: List[Dict], buckets: Dict[str, Dict], style_present: bool):
    print("\n" + "=" * 70)
    print("SUMMARY & RECOMMENDATIONS")
    print("=" * 70)

    n = len(results)
    print(f"\nSample size: {n} qualified (Core 5) games")
    print(f"Caveat: With n={n}, correlations need |r| > ~0.35 for p < 0.05.")

    if not style_present:
        print("\n** Style dimension fields (3PT rate, FT rate, OREB/g, TOV/g, STL/g)")
        print("   are all zero — data needs a refresh via fetch_data.py.")
        print("   Only pace-based dimensions have real data in this run.")
        print("   Re-run after: python scripts/fetch_data.py")
        return

    # Find dimensions with signal
    signal_dims = [e for e in corr_table if abs(e['r']) >= 0.20 and not e.get('note')]
    weak_dims = [e for e in corr_table if 0.10 <= abs(e['r']) < 0.20 and not e.get('note')]

    if signal_dims:
        print("\nDimensions with potential signal (|r| >= 0.20):")
        for e in signal_dims:
            direction = "underpredicts" if e['r'] > 0 else "overpredicts"
            bucket_info = buckets.get(e['dimension'], {})
            bias = bucket_info.get('bias_diff', 0)
            print(f"  - {e['dimension']}: r = {e['r']:+.4f} (p = {e['p_value']:.4f})")
            print(f"    Model {direction} when this is high. Bucket bias diff: {bias:+.2f} pts")
    else:
        print("\nNo dimensions show |r| >= 0.20 — no strong style-residual signal detected.")

    if weak_dims:
        print("\nWeak signals (0.10 <= |r| < 0.20) — monitor but don't act on:")
        for e in weak_dims:
            print(f"  - {e['dimension']}: r = {e['r']:+.4f}")

    print("\nNext steps:")
    if signal_dims:
        print("  1. Verify signal isn't outlier-driven (check detail tables above)")
        print("  2. Consider adding adjustment terms for significant dimensions")
        print("  3. Re-run after more games accumulate to confirm stability")
    else:
        print("  1. No model changes warranted from current data")
        print("  2. Re-run periodically as sample grows")
        print("  3. Consider if other unmeasured dimensions explain residuals")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("HORNETS BUZZ - STYLE DIMENSION RESIDUAL ANALYSIS")
    print("=" * 70)

    # Load data
    data = load_data()
    games = data.get('games', [])
    print(f"\nLoaded {len(games)} total games")

    # Run backtest (Core 5 only)
    results = run_residual_backtest(games)
    print(f"Qualified (Core 5) games with enough history: {len(results)}")

    if len(results) < 10:
        print("\nInsufficient data for meaningful analysis (need >= 10 games).")
        return

    # Check style data
    style_present = check_style_data_present(results)
    if not style_present:
        print("\nWARNING: Opponent style fields (3PT rate, FT rate, OREB/g, TOV/g, STL/g)")
        print("  are all zero/missing. Only pace dimensions will produce real results.")
        print("  Run 'python scripts/fetch_data.py' to populate style data.\n")

    # Overall stats
    residuals = [r['residual'] for r in results]
    errors = [abs(r['residual']) for r in results]
    overall_mae = sum(errors) / len(errors)
    mean_residual = sum(residuals) / len(residuals)
    print(f"\nOverall MAE: {overall_mae:.2f} pts")
    print(f"Mean residual: {mean_residual:+.2f} pts (positive = model underpredicts)")

    # 1. Correlation analysis
    print("\n" + "=" * 70)
    print("PEARSON CORRELATION: Style Dimension vs Residual")
    print("=" * 70)
    corr_table = correlation_analysis(results)
    print_correlation_table(corr_table)

    # 2. Bucket analysis
    print("\n" + "=" * 70)
    print("BUCKET ANALYSIS: High/Low Split at Median")
    print("=" * 70)
    buckets = bucket_analysis(results)
    print_bucket_table(buckets)

    # 3. Detail for top correlations
    details = detail_top_correlations(results, corr_table, threshold=0.20)
    if details:
        print("\n" + "=" * 70)
        print("DETAIL: Games for Dimensions with |r| > 0.20")
        print("=" * 70)
        print_detail(details)
    else:
        print("\n(No dimensions exceed |r| > 0.20 — detail drill-down skipped)")

    # 4. Summary
    print_summary(results, corr_table, buckets, style_present)

    # Save JSON
    output = {
        'total_games': len(games),
        'qualified_analyzed': len(results),
        'overall_mae': round(overall_mae, 2),
        'mean_residual': round(mean_residual, 2),
        'style_data_present': style_present,
        'correlations': corr_table,
        'buckets': buckets,
        'details': details,
        'results': results,
    }
    output_path = Path(__file__).parent.parent / "data" / "residual_analysis.json"
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nFull results saved to: {output_path}")


if __name__ == "__main__":
    main()
