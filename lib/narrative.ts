import { SpreadPrediction, RollingMetrics, TrendAnalysis, ConvictionBreakdown } from './model';
import { UpcomingGame } from './types';

export interface NarrativeInput {
  prediction: SpreadPrediction;
  allModePredictions?: { standard: SpreadPrediction; bayesian: SpreadPrediction; buzzing: SpreadPrediction };
  game: UpcomingGame;
  metrics: { last4: RollingMetrics; last7: RollingMetrics; last10: RollingMetrics; season: RollingMetrics };
  trend: TrendAnalysis;
}

export function generateNarrative(input: NarrativeInput): string {
  const { prediction, allModePredictions, game, metrics, trend } = input;
  const segments: string[] = [];

  // --- Segment 1: Headline ---
  segments.push(buildHeadline(prediction, game));

  // --- Segment 2: Elo vs Net Rating tension ---
  segments.push(buildEloNrTension(prediction, metrics));

  // --- Segment 3: Context factors ---
  const context = buildContextFactors(prediction, game);
  if (context) segments.push(context);

  // --- Segment 4: Mode consensus ---
  const consensus = buildModeConsensus(prediction, allModePredictions);
  if (consensus) segments.push(consensus);

  // --- Segment 5: Risk / conviction close ---
  segments.push(buildConvictionClose(prediction, trend));

  return segments.join(' ');
}

// ─── Segment builders ───────────────────────────────────────────────

function buildHeadline(prediction: SpreadPrediction, game: UpcomingGame): string {
  const margin = Math.abs(prediction.predictedMargin);
  const winning = prediction.predictedMargin > 0;
  const venue = game.isHome ? 'at home' : 'on the road';

  let headline: string;
  if (winning) {
    headline = `The ${prediction.mode === 'bayesian' ? 'Bayesian' : prediction.mode === 'buzzing' ? 'Buzzing' : 'Standard'} model projects Charlotte winning by ${margin.toFixed(1)} ${venue} against ${game.opponent}`;
  } else {
    headline = `The ${prediction.mode === 'bayesian' ? 'Bayesian' : prediction.mode === 'buzzing' ? 'Buzzing' : 'Standard'} model projects Charlotte losing by ${margin.toFixed(1)} ${venue} against ${game.opponent}`;
  }

  if (game.spread !== null) {
    const coverMargin = prediction.predictedMargin + game.spread; // spread is negative for favorites
    const covers = coverMargin > 0;
    headline += ` — ${covers ? 'covering' : 'missing'} the ${game.spread > 0 ? '+' : ''}${game.spread} line by ${Math.abs(coverMargin).toFixed(1)}`;
  }

  return headline + '.';
}

function buildEloNrTension(prediction: SpreadPrediction, metrics: { last4: RollingMetrics; last7: RollingMetrics; last10: RollingMetrics; season: RollingMetrics }): string {
  const eloSpread = prediction.eloComponent;
  const nrSpread = prediction.netRatingComponent;
  const divergence = Math.abs(eloSpread - nrSpread);
  const nrHigher = nrSpread > eloSpread;

  if (divergence > 3) {
    // Large divergence — full narrative about MOV cap
    const recentNr = metrics.last7.netRating;
    if (nrHigher) {
      return `The Elo component implies a ${formatComponent(eloSpread)} spread while Net Rating suggests ${formatComponent(nrSpread)} — a ${divergence.toFixed(1)}-point split. ` +
        `Elo's margin-of-victory cap at \u00b120 compresses blowout wins, so Charlotte's recent Net Rating of ${recentNr > 0 ? '+' : ''}${recentNr.toFixed(1)} may be understated in the Elo signal.`;
    } else {
      return `The Elo component implies ${formatComponent(eloSpread)} while Net Rating is more conservative at ${formatComponent(nrSpread)} — a ${divergence.toFixed(1)}-point gap. ` +
        `Net Rating over the last 7 games sits at ${recentNr > 0 ? '+' : ''}${recentNr.toFixed(1)}, pulling the blended projection back.`;
    }
  } else if (divergence >= 1.5) {
    // Moderate split
    return `Elo and Net Rating are moderately split (${formatComponent(eloSpread)} vs ${formatComponent(nrSpread)}), with a ${divergence.toFixed(1)}-point gap between the two components.`;
  } else {
    // Agreement
    return `Elo (${formatComponent(eloSpread)}) and Net Rating (${formatComponent(nrSpread)}) largely agree, giving the blended projection a solid foundation.`;
  }
}

function buildContextFactors(prediction: SpreadPrediction, game: UpcomingGame): string | null {
  // Sort factors by absolute impact, skip Elo/NR (already covered)
  const contextFactors = prediction.factors
    .filter(f => !f.name.includes('Elo') && !f.name.includes('Net Rating') && !f.name.includes('NR'))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 3);

  if (contextFactors.length === 0) return null;

  const parts: string[] = [];

  for (const factor of contextFactors) {
    const dir = factor.impact > 0 ? 'adds' : 'subtracts';
    const pts = Math.abs(factor.impact).toFixed(1);

    if (factor.name.toLowerCase().includes('home')) {
      parts.push(`home court ${dir} ${pts}`);
    } else if (factor.name.toLowerCase().includes('rest') || factor.name.toLowerCase().includes('fatigue') || factor.name.toLowerCase().includes('b2b')) {
      parts.push(`rest advantage ${dir} ${pts}`);
    } else if (factor.name.toLowerCase().includes('opponent') || factor.name.toLowerCase().includes('tier')) {
      parts.push(`the opponent-tier adjustment ${dir} ${pts}`);
    } else if (factor.name.toLowerCase().includes('streak')) {
      parts.push(`streak momentum ${dir} ${pts}`);
    } else if (factor.name.toLowerCase().includes('injury') || factor.name.toLowerCase().includes('core')) {
      parts.push(`injury impact ${dir} ${pts}`);
    } else {
      parts.push(`${factor.name.toLowerCase()} ${dir} ${pts}`);
    }
  }

  // Weave in injury context if available
  let injuryNote = '';
  if (game.injuryReport) {
    const status = game.injuryReport.hornetsCore5Status;
    if (status === 'ALL_HEALTHY') {
      injuryNote = ' The Core 5 are all available.';
    } else if (status) {
      injuryNote = ` Core 5 status: ${status.replace(/_/g, ' ').toLowerCase()}.`;
    }
  }

  return `Among context factors, ${joinList(parts)}.${injuryNote}`;
}

function buildModeConsensus(
  prediction: SpreadPrediction,
  allModePredictions?: { standard: SpreadPrediction; bayesian: SpreadPrediction; buzzing: SpreadPrediction }
): string | null {
  if (!allModePredictions) return null;

  const margins = [
    allModePredictions.standard.predictedMargin,
    allModePredictions.bayesian.predictedMargin,
    allModePredictions.buzzing.predictedMargin,
  ];
  const maxSpread = Math.max(...margins) - Math.min(...margins);

  if (maxSpread < 2) return null; // agreement — skip

  const stdM = allModePredictions.standard.predictedMargin;
  const bayM = allModePredictions.bayesian.predictedMargin;
  const buzM = allModePredictions.buzzing.predictedMargin;

  const most = Math.max(stdM, bayM, buzM);
  const least = Math.min(stdM, bayM, buzM);
  const mostLabel = most === buzM ? 'Buzzing' : most === bayM ? 'Bayesian' : 'Standard';
  const leastLabel = least === buzM ? 'Buzzing' : least === bayM ? 'Bayesian' : 'Standard';

  return `The three modes diverge by ${maxSpread.toFixed(1)} points — ${mostLabel} is most bullish at ${most > 0 ? '+' : ''}${most.toFixed(1)}, while ${leastLabel} is more conservative at ${least > 0 ? '+' : ''}${least.toFixed(1)}.`;
}

function buildConvictionClose(prediction: SpreadPrediction, trend: TrendAnalysis): string {
  const conv = prediction.conviction;
  let convLabel: string;
  if (conv >= 75) convLabel = 'a high-confidence spot';
  else if (conv >= 55) convLabel = 'a moderate-confidence spot';
  else if (conv >= 40) convLabel = 'a lower-confidence play';
  else convLabel = 'a low-conviction situation';

  const bd = prediction.convictionBreakdown;
  if (!bd) {
    // Fallback if no breakdown available
    return `Conviction sits at ${conv} — ${convLabel}.`;
  }

  let sentence = `Conviction is ${conv} — ${convLabel}.`;

  // Build detail sentences from the most noteworthy buckets
  const details: string[] = [];

  // --- Signal Alignment (most interesting to lead with) ---
  if (bd.alignment.modeConsensus === 15) {
    details.push('All three models agree on a cover');
  } else if (bd.alignment.modeConsensus === 8) {
    details.push('Two of three models project a cover');
  } else if (bd.alignment.modeConsensus === 0 && bd.alignment.score < 15) {
    details.push('The models are split on the cover direction');
  }

  if (bd.alignment.componentConsensus === 10) {
    details.push('both the Elo and Net Rating components independently project Charlotte clearing the line');
  } else if (bd.alignment.componentConsensus === 0) {
    details.push('the Elo and Net Rating components disagree on the cover direction');
  }

  if (bd.alignment.opponentInjuryEdge >= 7) {
    details.push('opponent injuries add significant unmodeled edge');
  } else if (bd.alignment.opponentInjuryEdge >= 4) {
    details.push('opponent injuries provide some unmodeled edge');
  }

  // --- Game Chaos ---
  if (bd.chaos.score >= 25) {
    details.push('this is a calm-pace, low-variance environment');
  } else if (bd.chaos.score <= 15) {
    const sigmaNote = prediction.regime !== 'Normal' ? ` in a ${prediction.regime} regime (\u03c3=${prediction.sigma})` : '';
    details.push(`variance is elevated${sigmaNote}`);
  }

  // --- Edge Reliability ---
  if (bd.edge.core5Freshness >= 18) {
    details.push('Core 5 data is fresh');
  } else if (bd.edge.core5Freshness <= 10) {
    details.push('Core 5 data is getting stale');
  }

  if (bd.edge.restScore >= 10) {
    details.push('Charlotte has full rest');
  } else if (bd.edge.restScore <= 3) {
    details.push("Charlotte is on a back-to-back");
  }

  // Compose: take the 2-3 most impactful details
  const selected = details.slice(0, 3);
  if (selected.length > 0) {
    // Capitalize the first detail and join with commas
    selected[0] = selected[0].charAt(0).toUpperCase() + selected[0].slice(1);
    sentence += ' ' + joinList(selected) + '.';
  }

  return sentence;
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatComponent(value: number): string {
  const label = value > 0 ? `Charlotte +${value.toFixed(1)}` : value < 0 ? `Charlotte ${value.toFixed(1)}` : 'even';
  return label;
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}
