# Hornets Buzz - Overall Approach & Features Documentation

## Project Philosophy

### Primary Goal
Build a **standard NBA spread prediction model** that achieves at least **~50% ATS accuracy** (break-even before vig). We're not trying to beat Vegas long-term—we're identifying a **short-term market inefficiency** and exploiting it responsibly before the market adjusts.

### Core Thesis
The Charlotte Hornets perform significantly better when their 5 core starters play together ("Core 5"). The market may be slow to adjust to this, creating a **10-15 game window** to exploit.

### What We Acknowledge
- The 78% ATS rate is **NOT sustainable** (small sample inflation)
- The market **WILL adjust** - Vegas isn't stupid
- Our true edge is likely **1-3% ATS**, not 26%
- We use **Bayesian shrinkage** to temper estimates toward reasonable values
- We use **half-Kelly sizing (capped at 60%)** to manage bankroll risk

---

## Core 5 Lineup

| Player | Position | Notes |
|--------|----------|-------|
| LaMelo Ball | PG | Primary playmaker |
| Brandon Miller | SF | Rookie, high upside |
| Miles Bridges | PF | Key scorer |
| Mark Williams | C | Rim protection |
| [5th Starter] | SG | Varies |

**Qualified Game**: A game where all 5 core starters played.

---

## Application Features

### 1. Dashboard (Overview Tab)

**Buzz Meter**: Visual indicator of team momentum based on rolling metrics.

**Respect Meter**: Tracks market perception via spread movement and betting lines.

**Stats Table**: Key metrics compared to league averages:
- Net Rating (ORTG - DRTG)
- Offensive Rating
- Defensive Rating
- Pace
- eFG%, TS%

**League Rankings**: Top 15 teams by Net Rating, ORTG, DRTG, and Elo.

**Comparison Chart**: Spread history with upcoming game predictions.

### 2. ATS Performance Tab

Tracks Against The Spread performance:
- Overall ATS record
- Home vs Away splits
- By opponent tier (elite/strong/mid/weak)
- Spread coverage margin

**CLV Tracking** (Closing Line Value):
- Opening spread vs closing spread
- Positive CLV = getting better numbers than market

### 3. Predictions Tab

**Upcoming Game Predictions**:
- Predicted margin (Hornets perspective)
- Predicted cover (margin + spread)
- Confidence level (high/medium/low)
- Conviction score (0-100) for bet sizing
- Factor breakdown showing what's driving the prediction

**Bet Type Recommendation** (Moneyline vs Spread):
- Compares expected value (EV) of spread vs moneyline
- Shows model win probability vs Vegas implied probability
- Recommends SPREAD, MONEYLINE, or PASS based on EV comparison
- Includes edge calculation and plain English reasoning

**Injury Report Integration**:
- Real-time injury status for both teams
- Core 5 health status
- Spread adjustment recommendations
- Refresh button for latest updates

**Three Prediction Modes** (Toggle in floating controls):
| Mode | Label | Purpose |
|------|-------|---------|
| Std | Standard | Conservative baseline |
| Bayes | Bayesian | **Recommended for betting** |
| 🐝 | Buzzing | Aggressive upper bound |

### 4. Game Log Tab

Complete game history:
- Date, opponent, result
- Hornets score vs opponent score
- Spread and cover result
- Qualified (Core 5 played) indicator
- Key stats per game

---

## Floating Controls

Located at bottom of screen, always accessible:

```
┌─────────────────────────────────────────────────────────────┐
│ [───────●───] 15 games   Healthy [ON]   Predict [Std|Bayes|🐝] │
└─────────────────────────────────────────────────────────────┘
```

**Window Slider**: 1 to all games (adjusts stats window)

**Healthy Toggle**: ON = Core 5 games only, OFF = all games

**Predict Mode**: Standard / Bayesian / Buzzing

---

## Data Pipeline

### Data Sources
- **NBA API**: Game results, box scores, player stats
- **The Odds API**: Betting lines, spreads, moneylines
- **Manual**: Injury reports (with refresh capability)

### Data Flow
```
NBA API → fetch_data.py → hornets_buzz.json → Next.js App
                                    ↓
                            model.ts (predictions)
                                    ↓
                           React Components (UI)
```

### Key Data Files
| File | Purpose |
|------|---------|
| `data/hornets_buzz.json` | Main data (games, metrics, upcoming) |
| `data/injury_reports.json` | Cached injury data by game |
| `data/backtest_results.json` | Hornets backtest output |
| `data/backtest_league_results.json` | League-wide backtest output |

---

## Injury Report System

### Player Impact Ratings
```typescript
// Opponent stars (when OUT)
+2.0 pts adjustment per star

// Opponent stars (when QUESTIONABLE)
+0.5 pts adjustment

// Core 5 players (when OUT)
-3.0 pts adjustment

// Cap total injury adjustment at ±6 pts
```

### Status Types
- OUT: Confirmed not playing
- DOUBTFUL: Unlikely to play
- QUESTIONABLE: Game-time decision
- PROBABLE: Likely to play
- DAY-TO-DAY: Short-term issue
- AVAILABLE: Healthy

### UI Display
Shows for each upcoming game:
- Hornets injuries (with Core 5 status)
- Opponent injuries (highlighting stars)
- Net spread adjustment
- Plain English summary

---

## Risk Management

### Kelly Criterion Implementation
```python
# 1. Cap effective win probability at 56%
effective_prob = min(model_prob, 0.56)

# 2. Calculate half-Kelly
kelly = (b × p - q) / b
half_kelly = kelly / 2

# 3. Cap at 60% of bankroll
bet_size = min(half_kelly, 0.60)
```

### Why These Safeguards?
- Model probabilities are inflated by small samples
- Feeding 75%+ probabilities into Kelly = bankroll destruction
- Half-Kelly reduces variance at cost of expected growth
- 60% cap prevents catastrophic single-game exposure

### MOV Capping
Point differential capped at ±20 per game to prevent blowouts from distorting Elo calculations.

### Margin Capping
Predicted margins capped at ±15 points (most NBA games fall within this range).

---

## Backtest-Driven Adjustments

### Parameters Tuned from Backtest
| Parameter | Original | Current | Evidence |
|-----------|----------|---------|----------|
| Home court | +2.5 | +2.0 | +1.3 overpredict bias |
| B2B penalty | -3.0 | -1.5 | Hornets +9.8 actual on B2Bs |
| Pace factor | 2% | 3% | High-pace MAE 50% higher |
| Survivorship | -0.75 | -0.25 | -5.7 underpredict Core 5 |
| Mid vs Mid | - | -1.0 | +2.2 league overpredict |

### Ongoing Tracking
- MAE by game situation
- ATS accuracy over time
- CLV performance
- Confidence calibration (do high-confidence bets outperform?)
- Conviction calibration (do high-conviction bets size better?)

### Architectural Improvements (Per ChatGPT Review)

**1. Separation of Prediction from Conviction**
- `predictedMargin`: Capped ±15 pts for display (reduces outlier noise)
- `rawMargin`: Uncapped margin for internal sizing calculations
- `conviction`: 0-100 score based on volatility factors, NOT the margin

Conviction factors:
- Low pace games = higher conviction (less variance)
- Weak/mid opponents = higher conviction (more predictable)
- Fresh Core 5 data = higher conviction
- Good rest = higher conviction
- Opponent injuries = higher conviction

**2. Core 5 Time Decay**
- Market adjusts to Core 5 performance over time
- Half-life of 30 days: edge decays by ~63% each month
- Formula: `core5_weight *= exp(-days_since_last_core5 / 30)`
- Applied to Bayesian blend weight, not directly to margin

**3. Margin Cap for Display Only**
- Raw margin used for internal sizing calculations
- ±15 pt cap applied only for UI display
- Prevents extreme predictions while preserving signal strength

**4. Regime-Based Variance (σ) - Per ChatGPT Review**
This is "the single biggest upgrade - makes EV math honest":
- Different situations have different VARIANCE, not just different means
- Pace adjustment moved FROM margin TO sigma (pace doesn't make teams worse, it makes outcomes noisier)
- Survivorship penalty moved FROM margin TO sigma/conviction (preserves upside while protecting sizing)

| Regime | σ | Description |
|--------|-----|-------------|
| Normal | 11.5 | Standard games |
| Core5 | 14.5 | Higher ceiling AND floor |
| HighPace | 15.0 | More possessions = more variance |
| EliteOpp | 13.5 | Unpredictable outcomes |

**5. Tail-Risk Haircut**
- Conviction score includes penalty for high-σ regimes
- `tailPenalty = min(1.0, 11.5 / σ)`
- At σ=15: ~23% conviction reduction → smaller bet sizes
- Protects bankroll from blowout variance (Utah +57, OKC +27 type games)

---

## File Structure

```
hornets-buzz/
├── app/
│   ├── page.tsx                 # Main dashboard
│   ├── api/
│   │   ├── data/               # Data API endpoint
│   │   └── injuries/           # Injury report API
│   └── components/
│       ├── BuzzMeter.tsx       # Momentum visualization
│       ├── RespectMeter.tsx    # Market perception
│       ├── StatsTable.tsx      # Key metrics
│       ├── LeagueRankings.tsx  # Top 15 teams
│       ├── ComparisonChart.tsx # Spread history
│       ├── ATSPerformance.tsx  # ATS tracking + CLV
│       ├── SpreadPrediction.tsx # Predictions + injuries
│       ├── GameLog.tsx         # Game history
│       └── FloatingControls.tsx # Slider + toggles
├── lib/
│   ├── model.ts                # Main prediction model
│   ├── buzzing-model.ts        # Buzzing-specific logic
│   └── types.ts                # TypeScript interfaces
├── scripts/
│   ├── fetch_data.py           # Data pipeline
│   ├── backtest.py             # Hornets backtest
│   └── backtest_league.py      # League-wide backtest
├── data/
│   ├── hornets_buzz.json       # Main data
│   └── injury_reports.json     # Injury cache
└── docs/
    ├── MODEL_AND_BACKTEST.md   # Model documentation
    └── OVERALL_APPROACH.md     # This file
```

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Data Fetching**: NBA API (nba_api Python package)
- **Odds Data**: The Odds API
- **Deployment**: Vercel
- **Version Control**: GitHub

---

## What Success Looks Like

### Short-Term (10-15 Games)
- Positive CLV (getting better numbers than closing lines)
- ATS > 50% (any edge above break-even)
- No catastrophic losses (half-Kelly keeps us in the game)

### Medium-Term (Rest of Season)
- Market adjusts (lines start reflecting Core 5 strength)
- Model transitions (Bayesian prior weight increases as edge shrinks)
- Graceful exit (stop betting when CLV goes negative)

### Validation Signals
- High-confidence predictions outperform low-confidence
- Core 5 games remain profitable
- CLV stays positive or near-zero

### Exit Signals
- Consistent negative CLV (market priced us correctly)
- Core 5 regresses hard (performance was noise)
- Key injury (thesis becomes moot)

---

## LLM Review Focus Areas

### Defensive (Find Problems)
1. Any bugs or logic errors in model implementation?
2. Where are we fooling ourselves with small samples?
3. Risk management gaps that could blow up bankroll?
4. Double-counting or correlation issues?

### Offensive (Find Edge)
1. Untapped signals we could add?
2. Specific situations where edge might be higher?
3. Timing optimization (when to bet)?
4. Alternative bet types (totals, props, live)?
5. Exit strategy refinement?
