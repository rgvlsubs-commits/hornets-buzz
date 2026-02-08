# Hornets Buzz - Model Architecture & Backtest Results

## Model Overview

A spread prediction model for Charlotte Hornets NBA games with three prediction modes.

### Prediction Modes

| Mode | Data Source | Use Case | Description |
|------|-------------|----------|-------------|
| **Standard** | All 53 games | Diagnostic | Conservative baseline using full season data |
| **Bayesian** | Blended | **Recommended** | Shrinkage blend of Standard + Core 5 data |
| **Buzzing** | Core 5 only (28 games) | Diagnostic | Aggressive upper bound using only healthy games |

---

## Core Parameters (Current Values)

### Net Rating Adjustments
```typescript
NR_HOME_ADVANTAGE = 2.0       // Reduced from 2.5 per backtest
NR_FATIGUE_PENALTY = 1.5      // Reduced from 3.0 (Hornets thrive on B2Bs)
```

### Opponent Adjustments
```typescript
ELITE_OPPONENT_THRESHOLD = 6.0   // Net rating threshold
ELITE_OPPONENT_PENALTY = -2.0    // Additional penalty vs elite teams
MID_VS_MID_ADJUSTMENT = -1.0     // Correct for overpredict bias
```

### Risk Controls
```typescript
KELLY_WIN_PROB_CAP = 0.56           // Cap win prob for sizing
MOV_CAP = 20                        // Cap point diff in Elo calc
PREDICTED_MARGIN_CAP = 15           // Cap extreme predictions (display only)
CORE5_DECAY_HALFLIFE = 30           // Days until Core 5 MEAN edge halves
CORE5_VARIANCE_DECAY = 60           // Days until Core 5 VARIANCE normalizes
```

### Regime-Based Variance (σ)
```typescript
// Per ChatGPT review: Model variance by regime, not just mean
// This is "the single biggest upgrade - makes EV math honest"
SIGMA_BASE = 11.5           // Normal games
SIGMA_CORE5 = 14.5          // Core 5 games (higher ceiling AND floor)
SIGMA_HIGH_PACE = 15.0      // High pace = more possessions = more variance
SIGMA_ELITE_OPPONENT = 13.5 // Elite opponents = unpredictable outcomes
HIGH_PACE_THRESHOLD = 205   // Combined pace above this = high variance

// Variance persists longer than mean edge
// Markets catch average faster than distribution
varianceDecay = exp(-daysSinceCore5 / 60)  // Slower than mean decay (60 vs 30)
```

### Pace Adjustment
```typescript
LEAGUE_AVG_PACE = 100
PACE_VARIANCE_FACTOR = 0.03  // 3% regression per pace point above avg
```

### Blend Weights
```typescript
ELO_WEIGHT = 0.55
NR_WEIGHT = 0.45

WINDOW_WEIGHTS = {
  last4: 0.30,
  last7: 0.25,
  last10: 0.25,
  season: 0.20
}
```

### Bayesian Prior
```typescript
// Adaptive: more conservative early, relaxes with sample size
priorStrength = max(40, min(60, 60 - 0.5 * sampleSize))
// At 28 games: 46
// At 40 games: 40
```

### Core 5 Time Decay
```typescript
// Market adjusts to Core 5 performance over time
// Edge decays exponentially with days since last Core 5 game
core5DecayFactor = exp(-daysSinceLastCore5 / CORE5_DECAY_HALFLIFE)
// At 0 days: 1.0 (full weight)
// At 30 days: 0.37 (1/e weight)
// At 60 days: 0.14 (heavily decayed)

// Applied to Bayesian blend:
sampleWeight = rawSampleWeight * core5DecayFactor
```

### Prediction vs Conviction (Separation)
```typescript
// Two distinct outputs:
// 1. predictedMargin: Capped ±15 pts for display
// 2. rawMargin: Uncapped for internal sizing calculations
// 3. conviction: 0-100 score based on volatility factors

// Conviction factors (independent of margin prediction):
// - Pace: Low pace = higher conviction (less variance)
// - Opponent: Weak/mid = higher, elite = lower
// - Core 5 Freshness: Recent Core 5 games = higher
// - Rest: Well rested = higher, B2B = lower
// - Injuries: Opponent stars out = higher, Core 5 out = lower
```

### Moneyline vs Spread Analysis
```typescript
interface MoneylineAnalysis {
  modelWinProb: number;      // From Elo model (0-1)
  impliedWinProb: number;    // From moneyline odds (0-1)
  edge: number;              // modelWinProb - implied (positive = value)
  moneylineEV: number;       // Expected value per $100 on ML
  spreadEV: number;          // Expected value per $100 on spread
  recommendation: 'moneyline' | 'spread' | 'pass';
  reasoning: string;         // Plain English explanation
}

// Key formulas:
// Moneyline to implied prob:
//   +150 → 100 / (150 + 100) = 40%
//   -150 → 150 / (150 + 100) = 60%

// Moneyline EV (underdog +150, 45% model win prob):
//   EV = (0.45 × 150) - (0.55 × 100) = $12.50

// Spread EV (55% cover prob, -110 juice):
//   EV = (0.55 × 100) - (0.45 × 110) = $5.50

// Cover probability from margin prediction:
//   Uses normal distribution with σ = 12 pts (NBA game variance)
//   P(cover) = Φ((predictedMargin + spread) / 12)

// Recommendation logic:
// - If neither EV > $2: PASS
// - If ML EV > spread EV + $1: MONEYLINE
// - If spread EV > ML EV + $1: SPREAD
// - Otherwise: Prefer spread (lower variance)
```

---

## Backtest Results

### Hornets-Specific (53 games)
| Metric | Value |
|--------|-------|
| MAE | 14.83 pts |
| RMSE | 17.64 pts |
| ATS Accuracy | 54.2% |

### League-Wide (600 games)
| Metric | Value |
|--------|-------|
| MAE | 10.8 pts |
| RMSE | 13.81 pts |
| Straight-up Accuracy | 66.2% |

### Comparison
| Metric | League | Hornets | Diff |
|--------|--------|---------|------|
| MAE | 10.8 | 14.83 | **+4.0 worse** |
| RMSE | 13.81 | 17.64 | +3.8 worse |

**Key Finding:** Hornets have higher variance outcomes than league average.

---

## Bucket Analysis

### League-Wide Buckets
| Bucket | Count | MAE | Accuracy |
|--------|-------|-----|----------|
| home_favorite | 275 | 10.94 | 69.8% |
| home_underdog | 163 | 10.46 | 69.9% |
| toss_up | 162 | 10.9 | 56.2% |
| high_pace | 18 | **15.49** | - |
| normal_pace | 545 | 10.44 | - |
| low_pace | 37 | 13.75 | - |

### Hornets-Specific Buckets
| Bucket | Bias | Interpretation |
|--------|------|----------------|
| back_to_back | -7.0 | Underpredicting (Hornets +9.8 actual) |
| core5 | -5.7 | Underpredicting (Core 5 dominates) |
| missing_starters | +8.4 | Overpredicting (they lose without starters) |
| home | +4.7 | Home court overestimated |
| 2plus_rest | +6.4 | Rest advantage overestimated |

---

## Adjustments Made (Post-Backtest)

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| Home court | +2.5 | +2.0 | League bias +1.3 overpredict |
| B2B penalty | -3.0 | -1.5 | Hornets +9.8 actual on B2Bs |
| Pace factor | 2% | 3% | High-pace MAE 50% worse |
| Survivorship penalty | -0.75 | -0.25 | Underpredicting Core 5 by 5.7 |
| Bench penalty | -0.5 | -0.25 | Same reason |
| Mid vs Mid | - | -1.0 | League +2.2 overpredict bias |

---

## Prediction Formula

### Standard Mode
```
standardMargin = (ELO_WEIGHT × eloSpread) + (NR_WEIGHT × nrPrediction)

where:
  eloSpread = (teamElo - oppElo + homeAdj + fatigueAdj) / 28
  nrPrediction = weightedNR + homeAdj + momentum + oppAdj +
                 fatigueAdj + elitePenalty + midVsMidAdj
```

### Bayesian Mode
```
priorStrength = max(40, 60 - 0.5 × sampleSize)
bayesianMargin = (priorStrength × standardMargin + sampleSize × buzzingMargin) /
                 (priorStrength + sampleSize)

// Then apply Core 5 risk penalty (scaled by Core 5 weight)
core5Weight = sampleSize / (priorStrength + sampleSize)
bayesianMargin += core5Weight × (SURVIVORSHIP_PENALTY + BENCH_PENALTY)
```

### Buzzing Mode
```
buzzingMargin = [same formula as Standard but using Core 5 metrics only]
buzzingMargin += SURVIVORSHIP_PENALTY + BENCH_PENALTY  // Full penalty
```

### Final Adjustments (All Modes)
```
// Pace adjustment
paceMultiplier = 1 - max(0, (combinedPace - 200) × 0.03)
adjustedMargin = predictedMargin × paceMultiplier

// Cap extreme predictions
finalMargin = clamp(adjustedMargin, -15, +15)
```

---

## Worst Predictions (Outliers)

### Hornets Games
| Date | Opponent | Predicted | Actual | Error |
|------|----------|-----------|--------|-------|
| 2026-01-10 | @ Utah | +9.7 | **+57** | 47.3 |
| 2026-01-05 | @ OKC | -11.7 | **+27** | 38.7 |
| 2025-12-05 | @ Toronto | -11.6 | **+26** | 37.6 |

**Insight:** These are games where healthy Hornets massively outperformed. The model's conservatism (survivorship penalty, elite penalty) hurt here.

---

## Statistical Safeguards

### Wilson Confidence Intervals
```python
# For ATS rate 78.6% with 28 games
CI = [60%, 90%]  # 95% confidence
# CI lower bound (60%) > 52.4% break-even
```

### Kelly Criterion (Risk-Adjusted)
```python
# Cap win probability at 56% for sizing
effective_win_prob = min(model_win_prob, 0.56)

# Half-Kelly with 60% cap
kelly = (b × p - q) / b
bet_size = min(kelly / 2, 0.60)
```

---

## Open Questions

1. Is the 3% pace factor enough? High-pace MAE still 50% higher.
2. Should we track errors by specific opponent to add team-level adjustments?
3. How quickly does the market adjust? Should we decay the Core 5 edge over time?
4. Are there specific game situations (nationally televised, after losses) where edge is higher?
