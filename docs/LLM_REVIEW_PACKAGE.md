# Charlotte Hornets Spread Prediction Model - LLM Review Package

**Date:** February 8, 2026
**Purpose:** Comprehensive review of model architecture, backtest results, and application to upcoming Detroit Pistons game
**Request:** Critique our approach—find bugs, logical errors, double-counting, and untapped opportunities

---

# PART 1: MODEL ARCHITECTURE & BACKTEST RESULTS

## 1.1 Model Overview

A spread prediction model for Charlotte Hornets NBA games with three prediction modes, built around the thesis that the Hornets' Core 5 lineup significantly outperforms their full-season metrics.

### Three Prediction Modes

| Mode | Data Source | Use Case | Description |
|------|-------------|----------|-------------|
| **Standard** | All 53 games | Diagnostic | Conservative baseline using full season |
| **Bayesian** | Blended | **Recommended** | Shrinkage blend of Standard + Core 5 data |
| **Buzzing** | Core 5 only (28 games) | Diagnostic | Aggressive upper bound, Core 5 metrics only |

### Core 5 Lineup
| Player | Position | Status |
|--------|----------|--------|
| LaMelo Ball | PG | Primary playmaker |
| Kon Knueppel | SG | Rookie (joined starting lineup) |
| Brandon Miller | SF | 2nd year star |
| Miles Bridges | PF | Key scorer |
| Moussa Diabaté | C | Rim protection |

**Definition:** A "qualified game" is one where all 5 Core 5 starters played significant minutes.

---

## 1.2 Core Parameters

### Net Rating Adjustments
```typescript
NR_HOME_ADVANTAGE = 2.0       // Reduced from 2.5 per backtest (+1.3 overpredict at home)
NR_FATIGUE_PENALTY = 1.5      // Reduced from 3.0 (Hornets +9.8 actual on B2Bs)
```

### Opponent Adjustments
```typescript
ELITE_OPPONENT_THRESHOLD = 6.0   // Net rating threshold for elite classification
ELITE_OPPONENT_PENALTY = -2.0    // Additional margin penalty vs elite teams
MID_VS_MID_ADJUSTMENT = -1.0     // Corrects for +2.2 league overpredict bias
```

### Regime-Based Variance (σ)
Per ChatGPT review: "Stop modeling variance like a retail bettor. Different situations have DIFFERENT variance, not just different means."

```typescript
SIGMA_BASE = 11.5           // Normal games
SIGMA_CORE5 = 14.5          // Core 5 games (higher ceiling AND floor)
SIGMA_HIGH_PACE = 15.0      // High pace = more possessions = more variance
SIGMA_ELITE_OPPONENT = 13.5 // Elite opponents = unpredictable outcomes
HIGH_PACE_THRESHOLD = 205   // Combined pace above this = high variance
```

**Why this matters:** Cover probability = Φ((predicted_margin + spread) / σ). Higher σ means lower certainty, which must flow through to sizing.

### Blend Weights
```typescript
ELO_WEIGHT = 0.55    // Increased from 0.40 based on backtest
NR_WEIGHT = 0.45     // Decreased from 0.60

WINDOW_WEIGHTS = {
  last4: 0.30,
  last7: 0.25,
  last10: 0.25,
  season: 0.20
}
```

### Bayesian Prior (Adaptive)
```typescript
priorStrength = max(40, min(60, 60 - 0.5 * sampleSize))
// At 28 games: 46
// At 40 games: 40

bayesianMargin = (priorStrength × standardMargin + sampleSize × buzzingMargin)
                 / (priorStrength + sampleSize)
```

### Core 5 Time Decay
```typescript
// Market adjusts to Core 5 performance over time
core5DecayFactor = exp(-daysSinceLastCore5 / 30)  // MEAN decay (30-day half-life)
varianceDecay = exp(-daysSinceLastCore5 / 60)     // VARIANCE decay (60-day half-life)

// Applied to Bayesian blend weight:
sampleWeight = rawSampleWeight * core5DecayFactor
```

---

## 1.3 Backtest Results

### Hornets-Specific (53 games through Feb 8, 2026)
| Metric | Value | Notes |
|--------|-------|-------|
| MAE | 12.27 pts | Improved from 14.83 after regime-based adjustments |
| RMSE | 15.41 pts | |
| ATS Accuracy | 54.2% | Above break-even (52.4%) |

### League-Wide Baseline (600+ games)
| Metric | Value |
|--------|-------|
| MAE | 10.87 pts |
| RMSE | 13.89 pts |
| Straight-up Accuracy | 66.2% |

### Hornets vs League Comparison
| Metric | League | Hornets | Gap |
|--------|--------|---------|-----|
| MAE | 10.87 | 12.27 | +1.40 worse |
| RMSE | 13.89 | 15.41 | +1.52 worse |

**Key Finding:** Hornets have higher variance outcomes than league average—this is a feature, not a bug. The Core 5 creates extreme outcomes (Utah +57, OKC +27).

---

## 1.4 Bucket Analysis

### Hornets-Specific Buckets
| Bucket | n | MAE | Bias | Interpretation |
|--------|---|-----|------|----------------|
| Core 5 | 26 | 15.65 | -5.7 | Model underpredicts (Core 5 dominates) |
| Missing starters | 27 | — | +8.4 | Model overpredicts (they lose without Core 5) |
| vs Elite (NR ≥ 6.0) | 3 | 11.4 | ~0 | Model is ACCURATE vs elite |
| Home games | 22 | 10.6 | +2.2 | Slight overpredict at home |
| Back-to-back | 5 | — | -7.0 | Underpredicts (Hornets +9.8 actual on B2Bs) |
| 2+ rest days | 30 | — | +6.4 | Overpredicts rest advantage |

### Key Insight
**Tension:** The model is accurate vs elite opponents (n=3, ~0 bias) BUT underpredicts Core 5 games by 5.7 pts overall. When facing elite opponents WITH Core 5 active, which pattern dominates?

---

## 1.5 Adjustments Made (Post-Backtest)

| Parameter | Before | After | Evidence |
|-----------|--------|-------|----------|
| Home court | +2.5 | +2.0 | League +1.3 overpredict at home |
| B2B penalty | -3.0 | -1.5 | Hornets +9.8 actual on B2Bs |
| Pace factor | 2% | 3% | High-pace MAE 50% worse |
| Survivorship penalty | -0.75 | -0.25 | Underpredicting Core 5 by 5.7 |
| Bench penalty | -0.5 | -0.25 | Same reason |
| Mid vs Mid | — | -1.0 | League +2.2 overpredict bias |
| Trade deadline adjustment | -1.5 | -0.75 | Was double-penalizing (margin + σ + conviction) |
| Trade deadline σ boost | +1.0 | 0 | Removed—variance already captured in Core5 regime |

---

## 1.6 Conviction Scoring (Separate from Prediction)

**Problem:** A model can predict +5 margin, but how confident should we be?

**Solution:** A 0-100 conviction score based on volatility factors, NOT the margin itself.

| Factor | Points | Rationale |
|--------|--------|-----------|
| Normal Pace (<195 combined) | +20 | Predictable game flow |
| Low Pace bonus | +10 | Even more stable |
| Weak Opponent (NR < -3.0) | +20 | More predictable |
| Mid Opponent (-3.0 to +3.0) | +15 | Medium |
| Elite Opponent (NR ≥ +6.0) | +5 | Volatile outcomes |
| Core 5 Recent (<5 days) | +25 | Fresh lineup data |
| Well Rested (2+ days) | +15 | Performance boost |
| Opponent Stars OUT | +10 | Clear advantage |
| **Tail-Risk Haircut** | -5 to -15 | High σ penalty |

### Tail-Risk Haircut Formula
```typescript
tailPenalty = min(1.0, 11.5 / σ)
convictionHaircut = (1 - tailPenalty) × 15

// At σ=15.5: haircut = 3.9 points off conviction
// At σ=11.5: haircut = 0 (baseline, no penalty)
```

**Sizing rule:** Conviction × 0.6 = bet size as % of half-Kelly.

---

## 1.7 Moneyline vs Spread Decision

For every game, we calculate EV for both bet types:

### Spread EV
```
coverProb = Φ((predicted_margin + spread) / σ)
spreadEV = (coverProb × 100) - ((1 - coverProb) × 110)
```

### Moneyline EV
```
winProb = Φ(predicted_margin / σ)

If ML positive (+150): mlEV = (winProb × 150) - ((1 - winProb) × 100)
If ML negative (-150): mlEV = (winProb × 100) - ((1 - winProb) × 150)
```

### Decision Rule
- If neither EV > $2: **PASS**
- If ML EV > spread EV + $1: **MONEYLINE**
- If spread EV > ML EV + $1: **SPREAD**
- Otherwise: Prefer **SPREAD** (lower variance)

---

# PART 2: OVERALL APPROACH & PHILOSOPHY

## 2.1 Core Thesis

The Charlotte Hornets perform significantly better when their 5 core starters play together. The market may be slow to adjust to this, creating a **short-term window** to exploit.

### What We Acknowledge
- The 78% ATS rate in early Core 5 games was **NOT sustainable** (small sample inflation)
- The market **WILL adjust**—Vegas isn't stupid
- Our true edge is likely **1-3% ATS**, not 26%
- We use **Bayesian shrinkage** to temper estimates toward reasonable values
- We use **half-Kelly sizing (capped at 60%)** to manage bankroll risk

### Current State (Feb 8, 2026)
| Metric | Value |
|--------|-------|
| Core 5 Record | 20-8 |
| Core 5 Net Rating | +7.5 |
| Core 5 ATS | 16-12 (57.1%) |
| Last 5 Core 5 games | 5-0 ATS |

---

## 2.2 Risk Management

### Kelly Criterion Implementation
```python
# 1. Cap effective win probability at 56%
effective_prob = min(model_prob, 0.56)

# 2. Calculate half-Kelly
kelly = (b × p - q) / b
half_kelly = kelly / 2

# 3. Cap at 60% of calculated half-Kelly
bet_size = half_kelly × min(conviction / 100, 0.60)
```

### Why These Safeguards?
- Model probabilities are inflated by small samples
- Feeding 75%+ probabilities into Kelly = bankroll destruction
- Half-Kelly reduces variance at cost of expected growth
- Conviction cap prevents oversizing on high-σ games

### Statistical Guardrails
- **MOV Cap:** ±20 pts (prevents blowouts from distorting Elo)
- **Margin Cap:** ±15 pts for display (raw margin used for sizing)
- **Injury Cap:** ±6 pts total adjustment

---

## 2.3 Exit Strategy

### Continue Betting When:
- CLV (Closing Line Value) remains positive or near-zero
- Core 5 continues to outperform
- High-conviction bets outperform low-conviction

### Stop/Reduce Betting When:
- Consistent negative CLV (market has priced us correctly)
- Core 5 regresses hard (performance was noise)
- Key Core 5 injury (thesis becomes moot)
- Line moves past CHA -1 before game (value extracted)

---

# PART 3: APPLICATION TO DETROIT PISTONS GAME

**Date:** February 9, 2026
**Location:** Charlotte (HOME)
**Significance:** Elite opponent test case

---

## 3.1 Team Profiles

### Charlotte Hornets (Core 5 Metrics)
| Metric | Value | Rank |
|--------|-------|------|
| Record (Core 5) | 20-8 | — |
| Net Rating | +7.5 | ~5th |
| Offensive Rating | 118.4 | 2nd |
| Defensive Rating | 110.9 | 8th |
| Recent Form | 5-0 (last 5 Core 5) | — |
| ATS Streak | 5-0 (covering by avg +4.4 pts) | — |

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

## 3.2 Current Lines (Verified Feb 8, 5:09 PM EST)

| Market | Line | Notes |
|--------|------|-------|
| **Spread** | **CHA +3.5** | Hornets are HOME UNDERDOGS |
| **Moneyline** | **+130** | 43.5% implied win prob |
| **Total** | 224.5 | |
| Opening Spread | +3.5 | No movement yet |

**The Paradox:** Two teams with nearly identical net ratings (+7.5 vs +7.8), but Charlotte is a 3.5-point home underdog. Why?

Possible explanations:
1. Market respects Detroit's 38-13 record
2. Hornets Core 5 still undervalued
3. Injury concerns not fully priced in

---

## 3.3 Injury Report (Critical - Feb 8, 4:00 PM EST)

### Charlotte Hornets Core 5: ALL HEALTHY ✓
| Player | Status |
|--------|--------|
| LaMelo Ball | AVAILABLE |
| Brandon Miller | AVAILABLE |
| Miles Bridges | AVAILABLE |
| Moussa Diabaté | AVAILABLE |
| Kon Knueppel | AVAILABLE |

**Other Hornets:**
- Tidjane Salaun: PROBABLE (illness)
- Josh Green: PROBABLE (Achilles management)
- Malaki Branham: AVAILABLE (just traded, joining team)
- Coby White: OUT (injured through All-Star break)

### Detroit Pistons: SIGNIFICANT INJURIES
| Player | Status | Impact | Notes |
|--------|--------|--------|-------|
| **Tobias Harris** | **OUT** | 4/5 | Left hip soreness |
| **Cade Cunningham** | **DAY-TO-DAY** | 5/5 | Right wrist management (played 38 min Thu) |
| **Jalen Duren** | **QUESTIONABLE** | 5/5 | Right knee soreness (left game early Thu) |

### Injury Impact Analysis
**Model Spread Adjustment: +4.5 pts in Charlotte's favor**

- Harris OUT = Confirmed rotation weakening
- Cunningham DAY-TO-DAY = Their best player at risk
- Duren QUESTIONABLE = Their starting center at risk

**Potential Line Movement:**
- If Cunningham + Duren both OUT: Line could move to CHA -1.5 to -2.5
- Current +3.5 becomes MASSIVE value if both sit

---

## 3.4 Trade Deadline Impact (Feb 4-6, 2026)

### Hornets Transactions

**OUT:**
- Tre Mann (traded to Memphis)
- Grant Williams (traded to Indiana)
- DaQuan Jeffries (waived)

**IN:**
- Malaki Branham (from Indiana via 3-team deal)
- Jaylen Wells (from Memphis)
- John Konchar (from Memphis)
- Trey Jemison (from Memphis)

**Impact Assessment:**
- Bench rotation disrupted
- New players need time to integrate
- **Core 5 unaffected**
- Trade deadline adjustment: -0.75 pts to margin (expires Feb 16)

### Detroit Transactions

**None major** - Detroit stood pat at deadline.

**Impact Assessment:**
- No roster disruption
- Chemistry intact
- BUT: Key injuries (Cunningham, Duren) may offset this advantage

---

## 3.5 Model Predictions

### Input Parameters
```
Hornets NR: +7.5 (Core 5)
Pistons NR: +7.8 (Elite)
Home Court: +2.0 pts
Trade Deadline Adj: -0.75 pts (bench disruption, expires Feb 16)
Elite Opponent Penalty: -2.0 pts
Fatigue: None (2+ days rest expected)
Injury Adjustment: +4.5 pts (Harris OUT, Cunningham/Duren questionable)
```

### Raw Calculation
```
Net Rating Differential: +7.5 - 7.8 = -0.3
Home Court: +2.0
Elite Opponent Penalty: -2.0
Trade Deadline: -0.75
Injury Adjustment: +4.5
─────────────────────────
Predicted Margin: +3.45 pts
```

### Regime Analysis
```
Active regime: Core5 + EliteOpp
Base σ: 14.5 (Core 5)
Trade transition σ boost: +1.0
Final σ: 15.5
```

### By Prediction Mode

| Mode | Predicted Margin | Notes |
|------|------------------|-------|
| Standard | ~-2.0 to 0 | Full season data, conservative |
| **Bayesian** | **+3.45** | **Recommended for betting** |
| Buzzing | +5.0 to +7.0 | Pure Core 5, aggressive upper bound |

---

## 3.6 Cover Probability & EV Analysis

### Spread Analysis (at σ=15.5)
```
Expected Cover Margin = spread + predicted_margin
                      = 3.5 + 3.45 = 6.95 pts

Cover Probability = Φ(6.95 / 15.5) = Φ(0.45) ≈ 67%

Spread EV = (0.67 × 100) - (0.33 × 110) = +30.7 per $100
```

### Moneyline Analysis
```
Model Win Prob = Φ(3.45 / 15.5) = Φ(0.22) ≈ 59%
Implied Win Prob (at +130) = 100 / (130 + 100) = 43.5%
Edge = 59% - 43.5% = +15.5%

ML EV (at +130) = (0.59 × 130) - (0.41 × 100) = +35.7 per $100
```

### Recommendation
| Bet Type | Line | EV per $100 | Recommendation |
|----------|------|-------------|----------------|
| **Spread** | +3.5 | +30.7 | **STRONG BET** |
| Moneyline | +130 | +35.7 | Good value, higher EV but more variance |

**Verdict:** Both are strong bets. Spread is safer (67% cover prob). ML has higher EV but only 59% win prob.

---

## 3.7 Conviction Score

| Factor | Points | Notes |
|--------|--------|-------|
| Normal Pace | +10 | Expected pace ~224.5 |
| Elite Opponent | +5 | Reduced (volatile matchup) |
| Core 5 Recent | +25 | Last Core 5 game: Feb 7 (1 day ago) |
| Well Rested | +15 | 2+ days rest expected |
| All Core 5 Healthy | +10 | All 5 AVAILABLE |
| Detroit Injuries | +10 | Harris OUT, Cunningham/Duren questionable |
| Tail-Risk Haircut | -5 | σ=15.5 penalty |
| **Total** | **70** | Medium-high conviction |

**Sizing:** 1.0-1.5 units (70% of calculated half-Kelly)

---

## 3.8 Risk Factors

### Elevated Risk (Caution)
1. **Elite Opponent** - Detroit is #2 in league, creates volatility
2. **High σ Regime** - 15.5 variance (tail-risk elevated)
3. **Trade Transition** - New bench players, unknown chemistry
4. **Core 5 Variance** - Backtest shows 15.65 MAE in Core 5 games

### Detroit-Specific Concerns
1. **Detroit punishes weak rim protection**
   - Diabaté is solid but foul-prone
   - If he gets early foul trouble → σ increases further

2. **Detroit suppresses opponent assist rates**
   - Hurts LaMelo-heavy offense
   - Can flatten margin without killing win probability

### Mitigating Factors
1. **Home Game** - +2.0 pts advantage
2. **Hot Streak** - 5-0 ATS, 5-0 SU in Core 5
3. **Model Accuracy vs Elite** - Near-zero bias historically (n=3)
4. **Strong Offensive Rating** - 118.4 ORTG (2nd in league)
5. **Detroit Injuries** - Harris OUT, Cunningham/Duren questionable

---

## 3.9 Pre-Game Checklist

- [ ] Confirm Cunningham status by 5 PM (DAY-TO-DAY)
- [ ] Confirm Duren status by 5 PM (QUESTIONABLE)
- [ ] Check for line movement toward Charlotte
- [ ] If both OUT → Consider increasing position to 2 units

### Exit Signals (Reduce/Pass)
- If Cunningham AND Duren both play full minutes
- If line moves to CHA -1 or worse (value extracted)
- If any Core 5 player scratched

---

## 3.10 Final Recommendation

| Bet | Line | EV | Size | Reasoning |
|-----|------|-----|------|-----------|
| **SPREAD** | **+3.5** | **+31** | **1.0-1.5 units** | Best value; injury edge amplifies cover |
| ML (alt) | +130 | +36 | 0.5-1 unit | Higher EV but more variance |

**Bottom Line:** Near-identical team strength, full Core 5 vs injured Detroit, +3.5 points of line value. Model shows +6.95 expected cover margin with 67% probability. Conviction 70/100.

---

# PART 4: QUESTIONS FOR LLM REVIEW

## 4.1 Model Architecture Questions

1. **Regime-Based σ:** Is our σ selection logic correct? We take the MAX of applicable regimes—should we SUM or use a more sophisticated combination?

2. **Bayesian Prior Decay:** We use 60 - 0.5×sampleSize. Is this decay rate appropriate, or should we use a different functional form?

3. **Time Decay Separation:** We decay mean on 30-day half-life but variance on 60-day half-life. Is this distinction valid, or are we overcomplicating?

4. **Double-Counting Check:** We apply:
   - Elite opponent penalty to MARGIN (-2.0)
   - Elite opponent affects σ (13.5 instead of 11.5)
   - Elite opponent reduces conviction (5 pts instead of 15)

   Is this triple-application of the same factor defensible, or are we over-penalizing?

## 4.2 Backtest Interpretation Questions

5. **Core 5 vs Elite Tension:** Model is accurate vs elite (n=3, ~0 bias) but underpredicts Core 5 by 5.7 pts. In the Detroit game (Core 5 vs Elite), which pattern should dominate?

6. **Sample Size Concerns:** n=3 for elite opponents is tiny. Should we weight the "accurate vs elite" finding at all, or ignore it?

7. **ATS Streak Sustainability:** Core 5 is 5-0 ATS on current streak. Is this:
   - Skill (Core 5 is genuinely undervalued)
   - Luck (regression incoming)
   - Both (true edge exists but smaller than 100%)

## 4.3 Application Questions

8. **Injury Adjustment Size:** We use +4.5 pts for Detroit injuries. Is this:
   - Too conservative (Harris OUT + Cunningham/Duren DAY-TO-DAY could be worth +6-8 pts)
   - Too aggressive (Cunningham often plays through "wrist management")
   - About right

9. **Trade Deadline Adjustment:** We use -0.75 pts expiring Feb 16. Is this:
   - Still too high (Core 5 unaffected, bench barely plays)
   - Too low (chemistry disruption is real)
   - Wrong structure (should be σ boost, not margin penalty)

10. **Moneyline vs Spread:** Model shows ML EV (+36) > Spread EV (+31). Should we follow the higher EV, or does the variance argument favor spread despite lower EV?

## 4.4 Risk Management Questions

11. **Conviction Scoring:** Is our 0-100 scoring system well-calibrated? Should factors have different weights?

12. **Tail-Risk Haircut:** We reduce conviction by (1 - 11.5/σ) × 15 at high σ. Is this haircut too aggressive, too lenient, or about right?

13. **Sizing Rule:** At conviction 70, we bet ~1.0-1.5 units. Is this too conservative for a +31 EV spot?

## 4.5 Missing Factors

14. **What signals are we missing?**
   - Referee tendencies?
   - Travel/time zone effects?
   - National TV game adjustments?
   - Revenge game narratives?

15. **Live Betting Opportunity:** Given Detroit's injury situation, are there specific live betting triggers we should watch for?
   - If Cunningham/Duren start but leave early
   - If Diabaté gets in foul trouble
   - If pace runs high (both teams are ~102 pace)

---

# APPENDIX A: Worst Predictions (Outliers)

| Date | Opponent | Predicted | Actual | Error |
|------|----------|-----------|--------|-------|
| 2026-01-10 | @ Utah | +9.7 | **+57** | 47.3 |
| 2026-01-05 | @ OKC | -11.7 | **+27** | 38.7 |
| 2025-12-05 | @ Toronto | -11.6 | **+26** | 37.6 |

**Insight:** These are games where healthy Hornets massively outperformed. The model's conservatism (survivorship penalty, elite penalty) hurt here. This is why we use regime-based σ—these outcomes ARE possible.

---

# APPENDIX B: Recent Core 5 Results

| Date | Opponent | Result | Margin | Spread | Covered |
|------|----------|--------|--------|--------|---------|
| Feb 7 | @ ATL | W 126-119 | +7 | -1.5 | ✓ |
| Feb 5 | @ HOU | W 109-97 | +12 | -1.5 | ✓ |
| Feb 2 | vs NOP | W 102-96 | +6 | -4.5 | ✓ |
| Jan 31 | vs SAS | W 111-107 | +4 | -3.8 | ✓ |
| Jan 29 | @ DAL | W 123-122 | +1 | -0.1 | ✓ |

**ATS Streak:** 5-0 (covering by avg +4.4 pts)

---

*Document generated: February 8, 2026*
*Model version: Regime-based variance with Bayesian blending*
*Lines captured: February 8, 2026 @ 5:09 PM EST*
*Injury report: February 8, 2026 @ 4:00 PM EST*
