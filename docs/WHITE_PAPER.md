# The Buzz Model

**How we predict Charlotte Hornets games — and decide when to bet.**

---

## The Core Idea

The Hornets' season stats don't tell the full story. At 30-31 overall, they look like a .500 team. But when the Core 5 lineup plays together, they're **23-9** — a completely different team.

Vegas knows the Hornets' overall record. What they're slower to price in is *which* Hornets team is showing up tonight. That's where we think the edge lives.

The model has three jobs:
1. **Predict the margin** — how much should Charlotte win or lose by?
2. **Score conviction** — how confident are we in this prediction?
3. **Size the bet** — conviction drives how much to wager

---

## The Core 5

We track games where all five starters play meaningful minutes:

- **LaMelo Ball** (PG)
- **Kon Knueppel** (SG)
- **Brandon Miller** (SF)
- **Miles Bridges** (PF)
- **Moussa Diabaté** (C)

When all five are in, the Hornets are a top-tier team. When they're not, the data is noisier and less predictive — which is why the model tracks this split carefully.

---

## How Predictions Work

### Two Engines, One Prediction

The model blends two independent approaches:

**Elo Rating (60% weight)** — Based on FiveThirtyEight's methodology. Estimates team strength from win-loss record and margin of victory. Stable but slow to react to recent form.

**Net Rating (40% weight)** — How many more points you score vs allow per 100 possessions. We use a weighted blend of rolling windows to balance recency against stability:

| Window | Weight | Why |
|--------|--------|-----|
| Last 4 games | 20% | Captures hot/cold streaks |
| Last 7 games | 20% | Short-term form |
| Last 10 games | 25% | Medium-term trend |
| Full season | 35% | Anchors against noise |

The season window gets the most weight because, at league scale, season-long data is more predictive than chasing recent results. The market already reacts to recency — we don't need to overweight it.

### Adjustments

After blending Elo and Net Rating, we apply situational adjustments:

| Factor | Adjustment | Why |
|--------|------------|-----|
| Home court | +1.5 pts | League-average home edge |
| Home team on B2B | -3.0 pts | Fatigue erodes home crowd/energy edge |
| Away team on B2B | +1.0 pts | Less impact — already traveling |
| Margin cap | +/-15 pts max | Prevents extreme predictions |

The B2B adjustments are asymmetric on purpose. Our backtest showed home teams on back-to-backs lose significantly more of their edge than away teams do — the crowd and routine advantages that make home court valuable are exactly what fatigue undermines.

### Three Prediction Modes

| Mode | What it does | When to use it |
|------|-------------|----------------|
| **Standard** | Uses all games, full season data | Conservative baseline |
| **Bayesian** | Blends season data with Core 5 evidence | **Primary betting mode** |
| **Buzzing** | Uses only Core 5 games | Upper bound / confirms edge |

**Bayesian mode** is the one we bet with. It starts anchored to full-season data early in the year, then gradually shifts toward Core 5 performance as those games accumulate. This avoids overreacting to small samples while recognizing that the Core 5 is genuinely a different team.

---

## Conviction Scoring

Predicting a +5 margin is one thing. Knowing *how much to trust that prediction* is another. That's what conviction does.

Conviction is a 0-100 score built from three buckets:

### Bucket 1: Game Chaos (0-30 pts)

How volatile is this game environment?

- **Pace** — Higher combined pace means more possessions, more variance, harder to predict. Calm games score higher.
- **Sigma penalty** — When the model detects an elevated-variance regime (Core 5 active, elite opponent, high pace), conviction takes a haircut. This is the only place variance reduces conviction — no double-counting.

### Bucket 2: Edge Reliability (0-35 pts)

Can we trust that our edge is real?

- **Core 5 freshness** (0-20) — How recently have we seen the Core 5 play together? Fresh data means our Bayesian estimate is current. Stale data means the market may have caught up.
- **Rest situation** (0-10) — Well-rested teams are more predictable. Back-to-back games score lower.
- **Health** (0-5) — All Core 5 healthy gets full credit. Key player out drops this to zero.

### Bucket 3: Signal Alignment (0-35 pts)

Do multiple signals agree?

- **Mode consensus** (0-15) — When Standard, Bayesian, and Buzzing all agree on whether Charlotte covers, conviction goes up. When they disagree, it goes down.
- **Component consensus** (0-10) — Do the Elo and Net Rating engines independently point the same direction against the spread?
- **Opponent injuries** (0-10) — Unmodeled opponent injuries (not reflected in the line) are free edge.
- **Market disagreement penalty** (0 to -10) — When our prediction disagrees with the closing line by 7+ points, conviction drops. The market wins big disagreements — our ATS analysis showed that 8+ point disagreement with the market produces just 26% ATS. At 10+ points of disagreement, the penalty is -10.

### How Conviction Drives Sizing

Conviction directly scales bet size:

```
units = (conviction / 100) x allocation x 2
```

A conviction of 70 means 70% of the calculated position size. Low conviction games get smaller bets. Very low conviction means we pass entirely.

---

## Moneyline vs Spread

For every game, we calculate expected value for both bet types:

- **Spread EV** uses cover probability (predicted margin + spread, divided by sigma)
- **Moneyline EV** uses win probability and the posted moneyline odds

We recommend whichever has higher EV. If the difference is small (<$5 per $100), we prefer the spread for lower variance.

---

## Backtest Results

Tested on the 2025-26 season using walk-forward methodology — every prediction uses only data available before that game. No look-ahead.

### League-Wide (690 non-Hornets games)

| Metric | Value |
|--------|-------|
| MAE | 11.3 pts |
| SU Accuracy | 63.9% |
| ATS Record | 326-338 (49.1%) |

The league model picks winners well but doesn't beat the spread consistently — the market is efficient across the full NBA.

### Hornets (Bayesian mode, 51 games)

| Metric | Value |
|--------|-------|
| MAE | 12.8 pts |
| SU Accuracy | 56.9% |
| ATS Record | **31-20 (60.8%)** |

### Hornets Core 5 Only (30 games)

| Metric | Value |
|--------|-------|
| ATS Record | **20-10 (66.7%)** |

The Hornets-specific model beats the spread at a much higher rate than the generic league model. The Bayesian adjustments and Core 5 filtering are adding roughly 12 points of ATS edge over the baseline. Core 5 games are where the edge concentrates.

### Key ATS Findings

From our league-wide ATS edge analysis (664 games with closing spreads):

- **B2B games hurt ATS**: 43.3% when either team is on a back-to-back vs 51.6% without
- **Large disagreements lose**: When the model disagrees with the market by 8+ points, ATS drops to 26%
- **The Hornets model is the exception**: Despite league-wide ATS being break-even, the Hornets Bayesian model finds real edge — especially in Core 5 games

---

## What This Isn't

This model doesn't predict upsets or find hidden gems across the whole NBA. The league-wide ATS is 49.1% — basically a coin flip against the market.

What it *does* do is identify a specific, persistent inefficiency: the market underprices the Charlotte Hornets when the Core 5 is healthy. The Bayesian mode captures this, the conviction score tells us when to trust it, and the sizing framework keeps us disciplined.

---

*Model version: Regime-based variance with Bayesian blending + market disagreement penalty*
*Last updated: March 2026*
