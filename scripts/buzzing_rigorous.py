#!/usr/bin/env python3
"""
Buzzing Model v2 - Statistically Rigorous Version

Applies proper confidence intervals and only recommends bets
when we have genuine statistical confidence, not just pattern-matching.

Key improvements:
1. Binomial confidence intervals on all segments
2. Required sample sizes before trusting patterns
3. Multiple confirming factors required for high confidence
4. Kelly criterion for bet sizing
5. Honest uncertainty quantification
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


# === Statistical Functions ===

def wilson_confidence_interval(successes: int, trials: int, z: float = 1.96) -> Tuple[float, float]:
    """
    Wilson score interval - better than normal approximation for small samples.
    Returns (lower, upper) bounds at given z-score (1.96 = 95% CI).
    """
    if trials == 0:
        return (0.0, 1.0)

    p = successes / trials
    denominator = 1 + z**2 / trials
    center = (p + z**2 / (2 * trials)) / denominator
    margin = (z / denominator) * math.sqrt(p * (1 - p) / trials + z**2 / (4 * trials**2))

    return (max(0, center - margin), min(1, center + margin))


def sample_size_for_confidence(observed_rate: float, desired_margin: float, z: float = 1.96) -> int:
    """
    Calculate sample size needed to achieve desired margin of error.
    """
    if observed_rate <= 0 or observed_rate >= 1:
        return 1000  # Edge case
    return int(math.ceil((z**2 * observed_rate * (1 - observed_rate)) / (desired_margin**2)))


def kelly_criterion(win_prob: float, odds: float = 1.91) -> float:
    """
    Kelly criterion for optimal bet sizing.
    odds = decimal odds (1.91 = -110 American)
    Returns fraction of bankroll to bet (0 = no bet).
    """
    # Convert to implied probability from odds
    implied_prob = 1 / odds

    # Edge = our probability - implied probability
    edge = win_prob - implied_prob

    if edge <= 0:
        return 0.0

    # Kelly formula: f = (bp - q) / b
    # where b = decimal odds - 1, p = win prob, q = 1-p
    b = odds - 1
    q = 1 - win_prob
    kelly = (b * win_prob - q) / b

    # Half-Kelly for safety (reduces variance)
    return max(0, kelly / 2)


@dataclass
class SegmentStats:
    """Statistics for a game segment."""
    name: str
    wins: int
    total: int
    ats_rate: float
    ci_lower: float
    ci_upper: float
    sample_sufficient: bool  # Do we have enough games to trust this?
    min_sample: int = 15  # Minimum games to consider pattern reliable


def analyze_segment(name: str, games: List[dict], min_sample: int = 15) -> SegmentStats:
    """Analyze a segment with proper confidence intervals."""
    total = len(games)
    wins = sum(1 for g in games if g.get('coveredSpread', False))

    if total == 0:
        return SegmentStats(name, 0, 0, 0.5, 0.0, 1.0, False, min_sample)

    ats_rate = wins / total
    ci_lower, ci_upper = wilson_confidence_interval(wins, total)
    sample_sufficient = total >= min_sample

    return SegmentStats(name, wins, total, ats_rate, ci_lower, ci_upper, sample_sufficient, min_sample)


# === Game Classification ===

def classify_opponent(net_rating: float) -> str:
    """Classify opponent tier."""
    if net_rating >= 6.0:
        return 'elite'
    elif net_rating >= 3.0:
        return 'strong'
    elif net_rating >= -3.0:
        return 'mid'
    return 'weak'


@dataclass
class RigorousPrediction:
    """Statistically rigorous prediction."""
    # Point estimates
    base_ats_rate: float
    adjusted_ats_rate: float

    # Confidence intervals
    ci_lower: float
    ci_upper: float

    # Statistical validity
    sample_size: int
    sample_sufficient: bool
    confidence_level: str  # 'high', 'medium', 'low', 'insufficient'

    # Betting recommendation
    has_edge: bool
    edge_size: float  # Above break-even (52.4%)
    kelly_fraction: float
    recommended_bet: str  # 'max', 'large', 'medium', 'small', 'pass'

    # Factors
    positive_factors: List[str]
    negative_factors: List[str]
    uncertain_factors: List[str]

    # Explanation
    reasoning: str


def analyze_game_rigorous(
    game: dict,
    qualified_games: List[dict],
    segment_stats: Dict[str, SegmentStats]
) -> RigorousPrediction:
    """
    Generate a statistically rigorous prediction for a game.
    """
    positive_factors = []
    negative_factors = []
    uncertain_factors = []

    # === 1. Base Rate ===
    overall = segment_stats.get('overall')
    base_ats_rate = overall.ats_rate if overall else 0.5
    base_ci_lower = overall.ci_lower if overall else 0.0
    base_ci_upper = overall.ci_upper if overall else 1.0
    sample_size = overall.total if overall else 0

    # === 2. Segment Analysis ===
    # Only apply adjustments from segments with sufficient samples

    is_home = game.get('isHome', False)
    is_road = not is_home
    is_b2b = game.get('isBackToBack', False)
    opp_nr = game.get('opponentNetRating', 0)
    opp_tier = classify_opponent(opp_nr)

    adjustments = []

    # Location factor
    if is_road:
        road_stats = segment_stats.get('road')
        if road_stats and road_stats.sample_sufficient:
            if road_stats.ci_lower > 0.524:  # 95% CI entirely above break-even
                positive_factors.append(f"Road games: {road_stats.wins}-{road_stats.total-road_stats.wins} ({road_stats.ats_rate*100:.0f}%) - STATISTICALLY SIGNIFICANT")
                adjustments.append(road_stats.ats_rate - base_ats_rate)
            else:
                uncertain_factors.append(f"Road games: {road_stats.wins}-{road_stats.total-road_stats.wins} - CI includes break-even [{road_stats.ci_lower*100:.0f}%-{road_stats.ci_upper*100:.0f}%]")
        else:
            uncertain_factors.append(f"Road games: insufficient sample (n={road_stats.total if road_stats else 0}, need {road_stats.min_sample if road_stats else 15})")
    else:
        home_stats = segment_stats.get('home')
        if home_stats and home_stats.sample_sufficient:
            if home_stats.ci_lower > 0.524:
                positive_factors.append(f"Home games: {home_stats.wins}-{home_stats.total-home_stats.wins} ({home_stats.ats_rate*100:.0f}%)")
                adjustments.append(home_stats.ats_rate - base_ats_rate)
            elif home_stats.ci_upper < 0.524:
                negative_factors.append(f"Home games below break-even")
            else:
                uncertain_factors.append(f"Home games: CI includes break-even")
        else:
            uncertain_factors.append(f"Home games: insufficient sample")

    # Opponent tier
    tier_key = f"vs_{opp_tier}"
    tier_stats = segment_stats.get(tier_key)
    if tier_stats and tier_stats.sample_sufficient:
        if tier_stats.ci_lower > 0.524:
            positive_factors.append(f"vs {opp_tier.upper()}: {tier_stats.wins}-{tier_stats.total-tier_stats.wins} ({tier_stats.ats_rate*100:.0f}%)")
            adjustments.append(tier_stats.ats_rate - base_ats_rate)
        elif tier_stats.ci_upper < 0.524:
            negative_factors.append(f"vs {opp_tier.upper()} teams: below break-even")
            adjustments.append(tier_stats.ats_rate - base_ats_rate)
        else:
            uncertain_factors.append(f"vs {opp_tier.upper()}: {tier_stats.wins}-{tier_stats.total-tier_stats.wins} - inconclusive")
    else:
        uncertain_factors.append(f"vs {opp_tier.upper()}: insufficient sample (n={tier_stats.total if tier_stats else 0})")

    # Back-to-back
    if is_b2b:
        b2b_stats = segment_stats.get('b2b')
        if b2b_stats and b2b_stats.total >= 10:  # Higher bar for B2B
            if b2b_stats.ci_lower > 0.524:
                positive_factors.append(f"Back-to-back: {b2b_stats.wins}-{b2b_stats.total-b2b_stats.wins}")
                adjustments.append(b2b_stats.ats_rate - base_ats_rate)
            else:
                uncertain_factors.append(f"Back-to-back: only {b2b_stats.total} games, inconclusive")
        else:
            uncertain_factors.append(f"Back-to-back: sample too small (n={b2b_stats.total if b2b_stats else 0})")

    # === 3. Calculate Adjusted Rate ===
    # Conservative approach: only add half of positive adjustments
    # (regression to mean expectation)
    if adjustments:
        avg_adjustment = sum(adjustments) / len(adjustments)
        adjusted_ats_rate = base_ats_rate + (avg_adjustment * 0.5)  # Shrink toward base
    else:
        adjusted_ats_rate = base_ats_rate

    # Clamp to reasonable range
    adjusted_ats_rate = max(0.4, min(0.9, adjusted_ats_rate))

    # === 4. Confidence Interval for Prediction ===
    # Use the overall CI as base, widen if we have uncertainty
    uncertainty_penalty = len(uncertain_factors) * 0.03
    ci_lower = max(0, base_ci_lower - uncertainty_penalty)
    ci_upper = min(1, base_ci_upper + uncertainty_penalty)

    # === 5. Determine if We Have Edge ===
    BREAK_EVEN = 0.524  # Need 52.4% to overcome -110 vig

    # Conservative: use lower bound of CI
    has_edge = ci_lower > BREAK_EVEN
    edge_size = ci_lower - BREAK_EVEN if has_edge else adjusted_ats_rate - BREAK_EVEN

    # === 6. Kelly Criterion ===
    kelly = kelly_criterion(adjusted_ats_rate) if has_edge else 0.0

    # === 7. Confidence Level ===
    sample_sufficient = sample_size >= 25

    if not sample_sufficient:
        confidence_level = 'insufficient'
    elif has_edge and len(positive_factors) >= 2 and len(negative_factors) == 0:
        confidence_level = 'high'
    elif has_edge and len(positive_factors) >= 1:
        confidence_level = 'medium'
    elif adjusted_ats_rate > BREAK_EVEN:
        confidence_level = 'low'
    else:
        confidence_level = 'insufficient'

    # === 8. Bet Recommendation ===
    if confidence_level == 'high' and kelly >= 0.05:
        recommended_bet = 'large'
    elif confidence_level == 'medium' and kelly >= 0.03:
        recommended_bet = 'medium'
    elif confidence_level == 'low' and kelly >= 0.02:
        recommended_bet = 'small'
    else:
        recommended_bet = 'pass'

    # === 9. Generate Reasoning ===
    if recommended_bet == 'pass':
        if not sample_sufficient:
            reasoning = f"PASS: Insufficient sample size ({sample_size} games). Need 25+ Core 5 games for reliable patterns."
        elif not has_edge:
            reasoning = f"PASS: No statistical edge. 95% CI [{ci_lower*100:.0f}%-{ci_upper*100:.0f}%] includes break-even (52.4%)."
        elif len(negative_factors) > 0:
            reasoning = f"PASS: Negative factors present. {'; '.join(negative_factors)}"
        else:
            reasoning = f"PASS: Too much uncertainty. {len(uncertain_factors)} inconclusive factors."
    else:
        reasoning = f"{recommended_bet.upper()}: Est. {adjusted_ats_rate*100:.0f}% ATS, 95% CI [{ci_lower*100:.0f}%-{ci_upper*100:.0f}%]. Kelly suggests {kelly*100:.1f}% of bankroll."

    return RigorousPrediction(
        base_ats_rate=base_ats_rate,
        adjusted_ats_rate=adjusted_ats_rate,
        ci_lower=ci_lower,
        ci_upper=ci_upper,
        sample_size=sample_size,
        sample_sufficient=sample_sufficient,
        confidence_level=confidence_level,
        has_edge=has_edge,
        edge_size=edge_size,
        kelly_fraction=kelly,
        recommended_bet=recommended_bet,
        positive_factors=positive_factors,
        negative_factors=negative_factors,
        uncertain_factors=uncertain_factors,
        reasoning=reasoning,
    )


def build_segment_stats(qualified_games: List[dict]) -> Dict[str, SegmentStats]:
    """Build statistics for all segments."""
    stats = {}

    # Overall
    stats['overall'] = analyze_segment('Overall', qualified_games, min_sample=20)

    # Location
    home_games = [g for g in qualified_games if g.get('isHome')]
    away_games = [g for g in qualified_games if not g.get('isHome')]
    stats['home'] = analyze_segment('Home', home_games, min_sample=12)
    stats['road'] = analyze_segment('Road', away_games, min_sample=12)

    # Opponent tier
    for tier in ['elite', 'strong', 'mid', 'weak']:
        tier_games = [g for g in qualified_games if classify_opponent(g.get('opponentNetRating', 0)) == tier]
        stats[f'vs_{tier}'] = analyze_segment(f'vs {tier}', tier_games, min_sample=8)

    # Back-to-back
    b2b_games = [g for g in qualified_games if g.get('isBackToBack')]
    stats['b2b'] = analyze_segment('Back-to-back', b2b_games, min_sample=10)

    return stats


def main():
    # Load data
    data_path = Path(__file__).parent.parent / "data" / "hornets_buzz.json"
    with open(data_path) as f:
        data = json.load(f)

    qualified = [g for g in data['games'] if g['isQualified']]
    upcoming = data.get('upcomingGames', [])

    print("=" * 70)
    print("BUZZING MODEL v2 - STATISTICALLY RIGOROUS ANALYSIS")
    print("=" * 70)

    # Build segment statistics
    segment_stats = build_segment_stats(qualified)

    # Print segment analysis
    print("\n--- SEGMENT ANALYSIS (with 95% Confidence Intervals) ---\n")
    print(f"{'Segment':<20} {'Record':<10} {'ATS %':<8} {'95% CI':<15} {'Sufficient?':<12}")
    print("-" * 70)

    BREAK_EVEN = 0.524

    for key in ['overall', 'home', 'road', 'vs_elite', 'vs_strong', 'vs_mid', 'vs_weak', 'b2b']:
        s = segment_stats.get(key)
        if s:
            record = f"{s.wins}-{s.total - s.wins}"
            ci_str = f"[{s.ci_lower*100:.0f}%-{s.ci_upper*100:.0f}%]"
            sufficient = "YES" if s.sample_sufficient else f"NO (need {s.min_sample})"

            # Highlight if CI is entirely above break-even
            if s.ci_lower > BREAK_EVEN:
                indicator = " ** EDGE"
            elif s.ci_upper < BREAK_EVEN:
                indicator = " -- AVOID"
            else:
                indicator = ""

            print(f"{s.name:<20} {record:<10} {s.ats_rate*100:>5.1f}%   {ci_str:<15} {sufficient:<12}{indicator}")

    print("\n** = 95% CI entirely above 52.4% break-even (statistically significant edge)")
    print("-- = 95% CI entirely below break-even")

    # Sample size guidance
    overall = segment_stats['overall']
    current_n = overall.total
    current_rate = overall.ats_rate

    # How many more games to narrow CI?
    needed_for_5pct_margin = sample_size_for_confidence(current_rate, 0.05)
    needed_for_10pct_margin = sample_size_for_confidence(current_rate, 0.10)

    print(f"\n--- SAMPLE SIZE GUIDANCE ---")
    print(f"Current sample: {current_n} Core 5 games")
    print(f"Current 95% CI: [{overall.ci_lower*100:.0f}%-{overall.ci_upper*100:.0f}%] (±{(overall.ci_upper-overall.ci_lower)*50:.0f}%)")
    print(f"For ±10% margin: need {needed_for_10pct_margin} games ({max(0, needed_for_10pct_margin - current_n)} more)")
    print(f"For ±5% margin: need {needed_for_5pct_margin} games ({max(0, needed_for_5pct_margin - current_n)} more)")

    # Analyze upcoming games
    if upcoming:
        print(f"\n--- UPCOMING GAMES (Rigorous Analysis) ---\n")

        for game in upcoming:
            opp = game.get('opponent', 'Unknown')
            date = game.get('date', 'TBD')
            loc = "vs" if game.get('isHome') else "@"
            spread = game.get('spread')

            pred = analyze_game_rigorous(game, qualified, segment_stats)

            print(f"{date}: {loc} {opp}")
            print(f"  Spread: {spread if spread else 'N/A'}")
            print(f"  Base ATS rate: {pred.base_ats_rate*100:.1f}%")
            print(f"  Adjusted ATS rate: {pred.adjusted_ats_rate*100:.1f}%")
            print(f"  95% CI: [{pred.ci_lower*100:.0f}%-{pred.ci_upper*100:.0f}%]")
            print(f"  Confidence: {pred.confidence_level.upper()}")
            print(f"  Kelly fraction: {pred.kelly_fraction*100:.1f}%")
            print(f"  ")
            print(f"  RECOMMENDATION: {pred.reasoning}")

            if pred.positive_factors:
                print(f"  [+] {'; '.join(pred.positive_factors)}")
            if pred.negative_factors:
                print(f"  [-] {'; '.join(pred.negative_factors)}")
            if pred.uncertain_factors:
                print(f"  [?] {'; '.join(pred.uncertain_factors)}")
            print()

    # Summary
    print("=" * 70)
    print("KEY TAKEAWAYS")
    print("=" * 70)
    print(f"""
    1. SAMPLE SIZE MATTERS: With only {current_n} games, our confidence intervals
       are wide. The {overall.ats_rate*100:.0f}% ATS rate has a 95% CI of
       [{overall.ci_lower*100:.0f}%-{overall.ci_upper*100:.0f}%].

    2. WHAT WE CAN SAY: The CI lower bound ({overall.ci_lower*100:.0f}%) is
       {'ABOVE' if overall.ci_lower > BREAK_EVEN else 'NOT above'} the 52.4% break-even.
       {'This suggests a real edge exists.' if overall.ci_lower > BREAK_EVEN else 'We cannot yet confirm a real edge.'}

    3. SEGMENT CAUTION: Most segments (road, B2B, vs tier) have <15 games.
       Patterns in small segments are likely noise, not signal.

    4. RECOMMENDATION: {'Selective betting justified' if overall.ci_lower > BREAK_EVEN else 'Wait for more data'}.
       Focus on games with multiple confirming factors.
       Track results to validate model going forward.
    """)


if __name__ == "__main__":
    main()
