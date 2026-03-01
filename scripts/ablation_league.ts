/**
 * Ablation Testing — League-Wide Model
 *
 * Tests which model components earn their keep on 690 non-Hornets games.
 * Each ablation toggles one component off (or swaps a variant) and measures
 * the impact on MAE, RMSE, bias, and SU accuracy.
 *
 * Usage: npx tsx scripts/ablation_league.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { estimateElo, eloToSpread } from '../lib/model';

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
  metadata: { season: string; predictableGames: number; minPriorGames: number };
  games: WalkforwardGame[];
}

interface Metrics {
  mae: number;
  rmse: number;
  bias: number;
  suPct: number;
  total: number;
}

// === Configurable prediction ===

interface ModelConfig {
  name: string;
  eloWeight: number;
  nrWeight: number;
  windowWeights: { last4: number; last7: number; last10: number; season: number };
  nrHomeAdvantage: number;
  eloHomeAdvantage: number;
  fatigueHomeB2B: number;
  fatigueAwayB2B: number;
  midVsMidAdj: number;
  marginCap: number;
  elitePenalty: number;       // extra penalty when one team is elite
  eliteThreshold: number;
}

const BASELINE: ModelConfig = {
  name: 'CURRENT (baseline)',
  eloWeight: 0.55,
  nrWeight: 0.45,
  windowWeights: { last4: 0.30, last7: 0.25, last10: 0.25, season: 0.20 },
  nrHomeAdvantage: 1.5,
  eloHomeAdvantage: 70,
  fatigueHomeB2B: 3.0,
  fatigueAwayB2B: 1.0,
  midVsMidAdj: -1.0,
  marginCap: 15,
  elitePenalty: 0,        // not used in league backtest currently
  eliteThreshold: 6.0,
};

function weightedNR(nr: RollingNR, w: ModelConfig['windowWeights']): number {
  return nr.last4 * w.last4 + nr.last7 * w.last7 + nr.last10 * w.last10 + nr.season * w.season;
}

function predict(home: TeamSnapshot, away: TeamSnapshot, cfg: ModelConfig): number {
  // Elo component
  const homeElo = estimateElo(home.wins, home.losses, home.totalPointDiff, home.gamesPlayed);
  const awayElo = estimateElo(away.wins, away.losses, away.totalPointDiff, away.gamesPlayed);
  const eloDiff = homeElo - awayElo + cfg.eloHomeAdvantage;
  const eloPred = eloToSpread(eloDiff);

  // NR component
  const homeWNR = weightedNR(home.rollingNR, cfg.windowWeights);
  const awayWNR = weightedNR(away.rollingNR, cfg.windowWeights);
  let nrPred = (homeWNR - awayWNR) + cfg.nrHomeAdvantage;

  // Fatigue
  if (home.isBackToBack) nrPred -= cfg.fatigueHomeB2B;
  if (away.isBackToBack) nrPred += cfg.fatigueAwayB2B;

  // Mid vs Mid
  const bothMid = homeWNR >= -3.0 && homeWNR < 3.0 && awayWNR >= -3.0 && awayWNR < 3.0;
  if (bothMid && cfg.midVsMidAdj !== 0) {
    nrPred += nrPred > 0 ? cfg.midVsMidAdj : -cfg.midVsMidAdj;
  }

  // Elite penalty (applied to NR prediction when one team is elite and other isn't)
  if (cfg.elitePenalty !== 0) {
    const homeElite = homeWNR >= cfg.eliteThreshold;
    const awayElite = awayWNR >= cfg.eliteThreshold;
    if (homeElite && !awayElite) nrPred += cfg.elitePenalty; // shrink home margin
    if (awayElite && !homeElite) nrPred -= cfg.elitePenalty; // shrink away margin (toward 0)
  }

  // Blend
  const raw = eloPred * cfg.eloWeight + nrPred * cfg.nrWeight;

  // Cap
  if (cfg.marginCap > 0) {
    return Math.round(Math.max(-cfg.marginCap, Math.min(cfg.marginCap, raw)) * 10) / 10;
  }
  return Math.round(raw * 10) / 10;
}

function computeMetrics(games: WalkforwardGame[], cfg: ModelConfig): Metrics {
  let sumAbsErr = 0, sumSqErr = 0, sumErr = 0, suCorrect = 0, n = 0;

  for (const g of games) {
    const pred = predict(g.homeSnapshot, g.awaySnapshot, cfg);
    const err = pred - g.actualMargin;
    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    sumErr += err;
    if ((pred > 0 && g.actualMargin > 0) || (pred < 0 && g.actualMargin < 0)) suCorrect++;
    n++;
  }

  return {
    mae: n > 0 ? sumAbsErr / n : 0,
    rmse: n > 0 ? Math.sqrt(sumSqErr / n) : 0,
    bias: n > 0 ? sumErr / n : 0,
    suPct: n > 0 ? (suCorrect / n) * 100 : 0,
    total: n,
  };
}

// === Ablation configs ===

function buildAblations(): ModelConfig[] {
  const configs: ModelConfig[] = [
    // Baseline
    { ...BASELINE },

    // --- Component removal ---
    { ...BASELINE, name: 'No mid-vs-mid adj', midVsMidAdj: 0 },
    { ...BASELINE, name: 'No margin cap', marginCap: 0 },
    { ...BASELINE, name: 'No B2B fatigue', fatigueHomeB2B: 0, fatigueAwayB2B: 0 },
    { ...BASELINE, name: 'Flat B2B (1.5/1.5)', fatigueHomeB2B: 1.5, fatigueAwayB2B: 1.5 },

    // --- Add elite penalty ---
    { ...BASELINE, name: '+Elite penalty -1.0', elitePenalty: -1.0 },
    { ...BASELINE, name: '+Elite penalty -1.5', elitePenalty: -1.5 },

    // --- Blend weight variants ---
    { ...BASELINE, name: 'Blend 50/50', eloWeight: 0.50, nrWeight: 0.50 },
    { ...BASELINE, name: 'Blend 60/40 Elo-heavy', eloWeight: 0.60, nrWeight: 0.40 },
    { ...BASELINE, name: 'Blend 40/60 NR-heavy', eloWeight: 0.40, nrWeight: 0.60 },
    { ...BASELINE, name: 'Elo only', eloWeight: 1.0, nrWeight: 0.0 },
    { ...BASELINE, name: 'NR only', eloWeight: 0.0, nrWeight: 1.0 },

    // --- Window weight variants ---
    { ...BASELINE, name: 'Windows 40/30/20/10 (recency)', windowWeights: { last4: 0.40, last7: 0.30, last10: 0.20, season: 0.10 } },
    { ...BASELINE, name: 'Windows 25/25/25/25 (equal)', windowWeights: { last4: 0.25, last7: 0.25, last10: 0.25, season: 0.25 } },
    { ...BASELINE, name: 'Windows 20/20/25/35 (stable)', windowWeights: { last4: 0.20, last7: 0.20, last10: 0.25, season: 0.35 } },

    // --- Home advantage variants ---
    { ...BASELINE, name: 'Home NR=2.0 (old)', nrHomeAdvantage: 2.0 },
    { ...BASELINE, name: 'Home NR=1.0', nrHomeAdvantage: 1.0 },

    // --- Stronger mid-vs-mid ---
    { ...BASELINE, name: 'Mid-vs-mid -1.5', midVsMidAdj: -1.5 },
    { ...BASELINE, name: 'Mid-vs-mid -2.0', midVsMidAdj: -2.0 },
  ];

  return configs;
}

// === Output ===

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const fmt = (n: number, d: number = 1) => n.toFixed(d);
const fmtSign = (n: number, d: number = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

function main() {
  const dataPath = path.resolve(__dirname, '../data/league_walkforward.json');
  if (!fs.existsSync(dataPath)) {
    console.error('ERROR: data/league_walkforward.json not found.');
    process.exit(1);
  }

  const data: WalkforwardData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const nonHornets = data.games.filter(g => !g.isHornetsGame);

  console.log('');
  console.log('=== ABLATION TESTING — LEAGUE-WIDE (non-Hornets) ===');
  console.log(`Games: ${nonHornets.length}`);
  console.log('');

  const configs = buildAblations();
  const baselineMetrics = computeMetrics(nonHornets, configs[0]);

  // Header
  console.log(
    pad('Configuration', 32) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('RMSE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU%', 6) + ' | ' +
    padL('dMAE', 6) + ' | ' +
    padL('dSU%', 6)
  );
  console.log('-'.repeat(86));

  for (const cfg of configs) {
    const m = computeMetrics(nonHornets, cfg);
    const dMAE = m.mae - baselineMetrics.mae;
    const dSU = m.suPct - baselineMetrics.suPct;

    const isBaseline = cfg.name === BASELINE.name;
    const marker = isBaseline ? ' <--' : '';

    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmt(m.rmse), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(isBaseline ? '  ---' : fmtSign(dMAE, 2), 6) + ' | ' +
      padL(isBaseline ? '  ---' : fmtSign(dSU, 1), 6) +
      marker
    );
  }

  // Sub-bucket ablations for key configs
  console.log('');
  console.log('=== KEY ABLATION DETAIL (mid-vs-mid games only, n=68) ===');
  const midGames = nonHornets.filter(g => {
    const hw = weightedNR(g.homeSnapshot.rollingNR, BASELINE.windowWeights);
    const aw = weightedNR(g.awaySnapshot.rollingNR, BASELINE.windowWeights);
    return hw >= -3.0 && hw < 3.0 && aw >= -3.0 && aw < 3.0;
  });

  const midConfigs = configs.filter(c =>
    c.name.includes('CURRENT') || c.name.includes('mid-vs-mid') || c.name.includes('No mid')
  );

  console.log(
    pad('Configuration', 32) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU%', 6) + ' | ' +
    padL('n', 4)
  );
  console.log('-'.repeat(60));

  for (const cfg of midConfigs) {
    const m = computeMetrics(midGames, cfg);
    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(String(m.total), 4)
    );
  }

  // B2B detail
  console.log('');
  console.log('=== KEY ABLATION DETAIL (B2B games only, n=~200) ===');
  const b2bGames = nonHornets.filter(g =>
    g.homeSnapshot.isBackToBack || g.awaySnapshot.isBackToBack
  );

  const b2bConfigs = configs.filter(c =>
    c.name.includes('CURRENT') || c.name.includes('B2B') || c.name.includes('Flat')
  );

  console.log(
    pad('Configuration', 32) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU%', 6) + ' | ' +
    padL('n', 4)
  );
  console.log('-'.repeat(60));

  for (const cfg of b2bConfigs) {
    const m = computeMetrics(b2bGames, cfg);
    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(String(m.total), 4)
    );
  }

  console.log('');
}

main();
