#!/usr/bin/env python3
"""
Buzzing Model Analysis - Hornets Betting Recommendations

Analyzes upcoming Hornets games using the Buzzing model philosophy:
- Core 5 performance as baseline (+8.9 margin, 77.8% ATS)
- Opponent tier assessment
- Situational factors (home/away, rest, streak)
- Value identification vs market spread

Usage:
    python buzzing_analysis.py
"""

import json
import os
from datetime import datetime
from pathlib import Path

# === Model Constants (matching buzzing-model.ts) ===

# Core 5 baseline
CORE5_WIN_PCT = 0.704
CORE5_ATS_PCT = 0.778
CORE5_AVG_MARGIN = 8.9
CORE5_NET_RATING = 8.5

# Opponent tiers
ELITE_THRESHOLD = 6.0
STRONG_THRESHOLD = 3.0
WEAK_THRESHOLD = -3.0

# Value thresholds
HIGH_VALUE = 5.0
MEDIUM_VALUE = 3.0
LOW_VALUE = 1.0

# Adjustments
# KEY INSIGHT: Hornets are 13-2 ATS on the road (86.7%) vs 9-4 at home (69.2%)
# The market disrespects them more as road teams - that's where the value is!
HOME_BOOST = 0.0  # Reduced - home isn't as valuable for ATS
ROAD_VALUE_BOOST = 2.0  # NEW: Road games have more ATS value
B2B_BOOST = 1.0  # Increased - Hornets are 5-1 on B2Bs (83.3% ATS)
REST_BOOST = 1.5
STREAK_BOOST = 0.3
ELITE_PENALTY = -3.0
ROAD_ELITE_PENALTY = -1.0  # Reduced - even road elite is ok (they cover on road)


def load_data():
    """Load Hornets data."""
    data_path = Path(__file__).parent.parent / "data" / "hornets_buzz.json"
    with open(data_path) as f:
        return json.load(f)


def classify_opponent(net_rating: float) -> str:
    """Classify opponent tier."""
    if net_rating >= ELITE_THRESHOLD:
        return "elite"
    elif net_rating >= STRONG_THRESHOLD:
        return "strong"
    elif net_rating >= WEAK_THRESHOLD:
        return "mid"
    return "weak"


def get_streak(games: list) -> int:
    """Get current win streak."""
    streak = 0
    for g in games:
        if g["result"] == "W":
            streak += 1
        else:
            break
    return streak


def buzzing_predict(game: dict, qualified_games: list) -> dict:
    """Generate Buzzing prediction for a game."""

    factors = []
    risks = []
    opportunities = []

    # Core 5 baseline
    base_margin = CORE5_AVG_MARGIN
    factors.append({
        "name": "Core 5 Baseline",
        "impact": base_margin,
        "desc": f"Core 5 averages +{CORE5_AVG_MARGIN} margin"
    })

    # Opponent assessment
    opp_nr = game.get("opponentNetRating", 0)
    opp_tier = classify_opponent(opp_nr)

    opp_adjustment = -opp_nr * 0.5
    if opp_tier == "elite":
        opp_adjustment += ELITE_PENALTY
        risks.append(f"Elite opponent ({opp_nr:+.1f} NR)")
    elif opp_tier == "weak":
        opp_adjustment += 2.0
        opportunities.append(f"Weak opponent ({opp_nr:.1f} NR)")
    elif opp_tier == "mid":
        opportunities.append("Mid-tier opponent (Hornets are 9-3)")

    factors.append({
        "name": f"vs {opp_tier.upper()}",
        "impact": opp_adjustment,
        "desc": f"Opponent NR: {opp_nr:+.1f}"
    })

    # Home/Away
    # KEY INSIGHT: Hornets are 13-2 ATS on road (86.7%) - market disrespects them!
    is_home = game.get("isHome", False)
    location_adj = 0
    if is_home:
        location_adj = HOME_BOOST
        # Home is fine but not where the ATS value is
    else:
        # ROAD IS WHERE THE MONEY IS
        location_adj = ROAD_VALUE_BOOST
        opportunities.append("ROAD GAME (86.7% ATS historically!)")
        if opp_tier == "elite":
            location_adj += ROAD_ELITE_PENALTY
            risks.append("Road game vs elite (but still 13-2 overall on road)")

    factors.append({
        "name": "Home" if is_home else "ROAD VALUE",
        "impact": location_adj,
        "desc": "Road games are +86.7% ATS" if not is_home else "Home game"
    })

    # Rest
    rest_adj = 0
    is_b2b = game.get("isBackToBack", False)
    rest_days = game.get("restDays", 1)

    if is_b2b:
        rest_adj = B2B_BOOST
        opportunities.append("Back-to-back (5-1 record!)")
    elif rest_days >= 2:
        rest_adj = REST_BOOST
        opportunities.append(f"Well rested ({rest_days} days)")

    if rest_adj != 0:
        factors.append({
            "name": "Rest",
            "impact": rest_adj,
            "desc": "Schedule factor"
        })

    # Streak
    streak = get_streak(qualified_games)
    streak_adj = 0
    if streak >= 3:
        streak_adj = min(streak * STREAK_BOOST, 3.0)
        opportunities.append(f"{streak}-game win streak")
        factors.append({
            "name": f"Streak ({streak}W)",
            "impact": streak_adj,
            "desc": "Hot streak bonus"
        })

    # Calculate prediction
    predicted_margin = base_margin + opp_adjustment + location_adj + rest_adj + streak_adj

    # Value vs spread
    spread = game.get("spread")
    if spread is None:
        predicted_cover = 0
        value_score = 0
    else:
        predicted_cover = predicted_margin + spread
        value_score = predicted_cover

    # Confidence score
    confidence_score = 50
    confidence_score += min(len(qualified_games), 20)

    if value_score >= HIGH_VALUE:
        confidence_score += 20
    elif value_score >= MEDIUM_VALUE:
        confidence_score += 10
    elif value_score < 0:
        confidence_score -= 20

    if opp_tier == "weak":
        confidence_score += 10
    elif opp_tier == "elite":
        confidence_score -= 15

    if is_home:
        confidence_score += 5

    if streak >= 5:
        confidence_score += 10
    elif streak >= 3:
        confidence_score += 5

    confidence_score = max(0, min(100, confidence_score))

    # Determine bet sizing
    no_spread = spread is None

    if no_spread:
        # No spread available yet - give preliminary assessment
        if opp_tier == "elite" and not is_home:
            confidence = "AVOID"
            bet_size = "WAIT (road elite)"
        elif opp_tier == "elite" and is_home:
            confidence = "CAUTION"
            bet_size = "WAIT (home elite)"
        elif opp_tier == "weak":
            confidence = "LIKELY MAX"
            bet_size = "WAIT (weak opp)"
        elif opp_tier == "mid":
            confidence = "LIKELY HIGH"
            bet_size = "WAIT (mid opp)"
        else:
            confidence = "LIKELY MED"
            bet_size = "WAIT"
    elif opp_tier == "elite" and not is_home:
        # Road vs elite - avoid
        confidence = "AVOID"
        bet_size = "PASS"
    elif opp_tier == "elite" and is_home and value_score >= MEDIUM_VALUE:
        # Elite at home - still bet but with caution
        confidence = "MEDIUM"
        bet_size = "MEDIUM"
    elif value_score >= HIGH_VALUE and confidence_score >= 70:
        confidence = "MAX"
        bet_size = "MAX BET"
    elif value_score >= MEDIUM_VALUE and confidence_score >= 60:
        confidence = "HIGH"
        bet_size = "LARGE"
    elif value_score >= LOW_VALUE and confidence_score >= 50:
        confidence = "MEDIUM"
        bet_size = "MEDIUM"
    elif value_score > 0:
        confidence = "LOW"
        bet_size = "SMALL"
    else:
        confidence = "AVOID"
        bet_size = "PASS"

    return {
        "predicted_margin": round(predicted_margin, 1),
        "predicted_cover": round(predicted_cover, 1),
        "value_score": round(value_score, 1),
        "confidence": confidence,
        "confidence_score": confidence_score,
        "bet_size": bet_size,
        "factors": factors,
        "risks": risks,
        "opportunities": opportunities,
        "opp_tier": opp_tier,
    }


def fetch_current_spreads():
    """Fetch current Hornets spreads from The Odds API."""
    import requests
    import os

    # Load API key
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if "ODDS_API_KEY" in line:
                    os.environ["ODDS_API_KEY"] = line.split("=")[1].strip()

    api_key = os.environ.get("ODDS_API_KEY")
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
            spreads = {}
            for game in response.json():
                is_hornets = any("hornets" in t.lower() for t in [game.get("home_team", ""), game.get("away_team", "")])
                if is_hornets:
                    is_home = "hornets" in game.get("home_team", "").lower()
                    for bookmaker in game.get("bookmakers", []):
                        if bookmaker.get("key") == "draftkings":
                            for market in bookmaker.get("markets", []):
                                if market.get("key") == "spreads":
                                    for outcome in market.get("outcomes", []):
                                        if "hornets" in outcome.get("name", "").lower():
                                            opp = game.get("away_team") if is_home else game.get("home_team")
                                            spreads[opp] = {
                                                "spread": outcome.get("point", 0),
                                                "is_home": is_home,
                                            }
            return spreads
    except Exception as e:
        print(f"Could not fetch spreads: {e}")
    return {}


def main():
    data = load_data()

    qualified = [g for g in data["games"] if g["isQualified"]]
    upcoming = data.get("upcomingGames", [])

    # Fetch current spreads
    print("Fetching current spreads...")
    current_spreads = fetch_current_spreads()
    for game in upcoming:
        opp = game.get("opponent", "")
        if opp in current_spreads:
            game["spread"] = current_spreads[opp]["spread"]
            print(f"  {opp}: {current_spreads[opp]['spread']:+.1f}")

    print("=" * 60)
    print("BUZZING MODEL - HORNETS BETTING ANALYSIS")
    print("=" * 60)

    # Core 5 summary
    wins = sum(1 for g in qualified if g["result"] == "W")
    losses = len(qualified) - wins
    streak = get_streak(qualified)
    ats_wins = sum(1 for g in qualified if g.get("coveredSpread"))

    print(f"\n--- CORE 5 STATS ({len(qualified)} games) ---")
    print(f"Record: {wins}-{losses} ({wins/len(qualified)*100:.1f}%)")
    print(f"ATS: {ats_wins}-{len(qualified)-ats_wins} ({ats_wins/len(qualified)*100:.1f}%)")
    print(f"Current Streak: {streak}W")
    print(f"Avg Margin: +{CORE5_AVG_MARGIN}")

    if not upcoming:
        print("\nNo upcoming games found.")
        return

    print(f"\n--- UPCOMING GAMES ({len(upcoming)}) ---\n")

    for game in upcoming:
        pred = buzzing_predict(game, qualified)

        opp = game.get("opponent", "Unknown")
        date = game.get("date", "TBD")
        loc = "vs" if game.get("isHome") else "@"
        spread = game.get("spread")
        spread_str = f"{spread:+.1f}" if spread else "N/A"

        print(f"{date}: {loc} {opp}")
        print(f"  Spread: {spread_str}")
        print(f"  Opponent Tier: {pred['opp_tier'].upper()}")
        print(f"  Predicted Margin: {pred['predicted_margin']:+.1f}")

        if spread:
            print(f"  Value vs Spread: {pred['value_score']:+.1f}")

        print(f"  Confidence: {pred['confidence']} ({pred['confidence_score']})")
        print(f"  Recommendation: {pred['bet_size']}")

        if pred['opportunities']:
            print(f"  [+] {', '.join(pred['opportunities'])}")
        if pred['risks']:
            print(f"  [-] {', '.join(pred['risks'])}")

        print()

    # Summary table
    print("=" * 60)
    print("BETTING SUMMARY")
    print("=" * 60)
    print(f"{'Date':<12} {'Opponent':<15} {'Spread':<8} {'Value':<8} {'Bet':<10}")
    print("-" * 60)

    for game in upcoming:
        pred = buzzing_predict(game, qualified)
        date = game.get("date", "TBD")[:10]
        opp = game.get("opponent", "?")[:12]
        loc = "vs" if game.get("isHome") else "@"
        spread = game.get("spread")
        spread_str = f"{spread:+.1f}" if spread else "N/A"
        value_str = f"{pred['value_score']:+.1f}" if spread else "N/A"

        print(f"{date:<12} {loc} {opp:<12} {spread_str:<8} {value_str:<8} {pred['bet_size']:<10}")

    print()

    # Key betting rules
    print("=" * 60)
    print("BUZZING MODEL - KEY RULES")
    print("=" * 60)
    print("""
    Based on Core 5 performance (28 games, 78.6% ATS):

    MAX BET situations:
    - Road games vs weak/mid opponents (86.7% ATS on road)
    - Back-to-back games (83.3% ATS)
    - Spread value > 5 points (76.9% ATS)

    LARGE BET situations:
    - Home games vs weak opponents
    - Road games vs strong opponents
    - Spread value 3-5 points

    MEDIUM/CAUTION situations:
    - Home games vs strong opponents
    - Home games vs elite opponents

    AVOID situations:
    - Road games vs elite opponents (small sample but risky)

    Key insight: The market STILL doesn't respect the Core 5.
    Road games are the highest-value spots because the market
    treats them like the old, injured Hornets.
    """)


if __name__ == "__main__":
    main()
