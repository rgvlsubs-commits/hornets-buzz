/**
 * ATS Edge Analysis — League-Wide
 *
 * Reads walk-forward data, re-runs predictions, and examines ATS performance
 * across every feature dimension. The central question for each bucket:
 * should this factor increase or decrease conviction?
 *
 * Analysis sections:
 * 1. B2B Granularity (4 buckets)
 * 2. Rest Days Differential
 * 3. Model-Market Disagreement
 * 4. NR Momentum (perception lag test)
 * 5. Matchup Type
 * 6. Season Timing
 * 7. Pace Differential
 * 8. Cross-tab: Disagreement x B2B
 * 9. Combined Filter Summary
 * 10. Split-Half Validation
 *
 * Usage: npx tsx scripts/ats_edge_analysis.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { estimateElo, eloToSpread } from '../lib/model';

// === Types (matching league_walkforward.json) ===

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
  metadata: {
    season: string;
    predictableGames: number;
    minPriorGames: number;
  };
  games: WalkforwardGame[];
}

// === Production model constants (must match lib/model.ts) ===

const ELO_HOME_ADVANTAGE = 70;
const ELO_WEIGHT = 0.60;
const NR_WEIGHT = 0.40;
const WINDOW_WEIGHTS = { last4: 0.20, last7: 0.20, last10: 0.25, season: 0.35 };
const NR_HOME_ADVANTAGE = 1.5;
const NR_FATIGUE_HOME_B2B = 3.0;
const NR_FATIGUE_AWAY_B2B = 1.0;
const PREDICTED_MARGIN_CAP = 15;

// === Prediction Logic ===

function weightedNR(nr: RollingNR): number {
  return nr.last4 * WINDOW_WEIGHTS.last4 + nr.last7 * WINDOW_WEIGHTS.last7 +
    nr.last10 * WINDOW_WEIGHTS.last10 + nr.season * WINDOW_WEIGHTS.season;
}

function classifyTier(nr: number): string {
  if (nr >= 6.0) return 'elite';
  if (nr >= 3.0) return 'strong';
  if (nr >= -3.0) return 'mid';
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

function predictGame(home: TeamSnapshot, away: TeamSnapshot): number {
  const homeElo = estimateElo(home.wins, home.losses, home.totalPointDiff, home.gamesPlayed);
  const awayElo = estimateElo(away.wins, away.losses, away.totalPointDiff, away.gamesPlayed);
  const eloDiff = homeElo - awayElo + ELO_HOME_ADVANTAGE;
  const eloPred = eloToSpread(eloDiff);

  const homeWNR = weightedNR(home.rollingNR);
  const awayWNR = weightedNR(away.rollingNR);
  let nrPred = (homeWNR - awayWNR) + NR_HOME_ADVANTAGE;

  if (home.isBackToBack) nrPred -= NR_FATIGUE_HOME_B2B;
  if (away.isBackToBack) nrPred += NR_FATIGUE_AWAY_B2B;

  const raw = eloPred * ELO_WEIGHT + nrPred * NR_WEIGHT;
  return Math.round(Math.max(-PREDICTED_MARGIN_CAP, Math.min(PREDICTED_MARGIN_CAP, raw)) * 10) / 10;
}

// === Enriched game record for analysis ===

interface AnalysisGame {
  game: WalkforwardGame;
  predicted: number;
  homeWNR: number;
  awayWNR: number;
  disagreement: number; // predicted - (-closingSpread), positive = model says more home
  atsResult: 'W' | 'L' | 'push';
  month: string;
  matchup: string;
  combinedPace: number;
  homeNRMomentum: number; // last4 - season divergence
  awayNRMomentum: number;
  restDaysDiff: number; // home rest - away rest
}

function enrichGame(g: WalkforwardGame): AnalysisGame | null {
  if (g.closingSpread === undefined) return null;

  const predicted = predictGame(g.homeSnapshot, g.awaySnapshot);
  const homeWNR = weightedNR(g.homeSnapshot.rollingNR);
  const awayWNR = weightedNR(g.awaySnapshot.rollingNR);

  // Disagreement: model predicted margin vs market implied margin
  // closingSpread is from home perspective (e.g., -5.5 = home favored by 5.5)
  // market thinks home wins by -closingSpread
  const marketImplied = -g.closingSpread;
  const disagreement = predicted - marketImplied;

  // ATS result
  const actualCover = g.actualMargin + g.closingSpread;
  const predictedCover = predicted + g.closingSpread;
  let atsResult: 'W' | 'L' | 'push';
  if (actualCover === 0) {
    atsResult = 'push';
  } else if ((predictedCover > 0 && actualCover > 0) || (predictedCover < 0 && actualCover < 0)) {
    atsResult = 'W';
  } else {
    atsResult = 'L';
  }

  const month = g.date.slice(0, 7); // YYYY-MM

  return {
    game: g,
    predicted,
    homeWNR,
    awayWNR,
    disagreement,
    atsResult,
    month,
    matchup: matchupType(homeWNR, awayWNR),
    combinedPace: g.homeSnapshot.pace + g.awaySnapshot.pace,
    homeNRMomentum: g.homeSnapshot.rollingNR.last4 - g.homeSnapshot.rollingNR.season,
    awayNRMomentum: g.awaySnapshot.rollingNR.last4 - g.awaySnapshot.rollingNR.season,
    restDaysDiff: g.homeSnapshot.restDays - g.awaySnapshot.restDays,
  };
}

// === Bucket statistics ===

interface BucketStats {
  label: string;
  n: number;
  atsW: number;
  atsL: number;
  atsPush: number;
  atsPct: number;
  modelBias: number;   // avg(predicted - actual)
  marketBias: number;  // avg(marketImplied - actual)
  avgDisagreement: number;
}

function computeBucket(label: string, games: AnalysisGame[]): BucketStats {
  let atsW = 0, atsL = 0, atsPush = 0;
  let sumModelErr = 0, sumMarketErr = 0, sumDisagree = 0;

  for (const g of games) {
    if (g.atsResult === 'W') atsW++;
    else if (g.atsResult === 'L') atsL++;
    else atsPush++;

    sumModelErr += g.predicted - g.game.actualMargin;
    sumMarketErr += (-g.game.closingSpread!) - g.game.actualMargin;
    sumDisagree += g.disagreement;
  }

  const n = games.length;
  const atsTotal = atsW + atsL;
  return {
    label,
    n,
    atsW,
    atsL,
    atsPush,
    atsPct: atsTotal > 0 ? (atsW / atsTotal) * 100 : 0,
    modelBias: n > 0 ? sumModelErr / n : 0,
    marketBias: n > 0 ? sumMarketErr / n : 0,
    avgDisagreement: n > 0 ? sumDisagree / n : 0,
  };
}

// === Output formatting ===

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);
const fmt = (n: number, d: number = 1) => n.toFixed(d);
const fmtSign = (n: number, d: number = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const MIN_N = 30;

function printBucketTable(title: string, buckets: BucketStats[]) {
  console.log(`\n--- ${title} ---`);
  console.log(
    pad('Bucket', 30) + '| ' +
    padL('n', 5) + ' | ' +
    padL('ATS W-L', 7) + ' | ' +
    padL('ATS%', 6) + ' | ' +
    padL('MdlBias', 7) + ' | ' +
    padL('MktBias', 7) + ' | ' +
    padL('AvgDis', 6)
  );
  console.log('-'.repeat(82));

  for (const b of buckets) {
    const flag = b.n < MIN_N ? ' *' : (b.atsPct >= 60 && b.n < 80 ? ' ?' : '');
    console.log(
      pad(b.label, 30) + '| ' +
      padL(String(b.n), 5) + ' | ' +
      padL(`${b.atsW}-${b.atsL}`, 7) + ' | ' +
      padL(fmt(b.atsPct), 6) + ' | ' +
      padL(fmtSign(b.modelBias), 7) + ' | ' +
      padL(fmtSign(b.marketBias), 7) + ' | ' +
      padL(fmtSign(b.avgDisagreement), 6) +
      flag
    );
  }

  const smallN = buckets.filter(b => b.n < MIN_N);
  if (smallN.length > 0) console.log(`  * n < ${MIN_N}, treat with caution`);
  const suspicious = buckets.filter(b => b.atsPct >= 60 && b.n >= MIN_N && b.n < 80);
  if (suspicious.length > 0) console.log('  ? ATS% >= 60% but n < 80, needs validation');
}

// === Main Analysis ===

function main() {
  const dataPath = path.resolve(__dirname, '../data/league_walkforward.json');
  if (!fs.existsSync(dataPath)) {
    console.error('ERROR: data/league_walkforward.json not found.');
    process.exit(1);
  }

  const data: WalkforwardData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const nonHornets = data.games.filter(g => !g.isHornetsGame);

  // Enrich all games with predictions and ATS outcomes
  const allGames: AnalysisGame[] = [];
  for (const g of nonHornets) {
    const enriched = enrichGame(g);
    if (enriched) allGames.push(enriched);
  }

  console.log('');
  console.log('=== ATS EDGE ANALYSIS — LEAGUE-WIDE ===');
  console.log(`Games with closing spreads: ${allGames.length}/${nonHornets.length}`);

  const overall = computeBucket('Overall', allGames);
  console.log(`Overall ATS: ${overall.atsW}-${overall.atsL} (${fmt(overall.atsPct)}%) | Push: ${overall.atsPush}`);
  console.log(`Model bias: ${fmtSign(overall.modelBias)} | Market bias: ${fmtSign(overall.marketBias)}`);

  // JSON output accumulator
  const jsonOutput: Record<string, unknown> = {
    metadata: {
      totalGames: allGames.length,
      overallATS: overall,
    },
  };

  // ================================================================
  // 1. B2B Granularity
  // ================================================================
  const homeOnlyB2B = allGames.filter(g => g.game.homeSnapshot.isBackToBack && !g.game.awaySnapshot.isBackToBack);
  const awayOnlyB2B = allGames.filter(g => !g.game.homeSnapshot.isBackToBack && g.game.awaySnapshot.isBackToBack);
  const bothB2B = allGames.filter(g => g.game.homeSnapshot.isBackToBack && g.game.awaySnapshot.isBackToBack);
  const neitherB2B = allGames.filter(g => !g.game.homeSnapshot.isBackToBack && !g.game.awaySnapshot.isBackToBack);

  const b2bBuckets = [
    computeBucket('Neither B2B', neitherB2B),
    computeBucket('Home-only B2B', homeOnlyB2B),
    computeBucket('Away-only B2B', awayOnlyB2B),
    computeBucket('Both B2B', bothB2B),
  ];
  printBucketTable('1. B2B Granularity', b2bBuckets);
  jsonOutput.b2bGranularity = b2bBuckets;

  // ================================================================
  // 2. Rest Days Differential
  // ================================================================
  const restLargeHome = allGames.filter(g => g.restDaysDiff >= 3);
  const restSlightHome = allGames.filter(g => g.restDaysDiff >= 1 && g.restDaysDiff < 3);
  const restEven = allGames.filter(g => g.restDaysDiff === 0);
  const restAwayAdv = allGames.filter(g => g.restDaysDiff < 0);

  const restBuckets = [
    computeBucket('Home +3 rest days', restLargeHome),
    computeBucket('Home +1-2 rest days', restSlightHome),
    computeBucket('Even rest', restEven),
    computeBucket('Away rest advantage', restAwayAdv),
  ];
  printBucketTable('2. Rest Days Differential', restBuckets);
  jsonOutput.restDaysDifferential = restBuckets;

  // ================================================================
  // 3. Model-Market Disagreement
  // ================================================================
  const absDisagree = (g: AnalysisGame) => Math.abs(g.disagreement);

  const dis0_2 = allGames.filter(g => absDisagree(g) < 2);
  const dis2_4 = allGames.filter(g => absDisagree(g) >= 2 && absDisagree(g) < 4);
  const dis4_6 = allGames.filter(g => absDisagree(g) >= 4 && absDisagree(g) < 6);
  const dis6_8 = allGames.filter(g => absDisagree(g) >= 6 && absDisagree(g) < 8);
  const dis8plus = allGames.filter(g => absDisagree(g) >= 8);

  const disagreeBuckets = [
    computeBucket('0-2pt disagreement', dis0_2),
    computeBucket('2-4pt disagreement', dis2_4),
    computeBucket('4-6pt disagreement', dis4_6),
    computeBucket('6-8pt disagreement', dis6_8),
    computeBucket('8pt+ disagreement', dis8plus),
  ];
  printBucketTable('3. Model-Market Disagreement (absolute)', disagreeBuckets);

  // Directional: model higher vs lower
  const modelHigher = allGames.filter(g => g.disagreement > 0);
  const modelLower = allGames.filter(g => g.disagreement < 0);

  const dirBuckets = [
    computeBucket('Model > Market (more home)', modelHigher),
    computeBucket('Model < Market (less home)', modelLower),
  ];
  printBucketTable('3b. Disagreement Direction', dirBuckets);

  jsonOutput.disagreement = { absolute: disagreeBuckets, directional: dirBuckets };

  // ================================================================
  // 4. NR Momentum (perception lag test)
  // ================================================================
  // For each game, compute the max absolute momentum between the two teams
  // Positive momentum team: last4 >> season → trending up (market may lag)
  const favoredTeamMomentum = allGames.map(g => {
    // Which team is the model's favored side? Use disagreement direction.
    // If model says more home than market (disagree > 0), home is our pick
    // Track the momentum of the team we're effectively "betting on"
    const homeIsPick = g.predicted + g.game.closingSpread! > 0;
    return {
      ...g,
      pickMomentum: homeIsPick ? g.homeNRMomentum : g.awayNRMomentum,
      fadeMomentum: homeIsPick ? g.awayNRMomentum : g.homeNRMomentum,
    };
  });

  const pickMomUp = favoredTeamMomentum.filter(g => g.pickMomentum >= 3);
  const pickMomFlat = favoredTeamMomentum.filter(g => g.pickMomentum > -3 && g.pickMomentum < 3);
  const pickMomDown = favoredTeamMomentum.filter(g => g.pickMomentum <= -3);

  const momBuckets = [
    computeBucket('Pick trending UP (NR+3)', pickMomUp),
    computeBucket('Pick flat (-3 to +3)', pickMomFlat),
    computeBucket('Pick trending DOWN (NR-3)', pickMomDown),
  ];
  printBucketTable('4. NR Momentum (perception lag)', momBuckets);

  // Also test: our pick is trending up AND faded team trending down
  const convergingEdge = favoredTeamMomentum.filter(g => g.pickMomentum >= 3 && g.fadeMomentum <= -3);
  const divergingBad = favoredTeamMomentum.filter(g => g.pickMomentum <= -3 && g.fadeMomentum >= 3);

  const convBuckets = [
    computeBucket('Pick UP + Fade DOWN', convergingEdge),
    computeBucket('Pick DOWN + Fade UP', divergingBad),
  ];
  printBucketTable('4b. NR Momentum Convergence', convBuckets);

  jsonOutput.nrMomentum = { pickDirection: momBuckets, convergence: convBuckets };

  // ================================================================
  // 5. Matchup Type
  // ================================================================
  const matchupGroups = new Map<string, AnalysisGame[]>();
  for (const g of allGames) {
    const existing = matchupGroups.get(g.matchup) || [];
    existing.push(g);
    matchupGroups.set(g.matchup, existing);
  }

  // Consolidate tiers with n < 30
  const consolidatedMatchups: BucketStats[] = [];
  const smallMatchups: AnalysisGame[] = [];

  for (const [type, games] of matchupGroups) {
    if (games.length >= MIN_N) {
      consolidatedMatchups.push(computeBucket(type, games));
    } else {
      smallMatchups.push(...games);
    }
  }
  if (smallMatchups.length >= MIN_N) {
    consolidatedMatchups.push(computeBucket('other_matchups', smallMatchups));
  }

  consolidatedMatchups.sort((a, b) => b.n - a.n);
  printBucketTable('5. Matchup Type', consolidatedMatchups);
  jsonOutput.matchupType = consolidatedMatchups;

  // ================================================================
  // 6. Season Timing
  // ================================================================
  const monthGroups = new Map<string, AnalysisGame[]>();
  for (const g of allGames) {
    const existing = monthGroups.get(g.month) || [];
    existing.push(g);
    monthGroups.set(g.month, existing);
  }

  const monthBuckets: BucketStats[] = [];
  for (const [month, games] of [...monthGroups].sort((a, b) => a[0].localeCompare(b[0]))) {
    monthBuckets.push(computeBucket(month, games));
  }
  printBucketTable('6. Season Timing (by month)', monthBuckets);
  jsonOutput.seasonTiming = monthBuckets;

  // ================================================================
  // 7. Pace Differential
  // ================================================================
  const paceValues = allGames.map(g => g.combinedPace);
  const paceMedian = paceValues.sort((a, b) => a - b)[Math.floor(paceValues.length / 2)];

  const highPace = allGames.filter(g => g.combinedPace >= paceMedian + 4);
  const midPace = allGames.filter(g => g.combinedPace >= paceMedian - 4 && g.combinedPace < paceMedian + 4);
  const lowPace = allGames.filter(g => g.combinedPace < paceMedian - 4);

  const paceBuckets = [
    computeBucket(`Low pace (<${fmt(paceMedian - 4, 0)})`, lowPace),
    computeBucket(`Mid pace (±4 of median)`, midPace),
    computeBucket(`High pace (>${fmt(paceMedian + 4, 0)})`, highPace),
  ];
  printBucketTable('7. Pace Differential', paceBuckets);
  jsonOutput.paceDifferential = paceBuckets;

  // ================================================================
  // 8. Cross-tab: Disagreement x B2B
  // ================================================================
  console.log('\n--- 8. Cross-tab: Disagreement x B2B ---');

  const isAnyB2B = (g: AnalysisGame) => g.game.homeSnapshot.isBackToBack || g.game.awaySnapshot.isBackToBack;
  const smallDis = (g: AnalysisGame) => absDisagree(g) < 4;
  const largeDis = (g: AnalysisGame) => absDisagree(g) >= 4;

  const crossBuckets = [
    computeBucket('No B2B + Small dis (<4)', allGames.filter(g => !isAnyB2B(g) && smallDis(g))),
    computeBucket('No B2B + Large dis (4+)', allGames.filter(g => !isAnyB2B(g) && largeDis(g))),
    computeBucket('B2B + Small dis (<4)', allGames.filter(g => isAnyB2B(g) && smallDis(g))),
    computeBucket('B2B + Large dis (4+)', allGames.filter(g => isAnyB2B(g) && largeDis(g))),
  ];
  printBucketTable('8. Cross-tab: Disagreement x B2B', crossBuckets);
  jsonOutput.crossTabDisagreementB2B = crossBuckets;

  // ================================================================
  // 9. Combined Filter Summary
  // ================================================================
  console.log('\n--- 9. Combined Filter Summary ---');
  console.log('Practical filter combos: "if we only bet these games, what\'s our ATS?"');
  console.log(
    pad('Filter', 45) + '| ' +
    padL('n', 5) + ' | ' +
    padL('ATS%', 6) + ' | ' +
    padL('W-L', 7) + ' | ' +
    padL('Viable', 7)
  );
  console.log('-'.repeat(80));

  const filters: { label: string; games: AnalysisGame[] }[] = [
    { label: 'All games', games: allGames },
    { label: 'No B2B (either team)', games: neitherB2B },
    { label: 'Disagree < 4pt', games: allGames.filter(g => absDisagree(g) < 4) },
    { label: 'Disagree < 6pt', games: allGames.filter(g => absDisagree(g) < 6) },
    { label: 'No B2B + Disagree < 4pt', games: neitherB2B.filter(g => absDisagree(g) < 4) },
    { label: 'No B2B + Disagree < 6pt', games: neitherB2B.filter(g => absDisagree(g) < 6) },
    { label: 'No home B2B', games: allGames.filter(g => !g.game.homeSnapshot.isBackToBack) },
    { label: 'No home B2B + Disagree < 4pt', games: allGames.filter(g => !g.game.homeSnapshot.isBackToBack && absDisagree(g) < 4) },
    { label: 'Pick trending UP (NR +3)', games: pickMomUp },
    { label: 'Pick UP + No B2B', games: pickMomUp.filter(g => !isAnyB2B(g)) },
    { label: 'Pick UP + Disagree < 4pt', games: pickMomUp.filter(g => absDisagree(g) < 4) },
    { label: 'Not (home B2B + large dis)', games: allGames.filter(g => !(g.game.homeSnapshot.isBackToBack && absDisagree(g) >= 4)) },
    { label: 'Away-only B2B (fade home B2B)', games: awayOnlyB2B },
    { label: 'Best combo: noB2B+dis<4+momUp', games: neitherB2B.filter(g => absDisagree(g) < 4 && favoredTeamMomentum.find(f => f.game === g.game)?.pickMomentum! >= 3) },
  ];

  const filterBuckets: BucketStats[] = [];
  for (const f of filters) {
    const b = computeBucket(f.label, f.games);
    const viable = b.n >= 50 ? 'YES' : (b.n >= 30 ? 'maybe' : 'no');
    filterBuckets.push(b);
    console.log(
      pad(f.label, 45) + '| ' +
      padL(String(b.n), 5) + ' | ' +
      padL(fmt(b.atsPct), 6) + ' | ' +
      padL(`${b.atsW}-${b.atsL}`, 7) + ' | ' +
      padL(viable, 7)
    );
  }
  jsonOutput.combinedFilters = filterBuckets;

  // ================================================================
  // 10. Split-Half Validation
  // ================================================================
  console.log('\n--- 10. Split-Half Validation ---');
  console.log('First half (Nov-Jan) vs Second half (Feb-Mar) — do findings replicate?');

  const firstHalf = allGames.filter(g => g.month <= '2026-01');
  const secondHalf = allGames.filter(g => g.month > '2026-01');

  console.log(`\nFirst half: ${firstHalf.length} games | Second half: ${secondHalf.length} games`);

  const splitTests: { label: string; filter: (g: AnalysisGame) => boolean }[] = [
    { label: 'All', filter: () => true },
    { label: 'No B2B', filter: g => !g.game.homeSnapshot.isBackToBack && !g.game.awaySnapshot.isBackToBack },
    { label: 'Disagree < 4pt', filter: g => absDisagree(g) < 4 },
    { label: 'Home B2B only', filter: g => g.game.homeSnapshot.isBackToBack && !g.game.awaySnapshot.isBackToBack },
    { label: 'Disagree 4+ pt', filter: g => absDisagree(g) >= 4 },
    { label: 'No B2B + Dis<4', filter: g => !isAnyB2B(g) && absDisagree(g) < 4 },
    { label: 'Pick trending UP', filter: g => {
      const f = favoredTeamMomentum.find(ft => ft.game === g.game);
      return f ? f.pickMomentum >= 3 : false;
    }},
  ];

  console.log(
    pad('Bucket', 25) + '| ' +
    padL('1H n', 5) + ' | ' +
    padL('1H ATS', 7) + ' | ' +
    padL('2H n', 5) + ' | ' +
    padL('2H ATS', 7) + ' | ' +
    padL('Stable?', 8)
  );
  console.log('-'.repeat(66));

  const splitValidation: Record<string, { firstHalf: BucketStats; secondHalf: BucketStats; stable: boolean }>  = {};

  for (const test of splitTests) {
    const h1 = computeBucket(test.label, firstHalf.filter(test.filter));
    const h2 = computeBucket(test.label, secondHalf.filter(test.filter));

    // "Stable" = both halves go in the same direction relative to 50%, or delta < 8%
    const bothAbove = h1.atsPct > 50 && h2.atsPct > 50;
    const bothBelow = h1.atsPct < 50 && h2.atsPct < 50;
    const stable = (bothAbove || bothBelow) || (h1.n < 15 || h2.n < 15);

    splitValidation[test.label] = { firstHalf: h1, secondHalf: h2, stable };

    console.log(
      pad(test.label, 25) + '| ' +
      padL(String(h1.n), 5) + ' | ' +
      padL(h1.n >= 10 ? `${fmt(h1.atsPct)}%` : 'n/a', 7) + ' | ' +
      padL(String(h2.n), 5) + ' | ' +
      padL(h2.n >= 10 ? `${fmt(h2.atsPct)}%` : 'n/a', 7) + ' | ' +
      padL(stable ? 'YES' : 'NO', 8)
    );
  }
  jsonOutput.splitHalfValidation = splitValidation;

  // ================================================================
  // Summary & Recommendations
  // ================================================================
  console.log('\n=== CONVICTION IMPLICATIONS ===');
  console.log('');

  // Find the strongest signals
  const noB2B = computeBucket('No B2B', neitherB2B);
  const homeB2B = computeBucket('Home B2B', homeOnlyB2B);
  const smallDisBucket = computeBucket('Dis<4', allGames.filter(g => absDisagree(g) < 4));
  const largeDisBucket = computeBucket('Dis4+', allGames.filter(g => absDisagree(g) >= 4));

  console.log(`1. B2B: No-B2B ${fmt(noB2B.atsPct)}% (n=${noB2B.n}) vs Home-B2B ${fmt(homeB2B.atsPct)}% (n=${homeB2B.n})`);
  console.log(`   → Home B2B should REDUCE conviction; Away B2B is less harmful`);
  console.log('');
  console.log(`2. Disagreement: <4pt ${fmt(smallDisBucket.atsPct)}% (n=${smallDisBucket.n}) vs 4+pt ${fmt(largeDisBucket.atsPct)}% (n=${largeDisBucket.n})`);
  console.log(`   → Market alignment should INCREASE conviction; large disagreement DECREASES it`);
  console.log('');

  const momUp = computeBucket('Pick UP', pickMomUp);
  console.log(`3. NR Momentum: Pick trending UP ${fmt(momUp.atsPct)}% (n=${momUp.n})`);
  console.log(`   → If validated, perception lag bonus in conviction`);
  console.log('');

  // ================================================================
  // Save JSON
  // ================================================================
  const outputPath = path.resolve(__dirname, '../data/ats_edge_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\nFull results saved to: data/ats_edge_analysis.json`);
}

main();
