/**
 * Buzzing Model - Hornets-Specific Betting Model
 *
 * Based on analysis of Core 5 performance:
 * - 19-8 (70.4%) straight-up record
 * - 21-6 (77.8%) ATS record
 * - +8.9 avg margin, +8.5 net rating
 *
 * Key insights:
 * - Market consistently undervalues healthy Hornets
 * - Strong vs weak/mid opponents, struggles vs elite (CLE, OKC, BOS)
 * - Performs well on back-to-backs (5-1)
 * - Currently on 9-game win streak with Core 5
 */

import { Game, UpcomingGame } from './types';
import { RollingMetrics, TrendAnalysis, calculateRollingMetrics } from './model';

// === Buzzing Model Constants ===

// Core 5 baseline stats (from 27 qualified games)
const CORE5_WIN_PCT = 0.704;
const CORE5_ATS_PCT = 0.778;
const CORE5_AVG_MARGIN = 8.9;
const CORE5_NET_RATING = 8.5;

// Opponent tiers based on net rating
const ELITE_THRESHOLD = 6.0;  // Teams like CLE, OKC, BOS
const STRONG_THRESHOLD = 3.0;
const WEAK_THRESHOLD = -3.0;

// Value thresholds for bet sizing
const HIGH_VALUE_THRESHOLD = 5.0;   // Our prediction beats spread by 5+
const MEDIUM_VALUE_THRESHOLD = 3.0; // Our prediction beats spread by 3-5
const LOW_VALUE_THRESHOLD = 1.0;    // Our prediction beats spread by 1-3

// Confidence adjustments
// KEY INSIGHT: Hornets are 13-2 ATS on the road (86.7%) vs 9-4 at home (69.2%)
// The market disrespects them more as road teams - that's where the value is!
const HOME_BOOST = 0.0;           // Home isn't where ATS value is
const ROAD_VALUE_BOOST = 2.0;     // Road games have massive ATS value
const BACK_TO_BACK_BOOST = 1.0;   // Hornets are 5-1 on B2Bs (83.3% ATS)
const REST_ADVANTAGE_BOOST = 1.5;
const STREAK_BOOST = 0.3;         // Per game in streak, max 3 points

// Risk adjustments
const ELITE_OPPONENT_PENALTY = -3.0;
const ROAD_ELITE_PENALTY = -1.0;  // Reduced - Hornets still cover on road

export interface BuzzingPrediction {
  // Core prediction
  predictedMargin: number;
  predictedCover: number;  // Positive = expect to cover

  // Confidence & value
  confidence: 'max' | 'high' | 'medium' | 'low' | 'avoid';
  confidenceScore: number;  // 0-100
  valueScore: number;       // How much edge vs spread
  betSize: 'max' | 'large' | 'medium' | 'small' | 'pass';

  // Factors
  factors: {
    name: string;
    impact: number;
    description: string;
  }[];

  // Risk assessment
  risks: string[];
  opportunities: string[];

  // Recommendation
  recommendation: string;
}

export interface OpponentProfile {
  netRating: number;
  tier: 'elite' | 'strong' | 'mid' | 'weak';
  recentForm: number;  // Last 5 games net rating
}

/**
 * Classify opponent tier based on net rating
 */
export function classifyOpponent(netRating: number): OpponentProfile['tier'] {
  if (netRating >= ELITE_THRESHOLD) return 'elite';
  if (netRating >= STRONG_THRESHOLD) return 'strong';
  if (netRating >= WEAK_THRESHOLD) return 'mid';
  return 'weak';
}

/**
 * Calculate Core 5 Elo based on their specific performance
 * This ignores non-qualified games entirely
 */
export function calculateCore5Elo(qualifiedGames: Game[]): number {
  if (qualifiedGames.length === 0) return 1500;

  const wins = qualifiedGames.filter(g => g.result === 'W').length;
  const losses = qualifiedGames.length - wins;
  const totalMargin = qualifiedGames.reduce(
    (sum, g) => sum + (g.hornetsScore - g.opponentScore),
    0
  );

  const winPct = wins / qualifiedGames.length;
  const avgMargin = totalMargin / qualifiedGames.length;

  // Elo from win percentage
  let eloFromWinPct = 1500;
  if (winPct > 0 && winPct < 1) {
    eloFromWinPct = 1504.6 - 450 * Math.log10((1 / winPct) - 1);
  } else if (winPct >= 1) {
    eloFromWinPct = 1800;
  }

  // Elo from point differential (+10 margin ≈ +100 Elo)
  const eloFromMargin = 1500 + avgMargin * 10;

  // Weight margin more heavily (Core 5 sample is reliable)
  return 0.3 * eloFromWinPct + 0.7 * eloFromMargin;
}

/**
 * Get recent Core 5 performance (momentum)
 */
export function getCore5Momentum(qualifiedGames: Game[], windowSize: number = 5): number {
  const recent = qualifiedGames.slice(0, windowSize);
  if (recent.length === 0) return 0;

  const wins = recent.filter(g => g.result === 'W').length;
  const avgMargin = recent.reduce(
    (sum, g) => sum + (g.hornetsScore - g.opponentScore),
    0
  ) / recent.length;

  // Momentum score: combination of win rate and margin
  const winBonus = (wins / recent.length - 0.5) * 10;
  const marginBonus = avgMargin / 5;

  return winBonus + marginBonus;
}

/**
 * Calculate current win streak for Core 5
 */
export function getCore5Streak(qualifiedGames: Game[]): number {
  let streak = 0;
  for (const game of qualifiedGames) {
    if (game.result === 'W') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Main Buzzing prediction function
 *
 * Philosophy: The market undervalues healthy Hornets.
 * We bet when our Core 5-based prediction shows value vs the spread.
 */
export function buzzingPredict(
  upcomingGame: UpcomingGame,
  qualifiedGames: Game[],
  allGames: Game[]
): BuzzingPrediction {
  const factors: BuzzingPrediction['factors'] = [];
  const risks: string[] = [];
  const opportunities: string[] = [];

  // === 1. Core 5 Baseline ===
  const core5Elo = calculateCore5Elo(qualifiedGames);
  const core5Momentum = getCore5Momentum(qualifiedGames);
  const core5Streak = getCore5Streak(qualifiedGames);

  // Core 5 metrics
  const metrics = calculateRollingMetrics(allGames, 15, undefined, true);

  factors.push({
    name: 'Core 5 Baseline',
    impact: CORE5_AVG_MARGIN,
    description: `Core 5 averages +${CORE5_AVG_MARGIN} margin (${CORE5_WIN_PCT * 100}% win rate)`,
  });

  // === 2. Opponent Assessment ===
  const oppNetRating = upcomingGame.opponentNetRating ?? 0;
  const oppTier = classifyOpponent(oppNetRating);

  let oppAdjustment = 0;
  if (oppTier === 'elite') {
    oppAdjustment = ELITE_OPPONENT_PENALTY;
    risks.push(`Elite opponent (${oppNetRating > 0 ? '+' : ''}${oppNetRating.toFixed(1)} NR)`);
  } else if (oppTier === 'weak') {
    oppAdjustment = 2.0;
    opportunities.push(`Weak opponent (${oppNetRating.toFixed(1)} NR)`);
  } else if (oppTier === 'mid') {
    opportunities.push('Mid-tier opponent - Hornets excel here (9-3)');
  }

  // Adjust for opponent strength
  oppAdjustment -= oppNetRating * 0.5;

  factors.push({
    name: `vs ${oppTier.toUpperCase()} Opponent`,
    impact: oppAdjustment,
    description: `Opponent NR: ${oppNetRating > 0 ? '+' : ''}${oppNetRating.toFixed(1)}`,
  });

  // === 3. Home/Away ===
  // KEY INSIGHT: Hornets are 13-2 ATS on road (86.7%) - market disrespects them!
  let locationAdjustment = 0;
  if (upcomingGame.isHome) {
    locationAdjustment = HOME_BOOST;
    // Home is fine but not where the ATS value is
  } else {
    // ROAD IS WHERE THE MONEY IS
    locationAdjustment = ROAD_VALUE_BOOST;
    opportunities.push('ROAD GAME - 86.7% ATS historically!');
    if (oppTier === 'elite') {
      locationAdjustment += ROAD_ELITE_PENALTY;
      risks.push('Road vs elite (but still strong road record)');
    }
  }

  factors.push({
    name: upcomingGame.isHome ? 'Home Court' : 'ROAD VALUE',
    impact: locationAdjustment,
    description: upcomingGame.isHome ? 'Home game' : 'Road games are 86.7% ATS!',
  });

  // === 4. Rest/Schedule ===
  let restAdjustment = 0;
  if (upcomingGame.isBackToBack) {
    // Hornets are 5-1 on B2Bs with Core 5 - don't penalize!
    restAdjustment = BACK_TO_BACK_BOOST;
    opportunities.push('Back-to-back (Hornets are 5-1 on B2Bs!)');
  } else if (upcomingGame.restDays !== undefined && upcomingGame.restDays >= 2) {
    restAdjustment = REST_ADVANTAGE_BOOST;
    opportunities.push(`Well rested (${upcomingGame.restDays} days)`);
  }

  if (restAdjustment !== 0) {
    factors.push({
      name: 'Rest Factor',
      impact: restAdjustment,
      description: upcomingGame.isBackToBack ? 'B2B (historically strong)' : 'Rest advantage',
    });
  }

  // === 5. Momentum/Streak ===
  let streakAdjustment = 0;
  if (core5Streak >= 3) {
    streakAdjustment = Math.min(core5Streak * STREAK_BOOST, 3.0);
    opportunities.push(`On ${core5Streak}-game win streak`);

    factors.push({
      name: `${core5Streak}-Game Streak`,
      impact: streakAdjustment,
      description: 'Hot streak bonus',
    });
  }

  // === 6. Calculate Predicted Margin ===
  const baseMargin = CORE5_AVG_MARGIN;
  const predictedMargin =
    baseMargin +
    oppAdjustment +
    locationAdjustment +
    restAdjustment +
    streakAdjustment;

  // === 7. Calculate Value vs Spread ===
  const spread = upcomingGame.spread ?? 0;
  // predictedCover > 0 means we expect to cover
  // If spread is -5 (favored by 5) and we predict +10 margin:
  //   predictedCover = 10 + (-5) = +5 (cover by 5)
  const predictedCover = predictedMargin + spread;

  // Value score: how much better is our prediction vs the spread
  const valueScore = predictedCover;

  // === 8. Confidence Score ===
  let confidenceScore = 50; // Base

  // Sample size bonus (more Core 5 games = more confident)
  confidenceScore += Math.min(qualifiedGames.length, 20);

  // Value bonus
  if (valueScore >= HIGH_VALUE_THRESHOLD) confidenceScore += 20;
  else if (valueScore >= MEDIUM_VALUE_THRESHOLD) confidenceScore += 10;
  else if (valueScore < 0) confidenceScore -= 20;

  // Opponent tier
  if (oppTier === 'weak') confidenceScore += 10;
  else if (oppTier === 'elite') confidenceScore -= 15;

  // Home boost
  if (upcomingGame.isHome) confidenceScore += 5;

  // Streak boost
  if (core5Streak >= 5) confidenceScore += 10;
  else if (core5Streak >= 3) confidenceScore += 5;

  // Clamp to 0-100
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  // === 9. Determine Confidence Level & Bet Size ===
  let confidence: BuzzingPrediction['confidence'];
  let betSize: BuzzingPrediction['betSize'];

  if (oppTier === 'elite' && !upcomingGame.isHome) {
    confidence = 'avoid';
    betSize = 'pass';
    risks.push('AVOID: Road game vs elite team');
  } else if (valueScore >= HIGH_VALUE_THRESHOLD && confidenceScore >= 70) {
    confidence = 'max';
    betSize = 'max';
  } else if (valueScore >= MEDIUM_VALUE_THRESHOLD && confidenceScore >= 60) {
    confidence = 'high';
    betSize = 'large';
  } else if (valueScore >= LOW_VALUE_THRESHOLD && confidenceScore >= 50) {
    confidence = 'medium';
    betSize = 'medium';
  } else if (valueScore > 0) {
    confidence = 'low';
    betSize = 'small';
  } else {
    confidence = 'avoid';
    betSize = 'pass';
  }

  // === 10. Generate Recommendation ===
  let recommendation: string;
  if (confidence === 'max') {
    recommendation = `MAX BET: Hornets ${spread > 0 ? '+' : ''}${spread}. Model shows +${valueScore.toFixed(1)} points of value.`;
  } else if (confidence === 'high') {
    recommendation = `STRONG BET: Hornets ${spread > 0 ? '+' : ''}${spread}. Good value (+${valueScore.toFixed(1)}).`;
  } else if (confidence === 'medium') {
    recommendation = `MODERATE BET: Hornets ${spread > 0 ? '+' : ''}${spread}. Slight edge.`;
  } else if (confidence === 'low') {
    recommendation = `SMALL BET: Marginal value. Consider passing.`;
  } else {
    recommendation = `PASS: No value identified or high risk situation.`;
  }

  return {
    predictedMargin: Math.round(predictedMargin * 10) / 10,
    predictedCover: Math.round(predictedCover * 10) / 10,
    confidence,
    confidenceScore: Math.round(confidenceScore),
    valueScore: Math.round(valueScore * 10) / 10,
    betSize,
    factors,
    risks,
    opportunities,
    recommendation,
  };
}

/**
 * Analyze all upcoming Hornets games and rank by value
 */
export function analyzeUpcomingHornetsGames(
  upcomingGames: UpcomingGame[],
  qualifiedGames: Game[],
  allGames: Game[]
): Array<{ game: UpcomingGame; prediction: BuzzingPrediction }> {
  const hornetsGames = upcomingGames; // Assuming these are already Hornets games

  const analyzed = hornetsGames.map(game => ({
    game,
    prediction: buzzingPredict(game, qualifiedGames, allGames),
  }));

  // Sort by value score (highest first)
  return analyzed.sort((a, b) => b.prediction.valueScore - a.prediction.valueScore);
}
