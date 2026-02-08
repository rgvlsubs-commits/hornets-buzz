#!/usr/bin/env python3
"""
Injury Report Updater for Hornets Buzz Tracker

Usage:
    python update_injuries.py --game-id 0022500761 --opponent "Detroit Pistons"

This script helps you manually update injury reports before games.
Run this before each game to ensure the prediction reflects current injury status.

Workflow:
1. Check injury reports for both teams (ESPN, CBS Sports, etc.)
2. Run this script with the game ID and opponent
3. Enter injuries when prompted
4. The data will be saved and used in predictions
"""

import json
import argparse
from datetime import datetime
from pathlib import Path

# Core 5 starters
CORE_5 = [
    "LaMelo Ball",
    "Kon Knueppel",
    "Brandon Miller",
    "Miles Bridges",
    "Moussa Diabaté"
]

# Status options
STATUSES = ["OUT", "DOUBTFUL", "QUESTIONABLE", "PROBABLE", "DAY-TO-DAY", "AVAILABLE"]

def load_injury_reports():
    """Load existing injury reports."""
    path = Path(__file__).parent.parent / "data" / "injury_reports.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_injury_reports(data):
    """Save injury reports."""
    path = Path(__file__).parent.parent / "data" / "injury_reports.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"\nSaved to {path}")

def get_injuries_input(team_name: str, is_hornets: bool = False) -> list:
    """Interactive input for injuries."""
    injuries = []

    print(f"\n{'='*50}")
    print(f"Enter injuries for {team_name}")
    print("(Press Enter with empty name to finish)")
    print("="*50)

    if is_hornets:
        print(f"\nCore 5 to monitor: {', '.join(CORE_5)}")

    while True:
        name = input("\nPlayer name (or Enter to finish): ").strip()
        if not name:
            break

        print(f"Status options: {', '.join(STATUSES)}")
        status = input("Status: ").strip().upper()
        if status not in STATUSES:
            print(f"Invalid status. Using QUESTIONABLE.")
            status = "QUESTIONABLE"

        injury = input("Injury description: ").strip()

        is_star = False
        if is_hornets:
            is_star = any(core.lower() in name.lower() for core in CORE_5)
        else:
            is_star_input = input("Is this a key star? (y/n): ").strip().lower()
            is_star = is_star_input == 'y'

        injuries.append({
            "name": name,
            "status": status,
            "injury": injury,
            "isKeyStar": is_star,
            "impactRating": 5 if is_star else 2
        })

        print(f"Added: {name} - {status} ({injury})")

    return injuries

def analyze_injuries(hornets_injuries: list, opponent_injuries: list, opponent: str) -> dict:
    """Analyze injuries and generate summary."""
    summary_parts = []
    adjustment = 0.0

    # Check Core 5
    core5_injured = [p for p in hornets_injuries
                     if any(core.lower() in p["name"].lower() for core in CORE_5)]

    core5_status = "ALL_HEALTHY"
    if any(p["status"] in ["OUT", "DOUBTFUL"] for p in core5_injured):
        core5_status = "KEY_PLAYER_OUT"
        out_players = [p["name"] for p in core5_injured if p["status"] in ["OUT", "DOUBTFUL"]]
        summary_parts.append(f"CAUTION: {', '.join(out_players)} out/doubtful. Core 5 thesis impacted.")
        adjustment -= 3.0 * len(out_players)
    elif any(p["status"] in ["QUESTIONABLE", "DAY-TO-DAY"] for p in core5_injured):
        core5_status = "SOME_QUESTIONABLE"
        q_players = [p["name"] for p in core5_injured if p["status"] in ["QUESTIONABLE", "DAY-TO-DAY"]]
        summary_parts.append(f"Monitor: {', '.join(q_players)} questionable. Check before tip-off.")
    else:
        summary_parts.append("All Core 5 starters are healthy and available.")

    # Check opponent stars
    opp_stars_out = [p for p in opponent_injuries if p.get("isKeyStar") and p["status"] in ["OUT", "DOUBTFUL"]]
    opp_stars_q = [p for p in opponent_injuries if p.get("isKeyStar") and p["status"] in ["QUESTIONABLE", "DAY-TO-DAY"]]

    if opp_stars_out:
        names = [p["name"] for p in opp_stars_out]
        summary_parts.append(f"ADVANTAGE: {opponent} without {', '.join(names)}. Significant impact.")
        adjustment += 2.0 * len(opp_stars_out)

    if opp_stars_q:
        names = [p["name"] for p in opp_stars_q]
        summary_parts.append(f"{opponent}'s {', '.join(names)} questionable - monitor for updates.")
        adjustment += 0.5 * len(opp_stars_q)

    if not opp_stars_out and not opp_stars_q:
        if any(p["status"] == "OUT" for p in opponent_injuries):
            summary_parts.append(f"{opponent} has depth players out, but key rotation intact.")
        else:
            summary_parts.append(f"{opponent} appears healthy with no major injuries.")

    # Net assessment
    if adjustment > 2:
        summary_parts.append(f"Net injury edge: +{adjustment:.1f} pts in Hornets' favor.")
    elif adjustment < -2:
        summary_parts.append(f"Net injury impact: {adjustment:.1f} pts. Consider reducing position.")

    opp_out_count = len([p for p in opponent_injuries if p["status"] == "OUT"])

    return {
        "hornetsCore5Status": core5_status,
        "opponentKeyPlayersStatus": f"{opp_out_count} players OUT, {len(opp_stars_q)} stars questionable",
        "injuryImpact": " ".join(summary_parts),
        "spreadAdjustment": round(adjustment, 1)
    }

def main():
    parser = argparse.ArgumentParser(description="Update injury reports for Hornets games")
    parser.add_argument("--game-id", help="NBA game ID (e.g., 0022500761)")
    parser.add_argument("--opponent", required=True, help="Opponent team name (e.g., 'Detroit Pistons')")
    parser.add_argument("--quick", action="store_true", help="Quick mode - just update opponent name, no prompts")
    args = parser.parse_args()

    print("="*60)
    print("HORNETS INJURY REPORT UPDATER")
    print("="*60)
    print(f"Opponent: {args.opponent}")
    if args.game_id:
        print(f"Game ID: {args.game_id}")

    # Load existing data
    injury_data = load_injury_reports()

    if args.quick:
        # Quick mode - just show current data
        key = args.game_id or args.opponent
        if key in injury_data:
            report = injury_data[key]
            print(f"\nCurrent report (updated {report.get('lastUpdated', 'unknown')}):")
            print(f"  Core 5: {report.get('hornetsCore5Status', 'unknown')}")
            print(f"  Summary: {report.get('injuryImpact', 'none')}")
            print(f"  Adjustment: {report.get('spreadAdjustment', 0):+.1f} pts")
        else:
            print("\nNo existing report found.")
        return

    # Get Hornets injuries
    print("\n" + "="*60)
    print("STEP 1: HORNETS INJURIES")
    print("="*60)
    hornets_injuries = get_injuries_input("Charlotte Hornets", is_hornets=True)

    # Get opponent injuries
    print("\n" + "="*60)
    print(f"STEP 2: {args.opponent.upper()} INJURIES")
    print("="*60)
    opponent_injuries = get_injuries_input(args.opponent)

    # Analyze
    analysis = analyze_injuries(hornets_injuries, opponent_injuries, args.opponent)

    # Build report
    report = {
        "hornetsInjuries": hornets_injuries,
        "opponentInjuries": opponent_injuries,
        "hornetsCore5Status": analysis["hornetsCore5Status"],
        "opponentKeyPlayersStatus": analysis["opponentKeyPlayersStatus"],
        "injuryImpact": analysis["injuryImpact"],
        "spreadAdjustment": analysis["spreadAdjustment"],
        "lastUpdated": datetime.utcnow().isoformat() + "Z"
    }

    # Preview
    print("\n" + "="*60)
    print("INJURY REPORT PREVIEW")
    print("="*60)
    print(f"\nCore 5 Status: {report['hornetsCore5Status']}")
    print(f"Opponent Status: {report['opponentKeyPlayersStatus']}")
    print(f"\nSummary:\n{report['injuryImpact']}")
    print(f"\nSpread Adjustment: {report['spreadAdjustment']:+.1f} pts")

    # Confirm and save
    confirm = input("\nSave this report? (y/n): ").strip().lower()
    if confirm == 'y':
        if args.game_id:
            injury_data[args.game_id] = report
        injury_data[args.opponent] = report
        save_injury_reports(injury_data)
        print("\nInjury report saved successfully!")
        print("Run 'python scripts/fetch_data.py' to update the main data file.")
    else:
        print("\nReport not saved.")

if __name__ == "__main__":
    main()
