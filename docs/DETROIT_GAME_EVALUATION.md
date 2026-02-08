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

### Actual Lines
```
Spread: CHA +3.5 (-110)
Moneyline: CHA +130
Implied Win Prob: 43.5%
```

### Model Calculation
```
Model Predicted Margin (Bayesian): ~+1.0 to +3.0 pts
+ Injury Adjustment: +4.5 pts
= Adjusted Margin: +5.5 to +7.5 pts

Model Win Prob: ~55-60% (after injury adjustment)
Implied Win Prob: 43.5%
EDGE: +11.5% to +16.5%
```

### Spread Analysis (at σ=15.5)
```
Predicted Cover Margin: +3.5 + (adjusted margin)
                      = +3.5 + 6.5 = +10.0 pts expected cover
Cover Probability: Φ(10.0 / 15.5) = Φ(0.65) ≈ 74%
Spread EV: (0.74 × 100) - (0.26 × 110) = +45.4 per $100
```

### Moneyline Analysis
```
Model Win Prob: 57.5% (midpoint estimate)
Implied Win Prob: 43.5%
Edge: +14%

ML EV (at +130): (0.575 × 130) - (0.425 × 100) = +32.3 per $100
```

### Recommendation
| Bet Type | EV per $100 | Recommendation |
|----------|-------------|----------------|
| **Spread +3.5** | **+45.4** | **STRONG BET** |
| Moneyline +130 | +32.3 | Good value, lower EV |

**Verdict: SPREAD is the better bet** (higher EV, injury edge amplifies cover margin)

---

## 6. Injury Report (VERIFIED - Feb 8, 2026)

### Hornets Core 5 Status: ALL HEALTHY ✓
| Player | Status | Notes |
|--------|--------|-------|
| LaMelo Ball | AVAILABLE | ✓ |
| Brandon Miller | AVAILABLE | ✓ |
| Miles Bridges | AVAILABLE | ✓ |
| Moussa Diabaté | AVAILABLE | ✓ |
| Kon Knueppel | AVAILABLE | ✓ |

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
**Model Spread Adjustment: +4.5 pts in Hornets' favor**

- Harris OUT = Weakened rotation (confirmed)
- Cunningham questionable = Their best player at risk
- Duren questionable = Their starting center at risk

**If Cunningham + Duren both OUT:**
- Line could move to CHA -1.5 to -2.5
- This would be a MASSIVE value opportunity on current +3.5

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
| Line Value | **STRONG** (CHA +3.5 with Detroit injuries) |
| Model Edge | +14% win prob, +10 pts cover margin |
| Variance Regime | High (σ=15.5) |
| Conviction | **75/100** (injury edge elevates) |
| Core 5 Status | **ALL HEALTHY** ✓ |
| Key Risk | Cunningham/Duren play through injuries |

### Final Recommendation

| Bet | Line | EV | Size | Reasoning |
|-----|------|-----|------|-----------|
| **SPREAD** | **+3.5** | **+45** | **1.5-2 units** | Best value; injury edge amplifies cover |
| ML (alt) | +130 | +32 | 0.5-1 unit | Lower EV but higher ceiling |

### Pre-Game Checklist
- [ ] Confirm Cunningham status (DAY-TO-DAY)
- [ ] Confirm Duren status (QUESTIONABLE)
- [ ] Check for line movement toward Charlotte
- [ ] If both OUT → Consider increasing position

### Exit Signals (reduce/pass)
- If Cunningham AND Duren both play full minutes
- If line moves to CHA -1 or worse (value extracted)
- If any Core 5 player scratched

**Bottom Line:** This is a **strong value opportunity**. The Hornets are 3.5-point home underdogs despite similar team strength, Core 5 fully healthy, and Detroit missing key players. The injury-adjusted model shows +10 pts expected cover margin. Spread is the preferred bet (higher EV than ML). Size at 1.5-2 units given conviction of 75.

---

*Document generated: February 8, 2026*
*Model version: Regime-based variance with tail-risk sizing*
*Lines captured: February 8, 2026 @ 5:09 PM EST*
*Injury report: February 8, 2026 @ 4:00 PM EST*
