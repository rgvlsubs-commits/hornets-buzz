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
const ELO_FATIGUE_PENALTY = 46; // Back-to-back penalty in Elo points
const ELO_INITIAL = 1500;
const ELO_TO_SPREAD = 28; // ~28 Elo points = 1 point spread

// === Net Rating Parameters ===
const NR_HOME_ADVANTAGE = 2.5; // Points
const NR_FATIGUE_PENALTY = 3.0; // Back-to-back penalty in points

// === Blend Weights (optimized from backtest) ===
const ELO_WEIGHT = 0.55; // Increased from 0.40 based on backtest
const NR_WEIGHT = 0.45; // Decreased from 0.60

// Rolling window weights for net rating
const WINDOW_WEIGHTS = {
  last4: 0.40,
  last7: 0.30,
  last10: 0.20,
  season: 0.10,
};

// Momentum multiplier
const MOMENTUM_MULTIPLIER = 0.4;

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
const ELITE_OPPONENT_THRESHOLD = 6.0;  // Net rating threshold for elite teams
const ELITE_OPPONENT_PENALTY = -2.0;   // Additional penalty vs elite teams

// Roster change adjustments (trade impacts)
// Positive = opponent got better, Negative = opponent got worse
const ROSTER_ADJUSTMENTS: Record<string, { adjustment: number; note: string }> = {
  'Cleveland Cavaliers': {
    adjustment: 1.5,  // Harden acquisition is net positive short-term
    note: 'Harden trade (+1.5): Elite playmaker added, but integration period',
  },
  'CLE': {
    adjustment: 1.5,
    note: 'Harden trade (+1.5): Elite playmaker added, but integration period',
  },
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

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  momentum: number; // -10 to +10 scale
  consistency: number; // 0-1 scale (1 = very consistent)
  streakType: 'W' | 'L' | null;
  streakLength: number;
}

export interface SpreadPrediction {
  predictedMargin: number;
  predictedCover: number;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0-100
  eloComponent: number;
  netRatingComponent: number;
  mode: PredictionMode;
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
  gamesPlayed: number
): number {
  if (gamesPlayed === 0) return ELO_INITIAL;

  // Win percentage component
  const winPct = wins / gamesPlayed;
  const eloFromWinPct = winPctToElo(winPct);

  // Point differential component (rough: +10 diff ≈ +100 Elo above average)
  const avgPointDiff = pointDiff / gamesPlayed;
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
 * @param mode - 'bayesian' (default for betting), 'standard', or 'buzzing' (diagnostics)
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
  allGamesMetrics?: RollingMetrics
): SpreadPrediction {
  const factors: SpreadPrediction['factors'] = [];
  const isBuzzing = mode === 'buzzing';
  const isBayesian = mode === 'bayesian';

  // Use opponent net rating from game data if available
  const actualOpponentStrength = upcomingGame.opponentNetRating ?? opponentStrength;

  // Check for roster adjustments (trades, injuries, etc.)
  const rosterAdj = ROSTER_ADJUSTMENTS[upcomingGame.opponent];
  const rosterAdjustment = rosterAdj?.adjustment ?? 0;

  // === Fatigue Factor (Hornets) ===
  let fatigueAdjustment = 0;
  if (upcomingGame.isBackToBack) {
    fatigueAdjustment = -NR_FATIGUE_PENALTY;
  } else if (upcomingGame.restDays === 1) {
    fatigueAdjustment = -1.0;
  } else if (upcomingGame.restDays !== undefined && upcomingGame.restDays >= 3) {
    fatigueAdjustment = 0.5;
  }

  // === Opponent Rest Differential ===
  // If opponent is on B2B and we're not, that's an advantage
  let restDifferentialAdj = 0;
  if (upcomingGame.opponentIsBackToBack && !upcomingGame.isBackToBack) {
    restDifferentialAdj = 1.5; // Opponent fatigued, we're fresh
  } else if (!upcomingGame.opponentIsBackToBack && upcomingGame.isBackToBack) {
    restDifferentialAdj = -0.5; // Already penalized via fatigueAdjustment, small extra
  }

  // === Common adjustments (applied to both Standard and Buzzing margins) ===
  const homeAdj = upcomingGame.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;
  const momentumImpact = trend.momentum * MOMENTUM_MULTIPLIER;
  const oppAdjustment = -actualOpponentStrength;
  const isEliteOpponent = actualOpponentStrength >= ELITE_OPPONENT_THRESHOLD;
  const eliteOpponentPenalty = isEliteOpponent ? ELITE_OPPONENT_PENALTY : 0;

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

  const standardNrPrediction = standardWeightedNR + homeAdj + momentumImpact +
    oppAdjustment + fatigueAdjustment + eliteOpponentPenalty - rosterAdjustment + restDifferentialAdj;

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

    const buzzingNrPrediction = buzzingWeightedNR + homeAdj + momentumImpact +
      oppAdjustment + fatigueAdjustment + eliteOpponentPenalty - rosterAdjustment + restDifferentialAdj;

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
  } else if (isBayesian && buzzingMetrics && buzzingMetrics.games > 0) {
    // Bayesian: Blend margins with adaptive prior strength
    // KEY FIX: Blend at margin level, not component level
    const priorStrength = getBayesianPriorStrength(buzzingMetrics.games);
    const sampleWeight = buzzingMetrics.games;
    predictedMargin = (priorStrength * standardMargin + sampleWeight * buzzingMargin) /
                      (priorStrength + sampleWeight);
    displayElo = (priorStrength * standardElo + sampleWeight * buzzingElo) /
                 (priorStrength + sampleWeight);
    displayNR = (priorStrength * standardWeightedNR +
                 sampleWeight * (buzzingMetrics?.netRating ?? standardWeightedNR)) /
                (priorStrength + sampleWeight);

    factors.push({
      name: 'Bayesian Blend',
      value: priorStrength,
      impact: 0, // Informational
    });
  } else {
    // Standard: Full season data (diagnostic only)
    predictedMargin = standardMargin;
    displayElo = standardElo;
    displayNR = standardWeightedNR;
  }

  // === Build factors for display ===
  const modeLabel = isBuzzing ? ' [Buzz]' : isBayesian ? ' [Bayes]' : ' [Std]';
  factors.push({
    name: `Elo${modeLabel}`,
    value: displayElo,
    impact: eloToSpread(displayElo - opponentElo) * ELO_WEIGHT,
  });

  factors.push({
    name: `Net Rating${modeLabel}`,
    value: displayNR,
    impact: displayNR * NR_WEIGHT,
  });

  factors.push({
    name: upcomingGame.isHome ? 'Home Court' : 'Road Game',
    value: homeAdj,
    impact: homeAdj * NR_WEIGHT,
  });

  if (Math.abs(momentumImpact) > 0.5) {
    factors.push({
      name: `Momentum (${trend.direction})`,
      value: trend.momentum,
      impact: momentumImpact * NR_WEIGHT,
    });
  }

  // Opponent strength factor
  if (Math.abs(actualOpponentStrength) > 1) {
    factors.push({
      name: actualOpponentStrength > 0 ? 'Strong Opponent' : 'Weak Opponent',
      value: actualOpponentStrength,
      impact: oppAdjustment * NR_WEIGHT,
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
      impact: streakImpact * NR_WEIGHT,
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

  return {
    predictedMargin: Math.round(predictedMargin * 10) / 10,
    predictedCover: Math.round(predictedCover * 10) / 10,
    confidence,
    confidenceScore,
    eloComponent: Math.round(eloPrediction * 10) / 10,
    netRatingComponent: Math.round(nrPrediction * 10) / 10,
    mode,
    factors,
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
