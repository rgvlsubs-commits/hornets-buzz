const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/hornets_buzz.json', 'utf8'));

// Constants
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;
const NR_HOME_ADVANTAGE = 2.0;
const TRADE_DEADLINE_ADJ = -0.75;
const MOMENTUM_MULTIPLIER = 0.4;
const MID_TIER_ADJ = -1.0;
const ELO_HOME_ADVANTAGE = 70;
const ELO_TO_SPREAD = 28;
const ELO_INITIAL = 1500;

// Weight schemes to test
const schemes = {
  'Current (30/25/25/20)': { last4: 0.30, last7: 0.25, last10: 0.25, season: 0.20 },
  'Equal (25/25/25/25)': { last4: 0.25, last7: 0.25, last10: 0.25, season: 0.25 },
  'Flatter (20/25/25/30)': { last4: 0.20, last7: 0.25, last10: 0.25, season: 0.30 },
  'Season-heavy (15/20/25/40)': { last4: 0.15, last7: 0.20, last10: 0.25, season: 0.40 },
  'Minimal recency (10/15/25/50)': { last4: 0.10, last7: 0.15, last10: 0.25, season: 0.50 },
};

// Elo estimation
function estimateElo(wins, pointDiff, games) {
  if (games === 0) return 1500;
  const winPct = wins / games;
  if (winPct <= 0 || winPct >= 1) return 1500;
  const eloFromWinPct = 1504.6 - 450 * Math.log10((1 / winPct) - 1);
  const avgPointDiff = pointDiff / games;
  const eloFromPointDiff = 1500 + avgPointDiff * 10;
  const pointDiffWeight = Math.max(0.6, 0.8 - games / 200);
  return (1 - pointDiffWeight) * eloFromWinPct + pointDiffWeight * eloFromPointDiff;
}

// Get games sorted oldest first for backtesting
const allGames = [...data.games].reverse();

// Results storage
const results = {};
for (const schemeName of Object.keys(schemes)) {
  results[schemeName] = {
    all: { predictions: [], atsWins: 0, atsLosses: 0 },
    core5: { predictions: [], atsWins: 0, atsLosses: 0 },
  };
}

// Also test without momentum
results['Current NO momentum'] = {
  all: { predictions: [], atsWins: 0, atsLosses: 0 },
  core5: { predictions: [], atsWins: 0, atsLosses: 0 },
};

// Backtest each game
for (let i = 10; i < allGames.length; i++) {
  const game = allGames[i];
  if (game.spread === undefined || game.spread === null) continue;

  // Get prior games (only games BEFORE this one)
  const priorGames = allGames.slice(0, i);
  const priorQualified = priorGames.filter(g => g.isQualified);

  if (priorQualified.length < 4) continue;

  // Calculate rolling NRs from prior qualified games (most recent first)
  const recentQualified = [...priorQualified].reverse();
  const last4 = recentQualified.slice(0, 4);
  const last7 = recentQualified.slice(0, Math.min(7, recentQualified.length));
  const last10 = recentQualified.slice(0, Math.min(10, recentQualified.length));

  const last4NR = last4.reduce((s, g) => s + g.netRating, 0) / last4.length;
  const last7NR = last7.reduce((s, g) => s + g.netRating, 0) / last7.length;
  const last10NR = last10.reduce((s, g) => s + g.netRating, 0) / last10.length;
  const seasonNR = recentQualified.reduce((s, g) => s + g.netRating, 0) / recentQualified.length;

  // Opponent info
  const oppNR = game.opponentNetRating || 0;
  const oppElo = ELO_INITIAL + oppNR * 10;
  const isMidTier = oppNR >= -3.0 && oppNR < 3.0;
  const midTierAdj = isMidTier ? MID_TIER_ADJ : 0;

  // Momentum
  const momentum = Math.max(-10, Math.min(10, (last4NR - last10NR) * 0.8));
  const momentumImpact = momentum * MOMENTUM_MULTIPLIER;

  // Elo from prior games
  const priorWins = priorGames.filter(g => g.result === 'W').length;
  const priorPointDiff = priorGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
  const hornetsElo = estimateElo(priorWins, priorPointDiff, priorGames.length);
  const eloDiff = hornetsElo - oppElo + (game.isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE);
  const eloPred = eloDiff / ELO_TO_SPREAD;

  // Actual result
  const actualMargin = game.hornetsScore - game.opponentScore;
  const actualCovered = actualMargin + game.spread > 0;

  // Test each weight scheme
  for (const [schemeName, weights] of Object.entries(schemes)) {
    const weightedNR = last4NR * weights.last4 + last7NR * weights.last7 +
                       last10NR * weights.last10 + seasonNR * weights.season;

    const homeAdj = game.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;
    const nrPred = weightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj;
    const predictedMargin = eloPred * ELO_WEIGHT + nrPred * NR_WEIGHT;

    const error = Math.abs(predictedMargin - actualMargin);
    const predictedCover = predictedMargin + game.spread > 0;
    const atsCorrect = predictedCover === actualCovered;

    results[schemeName].all.predictions.push({ error, atsCorrect, predictedMargin, actualMargin });
    if (atsCorrect) results[schemeName].all.atsWins++;
    else results[schemeName].all.atsLosses++;

    if (game.isQualified) {
      results[schemeName].core5.predictions.push({ error, atsCorrect });
      if (atsCorrect) results[schemeName].core5.atsWins++;
      else results[schemeName].core5.atsLosses++;
    }
  }

  // Test without momentum (current weights)
  const weights = schemes['Current (30/25/25/20)'];
  const weightedNR = last4NR * weights.last4 + last7NR * weights.last7 +
                     last10NR * weights.last10 + seasonNR * weights.season;
  const homeAdj = game.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;
  const nrPredNoMom = weightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + midTierAdj;
  const predictedMarginNoMom = eloPred * ELO_WEIGHT + nrPredNoMom * NR_WEIGHT;

  const errorNoMom = Math.abs(predictedMarginNoMom - actualMargin);
  const predictedCoverNoMom = predictedMarginNoMom + game.spread > 0;
  const atsCorrectNoMom = predictedCoverNoMom === actualCovered;

  results['Current NO momentum'].all.predictions.push({ error: errorNoMom, atsCorrect: atsCorrectNoMom });
  if (atsCorrectNoMom) results['Current NO momentum'].all.atsWins++;
  else results['Current NO momentum'].all.atsLosses++;

  if (game.isQualified) {
    results['Current NO momentum'].core5.predictions.push({ error: errorNoMom, atsCorrect: atsCorrectNoMom });
    if (atsCorrectNoMom) results['Current NO momentum'].core5.atsWins++;
    else results['Current NO momentum'].core5.atsLosses++;
  }
}

// Print results
console.log('=== HORNETS BACKTEST RESULTS ===');
console.log('(Using only prior data for each prediction - no look-ahead bias)\n');

console.log('ALL GAMES:');
console.log('-'.repeat(75));
console.log('Scheme                       | MAE    | ATS Record | ATS %  | Edge vs 52.4%');
console.log('-'.repeat(75));

for (const [name, data] of Object.entries(results)) {
  const mae = data.all.predictions.reduce((s, p) => s + p.error, 0) / data.all.predictions.length;
  const atsTotal = data.all.atsWins + data.all.atsLosses;
  const atsPct = (data.all.atsWins / atsTotal * 100);
  const edge = atsPct - 52.4;
  console.log(name.padEnd(28) + ' | ' + mae.toFixed(1).padStart(5) + ' | ' +
              (data.all.atsWins + '-' + data.all.atsLosses).padStart(10) + ' | ' +
              atsPct.toFixed(1).padStart(5) + '% | ' + (edge > 0 ? '+' : '') + edge.toFixed(1) + '%');
}

console.log('\nCORE 5 GAMES ONLY:');
console.log('-'.repeat(75));
console.log('Scheme                       | MAE    | ATS Record | ATS %  | Edge vs 52.4%');
console.log('-'.repeat(75));

for (const [name, data] of Object.entries(results)) {
  if (data.core5.predictions.length === 0) continue;
  const mae = data.core5.predictions.reduce((s, p) => s + p.error, 0) / data.core5.predictions.length;
  const atsTotal = data.core5.atsWins + data.core5.atsLosses;
  const atsPct = (data.core5.atsWins / atsTotal * 100);
  const edge = atsPct - 52.4;
  console.log(name.padEnd(28) + ' | ' + mae.toFixed(1).padStart(5) + ' | ' +
              (data.core5.atsWins + '-' + data.core5.atsLosses).padStart(10) + ' | ' +
              atsPct.toFixed(1).padStart(5) + '% | ' + (edge > 0 ? '+' : '') + edge.toFixed(1) + '%');
}

console.log('\n52.4% is breakeven after vig (-110 odds)');
console.log('Sample size: ' + results['Current (30/25/25/20)'].all.predictions.length + ' total games, ' +
            results['Current (30/25/25/20)'].core5.predictions.length + ' Core 5 games');
