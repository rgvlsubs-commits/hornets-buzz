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

## 2. Current Lines (MANUAL CHECK REQUIRED)

*Note: Lines not available in API at time of document creation. Please verify current lines before evaluation.*

| Market | Expected Range | Notes |
|--------|----------------|-------|
| Spread | PK to CHA -2.5 | Home team, similar strength |
| Moneyline | -105 to -130 | Close matchup |
| Total | 225-230 | Both teams efficient |

**Line Movement to Watch:**
- Opening spread capture
- CLV opportunity if line moves toward Hornets

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
| Elite Opponent | -2.0 | Detroit NR = +7.8 |
| Trade Deadline | -1.5 | Bench disruption (expires Feb 16) |
| Mid vs Mid | 0 | N/A (elite opponent) |
| Fatigue | 0 | Well rested |

### Regime-Based Variance (σ)
| Component | σ Contribution |
|-----------|----------------|
| Core 5 Active | 14.5 (base) |
| Elite Opponent | +0 (already in Core5) |
| Trade Transition | +1.0 |
| **Total σ** | **15.5** |

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

## 5. Moneyline vs Spread Analysis

### Expected Calculation (assuming spread = -1.5)
```
Model Win Prob: ~52-55% (close matchup)
Implied Win Prob: ~53-56% (typical -110 to -130 line)
Edge: Marginal (0-2%)

Spread EV: Depends on cover probability at σ=15.5
Moneyline EV: Depends on exact ML odds

Recommendation: Need actual lines to calculate
```

### Scenarios
| If Spread Is... | Likely Recommendation |
|-----------------|----------------------|
| CHA -3.5 or worse | PASS or small ML |
| CHA -1.5 to -2.5 | SPREAD (if Core 5 healthy) |
| CHA PK or +0.5 | SPREAD (value) |
| CHA +1.5 or better | SPREAD (strong value) |

---

## 6. Injury Report (MANUAL CHECK REQUIRED)

### Hornets Core 5 Status
| Player | Status | Impact |
|--------|--------|--------|
| LaMelo Ball | CHECK | Critical |
| Brandon Miller | CHECK | Critical |
| Miles Bridges | CHECK | Critical |
| Mark Williams | CHECK | Critical |
| 5th Starter | CHECK | Important |

**Trade Deadline Acquisitions:**
- Coby White: OUT (injured through All-Star break)
- Malaki Branham: Available (integration period)
- Xaiver Tillman: Available (integration period)

### Pistons Key Players
*Check injury report for:*
- Cade Cunningham
- Jaden Ivey
- Other key rotation players

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

## 10. Summary

| Aspect | Assessment |
|--------|------------|
| Matchup Quality | Premium (two top-5 teams) |
| Model Confidence | Medium (elite opponent accurate, but Core 5 variance) |
| Variance Regime | High (σ=15.5) |
| Conviction | ~60/100 |
| Key Factor | Core 5 health status |
| Recommendation | Wait for lines, verify injuries, likely SMALL position if Core 5 healthy |

**Bottom Line:** This is a high-quality matchup between two elite teams. The model suggests a close game (Hornets slight favorite at home). Given high variance regime and elite opponent, bet sizing should be conservative. Wait for actual lines and injury confirmation before final decision.

---

*Document generated: February 8, 2026*
*Model version: Regime-based variance with tail-risk sizing*
*Data freshness: hornets_buzz.json updated February 8, 2026*
