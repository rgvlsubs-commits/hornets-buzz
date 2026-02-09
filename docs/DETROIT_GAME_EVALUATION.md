# Charlotte Hornets vs Detroit Pistons - Game Evaluation

**Date:** February 9, 2026
**Location:** Charlotte (HOME)
**Game Time:** TBD
**Document Purpose:** LLM evaluation of betting approach for this specific matchup

---

## 1. Team Profiles

### Charlotte Hornets (Core 5)
| Metric | Value | Rank |
|--------|-------|------|
| Record (Core 5) | 20-8 | - |
| Net Rating | +7.5 | ~5th |
| Offensive Rating | 118.4 | 2nd |
| Defensive Rating | 110.9 | 8th |
| Recent Form | 5-0 (last 5 Core 5) | - |

**Core 5 Lineup:**
- LaMelo Ball (PG) - Primary playmaker
- Kon Knueppel (SG) - Rookie
- Brandon Miller (SF) - 2nd year star
- Miles Bridges (PF) - Key scorer
- Moussa Diabaté (C) - Rim protection

**Recent Results (Core 5 only):**
| Date | Opponent | Result | Margin | Spread | Covered |
|------|----------|--------|--------|--------|---------|
| Feb 7 | @ ATL | W 126-119 | +7 | -1.5 | ✓ |
| Feb 5 | @ HOU | W 109-97 | +12 | -1.5 | ✓ |
| Feb 2 | vs NOP | W 102-96 | +6 | -4.5 | ✓ |
| Jan 31 | vs SAS | W 111-107 | +4 | -3.8 | ✓ |
| Jan 29 | @ DAL | W 123-122 | +1 | -0.1 | ✓ |

**ATS Streak:** 5-0 (covering by avg +4.4 pts)

### Detroit Pistons
| Metric | Value | Rank |
|--------|-------|------|
| Record | 38-13 | 2nd |
| Net Rating | +7.8 | 2nd |
| Offensive Rating | 117.9 | 2nd |
| Defensive Rating | 110.1 | 2nd |
| Elo | 1630 | 2nd |

**Classification:** ELITE OPPONENT (NR ≥ 6.0)

---

## 2. Current Lines (VERIFIED)

| Market | Line | Notes |
|--------|------|-------|
| **Spread** | **CHA +3.5** | Hornets are UNDERDOGS |
| **Moneyline** | **+130** | 43.5% implied win prob |
| **Total** | 224.5 | |
| Opening Spread | +3.5 | No movement yet |

**Critical Insight:** Despite similar net ratings (+7.5 vs +7.8), Vegas has Charlotte as 3.5-point home underdogs. This suggests:
- Market respects Detroit's 38-13 record
- Possible injury concerns not fully priced in
- Hornets Core 5 may still be undervalued

**Line Movement Potential:**
- If Cade Cunningham OUT: Line could move 2-3 pts toward CHA
- If Jalen Duren OUT: Additional 1-2 pts toward CHA
- Current injury adjustment model: **+4.5 pts** in Hornets' favor

---

## 3. Model Predictions (All 3 Modes)

### Input Parameters
```
Hornets NR: +7.5 (Core 5)
Pistons NR: +7.8 (Elite)
Home Court: +2.0 pts
Trade Deadline Adj: -1.5 pts (bench disruption)
Elite Opponent Penalty: -2.0 pts
Fatigue: None (2+ days rest expected)
```

### Standard Mode (Full Season Data)
- **Purpose:** Conservative baseline using all 53 games
- **Expected Margin:** ~-2.0 to 0 pts
- **Rationale:** Full season includes non-Core 5 games with worse metrics

### Bayesian Mode (RECOMMENDED FOR BETTING)
- **Purpose:** Blends Standard prior with Core 5 evidence
- **Prior Strength:** 46 (at 28 Core 5 games)
- **Expected Margin:** ~+0.5 to +2.5 pts
- **Rationale:** Core 5 performance weighted in, but tempered by prior

### Buzzing Mode (Core 5 Only)
- **Purpose:** Aggressive upper bound, diagnostic only
- **Expected Margin:** ~+3.0 to +5.0 pts
- **Rationale:** Pure Core 5 metrics, but higher variance

### Adjustments Applied
| Factor | Impact | Notes |
|--------|--------|-------|
| Home Court | +2.0 | Reduced from 2.5 per backtest |
| Elite Opponent | -2.0 | Detroit NR = +7.8 (backtest shows ~0 bias vs elite) |
| Trade Deadline | **-0.75** | Reduced from -1.5 per ChatGPT review (was double-penalizing) |
| Mid vs Mid | 0 | N/A (elite opponent) |
| Fatigue | 0 | Well rested |
| **Injury Adjustment** | **+4.5** | Harris OUT, Cunningham/Duren questionable |

### Regime-Based Variance (σ) - RSS Method
Per Gemini: Use Root Sum of Squares, not MAX.

| Component | σ Value | Boost² |
|-----------|---------|--------|
| Base | 11.5 | — |
| Core 5 | 14.5 | (14.5-11.5)² = 9.0 |
| Elite Opponent | 13.5 | (13.5-11.5)² = 4.0 |
| **Total σ** | **sqrt(11.5² + 9 + 4) = 16.2** | |

**Implication:** Higher σ means:
- Cover probability more uncertain
- Conviction score reduced (tail-risk haircut)
- Recommended bet size smaller

---

## 4. Backtest Context

### Overall Model Performance
| Metric | Hornets | League Avg | Gap |
|--------|---------|------------|-----|
| MAE | 12.27 | 10.87 | +1.40 |
| RMSE | 15.41 | 13.89 | +1.52 |
| ATS Accuracy | 54.2% | - | - |

### Relevant Buckets for This Game

**vs Elite Opponents (n=3):**
- MAE: 11.4 pts
- Predicted Avg: -11.2
- Actual Avg: -11.3
- Bias: ~0 (model is ACCURATE vs elite teams)

**Home Games (n=22):**
- MAE: 10.6 pts
- Predicted Avg: +2.9
- Actual Avg: +0.7
- Bias: +2.2 (slight overpredict at home)

**Core 5 Games (n=26):**
- MAE: 15.65 pts (HIGH VARIANCE)
- Predicted Avg: +2.8
- Actual Avg: +8.5
- Bias: -5.7 (underpredicting Core 5)

### Key Insight
The model has been ACCURATE vs elite opponents (nearly zero bias) but UNDERPREDICTS Core 5 games by 5.7 pts overall. This creates tension:
- Elite opponent → model should be accurate
- Core 5 game → model may underpredict

---

## 5. Moneyline vs Spread Analysis - SCENARIO-WEIGHTED (Per ChatGPT)

### Actual Lines
```
Spread: CHA +3.5 (-110)
Moneyline: CHA +130
Implied Win Prob: 43.5%
```

### Scenario-Weighted EV Calculation

Per ChatGPT: "Your EV math implicitly assumes the best scenario. Explicitly weight scenarios."

**Formula:** `E[margin] = Σ P(scenario_i) × margin_i`

| Scenario | Probability | Injury Adj | Margin | Weighted |
|----------|-------------|------------|--------|----------|
| All Detroit stars play | 40% | +0.5 | +1.0 | +0.40 |
| Cunningham plays, Duren OUT | 25% | +2.0 | +2.5 | +0.63 |
| Duren plays, Cunningham OUT | 15% | +2.5 | +3.0 | +0.45 |
| Both Cunningham + Duren OUT | 20% | +4.5 | +5.0 | +1.00 |
| **Expected Margin** | | | | **+2.48** |

**vs Previous Estimate:** Was +3.45 (max scenario bias) → Now +2.48 (probability-weighted)
**Reduction:** -0.97 pts (per ChatGPT's ~1-1.5 pts warning)

### Updated σ Calculation (Margin-Conditional)

Per ChatGPT: "Make σ partially conditional on predicted margin."
```
Base σ (RSS): 16.2
+ Margin boost: 0.20 × |2.48| = +0.5
= Effective σ: 16.7
```

### Spread Analysis (at σ=16.7)
```
Expected Cover Margin: +3.5 + 2.48 = +5.98 pts
Cover Probability: Φ(5.98 / 16.7) = Φ(0.36) ≈ 64%
Spread EV: (0.64 × 100) - (0.36 × 110) = +24.4 per $100
```

### Moneyline Analysis
```
Model Win Prob: Φ(2.48 / 16.7) = Φ(0.15) ≈ 56%
Implied Win Prob: 43.5%
Edge: +12.5%

ML EV (at +130): (0.56 × 130) - (0.44 × 100) = +28.8 per $100
```

### Updated Recommendation (Scenario-Weighted)
| Bet Type | Old EV | New EV | Recommendation |
|----------|--------|--------|----------------|
| Spread +3.5 | +45.4 | **+24.4** | Moderate value |
| ML +130 | +32.3 | **+28.8** | Similar value |

**Key Insight:** After probability-weighting, ML and Spread are nearly equal EV.
Per ChatGPT: "Your 60/40 split is a very grown-up solution."
| Moneyline +130 | +32.3 | Good value, lower EV |

**Verdict: SPREAD is the better bet** (higher EV, injury edge amplifies cover margin)

---

## 6. Injury Report (UPDATED - Feb 9, 2026 9:45 AM EST)

### Hornets Core 5 Status: ALL HEALTHY ✓
| Player | Status | Notes |
|--------|--------|-------|
| LaMelo Ball | AVAILABLE | ✓ |
| Brandon Miller | AVAILABLE | ✓ |
| Miles Bridges | AVAILABLE | ✓ |
| Moussa Diabaté | AVAILABLE | ✓ |
| Kon Knueppel | AVAILABLE | ✓ |

**Other Hornets OUT:**
- Coby White: OUT (injured through All-Star break)
- Liam McNeeley: OUT (rookie)
- Malaki Branham: OUT (thumb)

**Impact:** Core 5 intact. Bench shortened but not critical for our model.

### Detroit Pistons: 2 OUT + KEY GTD
| Player | Status | Impact | Notes |
|--------|--------|--------|-------|
| **Ron Holland II** | **OUT** | 3/5 | Confirmed |
| **Tim Smith** | **OUT** | 2/5 | Confirmed |
| **Jalen Duren** | **GTD** | 5/5 | **KEY - Game Time Decision** |
| Cade Cunningham | AVAILABLE | 5/5 | Expected to play |
| Tobias Harris | AVAILABLE | 4/5 | Expected to play |

### Injury Impact Analysis (UPDATED Feb 9, 9:45 AM)

**Current Assessment:**
- Cunningham & Harris: AVAILABLE (playing)
- Holland & Smith: OUT (minor bench impact)
- **Duren: GTD** (key variable)

**Revised Adjustment:**
| Scenario | Probability | Adjustment | Notes |
|----------|-------------|------------|-------|
| Duren PLAYS | 60% | +0.5 pts | Holland/Smith OUT adds ~+0.5 |
| Duren OUT | 40% | +2.5 pts | Core 5 vs Stewart mismatch |
| **Weighted** | — | **+1.3 pts** | Current expected adjustment |

**Position already locked at +3.0** - no change to strategy.
If Duren ruled OUT before tip, add reserve 0.5 units.

---

## 7. Risk Factors

### Elevated Risk (Caution)
1. **Elite Opponent** - Detroit is #2 in league, creates volatility
2. **High σ Regime** - 15.5 variance (tail-risk elevated)
3. **Trade Transition** - New bench players, unknown chemistry
4. **Core 5 Variance** - Backtest shows 15.65 MAE in Core 5 games

### Mitigating Factors
1. **Home Game** - +2.0 pts advantage
2. **Hot Streak** - 5-0 ATS, 5-0 SU in Core 5
3. **Model Accuracy vs Elite** - Near-zero bias historically
4. **Strong Offensive Rating** - 118.4 ORTG (2nd in league)
5. **Detroit Injuries** - Harris OUT, Cunningham/Duren questionable (+4.5 adjustment)

### Detroit-Specific Factors (Per ChatGPT Review)
1. **Detroit punishes weak rim protection**
   - Diabaté is solid but foul-prone
   - If he gets early foul trouble → σ increases further

2. **Detroit suppresses opponent assist rates**
   - Hurts LaMelo-heavy offense
   - Can flatten margin without killing win probability

**Implication:** Both factors reinforce **small sizing**, but don't change the bet direction.

---

## 8. Conviction Scoring

### Expected Conviction Breakdown
| Factor | Score | Notes |
|--------|-------|-------|
| Pace | ~10 | Normal pace expected |
| Opponent | 5 | Elite = low conviction |
| Core 5 Freshness | 25 | Recent games |
| Rest | 15 | Well rested |
| Injuries | 10 | Assume healthy (check) |
| Tail-Risk Haircut | -5 | σ=15.5 penalty |
| **Total** | **~60** | Medium conviction |

**Sizing Implication:**
- Half-Kelly at 60 conviction
- Cap at 60% of calculated Kelly
- Consider reducing further given elite opponent

---

## 9. Questions for LLM Evaluation

### Strategic Questions
1. Given the tension between "accurate vs elite" and "underpredict Core 5", how should we weight our prediction?

2. With σ=15.5 (high variance regime), should we prefer moneyline over spread to reduce exposure to margin uncertainty?

3. The Core 5 is 5-0 ATS on current streak - is this sustainable or regression candidate?

4. Trade deadline bench disruption (-1.5 pts) - is this adjustment appropriate for a home game against elite competition?

### Tactical Questions
5. What spread would make this a PASS vs a BET?

6. If Core 5 is healthy and line is CHA -2, what's your recommended:
   - Bet type (spread/ML/pass)
   - Conviction level (1-100)
   - Unit size (% of bankroll)

7. Any live betting opportunities to watch for given the matchup dynamics?

### Model Critique
8. Are there any factors we're missing that are specific to Detroit's playstyle?

9. Should the elite opponent penalty (-2.0) be higher given Detroit's #2 ranking?

10. Is the trade deadline adjustment overweighted for a Core 5 game where bench minutes may be limited?

---

## 10. Summary (UPDATED FEB 9, 2026 - 9:30 AM)

| Aspect | Assessment |
|--------|------------|
| Matchup Quality | Premium (two top-5 teams) |
| Line Value | **LOCKED IN** at +3.0 |
| Model Edge | +2.5 pts (scenario-weighted) |
| Variance Regime | High (σ=16.7 with margin-conditional) |
| Conviction | **65** |
| Core 5 Status | **ALL HEALTHY** ✓ |
| Key Risk | Detroit stars play through "management" |
| Bench Risk | Branham OUT = shorter rotation |

### Strategy: BET LOCKED IN

**Line moved +3.5 → +3.0.** Locked in position before further movement.

### Position Locked (Feb 9, 9:30 AM)

| Bet | Line | Size | Status |
|-----|------|------|--------|
| **SPREAD** | **+3.0** | **0.6 units** | LOCKED |
| **ML** | **+130** | **0.3 units** | LOCKED |
| **Reserve** | TBD | 0.5 units | IF Cunningham OUT |

**Total Exposure:** 0.9 units (with 0.5 reserve)

**Rationale:** Line moved +3.5 → +3.0. Locked in before further movement. Reserve kept for add-on if Cunningham ruled OUT (line would move to CHA -1 or better).

### Pre-Game Monitoring (60 min before tip)
- [ ] Confirm Cunningham status → IF OUT, add 0.5 units at current line
- [ ] Confirm Duren status → IF OUT, consider adding ML
- [ ] Watch for line movement past CHA -1 (would indicate major news)
- [ ] Check referee crew (high foul rate = Diabaté risk)

### Live Betting Triggers
Per Gemini:
- If Cunningham/Duren start but leave early → Live bet CHA
- If Diabaté gets 2 fouls in Q1 → σ increases, reduce live exposure
- If pace runs high (both teams ~102) → Variance elevated

### Exit Signals (reduce/pass)
- Cunningham AND Duren both play full minutes → Reduce to 0.5 units
- Line moves to CHA -1 or worse → Value extracted, PASS
- Any Core 5 player scratched → PASS
- Diabaté early foul trouble → Reduce live exposure

**Bottom Line:** Position locked at +3.0 spread (0.6u) and +130 ML (0.3u). Line moved from +3.5—bet the number, not the news. Reserve 0.5u to add if Cunningham ruled OUT. Live triggers active: BUY if opponent star exits early or Diabaté survives Q1 clean; SELL if Diabaté gets early foul trouble.

---

*Document generated: February 8, 2026*
*Model version: Regime-based variance with tail-risk sizing*
*Lines captured: February 8, 2026 @ 5:09 PM EST*
*Injury report: February 8, 2026 @ 4:00 PM EST*
