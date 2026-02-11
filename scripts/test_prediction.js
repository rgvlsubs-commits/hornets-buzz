// Test that mimics what the page does
const fs = require('fs');

// Read the model source to check MOMENTUM_MULTIPLIER
const modelSource = fs.readFileSync('./lib/model.ts', 'utf8');
const momMatch = modelSource.match(/const MOMENTUM_MULTIPLIER = ([\d.]+)/);
console.log('MOMENTUM_MULTIPLIER in source:', momMatch ? momMatch[1] : 'NOT FOUND');

// Now manually calculate what the page should show
const data = JSON.parse(fs.readFileSync('./data/hornets_buzz.json', 'utf8'));

// Constants from model (matching source)
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;
const NR_HOME_ADVANTAGE = 2.0;
const TRADE_DEADLINE_ADJ = -0.75;
const MOMENTUM_MULTIPLIER = parseFloat(momMatch[1]); // Use value from source
const MID_TIER_ADJ = -1.0;
const ELO_HOME_ADVANTAGE = 70;
const ELO_TO_SPREAD = 28;
const ELO_INITIAL = 1500;

console.log('Using MOMENTUM_MULTIPLIER:', MOMENTUM_MULTIPLIER);

const qualifiedGames = data.games.filter(g => g.isQualified);
const allGames = data.games;

// Rolling NRs
const last4NR = qualifiedGames.slice(0, 4).reduce((s, g) => s + g.netRating, 0) / 4;
const last7NR = qualifiedGames.slice(0, 7).reduce((s, g) => s + g.netRating, 0) / 7;
const last10NR = qualifiedGames.slice(0, 10).reduce((s, g) => s + g.netRating, 0) / 10;
const seasonNR = qualifiedGames.reduce((s, g) => s + g.netRating, 0) / qualifiedGames.length;

// Atlanta game
const atlanta = data.upcomingGames.find(g => g.opponent.includes('Atlanta'));
const oppNR = atlanta.opponentNetRating;
const oppElo = ELO_INITIAL + oppNR * 10;
const isMidTier = oppNR >= -3.0 && oppNR < 3.0;
const midTierAdj = isMidTier ? MID_TIER_ADJ : 0;

// Momentum
const momentum = Math.max(-10, Math.min(10, (last4NR - last10NR) * 0.8));
const momentumImpact = momentum * MOMENTUM_MULTIPLIER;

console.log('\nMomentum:', momentum.toFixed(2));
console.log('Momentum Impact (× ' + MOMENTUM_MULTIPLIER + '):', momentumImpact.toFixed(2));
console.log('Mid-tier adjustment:', midTierAdj);

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

// Standard
const allWins = allGames.filter(g => g.result === 'W').length;
const allPointDiff = allGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
const standardElo = estimateElo(allWins, allPointDiff, allGames.length);
const standardEloDiff = standardElo - oppElo + ELO_HOME_ADVANTAGE;
const standardEloPred = standardEloDiff / ELO_TO_SPREAD;

const standardWeightedNR = last4NR * 0.30 + last7NR * 0.25 + last10NR * 0.25 + seasonNR * 0.20;
const standardNRPred = standardWeightedNR + NR_HOME_ADVANTAGE + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj;
const standardMargin = standardEloPred * ELO_WEIGHT + standardNRPred * NR_WEIGHT;

// Buzzing
const c5Wins = qualifiedGames.filter(g => g.result === 'W').length;
const c5PointDiff = qualifiedGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
const buzzingElo = estimateElo(c5Wins, c5PointDiff, qualifiedGames.length);
const buzzingEloDiff = buzzingElo - oppElo + ELO_HOME_ADVANTAGE;
const buzzingEloPred = buzzingEloDiff / ELO_TO_SPREAD;

const buzzingWeightedNR = last4NR * 0.30 + last7NR * 0.30 + last10NR * 0.25 + seasonNR * 0.15;
const buzzingNRPred = buzzingWeightedNR + NR_HOME_ADVANTAGE + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj;
const buzzingMargin = buzzingEloPred * ELO_WEIGHT + buzzingNRPred * NR_WEIGHT;

// Bayesian
const priorStrength = 20 + 40 * Math.exp(-qualifiedGames.length / 40);
const decayFactor = Math.exp(-2 / 30);
const sampleWeight = qualifiedGames.length * decayFactor;
const bayesianMargin = (priorStrength * standardMargin + sampleWeight * buzzingMargin) / (priorStrength + sampleWeight);

console.log('\n=== EXPECTED PREDICTIONS ===');
console.log('Standard:', standardMargin.toFixed(1));
console.log('Bayesian:', bayesianMargin.toFixed(1));
console.log('Buzzing:', buzzingMargin.toFixed(1));
console.log('\nIf website shows different values, there may be additional factors in the full model.');
