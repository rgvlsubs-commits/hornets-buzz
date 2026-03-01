/**
 * Ablation Testing — League-Wide Model
 *
 * Tests which model components earn their keep on 690 non-Hornets games.
 * Each ablation toggles one component off (or swaps a variant) and measures
 * the impact on MAE, RMSE, bias, SU accuracy, and ATS performance.
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
  closingSpread?: number;
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
  atsW: number;
  atsL: number;
  atsPush: number;
  atsPct: number;
  atsTotal: number;
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
  elitePenalty: number;
  eliteThreshold: number;
  shrinkageAlpha?: number;     // blend prediction toward market when disagreement is large
  shrinkageThreshold?: number; // |disagreement| must exceed this to trigger shrinkage
}

// Updated to match current production model.ts constants
const BASELINE: ModelConfig = {
  name: 'CURRENT (baseline)',
  eloWeight: 0.60,
  nrWeight: 0.40,
  windowWeights: { last4: 0.20, last7: 0.20, last10: 0.25, season: 0.35 },
  nrHomeAdvantage: 1.5,
  eloHomeAdvantage: 70,
  fatigueHomeB2B: 3.0,
  fatigueAwayB2B: 1.0,
  midVsMidAdj: 0,     // disabled per ablation
  marginCap: 15,
  elitePenalty: 0,
  eliteThreshold: 6.0,
};

function weightedNR(nr: RollingNR, w: ModelConfig['windowWeights']): number {
  return nr.last4 * w.last4 + nr.last7 * w.last7 + nr.last10 * w.last10 + nr.season * w.season;
}

function predict(home: TeamSnapshot, away: TeamSnapshot, cfg: ModelConfig, closingSpread?: number): number {
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

  // Elite penalty
  if (cfg.elitePenalty !== 0) {
    const homeElite = homeWNR >= cfg.eliteThreshold;
    const awayElite = awayWNR >= cfg.eliteThreshold;
    if (homeElite && !awayElite) nrPred += cfg.elitePenalty;
    if (awayElite && !homeElite) nrPred -= cfg.elitePenalty;
  }

  // Blend
  let raw = eloPred * cfg.eloWeight + nrPred * cfg.nrWeight;

  // Cap
  if (cfg.marginCap > 0) {
    raw = Math.max(-cfg.marginCap, Math.min(cfg.marginCap, raw));
  }

  let pred = Math.round(raw * 10) / 10;

  // Market shrinkage: when |disagreement| > threshold, blend toward market
  if (cfg.shrinkageAlpha !== undefined && cfg.shrinkageThreshold !== undefined && closingSpread !== undefined) {
    const marketImplied = -closingSpread;
    const disagreement = Math.abs(pred - marketImplied);
    if (disagreement > cfg.shrinkageThreshold) {
      pred = Math.round((pred * cfg.shrinkageAlpha + marketImplied * (1 - cfg.shrinkageAlpha)) * 10) / 10;
    }
  }

  return pred;
}

function computeMetrics(games: WalkforwardGame[], cfg: ModelConfig): Metrics {
  let sumAbsErr = 0, sumSqErr = 0, sumErr = 0, suCorrect = 0, n = 0;
  let atsW = 0, atsL = 0, atsPush = 0;

  for (const g of games) {
    const pred = predict(g.homeSnapshot, g.awaySnapshot, cfg, g.closingSpread);
    const err = pred - g.actualMargin;
    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    sumErr += err;
    if ((pred > 0 && g.actualMargin > 0) || (pred < 0 && g.actualMargin < 0)) suCorrect++;
    n++;

    // ATS: did our predicted margin beat the closing spread?
    if (g.closingSpread !== undefined) {
      const actualCover = g.actualMargin + g.closingSpread;
      const predictedCover = pred + g.closingSpread;
      if (actualCover === 0) {
        atsPush++;
      } else if ((predictedCover > 0 && actualCover > 0) || (predictedCover < 0 && actualCover < 0)) {
        atsW++;
      } else {
        atsL++;
      }
    }
  }

  const atsTotal = atsW + atsL;
  return {
    mae: n > 0 ? sumAbsErr / n : 0,
    rmse: n > 0 ? Math.sqrt(sumSqErr / n) : 0,
    bias: n > 0 ? sumErr / n : 0,
    suPct: n > 0 ? (suCorrect / n) * 100 : 0,
    total: n,
    atsW,
    atsL,
    atsPush,
    atsPct: atsTotal > 0 ? (atsW / atsTotal) * 100 : 0,
    atsTotal,
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
    { ...BASELINE, name: 'Blend 55/45 (old)', eloWeight: 0.55, nrWeight: 0.45 },
    { ...BASELINE, name: 'Blend 40/60 NR-heavy', eloWeight: 0.40, nrWeight: 0.60 },
    { ...BASELINE, name: 'Elo only', eloWeight: 1.0, nrWeight: 0.0 },
    { ...BASELINE, name: 'NR only', eloWeight: 0.0, nrWeight: 1.0 },

    // --- Window weight variants ---
    { ...BASELINE, name: 'Windows 40/30/20/10 (recency)', windowWeights: { last4: 0.40, last7: 0.30, last10: 0.20, season: 0.10 } },
    { ...BASELINE, name: 'Windows 25/25/25/25 (equal)', windowWeights: { last4: 0.25, last7: 0.25, last10: 0.25, season: 0.25 } },
    { ...BASELINE, name: 'Windows 30/25/25/20 (old)', windowWeights: { last4: 0.30, last7: 0.25, last10: 0.25, season: 0.20 } },

    // --- Home advantage variants ---
    { ...BASELINE, name: 'Home NR=2.0 (old)', nrHomeAdvantage: 2.0 },
    { ...BASELINE, name: 'Home NR=1.0', nrHomeAdvantage: 1.0 },
    { ...BASELINE, name: 'Home NR=0.5', nrHomeAdvantage: 0.5 },

    // --- Stronger mid-vs-mid ---
    { ...BASELINE, name: 'Mid-vs-mid -1.0', midVsMidAdj: -1.0 },
    { ...BASELINE, name: 'Mid-vs-mid -1.5', midVsMidAdj: -1.5 },
    { ...BASELINE, name: 'Mid-vs-mid -2.0', midVsMidAdj: -2.0 },

    // --- B2B penalty exploration (ATS-driven) ---
    { ...BASELINE, name: 'B2B Home=4.0/Away=1.0', fatigueHomeB2B: 4.0, fatigueAwayB2B: 1.0 },
    { ...BASELINE, name: 'B2B Home=5.0/Away=1.0', fatigueHomeB2B: 5.0, fatigueAwayB2B: 1.0 },
    { ...BASELINE, name: 'B2B Home=3.0/Away=2.0', fatigueHomeB2B: 3.0, fatigueAwayB2B: 2.0 },
    { ...BASELINE, name: 'B2B Home=4.0/Away=2.0', fatigueHomeB2B: 4.0, fatigueAwayB2B: 2.0 },

    // --- Market shrinkage (post-prediction transform) ---
    { ...BASELINE, name: 'Shrink a=0.8 t=5', shrinkageAlpha: 0.8, shrinkageThreshold: 5 },
    { ...BASELINE, name: 'Shrink a=0.7 t=5', shrinkageAlpha: 0.7, shrinkageThreshold: 5 },
    { ...BASELINE, name: 'Shrink a=0.8 t=7', shrinkageAlpha: 0.8, shrinkageThreshold: 7 },
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
  const withSpreads = nonHornets.filter(g => g.closingSpread !== undefined);

  console.log('');
  console.log('=== ABLATION TESTING — LEAGUE-WIDE (non-Hornets) ===');
  console.log(`Games: ${nonHornets.length} | With closing spreads: ${withSpreads.length}`);
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
    padL('ATS%', 6) + ' | ' +
    padL('dMAE', 6) + ' | ' +
    padL('dSU%', 6) + ' | ' +
    padL('dATS', 6)
  );
  console.log('-'.repeat(104));

  for (const cfg of configs) {
    const m = computeMetrics(nonHornets, cfg);
    const dMAE = m.mae - baselineMetrics.mae;
    const dSU = m.suPct - baselineMetrics.suPct;
    const dATS = m.atsPct - baselineMetrics.atsPct;

    const isBaseline = cfg.name === BASELINE.name;
    const marker = isBaseline ? ' <--' : '';

    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmt(m.rmse), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(fmt(m.atsPct), 6) + ' | ' +
      padL(isBaseline ? '  ---' : fmtSign(dMAE, 2), 6) + ' | ' +
      padL(isBaseline ? '  ---' : fmtSign(dSU, 1), 6) + ' | ' +
      padL(isBaseline ? '  ---' : fmtSign(dATS, 1), 6) +
      marker
    );
  }

  // Sub-bucket ablations for key configs
  console.log('');
  console.log('=== KEY ABLATION DETAIL (mid-vs-mid games only) ===');
  const midGames = nonHornets.filter(g => {
    const hw = weightedNR(g.homeSnapshot.rollingNR, BASELINE.windowWeights);
    const aw = weightedNR(g.awaySnapshot.rollingNR, BASELINE.windowWeights);
    return hw >= -3.0 && hw < 3.0 && aw >= -3.0 && aw < 3.0;
  });

  const midConfigs = configs.filter(c =>
    c.name.includes('CURRENT') || c.name.includes('mid-vs-mid') || c.name.includes('No mid') || c.name.includes('Mid-vs-mid')
  );

  console.log(
    pad('Configuration', 32) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU%', 6) + ' | ' +
    padL('ATS%', 6) + ' | ' +
    padL('n', 4)
  );
  console.log('-'.repeat(68));

  for (const cfg of midConfigs) {
    const m = computeMetrics(midGames, cfg);
    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(m.atsTotal > 0 ? fmt(m.atsPct) : ' ---', 6) + ' | ' +
      padL(String(m.total), 4)
    );
  }

  // B2B detail
  console.log('');
  console.log('=== KEY ABLATION DETAIL (B2B games only) ===');
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
    padL('ATS%', 6) + ' | ' +
    padL('W-L', 7) + ' | ' +
    padL('n', 4)
  );
  console.log('-'.repeat(78));

  for (const cfg of b2bConfigs) {
    const m = computeMetrics(b2bGames, cfg);
    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(m.atsTotal > 0 ? fmt(m.atsPct) : ' ---', 6) + ' | ' +
      padL(m.atsTotal > 0 ? `${m.atsW}-${m.atsL}` : '---', 7) + ' | ' +
      padL(String(m.total), 4)
    );
  }

  // Market shrinkage detail
  console.log('');
  console.log('=== MARKET SHRINKAGE DETAIL ===');
  const shrinkConfigs = configs.filter(c =>
    c.name.includes('CURRENT') || c.name.includes('Shrink')
  );

  console.log(
    pad('Configuration', 32) + '| ' +
    padL('MAE', 6) + ' | ' +
    padL('Bias', 6) + ' | ' +
    padL('SU%', 6) + ' | ' +
    padL('ATS%', 6) + ' | ' +
    padL('W-L', 7) + ' | ' +
    padL('n', 4)
  );
  console.log('-'.repeat(78));

  for (const cfg of shrinkConfigs) {
    const m = computeMetrics(withSpreads, cfg);
    console.log(
      pad(cfg.name, 32) + '| ' +
      padL(fmt(m.mae), 6) + ' | ' +
      padL(fmtSign(m.bias), 6) + ' | ' +
      padL(fmt(m.suPct), 6) + ' | ' +
      padL(m.atsTotal > 0 ? fmt(m.atsPct) : ' ---', 6) + ' | ' +
      padL(m.atsTotal > 0 ? `${m.atsW}-${m.atsL}` : '---', 7) + ' | ' +
      padL(String(m.total), 4)
    );
  }

  console.log('');
}

main();
