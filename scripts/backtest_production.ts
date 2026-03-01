/**
 * Production Model Backtest
 *
 * Imports predictSpread() directly from lib/model.ts — zero translation gap.
 * Walks through games chronologically, using only prior data (no look-ahead).
 *
 * Usage: npx tsx scripts/backtest_production.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  predictSpread,
  calculateRollingMetrics,
  calculateBuzzingMetrics,
  analyzeTrend,
  applyAlignmentBonus,
} from '../lib/model';
import type {
  RollingMetrics,
  SpreadPrediction,
  PredictionMode,
} from '../lib/model';
import type { Game, UpcomingGame, BuzzData } from '../lib/types';

// ─── Load data ───────────────────────────────────────────────────────────────

const dataPath = path.resolve(__dirname, '../data/hornets_buzz.json');
const buzzData: BuzzData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Games are stored newest-first; reverse to chronological (oldest-first)
const allGames = [...buzzData.games].reverse();

// ─── Configuration ───────────────────────────────────────────────────────────

const MIN_PRIOR_GAMES = 10; // Need at least 10 prior games for rolling windows
const MIN_CORE5_GAMES = 5;  // Need at least 5 Core 5 games for buzzing metrics

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the `rollingMetrics` object that predictSpread expects.
 * `priorGames` should be newest-first (the format calculateRollingMetrics expects).
 */
function buildRollingMetrics(
  priorGamesNewestFirst: Game[],
  spreads: Map<string, number>,
  healthyOnly: boolean = true,
): {
  last4: RollingMetrics;
  last7: RollingMetrics;
  last10: RollingMetrics;
  season: RollingMetrics;
} {
  // When healthyOnly=true, season window = number of qualified games (matches production)
  const maxGames = healthyOnly
    ? priorGamesNewestFirst.filter(g => g.isQualified).length
    : priorGamesNewestFirst.length;
  return {
    last4: calculateRollingMetrics(priorGamesNewestFirst, 4, spreads, healthyOnly),
    last7: calculateRollingMetrics(priorGamesNewestFirst, 7, spreads, healthyOnly),
    last10: calculateRollingMetrics(priorGamesNewestFirst, 10, spreads, healthyOnly),
    season: calculateRollingMetrics(priorGamesNewestFirst, maxGames, spreads, healthyOnly),
  };
}

/**
 * Cast a historical Game as an UpcomingGame for prediction.
 * Uses only pre-game data (opponent stats, home/away, rest, spread).
 */
function gameToUpcomingGame(game: Game): UpcomingGame {
  return {
    gameId: game.gameId,
    date: game.date,
    opponent: game.opponent,
    isHome: game.isHome,
    spread: game.spread ?? null,
    moneyline: null, // Not available in historical data
    impliedWinPct: game.impliedWinPct ?? null,
    overUnder: null,
    opponentNetRating: game.opponentNetRating,
    opponentPace: game.opponentPace,
    opponentThreePtRate: game.opponentThreePtRate,
    opponentFtRate: game.opponentFtRate,
    opponentOrebPerGame: game.opponentOrebPerGame,
    opponentTovPerGame: game.opponentTovPerGame,
    opponentStlPerGame: game.opponentStlPerGame,
    opponentDefFg3Pct: game.opponentDefFg3Pct,
    restDays: game.restDays,
    isBackToBack: game.isBackToBack,
  };
}

/**
 * Build a spread map from games.
 */
function buildSpreads(games: Game[]): Map<string, number> {
  const spreads = new Map<string, number>();
  for (const g of games) {
    if (g.spread !== undefined && g.spread !== null) {
      spreads.set(g.gameId, g.spread);
    }
  }
  return spreads;
}

/**
 * Classify opponent strength tier by net rating.
 */
function opponentTier(nr: number | undefined): string {
  if (nr === undefined) return 'unknown';
  if (nr >= 6.0) return 'elite';
  if (nr >= 3.0) return 'strong';
  if (nr >= -3.0) return 'mid';
  return 'weak';
}

// ─── Per-game result tracking ────────────────────────────────────────────────

interface GameResult {
  date: string;
  opponent: string;
  isHome: boolean;
  isQualified: boolean;
  isBackToBack: boolean;
  opponentTier: string;
  opponentNetRating: number | undefined;
  actualMargin: number;
  spread: number | undefined;
  predictions: {
    standard: { margin: number; rawMargin: number };
    bayesian: { margin: number; rawMargin: number };
    buzzing: { margin: number; rawMargin: number };
  };
}

// ─── Run backtest ────────────────────────────────────────────────────────────

const results: GameResult[] = [];
let skipped = 0;

for (let i = 0; i < allGames.length; i++) {
  const game = allGames[i];

  // Only prior games visible (no look-ahead)
  const priorGames = allGames.slice(0, i); // chronological [0..i-1]

  if (priorGames.length < MIN_PRIOR_GAMES) {
    skipped++;
    continue;
  }

  // predictSpread expects games newest-first
  const priorNewestFirst = [...priorGames].reverse();

  const spreads = buildSpreads(priorGames);
  const qualifiedPrior = priorNewestFirst.filter(g => g.isQualified);

  // Build inputs
  // Production default: healthyOnly=true for rolling windows (matches dashboard)
  const rollingMetrics = buildRollingMetrics(priorNewestFirst, spreads, true);
  const buzzingMetrics = calculateBuzzingMetrics(priorNewestFirst, spreads);
  // allGamesMetrics always uses all games (healthyOnly=false), same as production
  const allGamesMetrics = calculateRollingMetrics(priorNewestFirst, priorNewestFirst.length, spreads, false);
  const trend = analyzeTrend(priorNewestFirst);
  const upcoming = gameToUpcomingGame(game);

  const actualMargin = game.hornetsScore - game.opponentScore;

  // Run all three modes
  const modes: PredictionMode[] = ['standard', 'bayesian', 'buzzing'];
  const preds: Record<string, SpreadPrediction> = {};

  for (const mode of modes) {
    // For buzzing mode, require minimum Core 5 games
    if (mode === 'buzzing' && qualifiedPrior.length < MIN_CORE5_GAMES) {
      // Fall back to standard prediction
      preds[mode] = preds['standard'] || predictSpread(
        upcoming,
        rollingMetrics,
        trend,
        upcoming.opponentNetRating ?? 0,
        'standard',
        buzzingMetrics,
        allGamesMetrics,
        priorNewestFirst,
      );
      continue;
    }

    preds[mode] = predictSpread(
      upcoming,
      rollingMetrics,
      trend,
      upcoming.opponentNetRating ?? 0,
      mode,
      buzzingMetrics,
      allGamesMetrics,
      priorNewestFirst,
    );
  }

  // Apply alignment bonus to bayesian (needs all 3 modes)
  if (preds['standard'] && preds['bayesian'] && preds['buzzing']) {
    preds['bayesian'] = applyAlignmentBonus(
      preds['bayesian'],
      {
        standard: preds['standard'],
        bayesian: preds['bayesian'],
        buzzing: preds['buzzing'],
      },
      upcoming.spread,
    );
  }

  results.push({
    date: game.date,
    opponent: game.opponent,
    isHome: game.isHome,
    isQualified: game.isQualified,
    isBackToBack: game.isBackToBack ?? false,
    opponentTier: opponentTier(game.opponentNetRating),
    opponentNetRating: game.opponentNetRating,
    actualMargin,
    spread: game.spread,
    predictions: {
      standard: { margin: preds['standard'].predictedMargin, rawMargin: preds['standard'].rawMargin },
      bayesian: { margin: preds['bayesian'].predictedMargin, rawMargin: preds['bayesian'].rawMargin },
      buzzing: { margin: preds['buzzing'].predictedMargin, rawMargin: preds['buzzing'].rawMargin },
    },
  });
}

// ─── Compute metrics ─────────────────────────────────────────────────────────

interface ModeMetrics {
  mae: number;
  rmse: number;
  bias: number;
  atsW: number;
  atsL: number;
  pickCorrect: number;
  total: number;
}

function computeMetrics(
  results: GameResult[],
  getMargin: (r: GameResult) => number,
  filter?: (r: GameResult) => boolean,
): ModeMetrics {
  const filtered = filter ? results.filter(filter) : results;
  let sumAbsErr = 0;
  let sumSqErr = 0;
  let sumErr = 0;
  let atsW = 0;
  let atsL = 0;
  let pickCorrect = 0;
  let total = 0;

  for (const r of filtered) {
    const pred = getMargin(r);
    const actual = r.actualMargin;
    const err = pred - actual;

    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    sumErr += err;
    total++;

    // ATS: did we correctly predict covering the spread?
    if (r.spread !== undefined && r.spread !== null) {
      const predictedCovers = pred + r.spread > 0;
      const actualCovers = actual + r.spread > 0;
      if (predictedCovers === actualCovers) {
        atsW++;
      } else {
        atsL++;
      }
    }

    // Pick winner correctly
    const predictedWin = pred > 0;
    const actualWin = actual > 0;
    if (predictedWin === actualWin) {
      pickCorrect++;
    }
  }

  return {
    mae: total > 0 ? sumAbsErr / total : 0,
    rmse: total > 0 ? Math.sqrt(sumSqErr / total) : 0,
    bias: total > 0 ? sumErr / total : 0,
    atsW,
    atsL,
    pickCorrect,
    total,
  };
}

// ─── Print results ───────────────────────────────────────────────────────────

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const fmt = (n: number, d: number = 1) => n.toFixed(d);
const fmtSign = (n: number, d: number = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

console.log('');
console.log('=== HORNETS BUZZ PRODUCTION BACKTEST ===');
console.log(`Games analyzed: ${results.length} (skipped first ${skipped})`);
const core5Results = results.filter(r => r.isQualified);
console.log(`Core 5 games: ${core5Results.length}`);
console.log('');

// Mode comparison table
const modeGetters: [string, (r: GameResult) => number][] = [
  ['Standard', r => r.predictions.standard.margin],
  ['Bayesian', r => r.predictions.bayesian.margin],
  ['Buzzing', r => r.predictions.buzzing.margin],
];

console.log(
  pad('Mode', 13) + '| ' +
  padL('MAE', 6) + ' | ' +
  padL('RMSE', 6) + ' | ' +
  padL('Bias', 6) + ' | ' +
  pad('ATS W-L', 9) + '| ' +
  padL('ATS%', 6) + ' | ' +
  padL('Pick%', 6)
);
console.log('-'.repeat(65));

for (const [name, getter] of modeGetters) {
  const m = computeMetrics(results, getter);
  const atsPct = (m.atsW + m.atsL) > 0 ? (m.atsW / (m.atsW + m.atsL) * 100) : 0;
  const pickPct = m.total > 0 ? (m.pickCorrect / m.total * 100) : 0;
  console.log(
    pad(name, 13) + '| ' +
    padL(fmt(m.mae), 6) + ' | ' +
    padL(fmt(m.rmse), 6) + ' | ' +
    padL(fmtSign(m.bias), 6) + ' | ' +
    pad(`${m.atsW}-${m.atsL}`, 9) + '| ' +
    padL(fmt(atsPct), 6) + ' | ' +
    padL(fmt(pickPct), 6)
  );
}

// Core 5 Only (Bayesian)
console.log('');
console.log('=== CORE 5 ONLY (Bayesian) ===');
const c5m = computeMetrics(results, r => r.predictions.bayesian.margin, r => r.isQualified);
const c5atsPct = (c5m.atsW + c5m.atsL) > 0 ? (c5m.atsW / (c5m.atsW + c5m.atsL) * 100) : 0;
console.log(
  `MAE: ${fmt(c5m.mae)} | RMSE: ${fmt(c5m.rmse)} | Bias: ${fmtSign(c5m.bias)} | ` +
  `ATS: ${c5m.atsW}-${c5m.atsL} (${fmt(c5atsPct)}%)`
);

// Bucket breakdowns (Bayesian)
console.log('');
console.log('=== BUCKETS (Bayesian) ===');

const bayesGetter = (r: GameResult) => r.predictions.bayesian.margin;

const buckets: [string, (r: GameResult) => boolean][] = [
  ['Home', r => r.isHome],
  ['Away', r => !r.isHome],
  ['vs Elite', r => r.opponentTier === 'elite'],
  ['vs Strong', r => r.opponentTier === 'strong'],
  ['vs Mid', r => r.opponentTier === 'mid'],
  ['vs Weak', r => r.opponentTier === 'weak'],
  ['B2B', r => r.isBackToBack],
  ['Qualified', r => r.isQualified],
  ['Not Qual', r => !r.isQualified],
];

for (const [label, filter] of buckets) {
  const m = computeMetrics(results, bayesGetter, filter);
  if (m.total === 0) continue;
  const atsPct = (m.atsW + m.atsL) > 0 ? (m.atsW / (m.atsW + m.atsL) * 100) : 0;
  console.log(
    pad(label + ':', 13) +
    `MAE ${padL(fmt(m.mae), 5)} | ` +
    `ATS ${fmt(atsPct)}% (${m.atsW}-${m.atsL}) | ` +
    `n=${m.total}`
  );
}

// Worst misses (Bayesian)
console.log('');
console.log('=== WORST MISSES (Bayesian) ===');

const sortedByError = [...results]
  .map(r => ({
    ...r,
    error: Math.abs(r.predictions.bayesian.margin - r.actualMargin),
  }))
  .sort((a, b) => b.error - a.error)
  .slice(0, 5);

for (const r of sortedByError) {
  const pred = r.predictions.bayesian.margin;
  console.log(
    `${r.date} ${r.isHome ? 'vs' : '@'} ${r.opponent}: ` +
    `Predicted ${fmtSign(pred)}, Actual ${fmtSign(r.actualMargin)}, ` +
    `Error: ${fmt(r.error)}`
  );
}

// Best predictions
console.log('');
console.log('=== BEST PREDICTIONS (Bayesian) ===');

const sortedByBest = [...results]
  .map(r => ({
    ...r,
    error: Math.abs(r.predictions.bayesian.margin - r.actualMargin),
  }))
  .sort((a, b) => a.error - b.error)
  .slice(0, 5);

for (const r of sortedByBest) {
  const pred = r.predictions.bayesian.margin;
  console.log(
    `${r.date} ${r.isHome ? 'vs' : '@'} ${r.opponent}: ` +
    `Predicted ${fmtSign(pred)}, Actual ${fmtSign(r.actualMargin)}, ` +
    `Error: ${fmt(r.error)}`
  );
}

// ─── Save full results to JSON ───────────────────────────────────────────────

const outputPath = path.resolve(__dirname, '../data/backtest_production.json');
const output = {
  runDate: new Date().toISOString(),
  gamesAnalyzed: results.length,
  gamesSkipped: skipped,
  core5Games: core5Results.length,
  summary: {
    standard: computeMetrics(results, r => r.predictions.standard.margin),
    bayesian: computeMetrics(results, r => r.predictions.bayesian.margin),
    buzzing: computeMetrics(results, r => r.predictions.buzzing.margin),
    core5Bayesian: computeMetrics(results, r => r.predictions.bayesian.margin, r => r.isQualified),
  },
  games: results,
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log('');
console.log(`Full results saved to: data/backtest_production.json`);
