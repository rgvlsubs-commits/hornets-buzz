const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/hornets_buzz.json', 'utf8'));

// Analyze when momentum helps vs hurts
const allGames = [...data.games].reverse();

console.log('=== MOMENTUM IMPACT ANALYSIS ===\n');

// Track predictions with and without momentum
const results = {
  withMomentum: { correct: 0, wrong: 0, predictions: [] },
  noMomentum: { correct: 0, wrong: 0, predictions: [] },
};

// Group by momentum direction
const momentumGroups = {
  positive: { withMom: 0, noMom: 0, total: 0 },
  negative: { withMom: 0, noMom: 0, total: 0 },
  neutral: { withMom: 0, noMom: 0, total: 0 },
};

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
const weights = { last4: 0.30, last7: 0.25, last10: 0.25, season: 0.20 };

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

for (let i = 10; i < allGames.length; i++) {
  const game = allGames[i];
  if (game.spread === undefined || game.spread === null) continue;

  const priorGames = allGames.slice(0, i);
  const priorQualified = priorGames.filter(g => g.isQualified);
  if (priorQualified.length < 4) continue;

  const recentQualified = [...priorQualified].reverse();
  const last4 = recentQualified.slice(0, 4);
  const last7 = recentQualified.slice(0, Math.min(7, recentQualified.length));
  const last10 = recentQualified.slice(0, Math.min(10, recentQualified.length));

  const last4NR = last4.reduce((s, g) => s + g.netRating, 0) / last4.length;
  const last7NR = last7.reduce((s, g) => s + g.netRating, 0) / last7.length;
  const last10NR = last10.reduce((s, g) => s + g.netRating, 0) / last10.length;
  const seasonNR = recentQualified.reduce((s, g) => s + g.netRating, 0) / recentQualified.length;

  const oppNR = game.opponentNetRating || 0;
  const oppElo = ELO_INITIAL + oppNR * 10;
  const isMidTier = oppNR >= -3.0 && oppNR < 3.0;
  const midTierAdj = isMidTier ? MID_TIER_ADJ : 0;

  const momentum = Math.max(-10, Math.min(10, (last4NR - last10NR) * 0.8));
  const momentumImpact = momentum * MOMENTUM_MULTIPLIER;

  const priorWins = priorGames.filter(g => g.result === 'W').length;
  const priorPointDiff = priorGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
  const hornetsElo = estimateElo(priorWins, priorPointDiff, priorGames.length);
  const eloDiff = hornetsElo - oppElo + (game.isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE);
  const eloPred = eloDiff / ELO_TO_SPREAD;

  const weightedNR = last4NR * weights.last4 + last7NR * weights.last7 +
                     last10NR * weights.last10 + seasonNR * weights.season;
  const homeAdj = game.isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;

  // With momentum
  const nrPredWithMom = weightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj;
  const predictedWithMom = eloPred * ELO_WEIGHT + nrPredWithMom * NR_WEIGHT;

  // Without momentum
  const nrPredNoMom = weightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + midTierAdj;
  const predictedNoMom = eloPred * ELO_WEIGHT + nrPredNoMom * NR_WEIGHT;

  const actualMargin = game.hornetsScore - game.opponentScore;
  const actualCovered = actualMargin + game.spread > 0;

  const predictedCoverWithMom = predictedWithMom + game.spread > 0;
  const predictedCoverNoMom = predictedNoMom + game.spread > 0;

  const correctWithMom = predictedCoverWithMom === actualCovered;
  const correctNoMom = predictedCoverNoMom === actualCovered;

  if (correctWithMom) results.withMomentum.correct++;
  else results.withMomentum.wrong++;
  if (correctNoMom) results.noMomentum.correct++;
  else results.noMomentum.wrong++;

  // Track by momentum direction
  let group;
  if (momentum > 1) group = 'positive';
  else if (momentum < -1) group = 'negative';
  else group = 'neutral';

  momentumGroups[group].total++;
  if (correctWithMom) momentumGroups[group].withMom++;
  if (correctNoMom) momentumGroups[group].noMom++;

  // Store details for analysis
  results.withMomentum.predictions.push({
    date: game.date,
    opponent: game.opponent,
    momentum: momentum.toFixed(1),
    predicted: predictedWithMom.toFixed(1),
    actual: actualMargin,
    spread: game.spread,
    correct: correctWithMom,
  });
}

console.log('OVERALL COMPARISON:');
console.log('-'.repeat(50));
const withMomPct = results.withMomentum.correct / (results.withMomentum.correct + results.withMomentum.wrong) * 100;
const noMomPct = results.noMomentum.correct / (results.noMomentum.correct + results.noMomentum.wrong) * 100;
console.log('With Momentum:    ' + results.withMomentum.correct + '-' + results.withMomentum.wrong + ' (' + withMomPct.toFixed(1) + '%)');
console.log('Without Momentum: ' + results.noMomentum.correct + '-' + results.noMomentum.wrong + ' (' + noMomPct.toFixed(1) + '%)');
console.log('Improvement:      ' + (noMomPct - withMomPct).toFixed(1) + '%');

console.log('\nBY MOMENTUM DIRECTION:');
console.log('-'.repeat(60));
console.log('Momentum  | Games | With Mom ATS | No Mom ATS | Better?');
console.log('-'.repeat(60));

for (const [group, stats] of Object.entries(momentumGroups)) {
  if (stats.total === 0) continue;
  const withPct = (stats.withMom / stats.total * 100).toFixed(0);
  const noPct = (stats.noMom / stats.total * 100).toFixed(0);
  const better = stats.noMom > stats.withMom ? 'NO MOM' : stats.withMom > stats.noMom ? 'MOMENTUM' : 'TIE';
  console.log(group.padEnd(9) + ' | ' + String(stats.total).padStart(5) + ' | ' +
              (stats.withMom + '/' + stats.total + ' (' + withPct + '%)').padStart(12) + ' | ' +
              (stats.noMom + '/' + stats.total + ' (' + noPct + '%)').padStart(10) + ' | ' + better);
}

console.log('\nKEY INSIGHT:');
console.log('When momentum is NEGATIVE (recent form worse than longer-term),');
console.log('removing the momentum penalty helps because it avoids over-penalizing');
console.log('what may be a temporary slump.\n');

// Show worst momentum games
console.log('GAMES WITH NEGATIVE MOMENTUM (< -2):');
console.log('-'.repeat(70));
const negMomGames = results.withMomentum.predictions.filter(p => parseFloat(p.momentum) < -2);
negMomGames.forEach(g => {
  const outcome = g.correct ? 'CORRECT' : 'WRONG';
  console.log(g.date + ' vs ' + g.opponent.padEnd(4) + ' | Mom: ' + g.momentum.padStart(5) +
              ' | Pred: ' + g.predicted.padStart(5) + ' | Actual: ' + String(g.actual).padStart(3) +
              ' | Spread: ' + String(g.spread).padStart(5) + ' | ' + outcome);
});
