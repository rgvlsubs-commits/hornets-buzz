/**
 * League-Wide Production Model Validation
 *
 * Reads walk-forward data from fetch_league_walkforward.py, applies the
 * production model's core methodology (Elo + NR blending), and measures
 * accuracy across ~500+ non-Hornets NBA games.
 *
 * Key difference from production Hornets model:
 * - BOTH teams have full rolling NR, so NR diff captures relative strength
 *   symmetrically (no 0.5x opponent adjustment needed)
 * - Hornets-specific code (roster adjustments, buzzing mode, etc.) is skipped
 * - Core methodology under test: estimateElo, blend weights, window weights,
 *   home advantage, B2B fatigue, margin cap, mid-vs-mid adjustment
 *
 * Usage: npx tsx scripts/backtest_league_production.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { estimateElo, eloToSpread } from '../lib/model';

// === Constants (matching production model.ts) ===
const ELO_HOME_ADVANTAGE = 70;     // Elo points
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;

const WINDOW_WEIGHTS = {
  last4: 0.30,
  last7: 0.25,
  last10: 0.25,
  season: 0.20,
};

const NR_HOME_ADVANTAGE = 1.5;     // Points (was 2.0)
const NR_FATIGUE_HOME_B2B = 3.0;   // Home team on B2B (fatigue erodes crowd/energy edge)
const NR_FATIGUE_AWAY_B2B = 1.0;   // Away team on B2B (less impact, already traveling)
const MID_VS_MID_ADJUSTMENT = -1.0;
const PREDICTED_MARGIN_CAP = 15;

const MID_TIER_LOW = -3.0;
const MID_TIER_HIGH = 3.0;

const HORNETS_TEAM_ID = 1610612766;

// === Types ===

interface RollingNR {
  last4: number;
  last7: number;
  last10: number;
  season: number;
}

interface TeamSnapshot {
  gamesPlayed: number;
  wins: number;
  losses: number;
  totalPointDiff: number;
  rollingNR: RollingNR;
  pace: number;
  isBackToBack: boolean;
  restDays: number;
}

interface WalkforwardGame {
  gameId: string;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  actualMargin: number;
  homeSnapshot: TeamSnapshot;
  awaySnapshot: TeamSnapshot;
  isHornetsGame: boolean;
}

interface WalkforwardData {
  metadata: {
    season: string;
    generatedAt: string;
    totalGamesInSeason: number;
    predictableGames: number;
    hornetsGames: number;
    nonHornetsGames: number;
    minPriorGames: number;
  };
  games: WalkforwardGame[];
}

interface GameResult {
  gameId: string;
  date: string;
  homeAbbrev: string;
  awayAbbrev: string;
  actualMargin: number;
  predictedMargin: number;
  rawMargin: number;
  error: number;
  isHornetsGame: boolean;
  isBackToBack: boolean; // either team on B2B
  matchupType: string;
  homeWeightedNR: number;
  awayWeightedNR: number;
  predictedWinner: string;
  actualWinner: string;
}

// === Prediction Logic ===

function weightedNR(nr: RollingNR): number {
  return (
    nr.last4 * WINDOW_WEIGHTS.last4 +
    nr.last7 * WINDOW_WEIGHTS.last7 +
    nr.last10 * WINDOW_WEIGHTS.last10 +
    nr.season * WINDOW_WEIGHTS.season
  );
}

function classifyTier(nr: number): string {
  if (nr >= 6.0) return 'elite';
  if (nr >= 3.0) return 'strong';
  if (nr >= MID_TIER_LOW) return 'mid';
  return 'weak';
}

function matchupType(homeNR: number, awayNR: number): string {
  const homeTier = classifyTier(homeNR);
  const awayTier = classifyTier(awayNR);

  if (homeTier === 'elite' && awayTier === 'elite') return 'elite_vs_elite';
  if ((homeTier === 'elite' && awayTier === 'weak') ||
      (homeTier === 'weak' && awayTier === 'elite')) return 'elite_vs_weak';
  if (homeTier === 'mid' && awayTier === 'mid') return 'mid_vs_mid';
  return `${homeTier}_vs_${awayTier}`;
}

function predictLeagueGame(
  home: TeamSnapshot,
  away: TeamSnapshot,
): { predictedMargin: number; rawMargin: number; homeWeightedNR: number; awayWeightedNR: number } {
  // 1-2. Estimate Elo for BOTH teams (zero translation gap — uses model.ts)
  const homeElo = estimateElo(
    home.wins, home.losses, home.totalPointDiff, home.gamesPlayed,
  );
  const awayElo = estimateElo(
    away.wins, away.losses, away.totalPointDiff, away.gamesPlayed,
  );

  // 3. Elo diff with home advantage
  const eloDiff = homeElo - awayElo + ELO_HOME_ADVANTAGE;

  // 4. Convert to spread
  const eloPrediction = eloToSpread(eloDiff);

  // 5-6. Weighted net rating for both teams
  const homeWNR = weightedNR(home.rollingNR);
  const awayWNR = weightedNR(away.rollingNR);

  // 7. NR prediction
  // Both teams have full rolling NR, so diff captures relative strength symmetrically
  let nrPrediction = (homeWNR - awayWNR) + NR_HOME_ADVANTAGE;

  // Fatigue adjustment — asymmetric: home B2B hurts more than away B2B
  if (home.isBackToBack) nrPrediction -= NR_FATIGUE_HOME_B2B;
  if (away.isBackToBack) nrPrediction += NR_FATIGUE_AWAY_B2B;

  // Mid vs Mid adjustment: when both teams are mid-tier, predictions tend to overestimate margins
  const bothMid = homeWNR >= MID_TIER_LOW && homeWNR < MID_TIER_HIGH &&
                  awayWNR >= MID_TIER_LOW && awayWNR < MID_TIER_HIGH;
  if (bothMid) {
    // Shrink toward 0 by 1 point
    nrPrediction += nrPrediction > 0 ? MID_VS_MID_ADJUSTMENT : -MID_VS_MID_ADJUSTMENT;
  }

  // 8. Blend Elo and NR
  const rawMargin = eloPrediction * ELO_WEIGHT + nrPrediction * NR_WEIGHT;

  // 9. Cap at ±15
  const predictedMargin = Math.max(-PREDICTED_MARGIN_CAP, Math.min(PREDICTED_MARGIN_CAP, rawMargin));

  return {
    predictedMargin: Math.round(predictedMargin * 10) / 10,
    rawMargin: Math.round(rawMargin * 10) / 10,
    homeWeightedNR: Math.round(homeWNR * 10) / 10,
    awayWeightedNR: Math.round(awayWNR * 10) / 10,
  };
}

// === Metrics ===

interface Metrics {
  mae: number;
  rmse: number;
  bias: number;
  suCorrect: number;
  total: number;
  suPct: number;
}

function computeMetrics(results: GameResult[]): Metrics {
  if (results.length === 0) {
    return { mae: 0, rmse: 0, bias: 0, suCorrect: 0, total: 0, suPct: 0 };
  }

  let sumAbsErr = 0;
  let sumSqErr = 0;
  let sumErr = 0;
  let suCorrect = 0;

  for (const r of results) {
    const err = r.predictedMargin - r.actualMargin;
    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    sumErr += err;

    // SU accuracy: did we pick the winner correctly?
    if ((r.predictedMargin > 0 && r.actualMargin > 0) ||
        (r.predictedMargin < 0 && r.actualMargin < 0)) {
      suCorrect++;
    }
  }

  const n = results.length;
  return {
    mae: sumAbsErr / n,
    rmse: Math.sqrt(sumSqErr / n),
    bias: sumErr / n,
    suCorrect,
    total: n,
    suPct: (suCorrect / n) * 100,
  };
}

// === Output Formatting ===

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const fmt = (n: number, d: number = 1) => n.toFixed(d);
const fmtSign = (n: number, d: number = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

function printMetricsRow(label: string, m: Metrics) {
  console.log(
    pad(label, 22) + '| ' +
    padL(fmt(m.mae), 6) + ' | ' +
    padL(fmt(m.rmse), 6) + ' | ' +
    padL(fmtSign(m.bias), 6) + ' | ' +
    padL(fmt(m.suPct), 6) + '% | ' +
    padL(`n=${m.total}`, 7)
  );
}

function printHeader() {
  console.log(
    pad('', 22) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('RMSE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU Acc', 7) + ' | ' +
    padL('Games', 7)
  );
  console.log('-'.repeat(68));
}

// === Main ===

function main() {
  // Load walk-forward data
  const dataPath = path.resolve(__dirname, '../data/league_walkforward.json');
  if (!fs.existsSync(dataPath)) {
    console.error('ERROR: data/league_walkforward.json not found.');
    console.error('Run: python scripts/fetch_league_walkforward.py');
    process.exit(1);
  }

  const data: WalkforwardData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const { metadata, games } = data;

  console.log('');
  console.log('=== LEAGUE-WIDE PRODUCTION MODEL VALIDATION ===');
  console.log(`Season: ${metadata.season}`);
  console.log(`Total games in dataset: ${metadata.predictableGames}`);
  console.log(`Min prior games per team: ${metadata.minPriorGames}`);
  console.log('');

  // Run predictions
  const results: GameResult[] = [];

  for (const game of games) {
    const pred = predictLeagueGame(game.homeSnapshot, game.awaySnapshot);

    const homeWNR = pred.homeWeightedNR;
    const awayWNR = pred.awayWeightedNR;

    results.push({
      gameId: game.gameId,
      date: game.date,
      homeAbbrev: game.homeAbbrev,
      awayAbbrev: game.awayAbbrev,
      actualMargin: game.actualMargin,
      predictedMargin: pred.predictedMargin,
      rawMargin: pred.rawMargin,
      error: Math.abs(pred.predictedMargin - game.actualMargin),
      isHornetsGame: game.isHornetsGame,
      isBackToBack: game.homeSnapshot.isBackToBack || game.awaySnapshot.isBackToBack,
      matchupType: matchupType(homeWNR, awayWNR),
      homeWeightedNR: homeWNR,
      awayWeightedNR: awayWNR,
      predictedWinner: pred.predictedMargin > 0 ? game.homeAbbrev : game.awayAbbrev,
      actualWinner: game.actualMargin > 0 ? game.homeAbbrev : game.awayAbbrev,
    });
  }

  // Split results
  const nonHornets = results.filter(r => !r.isHornetsGame);
  const hornetsOnly = results.filter(r => r.isHornetsGame);

  // === Overall Metrics ===
  console.log('=== OVERALL METRICS ===');
  printHeader();
  printMetricsRow('League (all)', computeMetrics(results));
  printMetricsRow('League (non-CHA)', computeMetrics(nonHornets));
  if (hornetsOnly.length > 0) {
    printMetricsRow('Hornets only', computeMetrics(hornetsOnly));
  }

  // Reference: Hornets production backtest
  console.log('-'.repeat(68));
  console.log(pad('Hornets (prod Bayes)', 22) + '|   11.4 |   15.7 |   -4.2 |   60.8% |   n=51');
  console.log('');

  // === Bucket Analysis (non-Hornets only for clean out-of-sample) ===
  console.log('=== BUCKETS (non-Hornets, clean out-of-sample) ===');
  printHeader();

  // Home favorite / underdog / toss-up
  const homeFav = nonHornets.filter(r => r.predictedMargin > 3);
  const homeUnderdog = nonHornets.filter(r => r.predictedMargin < -3);
  const tossUp = nonHornets.filter(r => Math.abs(r.predictedMargin) <= 3);

  printMetricsRow('Home Fav (>3)', computeMetrics(homeFav));
  printMetricsRow('Toss-up (+-3)', computeMetrics(tossUp));
  printMetricsRow('Home Dog (<-3)', computeMetrics(homeUnderdog));
  console.log('');

  // Matchup types
  console.log('--- Matchup Types ---');
  printHeader();

  const eliteVsElite = nonHornets.filter(r => r.matchupType === 'elite_vs_elite');
  const eliteVsWeak = nonHornets.filter(r => r.matchupType === 'elite_vs_weak');
  const midVsMid = nonHornets.filter(r => r.matchupType === 'mid_vs_mid');
  const otherMatchups = nonHornets.filter(r =>
    r.matchupType !== 'elite_vs_elite' &&
    r.matchupType !== 'elite_vs_weak' &&
    r.matchupType !== 'mid_vs_mid'
  );

  if (eliteVsElite.length > 0) printMetricsRow('Elite vs Elite', computeMetrics(eliteVsElite));
  if (eliteVsWeak.length > 0) printMetricsRow('Elite vs Weak', computeMetrics(eliteVsWeak));
  if (midVsMid.length > 0) printMetricsRow('Mid vs Mid', computeMetrics(midVsMid));
  if (otherMatchups.length > 0) printMetricsRow('Other matchups', computeMetrics(otherMatchups));
  console.log('');

  // B2B games
  console.log('--- Fatigue ---');
  printHeader();
  const b2bGames = nonHornets.filter(r => r.isBackToBack);
  const nonB2b = nonHornets.filter(r => !r.isBackToBack);
  printMetricsRow('B2B (either team)', computeMetrics(b2bGames));
  printMetricsRow('No B2B', computeMetrics(nonB2b));
  console.log('');

  // Large margin games
  console.log('--- By Predicted Margin Size ---');
  printHeader();
  const smallPred = nonHornets.filter(r => Math.abs(r.predictedMargin) <= 5);
  const medPred = nonHornets.filter(r => Math.abs(r.predictedMargin) > 5 && Math.abs(r.predictedMargin) <= 10);
  const largePred = nonHornets.filter(r => Math.abs(r.predictedMargin) > 10);
  printMetricsRow('Pred <=5', computeMetrics(smallPred));
  printMetricsRow('Pred 5-10', computeMetrics(medPred));
  printMetricsRow('Pred >10', computeMetrics(largePred));
  console.log('');

  // === Bias Analysis ===
  console.log('=== BIAS ANALYSIS (non-Hornets) ===');
  const allM = computeMetrics(nonHornets);
  const homeGames = nonHornets.filter(r => r.predictedMargin > 0);
  const awayGames = nonHornets.filter(r => r.predictedMargin <= 0);
  const homeM = computeMetrics(homeGames);
  const awayM = computeMetrics(awayGames);

  console.log(`Overall bias: ${fmtSign(allM.bias)} (positive = overpredicts home margin)`);
  console.log(`Home-favored games bias: ${fmtSign(homeM.bias)} (n=${homeM.total})`);
  console.log(`Away-favored games bias: ${fmtSign(awayM.bias)} (n=${awayM.total})`);
  console.log('');

  // === Worst Misses ===
  console.log('=== WORST MISSES (non-Hornets, top 5) ===');
  const worstMisses = [...nonHornets]
    .sort((a, b) => b.error - a.error)
    .slice(0, 5);

  for (const r of worstMisses) {
    console.log(
      `${r.date} ${r.awayAbbrev} @ ${r.homeAbbrev}: ` +
      `Pred ${fmtSign(r.predictedMargin)}, Actual ${fmtSign(r.actualMargin)}, ` +
      `Error: ${fmt(r.error)}`
    );
  }
  console.log('');

  // === Best Predictions ===
  console.log('=== BEST PREDICTIONS (non-Hornets, top 5) ===');
  const bestPreds = [...nonHornets]
    .sort((a, b) => a.error - b.error)
    .slice(0, 5);

  for (const r of bestPreds) {
    console.log(
      `${r.date} ${r.awayAbbrev} @ ${r.homeAbbrev}: ` +
      `Pred ${fmtSign(r.predictedMargin)}, Actual ${fmtSign(r.actualMargin)}, ` +
      `Error: ${fmt(r.error)}`
    );
  }
  console.log('');

  // === Save JSON output ===
  const outputPath = path.resolve(__dirname, '../data/backtest_league_walkforward.json');
  const output = {
    runDate: new Date().toISOString(),
    metadata: {
      ...metadata,
      modelParams: {
        eloWeight: ELO_WEIGHT,
        nrWeight: NR_WEIGHT,
        windowWeights: WINDOW_WEIGHTS,
        nrHomeAdvantage: NR_HOME_ADVANTAGE,
        nrFatigueHomeB2B: NR_FATIGUE_HOME_B2B,
        nrFatigueAwayB2B: NR_FATIGUE_AWAY_B2B,
        eloHomeAdvantage: ELO_HOME_ADVANTAGE,
        midVsMidAdjustment: MID_VS_MID_ADJUSTMENT,
        marginCap: PREDICTED_MARGIN_CAP,
      },
    },
    summary: {
      all: computeMetrics(results),
      nonHornets: computeMetrics(nonHornets),
      hornetsOnly: hornetsOnly.length > 0 ? computeMetrics(hornetsOnly) : null,
    },
    buckets: {
      homeFavorite: computeMetrics(homeFav),
      tossUp: computeMetrics(tossUp),
      homeUnderdog: computeMetrics(homeUnderdog),
      eliteVsElite: computeMetrics(eliteVsElite),
      eliteVsWeak: computeMetrics(eliteVsWeak),
      midVsMid: computeMetrics(midVsMid),
      b2b: computeMetrics(b2bGames),
      noB2b: computeMetrics(nonB2b),
    },
    games: results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Full results saved to: data/backtest_league_walkforward.json`);
}

main();
