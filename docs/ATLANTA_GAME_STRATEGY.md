# Charlotte Hornets vs Atlanta Hawks - Betting Strategy

**Date:** February 11, 2026
**Location:** Charlotte (HOME)
**Game Time:** TBD
**Document Updated:** February 10, 2026 (FINAL - model verified)

---

## 1. Game Overview

| Metric | Charlotte | Atlanta |
|--------|-----------|---------|
| Record | 25-29 (20-9 Core 5) | 26-29 |
| Net Rating | +8.4 (Core 5 season) | -1.3 |
| Last 4 Core 5 NR | **+4.0** (Detroit loss impact) | - |
| Momentum | **-5.6** (negative trend) | - |

**Critical Finding:** The Detroit loss creates NEGATIVE momentum that significantly impacts our prediction.

---

## 2. Current Lines

| Market | Line | Notes |
|--------|------|-------|
| **Spread** | **CHA -5.5** | Hornets favored |
| **Moneyline** | **-218** | 68.5% implied |
| **Total** | 231.5 | Higher pace game |

---

## 3. Model Prediction (VERIFIED)

### Key Adjustments Impacting Prediction

| Adjustment | Impact | Reason |
|------------|--------|--------|
| Home Court | +2.0 | Standard home advantage |
| Weak Opponent | +1.3 | Hawks -1.3 NR |
| Trade Deadline | -0.75 | Roster transition |
| **Momentum** | **-2.22** | Last 4 NR (4.0) vs Last 10 NR (10.9) = -5.6 momentum |
| **Mid-Tier Opponent** | **-1.0** | Hawks -1.3 NR triggers mid-tier penalty |

### All Three Modes

| Mode | Predicted Margin | vs -5.5 Spread | Verdict |
|------|------------------|----------------|---------|
| Standard | **+4.6** | **-0.9** | **MISS** |
| Bayesian | **+5.4** | **-0.1** | **MISS** (barely) |
| Buzzing | **+6.6** | **+1.1** | Cover (barely) |

### Cover Probability (Bayesian)
```
Predicted Margin: +5.4
Spread: -5.5
Expected Cover: -0.1 pts (MISS)

σ (Core5 + momentum): ~14.5
Cover Prob: ~49%  ← BELOW 50%
```

---

## 4. Why The Model Says PASS

### The Detroit Hangover is Real
1. **Last 4 NR dropped to +4.0** (was ~10+ before Detroit)
2. **Momentum is -5.6** (very negative)
3. **Momentum penalty of -2.22 pts** applied to prediction
4. **Mid-tier opponent penalty of -1.0** (Hawks aren't bad enough to be weak)

### Math Breakdown
```
Base weighted NR:     +6.95
Home court:           +2.00
Weak opponent:        +1.30
Trade deadline:       -0.75
Momentum penalty:     -2.22  ← THE KILLER
Mid-tier penalty:     -1.00
─────────────────────────────
Final NR prediction:  +6.28

Combined with Elo (Standard: 3.15 × 0.55 = 1.73)
Final prediction:     +4.56 (Standard)
                      +5.39 (Bayesian after blending)
```

---

## 5. EV Analysis

### Spread EV (Bayesian Mode)
```
Cover Prob: 49%
Spread EV = (0.49 × 100) - (0.51 × 110) = -7.1 per $100
```

### Moneyline EV
```
Win Prob: ~65%
At -218: EV = (0.65 × 45.9) - (0.35 × 100) = -5.2 per $100
```

### Verdict
| Bet Type | EV per $100 | Recommendation |
|----------|-------------|----------------|
| Spread -5.5 | **-7.1** | **NEGATIVE EV - PASS** |
| ML -218 | **-5.2** | **NEGATIVE EV - PASS** |

---

## 6. Recommended Strategy

### Pre-Game Recommendation

| Bet | Units | Rationale |
|-----|-------|-----------|
| Spread | **PASS** | Model shows 49% cover (negative EV) |
| Moneyline | **PASS** | Model shows 65% win (no edge vs 68.5% implied) |

**Total Exposure: 0 units**

### Why No Bet?
1. **Model says we MISS the spread** in both Standard and Bayesian modes
2. **Momentum is severely negative** (-5.6)
3. **Detroit hangover is mathematically real** (-2.22 pts penalty)
4. **No edge exists** - Vegas has this priced correctly
5. **Discipline > gambling** - don't bet when there's no edge

---

## 7. Live Betting Opportunities

If we believe the Detroit game was an outlier and want exposure:

### BUY Signals (Wait for Better Price)
| Trigger | Action |
|---------|--------|
| Line moves to -3.5 or better | Consider 0.5u spread |
| Up 8+ at halftime | Consider 0.25u 2H spread |
| LaMelo 20+ at half | Momentum shifting, consider small live bet |

### Key Insight
The LIVE market may offer better prices if:
- Hornets start slow (line drops)
- Then momentum shifts our way mid-game
- We can get a better number than -5.5

---

## 8. Comparison: Manual vs Model

| Metric | Manual (WRONG) | Model (CORRECT) |
|--------|----------------|-----------------|
| Predicted Margin | +11.2 | **+5.4** (Bayesian) |
| Expected Cover | +5.7 | **-0.1** (MISS) |
| Cover Probability | 66% | **49%** |
| Spread EV | +$28.6 | **-$7.1** |
| Recommendation | 1.5u bet | **PASS** |

### What Was Missing?
1. **Momentum penalty** (-2.22 pts) - Detroit loss created severe negative momentum
2. **Mid-tier penalty** (-1.0 pts) - Hawks aren't weak enough to avoid this
3. **Proper rolling window weights** - Last 4 at 30% weight with 4.0 NR

---

## 9. Bottom Line

| Aspect | Assessment |
|--------|------------|
| **Bet Quality** | **NO BET** - Negative EV on both spread and ML |
| **Model Prediction** | Miss spread by 0.1 pts (Bayesian) |
| **Cover Probability** | 49% (below breakeven) |
| **Recommendation** | **PASS** - Wait for live opportunities |

**Final Recommendation:**

```
PRE-GAME:
  - Spread: PASS (49% cover, negative EV)
  - Moneyline: PASS (no edge)

LIVE:
  - Wait for line movement or better spots
  - Consider small bets only if line drops to -3.5

DO NOT:
  - Chase the Detroit loss
  - Bet on "gut feel" when model says no edge
  - Ignore the momentum penalty
```

---

## 10. Lessons Learned

1. **Momentum matters** - A -8.9 NR game creates -2.22 pts momentum penalty
2. **Mid-tier opponents are tricky** - Neither weak enough for bonus nor strong enough for adjustment
3. **The model is smarter than intuition** - Trust the math
4. **Vegas knows** - They have this priced correctly at -5.5
5. **No edge = no bet** - Discipline is the edge

---

*Strategy FINAL: February 10, 2026*
*Model verified against website output*
*Key finding: Detroit hangover creates negative momentum penalty*
