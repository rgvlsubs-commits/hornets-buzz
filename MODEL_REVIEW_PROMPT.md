# NBA Spread Prediction Model - Code Review & Evaluation Request

## Context for LLM Reviewers (Gemini, ChatGPT, etc.)

I've built an NBA spread prediction model focused on the Charlotte Hornets. I'm sharing the complete code and asking you to:

1. **Review the code** for bugs, logic errors, or implementation issues
2. **Evaluate the model** for statistical validity and potential overfitting
3. **Suggest improvements** to make predictions more accurate
4. **Identify blind spots** in our methodology

Please be critical and thorough. I want honest feedback, not validation.

---

## Project Overview

**Goal**: Predict whether the Charlotte Hornets will cover the spread in NBA games.

**Core Thesis**: The Hornets perform significantly better when their 5 core starters play together ("Core 5"). The market may be slow to adjust to this.

**Two Models**:
1. **Standard Model**: Uses full season data, hybrid Elo + Net Rating approach
2. **Buzzing Model**: Uses only games where Core 5 played, exploiting potential market inefficiency

---

## Current Results

### Backtest Results (2025-26 Season, 709 games sampled)
- **Straight-up accuracy**: 60.7% (vs 50% baseline)
- **ATS accuracy with estimated spreads**: ~50% (testing against our own estimates, as expected)
- **Mean Absolute Error**: 11.4 points

### Hornets Core 5 Performance (28 qualified games)
- **Record**: 20-8 (71.4%)
- **ATS Record**: 22-6 (78.6%)
- **Net Rating**: +9.1
- **Road ATS**: 13-2 (86.7%)
- **Back-to-back ATS**: 5-1 (83.3%)

### Statistical Confidence (Wilson Score 95% CI)
- Overall ATS rate: 78.6%, CI: [60%-90%]
- CI lower bound (60%) > 52.4% break-even threshold
- Suggests edge is statistically significant, but wide interval due to small sample

---

## Model Architecture

### Standard Model (lib/model.ts)

**Hybrid approach**: 55% Elo + 45% Net Rating

```typescript
// Key parameters
const ELO_K_FACTOR = 20;
const ELO_HOME_ADVANTAGE = 70; // ~2.5 points
const ELO_TO_SPREAD = 28; // 28 Elo = 1 point spread
const NR_HOME_ADVANTAGE = 2.5;
const NR_FATIGUE_PENALTY = 3.0;

const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;

const WINDOW_WEIGHTS = {
  last4: 0.40,
  last7: 0.30,
  last10: 0.20,
  season: 0.10,
};
```

**Elo Component**:
- Uses FiveThirtyEight methodology
- `Elo = 1504.6 - 450 * log10((1/WinPct) - 1)`
- Margin of victory multiplier: `((MOV + 3) ^ 0.8) / (7.5 + 0.006 * |EloDiff|)`
- Converts to spread: `eloDiff / 28`

**Net Rating Component**:
- Weighted rolling windows (40% last 4, 30% last 7, etc.)
- Home court: +2.5 points
- Back-to-back penalty: -3.0 points
- Momentum factor based on recent vs longer-term performance

**Recent Additions**:
- Elite opponent penalty (-2.0 pts for teams with NR >= 6.0)
- Roster adjustment system (e.g., +1.5 for Cleveland's Harden trade)

### Buzzing Model (lib/buzzing-model.ts)

**Philosophy**: Market undervalues healthy Hornets, especially on the road.

```typescript
// Baseline from Core 5 performance
const CORE5_AVG_MARGIN = 8.9;
const CORE5_ATS_PCT = 0.778;

// Key insight: Road games are where ATS value is
const ROAD_VALUE_BOOST = 2.0;  // 86.7% ATS on road
const BACK_TO_BACK_BOOST = 1.0; // 83.3% ATS on B2Bs
const ELITE_OPPONENT_PENALTY = -3.0;
```

**Prediction formula**:
```
predictedMargin = CORE5_AVG_MARGIN + oppAdjustment + locationAdjustment + restAdjustment + streakAdjustment
```

---

## Full Model Code

### lib/model.ts (Standard Model)

```typescript
import { Game, UpcomingGame } from './types';

// === Elo Parameters (from 538) ===
const ELO_K_FACTOR = 20;
const ELO_HOME_ADVANTAGE = 70;
const ELO_FATIGUE_PENALTY = 46;
const ELO_INITIAL = 1500;
const ELO_TO_SPREAD = 28;

// === Net Rating Parameters ===
const NR_HOME_ADVANTAGE = 2.5;
const NR_FATIGUE_PENALTY = 3.0;

// === Blend Weights ===
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;

const WINDOW_WEIGHTS = {
  last4: 0.40,
  last7: 0.30,
  last10: 0.20,
  season: 0.10,
};

const MOMENTUM_MULTIPLIER = 0.4;

const ELITE_OPPONENT_THRESHOLD = 6.0;
const ELITE_OPPONENT_PENALTY = -2.0;

const ROSTER_ADJUSTMENTS: Record<string, { adjustment: number; note: string }> = {
  'Cleveland Cavaliers': {
    adjustment: 1.5,
    note: 'Harden trade (+1.5): Elite playmaker added, but integration period',
  },
};

export type PredictionMode = 'standard' | 'buzzing';

export interface RollingMetrics {
  window: number;
  games: number;
  netRating: number;
  ortg: number;
  drtg: number;
  wins: number;
  losses: number;
  pointDiff: number;
  atsRecord: { wins: number; losses: number; pushes: number };
  avgCoverMargin: number;
}

export function eloToWinProbability(eloDiff: number): number {
  return 1.0 / (1.0 + Math.pow(10, -eloDiff / 400));
}

export function eloToSpread(eloDiff: number): number {
  return eloDiff / ELO_TO_SPREAD;
}

export function winPctToElo(winPct: number): number {
  if (winPct <= 0) return 1200;
  if (winPct >= 1) return 1800;
  return 1504.6 - 450 * Math.log10((1 / winPct) - 1);
}

export function estimateElo(
  wins: number,
  losses: number,
  pointDiff: number,
  gamesPlayed: number
): number {
  if (gamesPlayed === 0) return ELO_INITIAL;

  const winPct = wins / gamesPlayed;
  const eloFromWinPct = winPctToElo(winPct);
  const avgPointDiff = pointDiff / gamesPlayed;
  const eloFromPointDiff = ELO_INITIAL + avgPointDiff * 10;

  const winPctWeight = Math.max(0.3, 1 - gamesPlayed / 82);
  return winPctWeight * eloFromWinPct + (1 - winPctWeight) * eloFromPointDiff;
}

export function calculateRollingMetrics(
  games: Game[],
  windowSize: number,
  spreads?: Map<string, number>,
  healthyOnly: boolean = true
): RollingMetrics {
  const filteredGames = healthyOnly ? games.filter(g => g.isQualified) : games;
  const windowGames = filteredGames.slice(0, windowSize);

  if (windowGames.length === 0) {
    return {
      window: windowSize, games: 0, netRating: 0, ortg: 0, drtg: 0,
      wins: 0, losses: 0, pointDiff: 0,
      atsRecord: { wins: 0, losses: 0, pushes: 0 }, avgCoverMargin: 0,
    };
  }

  const netRating = windowGames.reduce((sum, g) => sum + g.netRating, 0) / windowGames.length;
  const ortg = windowGames.reduce((sum, g) => sum + g.ortg, 0) / windowGames.length;
  const drtg = windowGames.reduce((sum, g) => sum + g.drtg, 0) / windowGames.length;
  const wins = windowGames.filter(g => g.result === 'W').length;
  const losses = windowGames.filter(g => g.result === 'L').length;
  const pointDiff = windowGames.reduce((sum, g) => sum + (g.hornetsScore - g.opponentScore), 0) / windowGames.length;

  return {
    window: windowSize,
    games: windowGames.length,
    netRating: Math.round(netRating * 10) / 10,
    ortg: Math.round(ortg * 10) / 10,
    drtg: Math.round(drtg * 10) / 10,
    wins, losses,
    pointDiff: Math.round(pointDiff * 10) / 10,
    atsRecord: { wins: 0, losses: 0, pushes: 0 },
    avgCoverMargin: 0,
  };
}

export function predictSpread(
  upcomingGame: UpcomingGame,
  rollingMetrics: { last4: RollingMetrics; last7: RollingMetrics; last10: RollingMetrics; season: RollingMetrics },
  trend: TrendAnalysis,
  opponentStrength: number = 0,
  mode: PredictionMode = 'standard',
  buzzingMetrics?: RollingMetrics,
  allGamesMetrics?: RollingMetrics
): SpreadPrediction {
  const factors: SpreadPrediction['factors'] = [];
  const isBuzzing = mode === 'buzzing';

  const actualOpponentStrength = upcomingGame.opponentNetRating ?? opponentStrength;
  const rosterAdj = ROSTER_ADJUSTMENTS[upcomingGame.opponent];
  const rosterAdjustment = rosterAdj?.adjustment ?? 0;

  // Fatigue
  let fatigueAdjustment = 0;
  if (upcomingGame.isBackToBack) {
    fatigueAdjustment = -NR_FATIGUE_PENALTY;
  } else if (upcomingGame.restDays === 1) {
    fatigueAdjustment = -1.0;
  } else if (upcomingGame.restDays !== undefined && upcomingGame.restDays >= 3) {
    fatigueAdjustment = 0.5;
  }

  // Elo Component
  let teamElo: number;
  if (isBuzzing && buzzingMetrics) {
    teamElo = estimateElo(buzzingMetrics.wins, buzzingMetrics.losses,
      buzzingMetrics.pointDiff * buzzingMetrics.games, buzzingMetrics.games);
  } else if (allGamesMetrics) {
    teamElo = estimateElo(allGamesMetrics.wins, allGamesMetrics.losses,
      allGamesMetrics.pointDiff * allGamesMetrics.games, allGamesMetrics.games);
  } else {
    teamElo = estimateElo(rollingMetrics.season.wins, rollingMetrics.season.losses,
      rollingMetrics.season.pointDiff * rollingMetrics.season.games, rollingMetrics.season.games);
  }

  const opponentElo = ELO_INITIAL + actualOpponentStrength * 10;
  let eloDiff = teamElo - opponentElo;
  if (upcomingGame.isHome) eloDiff += ELO_HOME_ADVANTAGE;
  else eloDiff -= ELO_HOME_ADVANTAGE;
  eloDiff += fatigueAdjustment * ELO_TO_SPREAD;

  const eloPrediction = eloToSpread(eloDiff);

  // Net Rating Component
  const weights = isBuzzing ? BUZZING_WINDOW_WEIGHTS : WINDOW_WEIGHTS;
  const weightedNR =
    (rollingMetrics.last4.netRating * weights.last4) +
    (rollingMetrics.last7.netRating * weights.last7) +
    (rollingMetrics.last10.netRating * weights.last10) +
    ((isBuzzing && buzzingMetrics ? buzzingMetrics.netRating : rollingMetrics.season.netRating) * weights.season);

  const homeAdj = upcomingGame.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;
  const momentumImpact = trend.momentum * MOMENTUM_MULTIPLIER;
  const oppAdjustment = -actualOpponentStrength;
  const isEliteOpponent = actualOpponentStrength >= ELITE_OPPONENT_THRESHOLD;
  const eliteOpponentPenalty = isEliteOpponent ? ELITE_OPPONENT_PENALTY : 0;

  const nrPrediction = weightedNR + homeAdj + momentumImpact + oppAdjustment +
    fatigueAdjustment + eliteOpponentPenalty - rosterAdjustment;

  // Combine
  const predictedMargin = (eloPrediction * ELO_WEIGHT) + (nrPrediction * NR_WEIGHT);
  const predictedCover = upcomingGame.spread !== null ? predictedMargin + upcomingGame.spread : 0;

  return {
    predictedMargin: Math.round(predictedMargin * 10) / 10,
    predictedCover: Math.round(predictedCover * 10) / 10,
    confidence: 'medium',
    confidenceScore: 50,
    eloComponent: Math.round(eloPrediction * 10) / 10,
    netRatingComponent: Math.round(nrPrediction * 10) / 10,
    mode,
    factors,
  };
}
```

---

## Statistical Rigor Analysis (Python)

```python
def wilson_confidence_interval(successes: int, trials: int, z: float = 1.96) -> Tuple[float, float]:
    """Wilson score interval - better than normal approximation for small samples."""
    if trials == 0:
        return (0.0, 1.0)

    p = successes / trials
    denominator = 1 + z**2 / trials
    center = (p + z**2 / (2 * trials)) / denominator
    margin = (z / denominator) * math.sqrt(p * (1 - p) / trials + z**2 / (4 * trials**2))

    return (max(0, center - margin), min(1, center + margin))

def kelly_criterion(win_prob: float, odds: float = 1.91) -> float:
    """Kelly criterion for optimal bet sizing. odds = 1.91 = -110 American"""
    implied_prob = 1 / odds
    edge = win_prob - implied_prob

    if edge <= 0:
        return 0.0

    b = odds - 1
    q = 1 - win_prob
    kelly = (b * win_prob - q) / b

    return max(0, kelly / 2)  # Half-Kelly for safety
```

---

## Key Questions for Reviewers

### 1. Statistical Validity
- Is 28 games a sufficient sample to draw conclusions?
- Are we overfitting to noise in small segments (road, B2B)?
- Is our Wilson CI approach appropriate?

### 2. Model Architecture
- Is 55/45 Elo/NR split optimal, or should we adjust?
- Are the rolling window weights (40/30/20/10) justified?
- Is the elite opponent penalty (-2.0) appropriate?

### 3. Potential Bugs
- Any issues with the Elo calculation?
- Are we handling home/away correctly?
- Any edge cases in the spread prediction logic?

### 4. Overfitting Concerns
- The Buzzing model uses Core 5 performance as baseline - is this circular?
- Road ATS of 86.7% (13-2) seems too good - how much is noise?
- Are we data-mining by finding patterns post-hoc?

### 5. Missing Factors
- What variables should we include that we're missing?
- Should we account for pace, defensive matchups, injury reports?
- How should we handle opponent rest days?

### 6. Code Quality
- Any TypeScript or Python best practices we're violating?
- Performance concerns with the calculations?
- Better ways to structure the model?

---

## Adjustments We've Made

1. **Standard vs Buzzing split**: Standard uses full season data (53 games), Buzzing uses only Core 5 games (28 games)

2. **Elite opponent penalty**: Added -2.0 point adjustment for teams with NR >= 6.0

3. **Roster adjustments**: Manual adjustments for major trades (Cleveland +1.5 for Harden)

4. **Elo weighting**: Increased from 40% to 55% based on backtest showing Elo outperformed NR

5. **Statistical rigor**: Added Wilson score CIs and Kelly criterion for bet sizing

6. **Sample size requirements**: Require 15+ games per segment before trusting patterns

---

## What Success Looks Like

If the model is valid:
- ATS accuracy should be >52.4% (break-even) over a larger sample
- High-confidence predictions should outperform low-confidence
- Elo and NR components should agree more often than not

Please provide specific, actionable feedback. Thank you!
