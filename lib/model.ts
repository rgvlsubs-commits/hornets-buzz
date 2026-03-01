import { Game, UpcomingGame } from './types';

/**
 * NBA Spread Prediction Model
 *
 * Based on backtesting analysis combining:
 * - FiveThirtyEight Elo methodology
 * - Bart Torvik efficiency ratings approach
 * - Rolling net rating windows
 *
 * Backtest results (2025-26 season, 709 games):
 * - Elo Model: 11.43 MAE, 63.2% accuracy
 * - Net Rating Model: 12.24 MAE, 61.8% accuracy
 * - Hybrid: 11.53 MAE, 62.2% accuracy
 *
 * Sources:
 * - https://fivethirtyeight.com/methodology/how-our-nba-predictions-work/
 * - https://barttorvik.com/
 */

// === Elo Parameters (from 538) ===
const ELO_K_FACTOR = 20;
const ELO_HOME_ADVANTAGE = 70; // Elo points (~2.5 actual points)
const ELO_INITIAL = 1500;
const ELO_TO_SPREAD = 28; // ~28 Elo points = 1 point spread

// === Net Rating Parameters ===
// Home court: 2.0 → 1.5 per league-wide backtest (+0.9 home bias on 690 games)
const NR_HOME_ADVANTAGE = 1.5; // Points (was 2.0, originally 2.5)
// B2B penalty is asymmetric: home teams lose crowd/energy edge, away teams less affected
// Per league-wide backtest (690 games): home B2B bias +3.4, away B2B bias +2.9 w/ flat 1.5
const NR_FATIGUE_HOME_B2B = 3.0; // Home team on B2B (was flat 1.5)
const NR_FATIGUE_AWAY_B2B = 1.0; // Away team on B2B (was flat 1.5)

// === Vig Removal ===
// Standard NBA overround is ~4-5%. Devig implied probability by dividing out the overround.
const ESTIMATED_OVERROUND = 1.045;

// === Blend Weights (optimized from backtest) ===
const ELO_WEIGHT = 0.60; // Increased from 0.55 per league ablation (+0.7% SU on 690 games)
const NR_WEIGHT = 0.40; // Decreased from 0.45

// Rolling window weights for net rating
// Shifted toward stability per league ablation: 20/20/25/35 beat 30/25/25/20 (-0.06 MAE, +0.4% SU)
// Season data is more predictive than recency at league scale
const WINDOW_WEIGHTS = {
  last4: 0.20,
  last7: 0.20,
  last10: 0.25,
  season: 0.35,
};

// Buzzing mode: window weights when using only healthy games
const BUZZING_WINDOW_WEIGHTS = {
  last4: 0.30,
  last7: 0.30,
  last10: 0.25,
  season: 0.15, // "season" here means all healthy games (up to 15)
};

// Buzzing mode sample size
const BUZZING_SAMPLE_SIZE = 15;

// Elite opponent threshold and penalty
// Note: Backtest shows ~0 bias vs elite (n=3), suggesting this penalty
// may already be well-calibrated. ChatGPT suggested -1.0 to -1.5 for Bayesian,
// but n=3 is too small to confidently reduce. Keep at -2.0 and monitor.
const ELITE_OPPONENT_THRESHOLD = 6.0;  // Net rating threshold for elite teams
// Per ChatGPT review: Reduce from -2.0 to -1.0, let σ do more work
const ELITE_OPPONENT_PENALTY = -1.0;   // Additional penalty vs elite teams (was -2.0)

// === RISK ADJUSTMENTS (Per ChatGPT/Gemini Review) ===

// Mid vs Mid adjustment — DISABLED per league ablation (zero effect on 690 games)
// Was -1.0 when opponent NR between -3.0 and 3.0
const MID_TIER_THRESHOLD_LOW = -3.0;
const MID_TIER_THRESHOLD_HIGH = 3.0;
const MID_VS_MID_ADJUSTMENT = 0;

// Predicted margin cap - extreme predictions are usually wrong
// Most NBA games land within ±15 points; capping reduces MAE from outliers
const PREDICTED_MARGIN_CAP = 15;

// League average pace (used as fallback for missing pace data)
const LEAGUE_AVG_PACE = 100;

// === CORE 5 TIME DECAY ===
// Per ChatGPT review: Market adjusts to Core 5 performance over time
// Weight decays exponentially as days since last Core 5 game increases
// Half-life of ~30 days means edge decays by ~50% each month
const CORE5_DECAY_HALFLIFE = 30; // Days until Core 5 edge is halved

// === REGIME-BASED VARIANCE (σ) ===
// Per ChatGPT review: Stop modeling variance like a retail bettor
// Different game situations have DIFFERENT variance, not just different means
// σ = standard deviation of actual margin around predicted margin
const SIGMA_BASE = 11.5;           // Normal games
const SIGMA_CORE5 = 14.5;          // Core 5 games have higher ceiling AND floor
const SIGMA_HIGH_PACE = 15.0;      // High pace = more possessions = more variance
const SIGMA_ELITE_OPPONENT = 13.5; // Elite opponents create unpredictable outcomes
const HIGH_PACE_THRESHOLD = 205;   // Combined pace above this = high pace game

// Per ChatGPT review: Make σ partially conditional on predicted margin
// "This fixes why your biggest misses are positive blowouts"
// σ_effective += δ × |predicted_margin| where δ ≈ 0.15-0.25
const SIGMA_MARGIN_COEFFICIENT = 0.20;  // σ increases by 0.2 per point of |margin|

/**
 * Calculate days between two dates
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate regime-based variance (σ) for a game
 *
 * Per ChatGPT review: Different situations have different VARIANCE, not just different means.
 * This is the single biggest upgrade - makes EV math honest.
 *
 * Per Gemini review: Use Root Sum of Squares (RSS) instead of MAX.
 * Independent variance sources should combine, not cap at highest single factor.
 * Formula: σ = sqrt(σ_base² + Σ(σ_regime - σ_base)²)
 *
 * Per ChatGPT follow-up: Make σ partially conditional on predicted margin.
 * "This fixes why your biggest misses are positive blowouts."
 * σ_effective += δ × |predicted_margin| where δ ≈ 0.20
 *
 * @param predictedMargin - The predicted margin (optional, for margin-conditional σ)
 * @returns sigma (standard deviation) and the regime description
 */
function calculateRegimeSigma(
  isCore5Active: boolean,
  combinedPace: number,
  opponentNetRating: number,
  daysSinceCore5: number,
  predictedMargin: number = 0  // Optional: for margin-conditional σ
): { sigma: number; regime: string } {
  const regimeParts: string[] = [];
  const varianceBoosts: number[] = []; // Collect (σ_regime - σ_base)² terms

  // Core 5 games have higher variance (ceiling AND floor)
  if (isCore5Active) {
    const boost = SIGMA_CORE5 - SIGMA_BASE;
    varianceBoosts.push(boost * boost);
    regimeParts.push('Core5');
  }

  // High pace games have more possessions = more variance
  if (combinedPace > HIGH_PACE_THRESHOLD) {
    const boost = SIGMA_HIGH_PACE - SIGMA_BASE;
    varianceBoosts.push(boost * boost);
    regimeParts.push('HighPace');
  }

  // Elite opponents create unpredictable outcomes
  if (opponentNetRating >= ELITE_OPPONENT_THRESHOLD) {
    const boost = SIGMA_ELITE_OPPONENT - SIGMA_BASE;
    varianceBoosts.push(boost * boost);
    regimeParts.push('EliteOpp');
  }

  // Variance persists longer than mean - keep σ elevated for 45-60 days after Core 5
  // Markets catch the average faster than they catch the distribution
  if (daysSinceCore5 > 0 && daysSinceCore5 <= 60) {
    const varianceDecay = Math.exp(-daysSinceCore5 / 60); // Slower decay than mean (60 vs 30)
    const core5VarianceBoost = (SIGMA_CORE5 - SIGMA_BASE) * varianceDecay;
    if (core5VarianceBoost > 0.5) {
      varianceBoosts.push(core5VarianceBoost * core5VarianceBoost);
      regimeParts.push('Core5Var');
    }
  }

  // RSS combination: σ = sqrt(σ_base² + Σ boosts²)
  const totalVarianceBoost = varianceBoosts.reduce((sum, v) => sum + v, 0);
  let sigma = Math.sqrt(SIGMA_BASE * SIGMA_BASE + totalVarianceBoost);

  // Margin-conditional σ: larger predicted margins = more uncertainty
  // Per ChatGPT: "This fixes why your biggest misses are positive blowouts"
  const marginBoost = SIGMA_MARGIN_COEFFICIENT * Math.abs(predictedMargin);
  if (marginBoost > 0.5) {
    sigma += marginBoost;
    regimeParts.push('MarginVar');
  }

  const regime = regimeParts.length > 0 ? regimeParts.join('+') : 'Normal';
  return { sigma: Math.round(sigma * 10) / 10, regime };
}

/**
 * Calculate Core 5 time decay factor
 * Returns 0-1 where 1 = fresh (recent Core 5 game), 0 = stale (long time since Core 5)
 *
 * Formula: exp(-days_since_last_core5 / halflife)
 * - At 0 days: 1.0 (full weight)
 * - At 30 days: 0.37 (1/e weight)
 * - At 60 days: 0.14 (heavily decayed)
 */
function calculateCore5TimeDecay(daysSinceLastCore5: number): number {
  return Math.exp(-daysSinceLastCore5 / CORE5_DECAY_HALFLIFE);
}

/**
 * Calculate conviction score (0-100) for bet sizing
 *
 * Separate from prediction - this measures HOW CONFIDENT we should be
 * in the prediction, not what the prediction is.
 *
 * Per ChatGPT review: Also includes TAIL-RISK HAIRCUT based on sigma.
 * Higher variance regimes get reduced conviction to protect bankroll.
 *
 * Factors that INCREASE conviction:
 * - Low pace game (less variance)
 * - Weak opponent (more predictable)
 * - Fresh Core 5 data (recent performance)
 * - Good rest situation
 * - Opponent missing key players
 *
 * Factors that DECREASE conviction:
 * - High pace game (more variance)
 * - Elite opponent (more volatile outcomes)
 * - Stale Core 5 data (market has adjusted)
 * - Back-to-back (less predictable)
 * - Core 5 missing players
 * - High sigma regime (tail-risk haircut)
 */
export interface ConvictionBreakdown {
  // Bucket 1: Game Chaos (0-30, higher = calmer game)
  chaos: {
    score: number;
    sigmaPenalty: number;    // from tail-risk haircut (0 to -15)
    paceScore: number;       // 0-15: low pace = calm
  };
  // Bucket 2: Edge Reliability (0-35, higher = more trustworthy edge)
  edge: {
    score: number;
    core5Freshness: number;  // 0-20: recent Core 5 data
    restScore: number;       // 0-10: good rest situation
    hornetsHealthScore: number; // 0-5: Core 5 healthy = full credit
  };
  // Bucket 3: Signal Alignment (0-35, higher = stronger agreement)
  alignment: {
    score: number;
    modeConsensus: number;   // 0-15: all modes agree on cover direction
    componentConsensus: number; // 0-10: Elo and NR both point same way vs spread
    opponentInjuryEdge: number; // 0-10: unmodeled opponent injuries = free edge
    marketDisagreementPenalty: number; // 0 to -10: large model-market disagreement penalty
  };
  total: number; // 0-100
}

function calculateConviction(
  combinedPace: number,
  core5DecayFactor: number,
  restDays: number | undefined,
  isBackToBack: boolean | undefined,
  sigma: number,
  eloComponent: number,
  netRatingComponent: number,
  spread: number | null,
  predictedMargin: number,
  injuryReport?: { hornetsCore5Status: string; spreadAdjustment?: number }
): { conviction: number; breakdown: ConvictionBreakdown } {
  // === Bucket 1: Game Chaos (0-30) ===
  // paceScore (0-15): League avg combined pace = 200
  const paceDeviation = combinedPace - 200;
  const paceScore = Math.max(0, Math.min(15, 7.5 - paceDeviation * 0.375));

  // sigmaPenalty (0 to -15): Tail-risk haircut from sigma
  // This is the ONLY place sigma reduces conviction — no double-counting
  const tailPenalty = Math.min(1.0, SIGMA_BASE / sigma);
  const sigmaPenalty = -Math.round((1 - tailPenalty) * 15);

  const chaosScore = Math.max(0, Math.min(30, paceScore + 15 + sigmaPenalty));

  // === Bucket 2: Edge Reliability (0-35) ===
  // core5Freshness (0-20): Based on time decay
  const core5Freshness = Math.round(core5DecayFactor * 20);

  // restScore (0-10): Simplified tiers
  let restScore: number;
  if (isBackToBack) {
    restScore = 3;
  } else if (restDays !== undefined && restDays >= 2) {
    restScore = 10;
  } else {
    restScore = 7;
  }

  // hornetsHealthScore (0-5): Core 5 health
  let hornetsHealthScore = 5; // Default: all healthy
  if (injuryReport) {
    if (injuryReport.hornetsCore5Status === 'KEY_PLAYER_OUT') {
      hornetsHealthScore = 0;
    } else if (injuryReport.hornetsCore5Status === 'SOME_QUESTIONABLE') {
      hornetsHealthScore = 2;
    }
  }

  const edgeScore = Math.max(0, Math.min(35, core5Freshness + restScore + hornetsHealthScore));

  // === Bucket 3: Signal Alignment (0-35) — Phase 1 only ===
  // componentConsensus (0-10): Do Elo and NR both imply cover vs spread?
  let componentConsensus = 5; // Default neutral when no spread
  if (spread !== null) {
    const eloCovers = eloComponent + spread > 0;
    const nrCovers = netRatingComponent + spread > 0;
    if (eloCovers && nrCovers) {
      componentConsensus = 10;
    } else if (eloCovers || nrCovers) {
      componentConsensus = 5;
    } else {
      componentConsensus = 0;
    }
  }

  // opponentInjuryEdge (0-10): Unmodeled opponent injuries = free edge
  let opponentInjuryEdge = 0;
  if (injuryReport?.spreadAdjustment && injuryReport.spreadAdjustment > 0) {
    const adj = injuryReport.spreadAdjustment;
    if (adj >= 3) {
      opponentInjuryEdge = 10;
    } else if (adj >= 1.5) {
      opponentInjuryEdge = 7;
    } else {
      opponentInjuryEdge = 4;
    }
  }

  // marketDisagreementPenalty (0 to -10): When model disagrees with market by 7+ pts,
  // conviction drops. Per ATS edge analysis: 8pt+ disagreement = 25.9% ATS (n=27),
  // 6-8pt = 47.4% (n=57). The market wins big disagreements.
  let marketDisagreementPenalty = 0;
  if (spread !== null) {
    const disagreement = Math.abs(predictedMargin + spread);
    if (disagreement >= 10) {
      marketDisagreementPenalty = -10;
    } else if (disagreement >= 7) {
      marketDisagreementPenalty = -5;
    }
  }

  // modeConsensus starts at 0 — filled in by applyAlignmentBonus()
  const modeConsensus = 0;

  const alignmentScore = Math.max(0, Math.min(35, modeConsensus + componentConsensus + opponentInjuryEdge + marketDisagreementPenalty));

  const total = Math.min(100, Math.max(0, chaosScore + edgeScore + alignmentScore));

  const breakdown: ConvictionBreakdown = {
    chaos: { score: chaosScore, sigmaPenalty, paceScore },
    edge: { score: edgeScore, core5Freshness, restScore, hornetsHealthScore },
    alignment: { score: alignmentScore, modeConsensus, componentConsensus, opponentInjuryEdge, marketDisagreementPenalty },
    total,
  };

  return { conviction: total, breakdown };
}

/**
 * Convert American moneyline odds to implied probability
 * +150 means bet $100 to win $150 → implied prob = 100 / (150 + 100) = 40%
 * -150 means bet $150 to win $100 → implied prob = 150 / (150 + 100) = 60%
 */
function moneylineToImpliedProb(moneyline: number): number {
  if (moneyline > 0) {
    // Underdog: +150 means 40% implied
    return 100 / (moneyline + 100);
  } else {
    // Favorite: -150 means 60% implied
    return Math.abs(moneyline) / (Math.abs(moneyline) + 100);
  }
}

/**
 * Calculate expected value (EV) per $100 bet on moneyline
 * EV = (winProb × profit) - (loseProb × stake)
 */
function calculateMoneylineEV(modelWinProb: number, moneyline: number): number {
  const loseProb = 1 - modelWinProb;

  if (moneyline > 0) {
    // Underdog: Win $moneyline on $100 bet
    return (modelWinProb * moneyline) - (loseProb * 100);
  } else {
    // Favorite: Win $100 on $|moneyline| bet, normalized to $100 stake
    const profitPer100 = (100 / Math.abs(moneyline)) * 100;
    return (modelWinProb * profitPer100) - (loseProb * 100);
  }
}

/**
 * Calculate expected value (EV) per $100 bet on spread
 * Standard -110 juice: bet $110 to win $100
 * EV = (coverProb × 100) - (missProb × 110)
 */
function calculateSpreadEV(coverProb: number, juice: number = -110): number {
  const missProb = 1 - coverProb;
  const stakeToWin100 = Math.abs(juice); // Usually 110

  return (coverProb * 100) - (missProb * stakeToWin100);
}

/**
 * Estimate cover probability from predicted margin and spread
 * Uses a normal distribution with REGIME-BASED sigma (not fixed 12)
 *
 * Per ChatGPT review: Different situations have different variance.
 * Using dynamic sigma makes EV math honest.
 *
 * @param sigma - Regime-based standard deviation (11.5 to 15.0 depending on situation)
 */
function estimateCoverProbability(predictedMargin: number, spread: number, sigma: number): number {
  // Cover margin = predictedMargin + spread
  const predictedCover = predictedMargin + spread;

  // Z-score: how many std devs is "covering" from our prediction
  const zScore = predictedCover / sigma;

  // Convert z-score to probability using approximation of normal CDF
  return normalCDF(zScore);
}

/**
 * Approximation of standard normal CDF
 * Accurate to ~0.1% for most practical values
 */
function normalCDF(z: number): number {
  // Abramowitz and Stegun approximation
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Analyze moneyline vs spread and recommend the better bet
 *
 * @param sigma - Regime-based standard deviation for cover probability
 */
function analyzeMoneyline(
  predictedMargin: number,
  spread: number | null,
  moneyline: number | null,
  eloDiff: number,
  sigma: number  // NEW: regime-based variance
): MoneylineAnalysis | undefined {
  // Need both spread and moneyline to compare
  if (spread === null || moneyline === null) {
    return undefined;
  }

  // Calculate model win probability from Elo difference
  const modelWinProb = eloToWinProbability(eloDiff);

  // Get implied probability from moneyline, with vig removed
  const rawImplied = moneylineToImpliedProb(moneyline);
  const impliedWinProb = Math.min(0.99, Math.max(0.01, rawImplied / ESTIMATED_OVERROUND));

  // Calculate edge on moneyline
  const edge = modelWinProb - impliedWinProb;

  // Calculate EVs using regime-based sigma
  const moneylineEV = calculateMoneylineEV(modelWinProb, moneyline);
  const coverProb = estimateCoverProbability(predictedMargin, spread, sigma);
  const spreadEV = calculateSpreadEV(coverProb);

  // Determine recommendation
  let recommendation: 'moneyline' | 'spread' | 'pass';
  let reasoning: string;

  // Minimum edge threshold to recommend a bet (accounts for vig and model uncertainty)
  const MIN_EDGE = 0.03; // 3% edge minimum
  const MIN_EV = 2.0;    // $2 EV per $100 minimum

  if (moneylineEV <= MIN_EV && spreadEV <= MIN_EV) {
    recommendation = 'pass';
    reasoning = `Neither bet offers sufficient value. ML EV: $${moneylineEV.toFixed(1)}, Spread EV: $${spreadEV.toFixed(1)}`;
  } else if (moneylineEV > spreadEV + 1) {
    // Moneyline offers meaningfully better EV
    recommendation = 'moneyline';
    if (moneyline > 0) {
      reasoning = `Underdog ML (+${moneyline}) offers better value. Model: ${(modelWinProb * 100).toFixed(0)}% win prob vs ${(impliedWinProb * 100).toFixed(0)}% implied. EV: $${moneylineEV.toFixed(1)} vs spread $${spreadEV.toFixed(1)}`;
    } else {
      reasoning = `Favorite ML (${moneyline}) offers better value. Model: ${(modelWinProb * 100).toFixed(0)}% win prob. EV: $${moneylineEV.toFixed(1)} vs spread $${spreadEV.toFixed(1)}`;
    }
  } else if (spreadEV > moneylineEV + 1) {
    // Spread offers meaningfully better EV
    recommendation = 'spread';
    reasoning = `Spread (${spread > 0 ? '+' : ''}${spread}) offers better value. Cover prob: ${(coverProb * 100).toFixed(0)}%. EV: $${spreadEV.toFixed(1)} vs ML $${moneylineEV.toFixed(1)}`;
  } else {
    // Similar EVs - prefer spread (more common, lower variance)
    recommendation = spreadEV >= MIN_EV ? 'spread' : 'pass';
    reasoning = `Similar value on both. Spread: $${spreadEV.toFixed(1)} EV, ML: $${moneylineEV.toFixed(1)} EV. ${recommendation === 'spread' ? 'Spread preferred for lower variance.' : 'Insufficient edge on either.'}`;
  }

  return {
    modelWinProb: Math.round(modelWinProb * 1000) / 1000,
    impliedWinProb: Math.round(impliedWinProb * 1000) / 1000,
    edge: Math.round(edge * 1000) / 1000,
    moneylineEV: Math.round(moneylineEV * 10) / 10,
    spreadEV: Math.round(spreadEV * 10) / 10,
    recommendation,
    reasoning,
  };
}

// Roster change adjustments (trade impacts)
// Positive = opponent got better, Negative = opponent got worse
// expiresAfter: full adjustment until this date, then 50% decay, removed after +30 days
const ROSTER_ADJUSTMENTS: Record<string, { adjustment: number; note: string; tradeDate?: string; expiresAfter?: string }> = {
  'Cleveland Cavaliers': {
    adjustment: 1.5,  // Harden acquisition is net positive short-term
    note: 'Harden trade (+1.5): Elite playmaker added, but integration period',
    tradeDate: '2026-02-06',
    expiresAfter: '2026-03-15',
  },
  'CLE': {
    adjustment: 1.5,
    note: 'Harden trade (+1.5): Elite playmaker added, but integration period',
    tradeDate: '2026-02-06',
    expiresAfter: '2026-03-15',
  },
};

// === HORNETS ROSTER TRANSITION (Feb 2026 Trades) ===
// Trades: OUT - Tyus Jones, Sexton, Plumlee, Connaughton
//         IN  - Coby White (INJURED through ASB), Branham, Tillman
// Net impact: Bench depth depleted, new players need integration
// Core 5 unchanged, but bench support weaker short-term
// Expires: After All-Star break (Feb 16, 2026)
//
// Per ChatGPT review: Original -1.5 margin + 1.0 σ was "double-penalizing"
// Bench disruption matters LESS in:
//   - Home games (controlled environment)
//   - Elite opponent games (Core 5 plays heavy minutes)
//   - Low-pace games (fewer possessions = fewer bench opportunities)
// Reduced margin penalty, removed σ boost (let conviction handle it)
const HORNETS_TRADE_DEADLINE_ADJUSTMENT = {
  active: true,
  expiresAfter: '2026-02-16',  // All-Star break
  marginAdjustment: -0.75,     // Reduced from -1.5 per ChatGPT review
  sigmaBoost: 0,               // Removed - was double-counting with conviction
  note: 'Trade deadline roster transition: Lost Jones/Sexton/Plumlee, Coby White injured',
};

/**
 * Prediction mode for spread calculations
 * - 'standard': Uses full season data (all games, conservative baseline)
 * - 'bayesian': Blends standard prior with Core 5 evidence (mathematically principled)
 * - 'buzzing': Uses only Core 5 healthy games (aggressive, high conviction)
 *
 * IMPORTANT: Bayesian should be the default betting mode.
 * Standard & Buzzing are diagnostics/confidence bands only.
 */
export type PredictionMode = 'standard' | 'bayesian' | 'buzzing';

/**
 * Adaptive Bayesian prior strength based on sample size
 * - Early Core 5 data → more conservative (higher prior)
 * - More Core 5 games → allow data to dominate (lower prior)
 *
 * Per Gemini review: Use exponential decay instead of linear.
 * Linear decay hits floor too quickly and could reach 0 at high sample sizes.
 * Exponential decay asymptotically approaches a "Season-Reliability Floor" of 20.
 *
 * Formula: 20 + 40 * exp(-sampleSize / 40)
 * - At 0 games: 60 (very conservative)
 * - At 28 games: ~40 (balanced)
 * - At 40 games: ~35 (data-driven)
 * - At infinity: 20 (never ignores season context)
 */
function getBayesianPriorStrength(sampleSize: number): number {
  const PRIOR_FLOOR = 20;    // Season-reliability floor (never ignore all context)
  const PRIOR_RANGE = 40;    // Range from floor to max (60 - 20 = 40)
  const DECAY_RATE = 40;     // Half-life in games (~28 games = 50% decay)
  return PRIOR_FLOOR + PRIOR_RANGE * Math.exp(-sampleSize / DECAY_RATE);
  // At 28 games: 60 - 14 = 46
  // At 40 games: 60 - 20 = 40
  // At 10 games: 60 - 5 = 55
}

/**
 * MOV (Margin of Victory) capping to prevent blowouts from distorting Elo
 * Per ChatGPT/Gemini review: uncapped MOV inflates Elo and distorts spreads
 * Cap at ±20 points per game
 */
const MOV_CAP = 20;

function capMargin(margin: number): number {
  return Math.max(-MOV_CAP, Math.min(MOV_CAP, margin));
}

/**
 * Kelly-safe win probability - caps effective probability for sizing
 * Per ChatGPT/Gemini review: feeding inflated 75%+ probabilities into Kelly
 * is the fastest way to blow up a bankroll. Cap at 56% for sizing purposes.
 *
 * This doesn't change predictions - only bet sizing calculations.
 */
const KELLY_WIN_PROB_CAP = 0.56;

export function getKellySafeWinProb(rawWinProb: number): number {
  return Math.min(rawWinProb, KELLY_WIN_PROB_CAP);
}

export interface RollingMetrics {
  window: number;
  games: number;
  netRating: number;
  ortg: number;
  drtg: number;
  pace: number;
  wins: number;
  losses: number;
  pointDiff: number;
  atsRecord: { wins: number; losses: number; pushes: number };
  avgCoverMargin: number;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  momentum: number; // -10 to +10 scale
  consistency: number; // 0-1 scale (1 = very consistent)
  streakType: 'W' | 'L' | null;
  streakLength: number;
}

export interface MoneylineAnalysis {
  modelWinProb: number;         // Model's predicted win probability (0-1)
  impliedWinProb: number;       // Vegas implied probability from moneyline (0-1)
  edge: number;                 // modelWinProb - impliedWinProb (positive = value)
  moneylineEV: number;          // Expected value per $100 bet on moneyline
  spreadEV: number;             // Expected value per $100 bet on spread
  recommendation: 'moneyline' | 'spread' | 'pass';  // Which bet offers better value
  reasoning: string;            // Plain English explanation
}

export interface SpreadPrediction {
  predictedMargin: number;      // Capped margin for display (±15 pts)
  rawMargin: number;            // Uncapped margin for internal sizing calculations
  predictedCover: number;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0-100
  conviction: number;           // 0-100 score for bet sizing (separate from prediction)
  convictionBreakdown?: ConvictionBreakdown;  // Three-bucket breakdown
  sigma: number;                // Regime-based variance (11.5-15.0)
  regime: string;               // Variance regime description (e.g., "Core5+HighPace")
  eloComponent: number;
  netRatingComponent: number;
  mode: PredictionMode;
  moneylineAnalysis?: MoneylineAnalysis;  // Moneyline vs spread comparison
  factors: {
    name: string;
    value: number;
    impact: number;
  }[];
}

/**
 * Convert Elo difference to win probability (538 formula)
 * P(win) = 1 / (1 + 10^(-EloDiff/400))
 */
export function eloToWinProbability(eloDiff: number): number {
  return 1.0 / (1.0 + Math.pow(10, -eloDiff / 400));
}

/**
 * Convert Elo difference to point spread
 * ~28 Elo points = 1 point on spread
 */
export function eloToSpread(eloDiff: number): number {
  return eloDiff / ELO_TO_SPREAD;
}

/**
 * Calculate Elo rating from winning percentage
 * From 538: Elo = 1504.6 - 450 * log10((1/WinPct) - 1)
 */
export function winPctToElo(winPct: number): number {
  if (winPct <= 0) return 1200;
  if (winPct >= 1) return 1800;
  return 1504.6 - 450 * Math.log10((1 / winPct) - 1);
}

/**
 * Update Elo after a game (538 margin of victory formula)
 * MOV multiplier = ((MOV + 3) ^ 0.8) / (7.5 + 0.006 * |EloDiff|)
 */
export function updateElo(
  winnerElo: number,
  loserElo: number,
  margin: number,
  winnerHome: boolean
): { winnerNewElo: number; loserNewElo: number } {
  // Adjust for home court
  let eloDiff = winnerElo - loserElo;
  if (winnerHome) {
    eloDiff += ELO_HOME_ADVANTAGE;
  } else {
    eloDiff -= ELO_HOME_ADVANTAGE;
  }

  // Expected win probability
  const expected = eloToWinProbability(eloDiff);

  // Margin of victory multiplier (538 formula with diminishing returns)
  const movMult = Math.pow(Math.abs(margin) + 3, 0.8) / (7.5 + 0.006 * Math.abs(eloDiff));

  // Elo shift
  const shift = ELO_K_FACTOR * movMult * (1 - expected);

  return {
    winnerNewElo: winnerElo + shift,
    loserNewElo: loserElo - shift,
  };
}

/**
 * Estimate team Elo from season record and point differential
 *
 * Analytics research (Morey, Oliver) shows point differential is a
 * better predictor of future performance than win% throughout the season.
 * Point diff has less variance and regresses to the mean more reliably.
 */
export function estimateElo(
  wins: number,
  losses: number,
  pointDiff: number,
  gamesPlayed: number,
  useMOVCap: boolean = true
): number {
  if (gamesPlayed === 0) return ELO_INITIAL;

  // Win percentage component
  const winPct = wins / gamesPlayed;
  const eloFromWinPct = winPctToElo(winPct);

  // Point differential component (rough: +10 diff ≈ +100 Elo above average)
  // Apply MOV cap to prevent blowouts from distorting Elo
  // Per ChatGPT/Gemini: uncapped MOV inflates Elo and overweights garbage time
  let avgPointDiff = pointDiff / gamesPlayed;
  if (useMOVCap) {
    // Cap effective point diff at ±20 per game equivalent
    avgPointDiff = capMargin(avgPointDiff);
  }
  const eloFromPointDiff = ELO_INITIAL + avgPointDiff * 10;

  // Blend: Weight point diff higher throughout (better predictor per analytics research)
  // Early season: 75% point diff (less noisy than small-sample win%)
  // Mid/late season: 60% point diff (win% stabilizes but point diff remains informative)
  const pointDiffWeight = Math.max(0.6, 0.8 - gamesPlayed / 200);
  return (1 - pointDiffWeight) * eloFromWinPct + pointDiffWeight * eloFromPointDiff;
}

/**
 * Calculate metrics for a rolling window of games
 * @param healthyOnly - If true, only include games where all core starters played (isQualified)
 */
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
      window: windowSize,
      games: 0,
      netRating: 0,
      ortg: 0,
      drtg: 0,
      pace: 0,
      wins: 0,
      losses: 0,
      pointDiff: 0,
      atsRecord: { wins: 0, losses: 0, pushes: 0 },
      avgCoverMargin: 0,
    };
  }

  const netRating = windowGames.reduce((sum, g) => sum + g.netRating, 0) / windowGames.length;
  const ortg = windowGames.reduce((sum, g) => sum + g.ortg, 0) / windowGames.length;
  const drtg = windowGames.reduce((sum, g) => sum + g.drtg, 0) / windowGames.length;
  const pace = windowGames.reduce((sum, g) => sum + g.pace, 0) / windowGames.length;
  const wins = windowGames.filter(g => g.result === 'W').length;
  const losses = windowGames.filter(g => g.result === 'L').length;
  const pointDiff = windowGames.reduce((sum, g) => sum + (g.hornetsScore - g.opponentScore), 0) / windowGames.length;

  // Calculate ATS record if spreads provided
  let atsWins = 0, atsLosses = 0, atsPushes = 0;
  let totalCoverMargin = 0;

  if (spreads) {
    for (const game of windowGames) {
      const spread = spreads.get(game.gameId) ?? 0;
      const margin = game.hornetsScore - game.opponentScore;
      const coverMargin = margin + spread;

      totalCoverMargin += coverMargin;

      if (Math.abs(coverMargin) < 0.5) {
        atsPushes++;
      } else if (coverMargin > 0) {
        atsWins++;
      } else {
        atsLosses++;
      }
    }
  }

  return {
    window: windowSize,
    games: windowGames.length,
    netRating: Math.round(netRating * 10) / 10,
    ortg: Math.round(ortg * 10) / 10,
    drtg: Math.round(drtg * 10) / 10,
    pace: Math.round(pace * 10) / 10,
    wins,
    losses,
    pointDiff: Math.round(pointDiff * 10) / 10,
    atsRecord: { wins: atsWins, losses: atsLosses, pushes: atsPushes },
    avgCoverMargin: windowGames.length > 0 ? Math.round(totalCoverMargin / windowGames.length * 10) / 10 : 0,
  };
}

/**
 * Analyze trend and momentum
 */
export function analyzeTrend(games: Game[]): TrendAnalysis {
  const qualifiedGames = games.filter(g => g.isQualified);

  if (qualifiedGames.length < 4) {
    return {
      direction: 'stable',
      momentum: 0,
      consistency: 0.5,
      streakType: null,
      streakLength: 0,
    };
  }

  // Calculate net rating for different windows
  const last4 = qualifiedGames.slice(0, 4);
  const last10 = qualifiedGames.slice(0, Math.min(10, qualifiedGames.length));

  const nr4 = last4.reduce((sum, g) => sum + g.netRating, 0) / last4.length;
  const nr10 = last10.reduce((sum, g) => sum + g.netRating, 0) / last10.length;

  // Momentum: difference between recent and longer-term
  const momentum = Math.max(-10, Math.min(10, (nr4 - nr10) * 0.8));

  // Direction
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (momentum > 2) direction = 'up';
  else if (momentum < -2) direction = 'down';

  // Consistency: standard deviation of margins
  const margins = last10.map(g => g.hornetsScore - g.opponentScore);
  const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
  const variance = margins.reduce((sum, m) => sum + Math.pow(m - avgMargin, 2), 0) / margins.length;
  const stdDev = Math.sqrt(variance);
  const consistency = Math.max(0, Math.min(1, 1 - (stdDev / 20)));

  // Streak
  let streakType: 'W' | 'L' | null = qualifiedGames[0]?.result === 'W' ? 'W' : 'L';
  let streakLength = 0;
  for (const game of qualifiedGames) {
    if (game.result === streakType) {
      streakLength++;
    } else {
      break;
    }
  }

  return {
    direction,
    momentum: Math.round(momentum * 10) / 10,
    consistency: Math.round(consistency * 100) / 100,
    streakType,
    streakLength,
  };
}

/**
 * Predict spread coverage for an upcoming game
 *
 * REFACTORED: Now uses margin-level Bayesian blending to avoid correlation leakage.
 * Instead of blending Elo and NR separately, we:
 * 1. Calculate complete Standard margin (Elo + NR blended)
 * 2. Calculate complete Buzzing margin (Elo + NR blended)
 * 3. Bayesian blend the final margins
 *
 * NEW: Separation of prediction from conviction (per ChatGPT review)
 * - rawMargin: Uncapped margin for internal sizing calculations
 * - predictedMargin: Capped margin for display (±15 pts)
 * - conviction: 0-100 score for bet sizing based on volatility factors
 *
 * NEW: Core 5 time decay (per ChatGPT review)
 * - Market adjusts to Core 5 performance over time
 * - Edge decays exponentially with days since last Core 5 game
 *
 * @param mode - 'bayesian' (default for betting), 'standard', or 'buzzing' (diagnostics)
 * @param games - All games (for calculating days since last Core 5 game)
 */
export function predictSpread(
  upcomingGame: UpcomingGame,
  rollingMetrics: {
    last4: RollingMetrics;
    last7: RollingMetrics;
    last10: RollingMetrics;
    season: RollingMetrics;
  },
  trend: TrendAnalysis,
  opponentStrength: number = 0,
  mode: PredictionMode = 'bayesian', // Changed default to bayesian
  buzzingMetrics?: RollingMetrics,
  allGamesMetrics?: RollingMetrics,
  games?: Game[]  // NEW: For Core 5 time decay calculation
): SpreadPrediction {
  const factors: SpreadPrediction['factors'] = [];
  const isBuzzing = mode === 'buzzing';
  const isBayesian = mode === 'bayesian';

  // === Calculate Core 5 Time Decay ===
  // Find days since last Core 5 game to determine edge freshness
  let daysSinceLastCore5 = 0;
  let core5DecayFactor = 1.0; // Default: full weight if we can't calculate

  if (games && games.length > 0) {
    const qualifiedGames = games.filter(g => g.isQualified);
    if (qualifiedGames.length > 0) {
      // Games are sorted newest first, so first qualified game is most recent
      const lastCore5Date = qualifiedGames[0].date;
      const gameDate = upcomingGame.date;
      daysSinceLastCore5 = daysBetween(lastCore5Date, gameDate);
      core5DecayFactor = calculateCore5TimeDecay(daysSinceLastCore5);
    }
  }

  // Use opponent net rating from game data if available
  const actualOpponentStrength = upcomingGame.opponentNetRating ?? opponentStrength;

  // Check for opponent roster adjustments (trades, injuries, etc.)
  const rosterAdj = ROSTER_ADJUSTMENTS[upcomingGame.opponent];
  let rosterAdjustment = rosterAdj?.adjustment ?? 0;
  if (rosterAdj?.expiresAfter) {
    const gameDate = new Date(upcomingGame.date);
    const expiresDate = new Date(rosterAdj.expiresAfter);
    const fullExpireDate = new Date(expiresDate.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    if (gameDate > fullExpireDate) {
      rosterAdjustment = 0; // Fully expired
    } else if (gameDate > expiresDate) {
      rosterAdjustment *= 0.5; // 50% decay after expiration date
    }
  }

  // Check for Hornets roster transition adjustment (trade deadline impact)
  let hornetsTradeAdjustment = 0;
  let hornetsTradeNote = '';
  if (HORNETS_TRADE_DEADLINE_ADJUSTMENT.active) {
    const gameDate = new Date(upcomingGame.date);
    const expirationDate = new Date(HORNETS_TRADE_DEADLINE_ADJUSTMENT.expiresAfter);
    if (gameDate <= expirationDate) {
      hornetsTradeAdjustment = HORNETS_TRADE_DEADLINE_ADJUSTMENT.marginAdjustment;
      hornetsTradeNote = HORNETS_TRADE_DEADLINE_ADJUSTMENT.note;
    }
  }

  // === Fatigue Factor (Hornets) — asymmetric by home/away ===
  // League backtest: home B2B teams lose crowd/energy edge (-3.0), away B2B less affected (-1.0)
  let fatigueAdjustment = 0;
  if (upcomingGame.isBackToBack) {
    fatigueAdjustment = upcomingGame.isHome ? -NR_FATIGUE_HOME_B2B : -NR_FATIGUE_AWAY_B2B;
  } else if (upcomingGame.restDays === 1) {
    fatigueAdjustment = -1.0;
  } else if (upcomingGame.restDays !== undefined && upcomingGame.restDays >= 3) {
    fatigueAdjustment = 0.5;
  }

  // === Opponent Rest Differential — asymmetric by opponent home/away ===
  let restDifferentialAdj = 0;
  if (upcomingGame.opponentIsBackToBack && !upcomingGame.isBackToBack) {
    // Opponent fatigued: home B2B opponent (we're away) hurts them more
    restDifferentialAdj = upcomingGame.isHome ? NR_FATIGUE_AWAY_B2B : NR_FATIGUE_HOME_B2B;
  }

  // === Common adjustments (applied to both Standard and Buzzing margins) ===
  const homeAdj = upcomingGame.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;
  // Halved to reduce double-counting with Elo branch (opponent NR already in Elo diff)
  const oppAdjustment = -actualOpponentStrength * 0.5;
  const isEliteOpponent = actualOpponentStrength >= ELITE_OPPONENT_THRESHOLD;
  const eliteOpponentPenalty = isEliteOpponent ? ELITE_OPPONENT_PENALTY : 0;

  // Mid vs Mid adjustment - league backtest showed +2.2 overpredict bias
  const isMidTierOpponent = actualOpponentStrength >= MID_TIER_THRESHOLD_LOW &&
                            actualOpponentStrength < MID_TIER_THRESHOLD_HIGH;
  const midVsMidAdjustment = isMidTierOpponent ? MID_VS_MID_ADJUSTMENT : 0;

  // === Calculate STANDARD margin (full season data) ===
  let standardElo: number;
  if (allGamesMetrics) {
    standardElo = estimateElo(
      allGamesMetrics.wins, allGamesMetrics.losses,
      allGamesMetrics.pointDiff * allGamesMetrics.games, allGamesMetrics.games
    );
  } else {
    standardElo = estimateElo(
      rollingMetrics.season.wins, rollingMetrics.season.losses,
      rollingMetrics.season.pointDiff * rollingMetrics.season.games,
      rollingMetrics.season.games
    );
  }

  const opponentElo = ELO_INITIAL + actualOpponentStrength * 10;
  let standardEloDiff = standardElo - opponentElo;
  standardEloDiff += upcomingGame.isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE;
  standardEloDiff += fatigueAdjustment * ELO_TO_SPREAD;
  const standardEloPrediction = eloToSpread(standardEloDiff);

  const standardWeightedNR =
    (rollingMetrics.last4.netRating * WINDOW_WEIGHTS.last4) +
    (rollingMetrics.last7.netRating * WINDOW_WEIGHTS.last7) +
    (rollingMetrics.last10.netRating * WINDOW_WEIGHTS.last10) +
    (rollingMetrics.season.netRating * WINDOW_WEIGHTS.season);

  const standardNrPrediction = standardWeightedNR + homeAdj +
    oppAdjustment + fatigueAdjustment + eliteOpponentPenalty + midVsMidAdjustment - rosterAdjustment + restDifferentialAdj + hornetsTradeAdjustment;

  // Complete Standard margin
  const standardMargin = (standardEloPrediction * ELO_WEIGHT) + (standardNrPrediction * NR_WEIGHT);

  // === Calculate BUZZING margin (Core 5 only) ===
  let buzzingMargin = standardMargin; // Default fallback
  let buzzingElo = standardElo;

  if (buzzingMetrics && buzzingMetrics.games > 0) {
    buzzingElo = estimateElo(
      buzzingMetrics.wins, buzzingMetrics.losses,
      buzzingMetrics.pointDiff * buzzingMetrics.games, buzzingMetrics.games
    );

    let buzzingEloDiff = buzzingElo - opponentElo;
    buzzingEloDiff += upcomingGame.isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE;
    buzzingEloDiff += fatigueAdjustment * ELO_TO_SPREAD;
    const buzzingEloPrediction = eloToSpread(buzzingEloDiff);

    const buzzingWeightedNR =
      (rollingMetrics.last4.netRating * BUZZING_WINDOW_WEIGHTS.last4) +
      (rollingMetrics.last7.netRating * BUZZING_WINDOW_WEIGHTS.last7) +
      (rollingMetrics.last10.netRating * BUZZING_WINDOW_WEIGHTS.last10) +
      (buzzingMetrics.netRating * BUZZING_WINDOW_WEIGHTS.season);

    const buzzingNrPrediction = buzzingWeightedNR + homeAdj +
      oppAdjustment + fatigueAdjustment + eliteOpponentPenalty + midVsMidAdjustment - rosterAdjustment + restDifferentialAdj + hornetsTradeAdjustment;

    // Complete Buzzing margin
    buzzingMargin = (buzzingEloPrediction * ELO_WEIGHT) + (buzzingNrPrediction * NR_WEIGHT);
  }

  // === Select final margin based on mode ===
  let predictedMargin: number;
  let displayElo: number;
  let displayNR: number;

  if (isBuzzing) {
    // Full Buzz: Pure Core 5 data (diagnostic only)
    predictedMargin = buzzingMargin;
    displayElo = buzzingElo;
    displayNR = buzzingMetrics?.netRating ?? standardWeightedNR;

    // Per ChatGPT: Removed survivorship penalty from margin
    // Risk is now captured via higher sigma (14.5 for Core 5) and conviction haircut
    // This preserves upside while protecting bankroll through sizing
  } else if (isBayesian && buzzingMetrics && buzzingMetrics.games > 0) {
    // Bayesian: Blend margins with adaptive prior strength
    // KEY FIX: Blend at margin level, not component level
    const priorStrength = getBayesianPriorStrength(buzzingMetrics.games);

    // Apply Core 5 time decay to sample weight
    // As days since last Core 5 game increases, we trust Core 5 data less
    // (market has adjusted, edge has decayed)
    const rawSampleWeight = buzzingMetrics.games;
    const sampleWeight = rawSampleWeight * core5DecayFactor;

    predictedMargin = (priorStrength * standardMargin + sampleWeight * buzzingMargin) /
                      (priorStrength + sampleWeight);
    displayElo = (priorStrength * standardElo + sampleWeight * buzzingElo) /
                 (priorStrength + sampleWeight);
    displayNR = (priorStrength * standardWeightedNR +
                 sampleWeight * (buzzingMetrics?.netRating ?? standardWeightedNR)) /
                (priorStrength + sampleWeight);

    // Per ChatGPT: Removed survivorship penalty from margin
    // Risk is now captured via higher sigma and conviction tail-risk haircut
    // This preserves legitimate upside while protecting bankroll through sizing

    factors.push({
      name: 'Bayesian Blend',
      value: priorStrength,
      impact: 0, // Informational
    });

    // Show time decay factor if significant
    if (core5DecayFactor < 0.9) {
      factors.push({
        name: 'Core 5 Time Decay',
        value: Math.round(core5DecayFactor * 100),
        impact: 0, // Informational - affects blend weight, not margin directly
      });
    }
  } else {
    // Standard: Full season data (diagnostic only)
    predictedMargin = standardMargin;
    displayElo = standardElo;
    displayNR = standardWeightedNR;
  }

  // === Calculate component predictions for display and confidence ===
  const eloPrediction = eloToSpread(displayElo - opponentElo) * ELO_WEIGHT;
  const nrPrediction = displayNR * NR_WEIGHT;

  // === Build factors for display ===
  const modeLabel = isBuzzing ? ' [Buzz]' : isBayesian ? ' [Bayes]' : ' [Std]';
  factors.push({
    name: `Elo${modeLabel}`,
    value: displayElo,
    impact: eloPrediction,
  });

  factors.push({
    name: `Net Rating${modeLabel}`,
    value: displayNR,
    impact: nrPrediction,
  });

  factors.push({
    name: upcomingGame.isHome ? 'Home Court' : 'Road Game',
    value: homeAdj,
    impact: homeAdj * NR_WEIGHT,
  });

  // Opponent strength factor
  if (Math.abs(actualOpponentStrength) > 1) {
    factors.push({
      name: actualOpponentStrength > 0 ? 'Strong Opponent' : 'Weak Opponent',
      value: actualOpponentStrength,
      impact: oppAdjustment * NR_WEIGHT, // Reflects 0.5x opponent strength (reduced double-counting)
    });
  }

  // Elite opponent penalty
  if (isEliteOpponent) {
    factors.push({
      name: 'Elite Opponent',
      value: actualOpponentStrength,
      impact: eliteOpponentPenalty * NR_WEIGHT,
    });
  }

  // Roster adjustment (trades, etc.)
  if (rosterAdj) {
    factors.push({
      name: rosterAdj.note.split(':')[0], // Just the trade name
      value: rosterAdjustment,
      impact: -rosterAdjustment * NR_WEIGHT,
    });
  }

  // Fatigue factor
  if (fatigueAdjustment !== 0) {
    factors.push({
      name: upcomingGame.isBackToBack ? 'Back-to-Back' : (fatigueAdjustment > 0 ? 'Well Rested' : 'Short Rest'),
      value: upcomingGame.restDays ?? 0,
      impact: fatigueAdjustment * NR_WEIGHT,
    });
  }

  // Rest differential (opponent fatigue)
  if (restDifferentialAdj !== 0) {
    factors.push({
      name: restDifferentialAdj > 0 ? 'Opp B2B Advantage' : 'Opp Rest Advantage',
      value: restDifferentialAdj,
      impact: restDifferentialAdj * NR_WEIGHT,
    });
  }

  // Streak bonus
  let streakImpact = 0;
  if (trend.streakLength >= 3) {
    streakImpact = trend.streakType === 'W' ? 1.5 : -1.5;
    factors.push({
      name: `${trend.streakLength}-Game ${trend.streakType === 'W' ? 'Win' : 'Losing'} Streak`,
      value: trend.streakLength,
      impact: 0, // Informational only — streak not added to predictedMargin
    });
  }

  // predictedMargin already calculated above via margin-level blending

  // Predicted cover (positive = expect to cover)
  // If spread is -2.5 (favorite by 2.5) and we predict +4.7 margin:
  //   Cover = 4.7 + (-2.5) = +2.2 (we cover by 2.2)
  // Formula: predictedMargin + spread (where spread is negative for favorites)
  // If no spread available yet, predictedCover is 0 (neutral)
  const predictedCover = upcomingGame.spread !== null
    ? predictedMargin + upcomingGame.spread
    : 0;

  // === Confidence calculation ===
  // Higher confidence when:
  // - More games in sample
  // - Elo and NR agree
  // - Team is consistent
  // - Large predicted margin

  const sampleSizeScore = Math.min(1, rollingMetrics.last10.games / 10);
  const consistencyScore = trend.consistency;
  const marginScore = Math.min(1, Math.abs(predictedCover) / 10);

  // Agreement score: how much do Elo and NR agree?
  const agreementScore = 1 - Math.min(1, Math.abs(eloPrediction - nrPrediction) / 10);

  const confidenceScore = Math.round(
    (sampleSizeScore * 0.2 + consistencyScore * 0.3 + marginScore * 0.2 + agreementScore * 0.3) * 100
  );

  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (confidenceScore >= 70) confidence = 'high';
  else if (confidenceScore < 45) confidence = 'low';

  // === Calculate Combined Pace ===
  const hornetsPace = rollingMetrics.season.pace > 0 ? rollingMetrics.season.pace : LEAGUE_AVG_PACE;
  const opponentPace = upcomingGame.opponentPace ?? LEAGUE_AVG_PACE;
  const combinedPace = hornetsPace + opponentPace;

  // === Calculate Regime-Based Sigma (Variance) ===
  // Per ChatGPT review: Model variance by regime, not just mean
  // This is the single biggest upgrade - makes EV math honest
  // Per ChatGPT follow-up: Pass predicted margin for margin-conditional σ
  const isCore5Game = isBuzzing || Boolean(isBayesian && buzzingMetrics && buzzingMetrics.games > 0);
  let { sigma, regime } = calculateRegimeSigma(
    isCore5Game,
    combinedPace,
    actualOpponentStrength,
    daysSinceLastCore5,
    predictedMargin  // NEW: margin-conditional σ
  );

  // Apply trade transition sigma boost if active
  if (hornetsTradeAdjustment !== 0) {
    sigma += HORNETS_TRADE_DEADLINE_ADJUSTMENT.sigmaBoost;
    regime = regime === 'Normal' ? 'TradeTransition' : regime + '+Trade';
    factors.push({
      name: 'Trade Deadline',
      value: hornetsTradeAdjustment,
      impact: hornetsTradeAdjustment * NR_WEIGHT,
    });
  }

  // Add regime info to factors if not normal
  if (regime !== 'Normal') {
    factors.push({
      name: `Variance Regime`,
      value: sigma,
      impact: 0, // Informational - affects sizing, not margin
    });
  }

  // === Raw vs Capped Margin ===
  // Per ChatGPT review: Pace no longer adjusts margin - it only affects sigma (variance)
  // rawMargin: Uncapped for internal sizing calculations
  // cappedMargin: For display (±15 pts cap reduces outlier noise)
  const rawMargin = predictedMargin;
  const cappedMargin = Math.max(-PREDICTED_MARGIN_CAP, Math.min(PREDICTED_MARGIN_CAP, predictedMargin));
  const cappedCover = upcomingGame.spread !== null
    ? cappedMargin + upcomingGame.spread
    : 0;

  // === Calculate Conviction Score (three-bucket breakdown) ===
  // Bucket 1: Game Chaos — is the game environment volatile?
  // Bucket 2: Edge Reliability — can we trust the edge is real?
  // Bucket 3: Signal Alignment — do multiple signals agree? (mode consensus added post-hoc)
  const { conviction, breakdown: convictionBreakdown } = calculateConviction(
    combinedPace,
    core5DecayFactor,
    upcomingGame.restDays,
    upcomingGame.isBackToBack,
    sigma,
    eloPrediction,
    nrPrediction,
    upcomingGame.spread,
    cappedMargin,
    upcomingGame.injuryReport ? {
      hornetsCore5Status: upcomingGame.injuryReport.hornetsCore5Status,
      spreadAdjustment: upcomingGame.injuryReport.spreadAdjustment,
    } : undefined
  );

  // === Moneyline Analysis ===
  // Compare spread vs moneyline EV and recommend the better bet
  // Need Elo difference for win probability calculation
  // Per ChatGPT: Uses regime-based sigma for honest EV math
  const eloDiffForML = displayElo - (ELO_INITIAL + actualOpponentStrength * 10);
  const moneylineAnalysis = analyzeMoneyline(
    rawMargin,  // Use raw margin for more accurate probability estimate
    upcomingGame.spread,
    upcomingGame.moneyline,
    eloDiffForML,
    sigma  // NEW: Regime-based sigma for cover probability
  );

  return {
    predictedMargin: Math.round(cappedMargin * 10) / 10,
    rawMargin: Math.round(rawMargin * 10) / 10,
    predictedCover: Math.round(cappedCover * 10) / 10,
    confidence,
    confidenceScore,
    conviction,  // 0-100 score for bet sizing (three-bucket total)
    convictionBreakdown,  // Three-bucket breakdown (chaos/edge/alignment)
    sigma,       // Regime-based variance (11.5-15.0)
    regime,      // Variance regime description
    eloComponent: Math.round(eloPrediction * 10) / 10,
    netRatingComponent: Math.round(nrPrediction * 10) / 10,
    mode,
    moneylineAnalysis,  // Moneyline vs spread comparison (uses sigma for honest EV)
    factors,
  };
}

/**
 * Apply mode consensus bonus to conviction after all three modes are generated.
 * This is Phase 2 of the Signal Alignment bucket — requires all three modes.
 *
 * Counts how many modes predict a cover, computes modeConsensus score (0-15),
 * and returns an updated prediction with adjusted conviction and full breakdown.
 */
export function applyAlignmentBonus(
  prediction: SpreadPrediction,
  allModes: { standard: SpreadPrediction; bayesian: SpreadPrediction; buzzing: SpreadPrediction },
  spread: number | null
): SpreadPrediction {
  if (!prediction.convictionBreakdown || spread === null) {
    return prediction;
  }

  // Count how many modes predict a cover
  const covers = [
    allModes.standard.predictedMargin + spread > 0,
    allModes.bayesian.predictedMargin + spread > 0,
    allModes.buzzing.predictedMargin + spread > 0,
  ].filter(Boolean).length;

  let modeConsensus: number;
  if (covers === 3) {
    modeConsensus = 15; // All three modes agree on cover
  } else if (covers === 2) {
    modeConsensus = 8;  // Two of three agree
  } else {
    modeConsensus = 0;  // One or zero — no consensus
  }

  // Rebuild alignment bucket with mode consensus
  const bd = prediction.convictionBreakdown;
  const newAlignmentScore = Math.max(0, Math.min(35,
    modeConsensus + bd.alignment.componentConsensus + bd.alignment.opponentInjuryEdge + bd.alignment.marketDisagreementPenalty
  ));

  const newTotal = Math.min(100, Math.max(0,
    bd.chaos.score + bd.edge.score + newAlignmentScore
  ));

  const newBreakdown: ConvictionBreakdown = {
    chaos: { ...bd.chaos },
    edge: { ...bd.edge },
    alignment: {
      score: newAlignmentScore,
      modeConsensus,
      componentConsensus: bd.alignment.componentConsensus,
      opponentInjuryEdge: bd.alignment.opponentInjuryEdge,
      marketDisagreementPenalty: bd.alignment.marketDisagreementPenalty,
    },
    total: newTotal,
  };

  return {
    ...prediction,
    conviction: newTotal,
    convictionBreakdown: newBreakdown,
  };
}

/**
 * Calculate metrics for buzzing mode (last 15 healthy games)
 */
export function calculateBuzzingMetrics(
  games: Game[],
  spreads?: Map<string, number>
): RollingMetrics {
  return calculateRollingMetrics(games, BUZZING_SAMPLE_SIZE, spreads, true);
}

/**
 * Get historical spreads (placeholder - would come from data)
 */
export function getHistoricalSpreads(games: Game[]): Map<string, number> {
  const spreads = new Map<string, number>();

  for (const game of games) {
    // Estimate based on home/away
    const estimatedSpread = game.isHome ? -3 : 3;
    spreads.set(game.gameId, estimatedSpread);
  }

  return spreads;
}
