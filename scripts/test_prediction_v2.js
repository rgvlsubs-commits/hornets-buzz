// Accurate test that matches the actual model.ts implementation
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/hornets_buzz.json', 'utf8'));

// Constants from model.ts
const ELO_WEIGHT = 0.55;
const NR_WEIGHT = 0.45;
const NR_HOME_ADVANTAGE = 2.0;
const TRADE_DEADLINE_ADJ = -0.75;
const MOMENTUM_MULTIPLIER = 0.0;  // Disabled
const MID_TIER_ADJ = -1.0;
const ELO_HOME_ADVANTAGE = 70;
const ELO_TO_SPREAD = 28;
const ELO_INITIAL = 1500;

// Standard weights
const STANDARD_WEIGHTS = { last4: 0.30, last7: 0.25, last10: 0.25, season: 0.20 };
// Buzzing weights (different!)
const BUZZING_WEIGHTS = { last4: 0.30, last7: 0.30, last10: 0.25, season: 0.15 };

function estimateElo(wins, pointDiff, games, useMOVCap = true) {
  if (games === 0) return 1500;
  const winPct = wins / games;
  if (winPct <= 0 || winPct >= 1) return 1500;
  const eloFromWinPct = 1504.6 - 450 * Math.log10((1 / winPct) - 1);
  let avgPointDiff = pointDiff / games;
  if (useMOVCap) {
    avgPointDiff = Math.max(-20, Math.min(20, avgPointDiff));
  }
  const eloFromPointDiff = 1500 + avgPointDiff * 10;
  const pointDiffWeight = Math.max(0.6, 0.8 - games / 200);
  return (1 - pointDiffWeight) * eloFromWinPct + pointDiffWeight * eloFromPointDiff;
}

// Get all games and qualified games
const allGames = data.games;
const qualifiedGames = data.games.filter(g => g.isQualified);

console.log('Total games:', allGames.length);
console.log('Qualified games:', qualifiedGames.length);

// Calculate all games record (for Standard)
const allWins = allGames.filter(g => g.result === 'W').length;
const allLosses = allGames.filter(g => g.result === 'L').length;
const allPointDiff = allGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
console.log('\nAll games record:', allWins + '-' + allLosses);
console.log('All games point diff:', allPointDiff);

// Calculate Core 5 record (for Buzzing)
const c5Wins = qualifiedGames.filter(g => g.result === 'W').length;
const c5Losses = qualifiedGames.filter(g => g.result === 'L').length;
const c5PointDiff = qualifiedGames.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
console.log('\nCore 5 record:', c5Wins + '-' + c5Losses);
console.log('Core 5 point diff:', c5PointDiff);

// Last 15 qualified (for Buzzing Elo)
const last15Qualified = qualifiedGames.slice(0, 15);
const b15Wins = last15Qualified.filter(g => g.result === 'W').length;
const b15Losses = last15Qualified.filter(g => g.result === 'L').length;
const b15PointDiff = last15Qualified.reduce((s, g) => s + (g.hornetsScore - g.opponentScore), 0);
console.log('\nLast 15 qualified record:', b15Wins + '-' + b15Losses);
console.log('Last 15 qualified point diff:', b15PointDiff);

// Rolling NRs from qualified games
const last4 = qualifiedGames.slice(0, 4);
const last7 = qualifiedGames.slice(0, 7);
const last10 = qualifiedGames.slice(0, 10);
const seasonQualified = qualifiedGames;
const last15 = qualifiedGames.slice(0, 15);

const last4NR = last4.reduce((s, g) => s + g.netRating, 0) / last4.length;
const last7NR = last7.reduce((s, g) => s + g.netRating, 0) / last7.length;
const last10NR = last10.reduce((s, g) => s + g.netRating, 0) / last10.length;
const seasonNR = seasonQualified.reduce((s, g) => s + g.netRating, 0) / seasonQualified.length;
const last15NR = last15.reduce((s, g) => s + g.netRating, 0) / last15.length;

console.log('\n=== Rolling Net Ratings ===');
console.log('Last 4:', last4NR.toFixed(1));
console.log('Last 7:', last7NR.toFixed(1));
console.log('Last 10:', last10NR.toFixed(1));
console.log('Season (qualified):', seasonNR.toFixed(1));
console.log('Last 15:', last15NR.toFixed(1));

// Atlanta game
const atlanta = data.upcomingGames.find(g => g.opponent.includes('Atlanta'));
const oppNR = atlanta.opponentNetRating;
const oppElo = ELO_INITIAL + oppNR * 10;
const isHome = atlanta.isHome;
const restDays = atlanta.restDays;
const isMidTier = oppNR >= -3.0 && oppNR < 3.0;
const midTierAdj = isMidTier ? MID_TIER_ADJ : 0;

console.log('\n=== Atlanta Game ===');
console.log('Opponent NR:', oppNR);
console.log('Opponent Elo:', oppElo.toFixed(0));
console.log('Is home:', isHome);
console.log('Rest days:', restDays);
console.log('Mid-tier adjustment:', midTierAdj);

// Fatigue adjustment
let fatigueAdj = 0;
if (atlanta.isBackToBack) fatigueAdj = -1.5;
else if (restDays === 1) fatigueAdj = -1.0;
else if (restDays >= 3) fatigueAdj = 0.5;
console.log('Fatigue adjustment:', fatigueAdj);

// Momentum (disabled)
const momentum = Math.max(-10, Math.min(10, (last4NR - last10NR) * 0.8));
const momentumImpact = momentum * MOMENTUM_MULTIPLIER;
console.log('Momentum:', momentum.toFixed(2), '(impact:', momentumImpact.toFixed(2), ')');

// Home adjustment
const homeAdj = isHome ? NR_HOME_ADVANTAGE : -NR_HOME_ADVANTAGE;

// === STANDARD PREDICTION ===
const standardElo = estimateElo(allWins, allPointDiff, allGames.length);
let standardEloDiff = standardElo - oppElo;
standardEloDiff += isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE;
standardEloDiff += fatigueAdj * ELO_TO_SPREAD;
const standardEloPred = standardEloDiff / ELO_TO_SPREAD;

const standardWeightedNR = last4NR * STANDARD_WEIGHTS.last4 + last7NR * STANDARD_WEIGHTS.last7 +
                           last10NR * STANDARD_WEIGHTS.last10 + seasonNR * STANDARD_WEIGHTS.season;
const standardNRPred = standardWeightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj + fatigueAdj;
const standardMargin = standardEloPred * ELO_WEIGHT + standardNRPred * NR_WEIGHT;

console.log('\n=== STANDARD PREDICTION ===');
console.log('Standard Elo:', standardElo.toFixed(0));
console.log('Standard Elo Diff:', standardEloDiff.toFixed(0));
console.log('Standard Elo Pred:', standardEloPred.toFixed(2));
console.log('Standard Weighted NR:', standardWeightedNR.toFixed(2));
console.log('Standard NR Pred:', standardNRPred.toFixed(2));
console.log('Standard Margin:', standardMargin.toFixed(1));

// === BUZZING PREDICTION ===
const buzzingElo = estimateElo(b15Wins, b15PointDiff, last15.length);
let buzzingEloDiff = buzzingElo - oppElo;
buzzingEloDiff += isHome ? ELO_HOME_ADVANTAGE : -ELO_HOME_ADVANTAGE;
buzzingEloDiff += fatigueAdj * ELO_TO_SPREAD;
const buzzingEloPred = buzzingEloDiff / ELO_TO_SPREAD;

// Buzzing uses last15NR for the "season" component
const buzzingWeightedNR = last4NR * BUZZING_WEIGHTS.last4 + last7NR * BUZZING_WEIGHTS.last7 +
                          last10NR * BUZZING_WEIGHTS.last10 + last15NR * BUZZING_WEIGHTS.season;
const buzzingNRPred = buzzingWeightedNR + homeAdj + (-oppNR) + TRADE_DEADLINE_ADJ + momentumImpact + midTierAdj + fatigueAdj;
const buzzingMargin = buzzingEloPred * ELO_WEIGHT + buzzingNRPred * NR_WEIGHT;

console.log('\n=== BUZZING PREDICTION ===');
console.log('Buzzing Elo:', buzzingElo.toFixed(0));
console.log('Buzzing Elo Diff:', buzzingEloDiff.toFixed(0));
console.log('Buzzing Elo Pred:', buzzingEloPred.toFixed(2));
console.log('Buzzing Weighted NR:', buzzingWeightedNR.toFixed(2));
console.log('Buzzing NR Pred:', buzzingNRPred.toFixed(2));
console.log('Buzzing Margin:', buzzingMargin.toFixed(1));

// === BAYESIAN PREDICTION ===
const PRIOR_FLOOR = 20;
const PRIOR_RANGE = 40;
const DECAY_RATE = 40;
const CORE5_HALFLIFE = 30;

// Prior strength based on last 15 games
const priorStrength = PRIOR_FLOOR + PRIOR_RANGE * Math.exp(-last15.length / DECAY_RATE);

// Time decay (days since last Core 5 game)
const lastC5Date = new Date(qualifiedGames[0].date);
const gameDate = new Date(atlanta.date);
const daysSince = Math.ceil(Math.abs(gameDate - lastC5Date) / (1000 * 60 * 60 * 24));
const decayFactor = Math.exp(-daysSince / CORE5_HALFLIFE);
const sampleWeight = last15.length * decayFactor;

const bayesianMargin = (priorStrength * standardMargin + sampleWeight * buzzingMargin) / (priorStrength + sampleWeight);

console.log('\n=== BAYESIAN PREDICTION ===');
console.log('Prior strength:', priorStrength.toFixed(1));
console.log('Days since last Core 5:', daysSince);
console.log('Decay factor:', decayFactor.toFixed(3));
console.log('Sample weight:', sampleWeight.toFixed(1));
console.log('Bayesian Margin:', bayesianMargin.toFixed(1));

console.log('\n=== SUMMARY ===');
console.log('Standard:', standardMargin.toFixed(1));
console.log('Bayesian:', bayesianMargin.toFixed(1));
console.log('Buzzing:', buzzingMargin.toFixed(1));
console.log('\nSpread: -5.5');
console.log('Standard covers:', (standardMargin + (-5.5)) > 0 ? 'YES' : 'NO', '(by', (standardMargin - 5.5).toFixed(1), ')');
console.log('Bayesian covers:', (bayesianMargin + (-5.5)) > 0 ? 'YES' : 'NO', '(by', (bayesianMargin - 5.5).toFixed(1), ')');
console.log('Buzzing covers:', (buzzingMargin + (-5.5)) > 0 ? 'YES' : 'NO', '(by', (buzzingMargin - 5.5).toFixed(1), ')');
