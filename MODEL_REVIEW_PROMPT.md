# NBA Spread Prediction Model - Code Review & Evaluation Request

## Context for LLM Reviewers (ChatGPT, Gemini, etc.)

I've built an NBA spread prediction model focused on the Charlotte Hornets. I'm sharing the complete code and asking for **two types of feedback**:

### Defensive Review (Find Problems)
1. **Bugs & logic errors** - Is the code doing what we think it's doing?
2. **Overinflated expectations** - Where are we fooling ourselves with small samples or flawed reasoning?
3. **Statistical validity** - Are our methods sound? Are we overfitting?
4. **Risk management gaps** - Could we blow up our bankroll unexpectedly?

### Offensive Review (Find More Edge)
5. **Untapped signals** - What data or factors could improve predictions within our risk parameters?
6. **Market inefficiencies** - Are there other situations where the market might misprice the Hornets?
7. **Timing optimization** - When should we bet (line movement, injury news, etc.)?
8. **Confidence calibration** - How can we better identify high-value vs low-value spots?

**We want honest, critical feedback—but we also want creative suggestions for finding edge.** We're not trying to be reckless; we have Bayesian shrinkage, half-Kelly sizing, and CLV tracking in place. Within that framework, help us find opportunities we might be missing.

**Note**: This model was previously reviewed by Gemini and ChatGPT. We've implemented fixes from both. See "Changes Since Reviews" section below.

---

## Project Overview

### Primary Goal

Build a **standard NBA spread prediction model** that achieves at least **~50% ATS accuracy** (break-even before vig). We're not trying to build something that beats Vegas long-term—we're trying to identify a **short-term market inefficiency** and exploit it responsibly before the market adjusts.

### Our Implicit View

We believe the **healthy Hornets are legitimately good**—their Core 5 lineup has produced elite results (+9.1 net rating, 22-6 record). However, we acknowledge:

1. **The 78% ATS rate is NOT sustainable.** Small sample sizes inflate performance metrics. Regression is inevitable.
2. **The market WILL adjust.** Vegas isn't stupid. As the Hornets continue winning, lines will move to reflect their true strength.
3. **There may be a temporary window.** The market may still be pricing the Hornets based on their full-season record (including games without their core lineup), not their Core 5 performance. This creates a potential 10-15 game window to exploit.

### What We're NOT Saying

- We do NOT believe we have a 26% edge (78% - 52.4% break-even)
- We do NOT believe this edge will persist all season
- We do NOT believe we're smarter than the market long-term

### What We ARE Saying

- The healthy Hornets may be **temporarily mispriced**
- We want to make **calculated bets** while the edge potentially exists
- We use **Bayesian shrinkage** to temper our estimates toward reasonable values
- We use **half-Kelly sizing with a 60% cap** to manage bankroll risk
- We track **CLV (Closing Line Value)** to verify if we're actually beating the market

### Three Prediction Modes

| Mode | Data Source | Purpose |
|------|-------------|---------|
| **Standard** | Full season (all 53 games) | Conservative baseline; market's likely view |
| **Bayesian** | Blends Standard + Core 5 with shrinkage | **Recommended for betting**; balances signal vs noise |
| **Buzzing** | Core 5 games only (28 games) | Aggressive upper bound; diagnostic only |

The **Bayesian model** is the point: it asks "If the market is pricing based on full-season data, and we believe Core 5 data is more predictive, how much should we adjust?" The answer isn't "go all-in on Core 5 data"—it's "blend conservatively and bet when the adjusted estimate still shows value."

---

## Current Results

### Backtest Results (2025-26 Season, 709 games sampled)
- **Straight-up accuracy**: 60.7% (vs 50% baseline)
- **ATS accuracy with estimated spreads**: ~50% (testing against our own estimates)
- **Mean Absolute Error**: 11.4 points

### Hornets Core 5 Performance (28 qualified games)
- **Record**: 22-6 (78.6%)
- **ATS Record**: 22-6 (78.6%)
- **Net Rating**: +9.1
- **Road ATS**: 13-2 (86.7%) → *tempered to ~74% with shrinkage*
- **Back-to-back ATS**: 5-1 (83.3%) → *tempered to ~64% with shrinkage*

### Statistical Confidence (Wilson Score 95% CI)
- Overall ATS rate: 78.6%, CI: [60%-90%]
- CI lower bound (60%) > 52.4% break-even threshold
- Suggests edge is statistically significant, but wide interval due to small sample

### Important Context
The 78.6% ATS rate is almost certainly inflated by small sample variance. We do NOT expect this to continue. What we're betting on is that:
1. The **true rate** is somewhere in the 55-65% range (still profitable)
2. The market is currently pricing closer to the **full-season 50% rate**
3. This gap represents a **temporary opportunity** before lines adjust

---

## Model Architecture

### Prediction Modes (lib/model.ts)

```typescript
export type PredictionMode = 'standard' | 'bayesian' | 'buzzing';

/**
 * Adaptive Bayesian prior strength based on sample size
 * - Early Core 5 data → more conservative (higher prior)
 * - More Core 5 games → allow data to dominate (lower prior)
 *
 * Per Gemini review: Prior of 20-30 is too volatile for NBA.
 * Minimum 40 recommended; 50 is safer.
 * Formula: clamp(40, 60 - 0.5 * sampleSize, 60)
 */
function getBayesianPriorStrength(sampleSize: number): number {
  return Math.max(40, Math.min(60, 60 - 0.5 * sampleSize));
  // At 28 games: 60 - 14 = 46
  // At 40 games: 60 - 20 = 40
  // At 10 games: 60 - 5 = 55
}
```

**How Bayesian Mode Works** (MARGIN-LEVEL BLENDING):
```typescript
// CRITICAL: Blend at the MARGIN level, not component level
// This avoids correlation leakage between Elo and Net Rating

// 1. Calculate FULL Standard margin (using all games)
const standardMargin = (eloToSpread(standardEloDiff) * ELO_WEIGHT) + (standardNR * NR_WEIGHT);

// 2. Calculate FULL Buzzing margin (using Core 5 games only)
const buzzingMargin = (eloToSpread(buzzingEloDiff) * ELO_WEIGHT) + (buzzingNR * NR_WEIGHT);

// 3. Bayesian blend at the margin level
const priorStrength = getBayesianPriorStrength(sampleSize); // 40-60 based on sample
const predictedMargin = (priorStrength * standardMargin + sampleSize * buzzingMargin)
                        / (priorStrength + sampleSize);
// At 28 games with prior=46: ~62% Standard, ~38% Buzzing blend
```

### Core Parameters

```typescript
// === Elo Parameters (from 538) ===
const ELO_K_FACTOR = 20;
const ELO_HOME_ADVANTAGE = 70; // ~2.5 points
const ELO_TO_SPREAD = 28; // 28 Elo = 1 point spread
const ELO_INITIAL = 1500;

// === Net Rating Parameters ===
const NR_HOME_ADVANTAGE = 2.5;
const NR_FATIGUE_PENALTY = 3.0;

// === Blend Weights (optimized from backtest) ===
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;

// === Rolling Window Weights ===
const WINDOW_WEIGHTS = {
  last4: 0.40,
  last7: 0.30,
  last10: 0.20,
  season: 0.10,
};

// === Elite Opponent Handling ===
const ELITE_OPPONENT_THRESHOLD = 6.0;  // Net rating threshold
const ELITE_OPPONENT_PENALTY = -2.0;   // Additional penalty vs elite teams

// === Roster Adjustments (trades) ===
const ROSTER_ADJUSTMENTS = {
  'Cleveland Cavaliers': { adjustment: 1.5, note: 'Harden trade' },
};
```

### Buzzing Model Parameters (lib/buzzing-model.ts)

```typescript
// Core 5 baseline stats
const CORE5_WIN_PCT = 0.704;
const CORE5_ATS_PCT = 0.778;
const CORE5_AVG_MARGIN = 8.9;

// Value boosts - HEAVILY TEMPERED per multiple reviews
// Road: Raw 86.7% (13-2) → Tempered aggressively → 0.4 pts (was 2.0)
// B2B: REMOVED - 5-game sample too small to extrapolate
const ROAD_VALUE_BOOST = 0.4;     // Tempered from 2.0 → 1.5 → 0.8 → 0.4
const BACK_TO_BACK_BOOST = 0.0;   // REMOVED: 5-game sample is too small
const ELITE_OPPONENT_PENALTY = -3.0;
const REST_ADVANTAGE_BOOST = 1.0; // When well rested (2+ days)

// === RISK ADJUSTMENTS (Per Consolidated Review) ===
const MOV_CAP = 20;                      // Cap margin at ±20 pts in Elo calc
const KELLY_WIN_PROB_CAP = 0.56;         // Cap win prob for Kelly sizing
const CORE5_SURVIVORSHIP_PENALTY = -0.75; // Survivorship/schedule bias
const BENCH_MINUTE_PENALTY = -0.5;        // Partial bench impact (~18 min/game)
```

---

## Key Functions

### estimateElo (RECENTLY FIXED)

**Previous Bug**: Weighted Win% higher early season, Point Diff higher late season.

**Fix Applied**: Analytics research (Morey, Oliver) shows Point Diff is a better predictor throughout. Now weights Point Diff at 75% early, 60% late.

```typescript
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

  // FIXED: Weight point diff higher throughout (better predictor per analytics research)
  // Early season: 75% point diff (less noisy than small-sample win%)
  // Mid/late season: 60% point diff (win% stabilizes but point diff remains informative)
  const pointDiffWeight = Math.max(0.6, 0.8 - gamesPlayed / 200);
  return (1 - pointDiffWeight) * eloFromWinPct + pointDiffWeight * eloFromPointDiff;
}
```

### predictSpread (Current Implementation)

```typescript
export function predictSpread(
  upcomingGame: UpcomingGame,
  rollingMetrics: { last4, last7, last10, season },
  trend: TrendAnalysis,
  opponentStrength: number = 0,
  mode: PredictionMode = 'bayesian',  // Bayesian is now default
  buzzingMetrics?: RollingMetrics,
  allGamesMetrics?: RollingMetrics
): SpreadPrediction {

  // === Calculate COMPLETE predictions for each mode ===

  // Standard mode: Full season data
  const standardEloDiff = standardElo - opponentElo + homeAdj + fatigue;
  const standardNR = weightedNR + homeAdj + momentum + oppAdj + fatigue + elitePenalty;
  const standardMargin = (eloToSpread(standardEloDiff) * 0.55) + (standardNR * 0.45);

  // Buzzing mode: Core 5 games only
  const buzzingEloDiff = buzzingElo - opponentElo + homeAdj + fatigue;
  const buzzingNR = buzzingWeightedNR + homeAdj + momentum + oppAdj + fatigue + elitePenalty;
  const buzzingMargin = (eloToSpread(buzzingEloDiff) * 0.55) + (buzzingNR * 0.45);

  // === Select or blend based on mode ===
  let predictedMargin: number;
  if (mode === 'buzzing') {
    predictedMargin = buzzingMargin;  // Pure Core 5
  } else if (mode === 'bayesian') {
    // MARGIN-LEVEL BAYESIAN BLEND (critical fix from ChatGPT review)
    const priorStrength = getBayesianPriorStrength(sampleSize);
    predictedMargin = (priorStrength * standardMargin + sampleSize * buzzingMargin)
                      / (priorStrength + sampleSize);
  } else {
    predictedMargin = standardMargin;  // Full season
  }

  // Apply opponent rest differential (newly added)
  predictedMargin += getOpponentRestAdjustment(upcomingGame);

  return { predictedMargin, predictedCover, confidence, factors };
}
```

---

## New Features

### CLV (Closing Line Value) Tracking

We now track opening vs closing spreads to measure if we're beating the market:

```typescript
interface UpcomingGame {
  spread: number | null;           // Current spread
  openingSpread?: number | null;   // Opening spread when first posted
  spreadMovement?: number;         // Current - Opening (negative = moved toward us)
}

interface Game {
  spread?: number;           // Closing spread
  openingSpread?: number;    // Opening spread
  closingSpread?: number;    // Final spread
  clv?: number;              // Closing Line Value
}
```

### Injury Report Integration

Real-time injury tracking with spread adjustments:

```typescript
interface GameInjuryReport {
  hornetsInjuries: PlayerInjury[];
  opponentInjuries: PlayerInjury[];
  hornetsCore5Status: 'ALL_HEALTHY' | 'SOME_QUESTIONABLE' | 'KEY_PLAYER_OUT';
  injuryImpact: string;              // Plain English summary
  spreadAdjustment?: number;         // Suggested pts adjustment
  lastUpdated: string;
}
```

**Example Output**:
> "All Core 5 starters are healthy and available. ADVANTAGE: Detroit Pistons will be without Tobias Harris. Detroit's Cade Cunningham and Jalen Duren are questionable. Net injury edge: +4.5 pts in Hornets' favor."

---

## Changes Since Reviews

### Gemini Review - Fixes Applied

| Issue | Status | Resolution |
|-------|--------|------------|
| estimateElo backwards weighting | FIXED | Point Diff now weighted 75% early → 60% late (was reversed) |
| Road/B2B boosts too aggressive | FIXED | Applied shrinkage: Road 2.0→1.5, B2B 1.0→0.7 |
| No Bayesian shrinkage option | FIXED | Added 'bayesian' mode that blends Standard + Buzzing |
| Double-counting fatigue? | ANALYZED | Confirmed NOT a bug - fatigue applied to both components but blended 55/45 |

### ChatGPT Review - Fixes Applied

| Issue | Status | Resolution |
|-------|--------|------------|
| Bayesian blends components separately (correlation leakage) | FIXED | Now blends at MARGIN level: calc full Standard margin, full Buzzing margin, then blend |
| Prior strength too light (20 games) | FIXED | Now adaptive: `max(40, 60 - 0.5 * sampleSize)` → 46 at 28 games |
| Road/B2B STILL too aggressive | FIXED | Further reduced: Road 1.5→0.8, B2B 0.7→0.3 |
| Standard/Buzzing allow discretionary mode-switching | FIXED | Bayesian now default; Std/Buzz labeled as diagnostics |
| Missing opponent rest tracking | FIXED | Added opponentRestDays, opponentIsBackToBack fields |

### Second Gemini Review - Fixes Applied

| Issue | Status | Resolution |
|-------|--------|------------|
| Prior strength too volatile (30 min) | FIXED | Raised minimum to 40: `max(40, 60 - 0.5 * sampleSize)` |
| B2B boost on 5-game sample | FIXED | Removed entirely (0.0 pts) - sample too small to extrapolate |
| Kelly can recommend >100% bankroll | FIXED | Added 60% cap to half-Kelly output |
| Window weights aggressive (40/30/20/10) | KEPT | Optimized from backtest; flattening reduced accuracy |

### Consolidated ChatGPT + Gemini Review - Fixes Applied

| Issue | Status | Resolution |
|-------|--------|------------|
| **Kelly probability cap (CRITICAL)** | FIXED | Cap effective win_prob at 56% for sizing - inflated probs blow up bankrolls |
| **MOV capping in Elo** | FIXED | Cap point diff at ±20 pts/game - prevents blowouts from distorting Elo |
| **Road boost still too high** | FIXED | Cut from 0.8 → 0.4 pts - let CLV validate |
| **Survivorship/schedule bias** | FIXED | Added -0.75 pt penalty for Core 5 survivorship bias |
| **Bench minute impact** | FIXED | Added -0.5 pt partial bench penalty (Core 5 only plays ~30 min) |
| **Core 5 risk adjustment** | FIXED | Bayesian now applies scaled risk penalty based on Core 5 weight in blend |

### Issues Noted for Future

| Issue | Priority | Notes |
|-------|----------|-------|
| Injury adjustments too coarse | Medium | Need player-specific on/off net rating data; cap at ±6 total |
| MAE of 11.4 too high | Medium | Target ≤8.5; add RMSE and Brier tracking |
| CLV should be side-adjusted | Low | Track CLV conditional on bet direction |
| True edge likely 1-3% ATS, not 26% | ACKNOWLEDGED | Adjusted expectations; using half-Kelly with 60% cap |
| Consider flattening window weights | Low | 40/30/20/10 is aggressive but backtested well |

### Issues NOT Fixed (Intentional)

| Issue | Decision | Reasoning |
|-------|----------|-----------|
| Window weights too aggressive (40/30/20/10) | KEPT | Optimized from backtest; flattening reduced accuracy by ~2% |
| Selection bias in Core 5 sample | ACKNOWLEDGED | Core thesis assumes this IS the signal, not noise |
| Small sample sizes | ACKNOWLEDGED | Using Wilson CIs and half-Kelly (capped at 60%) to manage risk |
| Pace/defensive matchups | DEFERRED | Would require additional data sources; low priority for now |

---

## Statistical Rigor

```python
def wilson_confidence_interval(successes: int, trials: int, z: float = 1.96):
    """Wilson score interval - better for small samples than normal approx."""
    if trials == 0:
        return (0.0, 1.0)
    p = successes / trials
    denominator = 1 + z**2 / trials
    center = (p + z**2 / (2 * trials)) / denominator
    margin = (z / denominator) * math.sqrt(p * (1 - p) / trials + z**2 / (4 * trials**2))
    return (max(0, center - margin), min(1, center + margin))

def kelly_criterion(win_prob: float, odds: float = 1.91) -> float:
    """Kelly criterion for bet sizing. Half-Kelly with 60% cap."""
    implied_prob = 1 / odds
    edge = win_prob - implied_prob
    if edge <= 0:
        return 0.0
    b = odds - 1
    q = 1 - win_prob
    kelly = (b * win_prob - q) / b
    half_kelly = max(0, kelly / 2)
    return min(half_kelly, 0.60)  # Half-Kelly, capped at 60%
```

---

## Key Questions for Reviewers

### Defensive Questions (Find Problems)

#### 1. Bayesian Implementation (MOSTLY RESOLVED)
- Prior strength now adaptive: 40-60 based on sample size (was 20)
- Now blends at MARGIN level, not component level (fixed correlation leakage)
- **Remaining question**: Is the formula `max(40, 60 - 0.5 * sampleSize)` appropriate?

#### 2. Shrinkage on Road/B2B (RESOLVED)
- Road boost: 2.0 → 1.5 → 0.8 pts (heavily tempered)
- B2B boost: 1.0 → 0.7 → 0.0 pts (REMOVED - 5-game sample too small)
- **Remaining question**: Is 0.8 pts for road still appropriate, or should it be lower?

#### 3. What Are We Still Getting Wrong?
- Are there hidden correlations or double-counting we're missing?
- Is our confidence calibration off? (Are "high confidence" bets actually better?)
- Any survivorship bias in how we're measuring Core 5 performance?

---

### Offensive Questions (Find More Edge)

#### 4. Timing & Line Movement
- When is the best time to bet? (Opening lines vs waiting for movement?)
- Should we fade public money on Hornets when they become trendy?
- How can we use CLV data to optimize bet timing?

#### 5. Situational Edge
- Are there specific opponent types where Hornets are MORE mispriced? (e.g., vs tanking teams, after losses, in nationally televised games)
- Any scheduling spots the market consistently misprices? (long road trips, altitude games, etc.)
- Should we adjust more aggressively when opponent has key injuries?

#### 6. Data We Could Add
- Pace matchups (fast vs slow) - does this affect our edge?
- Referee tendencies (foul rates, pace of play)
- Travel distance/timezone effects
- Player-specific on/off ratings for injury adjustments
- Historical "market catch-up" patterns - how fast does Vegas typically adjust to breakout teams?

#### 7. Bet Types Beyond ATS
- Are there totals (over/under) opportunities given Hornets' pace?
- Player props that benefit from our Core 5 thesis?
- Live betting edges when Core 5 is playing but market still skeptical?

#### 8. Exit Strategy
- What signals should trigger us to STOP betting? (CLV goes negative, lines fully adjust, etc.)
- Should we reduce sizing as sample grows and edge likely shrinks?
- How do we distinguish "edge disappeared" from "normal variance"?

---

## File Structure

```
hornets-buzz/
├── lib/
│   ├── model.ts           # Main prediction model (Standard + Bayesian)
│   ├── buzzing-model.ts   # Buzzing model with tempered boosts
│   └── types.ts           # TypeScript interfaces
├── app/
│   ├── api/injuries/      # Injury report API
│   └── components/
│       ├── SpreadPrediction.tsx  # Prediction display with injury reports
│       ├── ATSPerformance.tsx    # ATS tracking with CLV
│       └── FloatingControls.tsx  # Mode selector (Std/Bayes/Buzz)
├── scripts/
│   ├── fetch_data.py      # Data pipeline with CLV tracking
│   └── update_injuries.py # Injury report updater
└── data/
    ├── hornets_buzz.json  # Main data file
    └── injury_reports.json # Cached injury data
```

---

## What Success Looks Like

### Short-Term (Next 10-15 Games)
- **Positive CLV**: We're getting better numbers than closing lines (market moving toward us)
- **ATS > 50%**: Even modest outperformance is a win given the vig
- **No catastrophic losses**: Half-Kelly sizing keeps us in the game

### Medium-Term (Rest of Season)
- **Market adjusts**: Lines start reflecting Core 5 strength (edge disappears)
- **Model transitions**: Bayesian prior weight increases as edge shrinks
- **Graceful exit**: We stop betting when CLV goes negative consistently

### What Would Prove Us Wrong
- **Negative CLV over 10+ games**: Market was already pricing Core 5 correctly
- **Core 5 regresses hard**: Recent performance was noise, not signal
- **Key injury**: Core 5 can't stay healthy, thesis becomes moot

### Honest Expectations
We're not trying to get rich. We're testing whether a **temporary market inefficiency** exists and can be exploited with **disciplined, calculated bets**. If we're wrong, half-Kelly sizing limits the damage. If we're right, we make some money before the market catches up.

Please provide specific, actionable feedback. Thank you!
