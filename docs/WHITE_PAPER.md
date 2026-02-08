# The Buzz Model: A Bayesian Approach to NBA Spread Betting

**A Technical White Paper on the Charlotte Hornets Prediction System**

---

## The Big Picture

The Hornets have a problem: their season stats lie. With a 25-28 record, they look like a mediocre team. But when their Core 5 lineup plays together? They're **20-8 with a +7.5 net rating**—5th best in the NBA.

Traditional betting models miss this because they average across all games. We built something different.

**The bottom line:** A regime-based Bayesian model that knows *which* Hornets team is actually playing.

---

## How It Works

### Three Prediction Modes

| Mode | What It Does | When to Use |
|------|--------------|-------------|
| **Standard** | Full season metrics (53 games) | Conservative baseline |
| **Bayesian** | Blends season prior with Core 5 evidence | **Primary betting mode** |
| **Buzzing** | Pure Core 5 metrics only | Upper bound / diagnostics |

**Why it matters:** The Bayesian mode gives us the best of both worlds—it respects sample size while recognizing that the Core 5 is a fundamentally different team.

### The Core 5 Filter

We only count games where all five starters play meaningful minutes:
- LaMelo Ball (PG)
- Kon Knueppel (SG)
- Brandon Miller (SF)
- Miles Bridges (PF)
- Moussa Diabaté (C)

**Result:** 28 qualified games out of 53 total. In those 28 games:
- Offensive Rating: 118.4 (2nd in NBA)
- Defensive Rating: 110.9 (8th)
- ATS Record: 16-12 (57.1%)

---

## The Math Under the Hood

### Bayesian Blending Formula

```
Blended = (prior_strength × season_metric + core5_games × core5_metric)
          / (prior_strength + core5_games)
```

**Prior strength** starts at 75 and decays to 20 as Core 5 games accumulate. At 28 games, prior strength ≈ 46.

**Translation:** Early season, we lean on full-season data. Now, Core 5 evidence dominates.

### Regime-Based Variance (σ)

Not all games are equally predictable. Our model assigns different variance based on game regime:

| Regime | Base σ | What It Means |
|--------|--------|---------------|
| Core 5 Active | 14.5 | High-variance lineup |
| High Pace (230+) | 15.0 | More possessions = more volatility |
| vs Elite (NR ≥ 6.0) | 13.5 | Elite teams are more consistent |
| Normal | 11.5 | Standard NBA game |

**Why it matters:** Cover probability depends on σ. Higher variance means less certainty, which affects bet sizing.

### Adjustment Stack

Every prediction starts with raw net rating differential, then applies:

| Factor | Adjustment | Source |
|--------|------------|--------|
| Home Court | +2.0 pts | League average |
| Elite Opponent | -2.0 pts | NR ≥ +6.0 penalty |
| Fatigue (B2B) | -3.5 pts | Back-to-back games |
| Mid vs Mid | +1.5 pts | Backtest shows under-prediction |
| Trade Deadline | -0.75 pts | Bench disruption (expires Feb 16) |
| Injuries | Variable | Per-player impact ratings |

---

## Conviction Scoring

**The problem:** A model can predict +5 margin, but how confident should we be?

**Our solution:** A 0-100 conviction score based on volatility factors:

| Factor | Points | Rationale |
|--------|--------|-----------|
| Normal Pace | +10 | Predictable game flow |
| Non-Elite Opponent | +15 | Higher model accuracy |
| Core 5 Recent (<5 days) | +25 | Fresh lineup data |
| Well Rested (no B2B) | +15 | Performance boost |
| All Core 5 Healthy | +10 | Full strength |
| **Tail-Risk Haircut** | -5 to -15 | High σ penalty |

**Sizing rule:** Conviction directly maps to bet size. At 60 conviction, bet 60% of calculated Kelly.

### Tail-Risk Haircut

When σ exceeds baseline (11.5), we apply a penalty:

```
tailPenalty = min(1.0, 11.5 / σ)
convictionHaircut = (1 - tailPenalty) × 15
```

**Example:** At σ = 15.5, haircut = 3.9 points off conviction.

---

## Moneyline vs Spread Decision

For every game, we calculate EV for both bet types:

**Spread EV:**
```
coverProb = Φ((predicted_margin + spread) / σ)
spreadEV = (coverProb × 100) - ((1 - coverProb) × 110)
```

**Moneyline EV:**
```
winProb = Φ(predicted_margin / σ)
If ML positive: mlEV = (winProb × ML) - ((1 - winProb) × 100)
If ML negative: mlEV = (winProb × 100) - ((1 - winProb) × |ML|)
```

**Decision rule:** Bet whichever has higher EV, unless the difference is <$5 per $100 (then prefer spread for lower variance).

---

## Backtest Results

| Metric | Hornets Model | League Average |
|--------|---------------|----------------|
| MAE | 12.27 pts | 10.87 pts |
| RMSE | 15.41 pts | 13.89 pts |
| ATS Accuracy | 54.2% | 50% (baseline) |

**Key insight from buckets:**
- vs Elite opponents: Nearly zero bias (accurate)
- Core 5 games: -5.7 bias (model underpredicts)
- Home games: +2.2 bias (slight overpredict)

---

## What We're Watching

1. **Core 5 time decay:** How quickly does lineup staleness affect predictions?
2. **Trade deadline adjustment:** Does bench disruption actually impact Core 5 games?
3. **Regime accuracy:** Are high-σ games truly less predictable?

---

## The Bottom Line

This isn't a magic formula. It's a disciplined framework that:

- Separates *which* Hornets team is playing
- Quantifies uncertainty through regime-based variance
- Ties prediction confidence to bet sizing
- Learns from backtest errors

**Expected edge:** 3-5% over closing lines in Core 5 games.

---

# Game Analysis: Charlotte vs Detroit Pistons

**February 9, 2026 | Charlotte (HOME)**

---

## The Setup

| Team | Record | Net Rating | Rank |
|------|--------|------------|------|
| Charlotte (Core 5) | 20-8 | +7.5 | ~5th |
| Detroit | 38-13 | +7.8 | 2nd |

**Current Line:** CHA +3.5 (-110) | ML +130

**The paradox:** Two teams with nearly identical net ratings, but Charlotte is a 3.5-point home underdog. Vegas respects Detroit's record. We respect the matchup.

---

## Injury Report (Critical)

### Detroit's Problems

| Player | Status | Impact |
|--------|--------|--------|
| Tobias Harris | **OUT** | Rotation weakened |
| Cade Cunningham | **DAY-TO-DAY** | Their best player at risk |
| Jalen Duren | **QUESTIONABLE** | Starting center at risk |

**Injury adjustment:** +4.5 pts in Charlotte's favor

### Charlotte's Core 5

All five starters: **AVAILABLE**

---

## Model Predictions

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
- **Active regime:** Core 5 + Elite Opponent
- **Calculated σ:** 15.5 (elevated variance)
- **Trade transition boost:** +1.0 to σ

### Cover Probability
```
Expected Cover = spread + predicted_margin
               = 3.5 + 3.45 = 6.95 pts

Cover Prob = Φ(6.95 / 15.5) = Φ(0.45) ≈ 67%
```

---

## Bet Analysis

| Bet Type | Line | Model Prob | Implied Prob | Edge | EV per $100 |
|----------|------|------------|--------------|------|-------------|
| **Spread** | +3.5 | 67% | 52% | +15% | **+21.4** |
| Moneyline | +130 | 57.5% | 43.5% | +14% | +32.3 |

**Verdict:** Spread is the smarter bet. Higher certainty, injury edge amplifies cover margin.

---

## Risk Factors

### Concerns
- Detroit is elite (#2 seed)—they punish mistakes
- High σ (15.5) means wide outcome distribution
- Diabaté is foul-prone; Detroit attacks the rim
- Detroit suppresses assist rates (hurts LaMelo offense)

### Mitigating Factors
- Charlotte is 5-0 ATS in last 5 Core 5 games
- Model has near-zero bias vs elite opponents
- Injury adjustment is conservative (could be larger if Cunningham sits)

---

## Conviction Score

| Factor | Points |
|--------|--------|
| Normal Pace | +10 |
| Elite Opponent | +5 (reduced) |
| Core 5 Recent | +25 |
| Well Rested | +15 |
| All Healthy | +10 |
| Tail-Risk Haircut | -5 |
| **Total** | **60** |

**Sizing:** 1.0-1.5 units (60% of calculated Kelly)

---

## Pre-Game Checklist

- [ ] Confirm Cunningham status by 5 PM
- [ ] Confirm Duren status by 5 PM
- [ ] Monitor line movement (value extracted if CHA -1 or worse)
- [ ] If both OUT → Consider 2 units

## Exit Signals

- Cunningham AND Duren play full minutes → Reduce to 0.5 units
- Line moves to CHA -1 → Value extracted, consider passing
- Any Core 5 player scratched → PASS

---

## Bottom Line

**Bet:** Charlotte +3.5 @ 1.0-1.5 units

**Why:** Near-identical team strength, full Core 5 vs injured Detroit, +3.5 points of line value. The model shows +6.95 expected cover margin with 67% probability.

**Risk level:** Medium-high (elite opponent, elevated σ)

---

*Model version: Regime-based variance with Bayesian blending*
*Document generated: February 8, 2026*
