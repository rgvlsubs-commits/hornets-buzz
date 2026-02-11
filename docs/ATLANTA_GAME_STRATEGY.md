# Charlotte Hornets vs Atlanta Hawks - Betting Strategy

**Date:** February 11, 2026
**Location:** Charlotte (HOME)
**Game Time:** TBD
**Document Updated:** February 10, 2026 (REVISED after model verification)

---

## 1. Game Overview

| Metric | Charlotte | Atlanta |
|--------|-----------|---------|
| Record | 25-29 (20-9 Core 5) | 26-29 |
| Net Rating | +8.4 (Core 5 season) | -1.3 |
| Last 4 Core 5 NR | **+4.0** (Detroit loss impact) | - |
| Elo | ~1503 (all) / ~1610 (Core 5) | 1487 |

**Matchup Profile:** Hornets are HOME FAVORITES vs a WEAK opponent. However, the Detroit loss (-8.9 game NR) has significantly impacted our rolling metrics.

---

## 2. Current Lines

| Market | Line | Notes |
|--------|------|-------|
| **Spread** | **CHA -5.5** | Hornets favored |
| **Moneyline** | **-218** | 68.5% implied |
| **Total** | 231.5 | Higher pace game |
| Opening Spread | -5.5 | No movement |

---

## 3. Model Prediction (CORRECTED)

### Rolling Window Impact
The Detroit loss (-8.9 NR) heavily drags down recent performance:
```
Last 4 Core 5 NR:  +4.0  (was ~8+ before Detroit)
Last 7 Core 5 NR:  +5.3
Last 10 Core 5 NR: +10.9
Season Core 5 NR:  +8.4
```

### Weighted Net Rating Calculation
Using model weights (0.30, 0.25, 0.25, 0.20):
```
Weighted NR = (4.0 × 0.30) + (5.3 × 0.25) + (10.9 × 0.25) + (8.4 × 0.20)
           = 1.2 + 1.3 + 2.7 + 1.7 = 6.9

Adjustments:
  + Home Court:     +2.0
  + Weak Opponent:  +1.3 (Hawks -1.3 NR)
  - Trade Deadline: -0.75
  ─────────────────────────
  NR Prediction:    9.5 pts
```

### All Three Modes

| Mode | Elo Component | NR Component | **Predicted Margin** |
|------|---------------|--------------|----------------------|
| Standard | 3.1 × 0.55 = 1.7 | 9.5 × 0.45 = 4.3 | **+6.0 pts** |
| Bayesian | Blended | Blended | **+6.8 pts** |
| Buzzing | 6.9 × 0.55 = 3.8 | 9.3 × 0.45 = 4.2 | **+8.0 pts** |

### Cover Probability (Bayesian Mode)
```
Spread: -5.5
Predicted Margin: +6.8
Expected Cover: +6.8 - 5.5 = +1.3 pts  ← MARGINAL

σ (Core5 regime): 14.5
Cover Prob: Φ(1.3 / 14.5) = 54%  ← BARELY ABOVE COIN FLIP
```

### Win Probability (Moneyline)
```
Model Win Prob: Φ(6.8 / 14.5) = 68%
Implied Win Prob: 68.5%
Edge: -0.5%  ← NO EDGE ON ML
```

---

## 4. EV Analysis (REVISED)

### Spread EV
```
Cover Prob: 54%
Spread EV = (0.54 × 100) - (0.46 × 110) = +3.4 per $100
```

### Moneyline EV
```
Win Prob: 68%
At -218: EV = (0.68 × 45.9) - (0.32 × 100) = +31.2 - 32.0 = -0.8 per $100
```

### Comparison
| Bet Type | EV per $100 | Recommendation |
|----------|-------------|----------------|
| Spread -5.5 | +3.4 | **MARGINAL VALUE** |
| ML -218 | -0.8 | **NO VALUE** |

**Verdict:** The edge has evaporated. Detroit loss dragged our rolling metrics down significantly. This is now a **marginal play at best**.

---

## 5. Conviction Score (REVISED)

| Factor | Points | Notes |
|--------|--------|-------|
| Normal Pace | +15 | 231.5 O/U is slightly elevated |
| Weak Opponent | +12 | Hawks NR -1.3 |
| Core 5 Fresh | +20 | 2 days since last Core 5 game |
| Rest Situation | +10 | 1 day rest |
| No Injuries | +10 | Core 5 expected healthy |
| Tail-Risk Haircut | -5 | σ=14.5 (Core 5 regime) |
| **Recent Form Penalty** | **-15** | Last 4 NR dropped to +4.0 |
| **Total** | **47** | **LOW-MEDIUM Conviction** |

---

## 6. Risk Factors

### Major Concerns
1. **Detroit hangover** - Last 4 Core 5 NR is only +4.0 (was +10 before)
2. **Marginal edge** - Only +1.3 expected cover margin
3. **Model says 54% cover** - Barely better than a coin flip
4. **No ML edge** - Model win prob matches implied prob exactly
5. **Trap game potential** - After tough loss, weak opponent = letdown risk

### Mitigating Factors
1. **Home game** - +2.0 pts advantage
2. **Weak opponent** - Hawks are below .500
3. **Core 5 still 20-9** - One bad game doesn't erase the sample
4. **Just beat Hawks 3 days ago** - 126-119 on the road

---

## 7. Recommended Strategy (REVISED)

### Pre-Game Recommendation

| Bet | Line | Units | Rationale |
|-----|------|-------|-----------|
| **Spread** | **-5.5** | **0.25** | Tiny edge, minimal exposure |
| Moneyline | -218 | **PASS** | No model edge |

**Total Exposure:** 0.25 units (REDUCED from original 1.5)

### Why the Dramatic Reduction?
1. **Model shows only 54% cover probability** - not 66% as originally calculated
2. **Expected cover margin is +1.3 pts, not +5.7**
3. **Detroit loss (-8.9 NR) heavily weights in rolling windows**
4. **The model is working correctly** - we were wrong in manual calculations
5. **Discipline > chasing** - Don't bet just because we lost yesterday

### Alternative: WAIT FOR LIVE
If we believe the Detroit game was an outlier, the better play is:
- **Skip the pre-game bet**
- **Wait for live betting opportunities** where we can get better value

---

## 8. Live Betting Triggers (ADJUSTED)

### BUY Signals (Add Position)
| Trigger | Action |
|---------|--------|
| Up 8+ at halftime | Add 0.5u spread if line is -2 or better |
| Hawks cold from 3 (< 25%) | Core 5 defense working, add 0.25u |
| LaMelo has 15+ at half | Engaged mode, consider adding |

### SELL Signals (No Bet / Exit)
| Trigger | Action |
|---------|--------|
| Down at halftime | **DO NOT ADD** - Detroit hangover is real |
| Tied or close at half | Stay at minimal exposure |
| Diabaté 3+ fouls Q1 | Do not add position |

---

## 9. Comparison: Original vs Corrected

| Metric | Original (WRONG) | Corrected |
|--------|------------------|-----------|
| Predicted Margin | +11.2 | **+6.8** (Bayesian) |
| Expected Cover | +5.7 | **+1.3** |
| Cover Probability | 66% | **54%** |
| ML Win Prob | 79% | **68%** |
| ML Edge | +10.5% | **0%** |
| Spread EV | +$28.6 | **+$3.4** |
| Recommended Units | 1.5 | **0.25** |

### What Went Wrong?
The manual calculation used season Core 5 NR (+8.4) directly instead of the model's weighted rolling windows. The model properly weights:
- Last 4 games at 30% → dropped to +4.0 after Detroit
- This is the model working as designed (responsive to recent form)

---

## 10. Bottom Line

| Aspect | Assessment |
|--------|------------|
| **Bet Quality** | **MARGINAL** - Only 54% cover, +1.3 expected margin |
| **Risk Level** | High (coming off bad loss, low conviction) |
| **Sizing** | 0.25 units MAX (or skip entirely) |
| **Confidence** | 47/100 |

**Final Recommendation:**

```
PRE-GAME:
  - Spread -5.5: 0.25 unit MAX (or PASS)
  - Moneyline: PASS (no edge)

LIVE BETTING:
  - Wait for better spots if up at half
  - Do not chase if down
```

**Rationale:** The Detroit loss has legitimate impact on our rolling metrics. The model is correctly showing reduced edge. This is NOT the game to chase losses - wait for a better spot or take minimal exposure.

---

## 11. Lessons Learned

1. **Always verify model output** - Manual calculations can miss weighted windows
2. **Rolling windows matter** - One bad game significantly impacts short-term predictions
3. **The model is smarter than napkin math** - Trust the systematic approach
4. **Discipline after losses** - This is exactly when to reduce exposure, not increase
5. **Detroit hangover is real** - A -8.9 NR game at 30% weight = -2.7 pts on prediction

---

*Strategy REVISED: February 10, 2026*
*Model version: Margin-conditional σ with rolling window weights*
*Correction: Manual calculation error identified and fixed*
