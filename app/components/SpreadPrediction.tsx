'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UpcomingGame, GameInjuryReport } from '@/lib/types';
import { SpreadPrediction as Prediction, RollingMetrics, TrendAnalysis } from '@/lib/model';
import { formatDate } from '@/lib/utils';

interface SpreadPredictionProps {
  upcomingGames: UpcomingGame[];
  predictions: Map<string, Prediction>;
  metrics: {
    last4: RollingMetrics;
    last7: RollingMetrics;
    last10: RollingMetrics;
    season: RollingMetrics;
  };
  trend: TrendAnalysis;
}

export default function SpreadPredictionComponent({
  upcomingGames,
  predictions,
}: SpreadPredictionProps) {
  // State for injury reports (allows refreshing without full page reload)
  const [injuryReports, setInjuryReports] = useState<Record<string, GameInjuryReport>>({});
  const [loadingInjuries, setLoadingInjuries] = useState<Record<string, boolean>>({});

  // Fetch injury report for a specific game
  const refreshInjuryReport = useCallback(async (gameId: string, opponent: string) => {
    setLoadingInjuries(prev => ({ ...prev, [gameId]: true }));

    try {
      const response = await fetch(`/api/injuries?gameId=${gameId}&opponent=${encodeURIComponent(opponent)}`);
      if (response.ok) {
        const report = await response.json();
        setInjuryReports(prev => ({ ...prev, [gameId]: report }));
      }
    } catch (error) {
      console.error('Failed to fetch injury report:', error);
    } finally {
      setLoadingInjuries(prev => ({ ...prev, [gameId]: false }));
    }
  }, []);

  // Get injury report - prefer local state, fallback to prop data
  const getInjuryReport = (game: UpcomingGame): GameInjuryReport | undefined => {
    return injuryReports[game.gameId] || game.injuryReport;
  };
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-300">
            Spread Predictions
          </h2>
          <p className="text-sm text-slate-500">
            Model-based predictions for upcoming games
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-full bg-[#00788C]" />
          <span>Cover</span>
          <div className="w-3 h-3 rounded-full bg-red-500 ml-2" />
          <span>Miss</span>
        </div>
      </div>

      <div className="space-y-4">
        {upcomingGames.slice(0, 5).map((game) => {
          const prediction = predictions.get(game.gameId);

          if (!prediction) return null;

          const hasLine = game.spread !== null;
          const willCover = hasLine && prediction.predictedCover > 0;
          const coverStrength = Math.abs(prediction.predictedCover);

          return (
            <div
              key={game.gameId}
              className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
            >
              {/* Game header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-medium">
                    <span className="text-slate-400 mr-1">
                      {game.isHome ? 'vs' : '@'}
                    </span>
                    {game.opponent}
                  </p>
                  <p className="text-sm text-slate-500">{formatDate(game.date)}</p>
                </div>
                <div className="text-right">
                  {game.spread !== null ? (
                    <>
                      <p className={`text-sm font-medium px-2 py-0.5 rounded inline-block ${
                        game.spread < 0
                          ? 'bg-[#00788C]/20 text-[#00A3B4]'
                          : 'bg-[#F9A01B]/20 text-[#F9A01B]'
                      }`}>
                        {game.spread < 0 ? `FAV ${Math.abs(game.spread)}` : `DOG ${game.spread}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {game.spread < 0 ? `Must win by ${Math.abs(game.spread) + 0.5}+` : `Can lose by ${game.spread - 0.5}`}
                      </p>
                      {/* Opening spread & line movement */}
                      {game.openingSpread !== undefined && game.openingSpread !== null && (
                        <p className="text-xs text-slate-600 mt-1">
                          Open: {game.openingSpread < 0 ? `FAV ${Math.abs(game.openingSpread)}` : `DOG ${game.openingSpread}`}
                          {game.spreadMovement !== undefined && game.spreadMovement !== 0 && (
                            <span className={`ml-1 ${game.spreadMovement < 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                              ({game.spreadMovement > 0 ? '+' : ''}{game.spreadMovement})
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-slate-500 text-sm">Line</p>
                      <p className="text-xl font-bold text-slate-500">TBD</p>
                    </>
                  )}
                </div>
              </div>

              {/* Prediction visualization - Number line */}
              {hasLine ? (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-slate-400">Predicted vs Spread</span>
                    <div className="flex items-center gap-2">
                      {/* Variance regime indicator */}
                      {prediction.regime !== 'Normal' && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/20 text-purple-400"
                          title={`Variance regime: σ=${prediction.sigma} (higher = more volatile)`}
                        >
                          σ{prediction.sigma}
                        </span>
                      )}
                      {/* Conviction score (for bet sizing) */}
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          prediction.conviction >= 70
                            ? 'bg-[#00788C]/30 text-[#00A3B4]'
                            : prediction.conviction >= 50
                            ? 'bg-[#F9A01B]/30 text-[#F9A01B]'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                        title={`Conviction score for bet sizing (includes tail-risk haircut for σ=${prediction.sigma})`}
                      >
                        {prediction.conviction} conv
                      </span>
                      {/* Confidence score (in prediction) */}
                      <span
                        className={`text-sm font-medium px-2 py-0.5 rounded ${
                          prediction.confidence === 'high'
                            ? 'bg-[#00788C]/20 text-[#00A3B4]'
                            : prediction.confidence === 'medium'
                            ? 'bg-[#F9A01B]/20 text-[#F9A01B]'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {prediction.confidenceScore}% conf
                      </span>
                    </div>
                  </div>

                  {/* Number line container */}
                  <div className="relative px-4">
                    {/* Zone labels */}
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-red-400 font-medium">HORNETS LOSE</span>
                      <span className="text-xs text-slate-500 font-medium">Predicted Margin</span>
                      <span className="text-xs text-[#00A3B4] font-medium">HORNETS WIN</span>
                    </div>

                    {/* Track */}
                    <div className="relative h-14">
                      {/* Background gradient */}
                      <div className="absolute inset-x-0 top-6 h-4 rounded-full bg-gradient-to-r from-red-600/40 via-slate-600 to-[#00788C]/40" />

                      {/* Tick marks */}
                      {[-15, -10, -5, 0, 5, 10, 15].map((tick) => {
                        const pct = ((tick + 15) / 30) * 100;
                        const isZero = tick === 0;
                        return (
                          <div
                            key={tick}
                            className="absolute top-5 flex flex-col items-center"
                            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                          >
                            <div
                              className={`${isZero ? 'w-1 h-6 bg-[#F9A01B]' : 'w-0.5 h-4 bg-slate-400'}`}
                            />
                          </div>
                        );
                      })}

                      {/* Current spread marker - positioned on margin scale */}
                      {/* For DOG +3.5: spread line is at -3.5 (can lose by 3.5 and cover) */}
                      {/* For FAV -3.5: spread line is at +3.5 (must win by 3.5 to cover) */}
                      {(() => {
                        // The spread line position: where you need to be to exactly cover
                        // DOG +3.5 → need margin > -3.5 → line at -3.5
                        // FAV -3.5 → need margin > +3.5 → line at +3.5
                        const spreadLinePosition = -game.spread!;
                        const spreadPct = ((Math.max(-15, Math.min(15, spreadLinePosition)) + 15) / 30) * 100;
                        return (
                          <div
                            className="absolute top-0 flex flex-col items-center z-10"
                            style={{ left: `${spreadPct}%`, transform: 'translateX(-50%)' }}
                          >
                            <div className="bg-[#F9A01B] text-slate-900 text-xs font-bold px-2 py-0.5 rounded-t whitespace-nowrap">
                              {game.spread! < 0
                                ? `Must win by ${Math.abs(game.spread!)}+`
                                : `Can lose by ${game.spread}`}
                            </div>
                            <div className="w-0.5 h-2 bg-[#F9A01B]" />
                          </div>
                        );
                      })()}

                      {/* Tick labels below */}
                      <div className="absolute -bottom-4 inset-x-0 flex justify-between text-xs text-slate-500">
                        <span>-15</span>
                        <span>-10</span>
                        <span>-5</span>
                        <span className="text-[#F9A01B] font-bold">0</span>
                        <span>+5</span>
                        <span>+10</span>
                        <span>+15</span>
                      </div>

                      {/* Prediction marker - shows predicted margin on same scale as spread */}
                      <motion.div
                        initial={{ left: '50%' }}
                        animate={{
                          left: `${((Math.max(-15, Math.min(15, prediction.predictedMargin)) + 15) / 30) * 100}%`
                        }}
                        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                        className="absolute top-3 -translate-x-1/2"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 ${
                            willCover
                              ? 'bg-[#00788C] border-[#00A3B4] text-white'
                              : 'bg-red-500 border-red-300 text-white'
                          }`}
                          title={`Predicted margin: ${prediction.predictedMargin > 0 ? '+' : ''}${prediction.predictedMargin} | Cover by: ${prediction.predictedCover > 0 ? '+' : ''}${prediction.predictedCover.toFixed(1)}`}
                        >
                          {prediction.predictedMargin > 0 ? '+' : ''}{prediction.predictedMargin.toFixed(1)}
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Spacing for tick labels */}
                  <div className="h-4" />
                </div>
              ) : (
                <div className="mb-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 border-dashed">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Predicted Margin</p>
                      <p className={`text-xl font-bold ${prediction.predictedMargin > 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                        {prediction.predictedMargin > 0 ? '+' : ''}{prediction.predictedMargin}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Spread not yet available</p>
                      <p className="text-xs text-slate-600">Check back closer to game time</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Prediction breakdown */}
              {hasLine ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Model Predicts Hornets Win By</p>
                    <p className={`text-lg font-bold ${prediction.predictedMargin > 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                      {prediction.predictedMargin > 0 ? '+' : ''}{prediction.predictedMargin} pts
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">vs the Line</p>
                    <p className={`text-lg font-bold ${willCover ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                      {willCover ? 'COVER' : 'MISS'} by {coverStrength.toFixed(1)}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Moneyline Analysis */}
              {prediction.moneylineAnalysis && (
                <div className="border-t border-slate-700 pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">Bet Type Recommendation</p>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        prediction.moneylineAnalysis.recommendation === 'moneyline'
                          ? 'bg-purple-500/20 text-purple-400'
                          : prediction.moneylineAnalysis.recommendation === 'spread'
                          ? 'bg-[#00788C]/20 text-[#00A3B4]'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {prediction.moneylineAnalysis.recommendation === 'moneyline'
                        ? `MONEYLINE ${game.moneyline! > 0 ? '+' : ''}${game.moneyline}`
                        : prediction.moneylineAnalysis.recommendation === 'spread'
                        ? `SPREAD ${game.spread! > 0 ? '+' : ''}${game.spread}`
                        : 'PASS'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    {prediction.moneylineAnalysis.reasoning}
                  </p>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Win Prob: </span>
                      <span className={`font-medium ${
                        prediction.moneylineAnalysis.edge > 0.03 ? 'text-[#00A3B4]' :
                        prediction.moneylineAnalysis.edge < -0.03 ? 'text-red-400' : 'text-slate-300'
                      }`}>
                        {(prediction.moneylineAnalysis.modelWinProb * 100).toFixed(0)}%
                      </span>
                      <span className="text-slate-600"> vs {(prediction.moneylineAnalysis.impliedWinProb * 100).toFixed(0)}% implied</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Edge: </span>
                      <span className={`font-medium ${
                        prediction.moneylineAnalysis.edge > 0 ? 'text-[#00A3B4]' : 'text-red-400'
                      }`}>
                        {prediction.moneylineAnalysis.edge > 0 ? '+' : ''}{(prediction.moneylineAnalysis.edge * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Factor breakdown */}
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs text-slate-500 mb-2">Key Factors</p>
                <div className="flex flex-wrap gap-2">
                  {prediction.factors.map((factor, idx) => (
                    <span
                      key={idx}
                      className={`text-xs px-2 py-1 rounded ${
                        factor.impact > 0
                          ? 'bg-[#00788C]/20 text-[#00A3B4]'
                          : factor.impact < 0
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {factor.name}: {factor.impact > 0 ? '+' : ''}{factor.impact.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Injury Report */}
              {(() => {
                const injuryReport = getInjuryReport(game);
                const isLoading = loadingInjuries[game.gameId];

                if (injuryReport) {
                  return (
                    <div className="border-t border-slate-700 pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Injury Report</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            injuryReport.hornetsCore5Status === 'ALL_HEALTHY'
                              ? 'bg-[#00788C]/20 text-[#00A3B4]'
                              : injuryReport.hornetsCore5Status === 'KEY_PLAYER_OUT'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-[#F9A01B]/20 text-[#F9A01B]'
                          }`}>
                            {injuryReport.hornetsCore5Status === 'ALL_HEALTHY'
                              ? 'Core 5 Healthy'
                              : injuryReport.hornetsCore5Status === 'KEY_PLAYER_OUT'
                              ? 'Core 5 Impacted'
                              : 'Monitor Status'}
                          </span>
                          {injuryReport.spreadAdjustment !== undefined && injuryReport.spreadAdjustment !== 0 && (
                            <span className={`text-xs font-medium ${
                              injuryReport.spreadAdjustment > 0 ? 'text-[#00A3B4]' : 'text-red-400'
                            }`}>
                              {injuryReport.spreadAdjustment > 0 ? '+' : ''}{injuryReport.spreadAdjustment} pts
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => refreshInjuryReport(game.gameId, game.opponent)}
                          disabled={isLoading}
                          className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                          title="Refresh injury report"
                        >
                          <svg
                            className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          {isLoading ? 'Updating...' : 'Refresh'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {injuryReport.injuryImpact}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Updated: {new Date(injuryReport.lastUpdated).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  );
                }

                // No injury report yet - prompt to check
                return (
                  <div className="border-t border-slate-700 pt-3 mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Injury Report</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                          Pending
                        </span>
                      </div>
                      <button
                        onClick={() => refreshInjuryReport(game.gameId, game.opponent)}
                        disabled={isLoading}
                        className="text-xs px-2 py-1 rounded bg-[#00788C] hover:bg-[#00788C]/80 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <svg
                          className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        {isLoading ? 'Loading...' : 'Check Injuries'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Check injury reports for both teams before placing bets.
                      Core 5 availability is critical to our prediction model.
                    </p>
                  </div>
                );
              })()}

              {/* Betting Strategy - only show when line is populated */}
              {hasLine && (
                <div className="border-t border-slate-700 pt-3 mt-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-[#F9A01B]">BETTING STRATEGY</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                      Wait 60 min before tip
                    </span>
                  </div>

                  {/* Pre-Game Bets */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Spread Bet */}
                    <div className={`p-2 rounded-lg border ${
                      prediction.moneylineAnalysis?.recommendation === 'spread' || !prediction.moneylineAnalysis
                        ? 'bg-[#00788C]/10 border-[#00788C]/30'
                        : 'bg-slate-800/50 border-slate-700'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">ATS</span>
                        <span className={`text-xs font-bold ${
                          willCover ? 'text-[#00A3B4]' : 'text-red-400'
                        }`}>
                          {game.spread! > 0 ? '+' : ''}{game.spread}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-white mb-1">
                        {(() => {
                          // Calculate spread bet size based on conviction and 60/40 split
                          const spreadPct = 0.6;
                          const convictionMultiplier = prediction.conviction / 100;
                          const units = (convictionMultiplier * spreadPct * 2).toFixed(1);
                          return `${units} units`;
                        })()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {(() => {
                          // Calculate cover probability
                          const coverMargin = prediction.predictedCover;
                          const sigma = prediction.sigma || 12;
                          const zScore = coverMargin / sigma;
                          // Approximate normal CDF
                          const coverProb = 0.5 * (1 + Math.tanh(zScore * 0.85));
                          return `${(coverProb * 100).toFixed(0)}% cover prob`;
                        })()}
                      </div>
                    </div>

                    {/* ML Bet */}
                    <div className={`p-2 rounded-lg border ${
                      prediction.moneylineAnalysis?.recommendation === 'moneyline'
                        ? 'bg-purple-500/10 border-purple-500/30'
                        : 'bg-slate-800/50 border-slate-700'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">ML</span>
                        <span className="text-xs font-bold text-purple-400">
                          {game.moneyline ? (game.moneyline > 0 ? '+' : '') + game.moneyline : 'TBD'}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-white mb-1">
                        {(() => {
                          // Calculate ML bet size based on conviction and 60/40 split
                          const mlPct = 0.4;
                          const convictionMultiplier = prediction.conviction / 100;
                          const units = (convictionMultiplier * mlPct * 2).toFixed(1);
                          return `${units} units`;
                        })()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {prediction.moneylineAnalysis
                          ? `${(prediction.moneylineAnalysis.modelWinProb * 100).toFixed(0)}% win prob`
                          : 'Awaiting odds'}
                      </div>
                    </div>
                  </div>

                  {/* Live Betting Triggers */}
                  <div className="bg-slate-900/50 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-2">
                      <svg className="w-3 h-3 text-[#F9A01B]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-medium text-[#F9A01B]">LIVE TRIGGERS</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[#00A3B4] font-medium">BUY:</span>
                        <ul className="text-slate-400 mt-0.5 space-y-0.5">
                          <li>• Opp star leaves early</li>
                          <li>• Diabate survives Q1</li>
                          <li>• Pace &gt;104 @ 6 min</li>
                        </ul>
                      </div>
                      <div>
                        <span className="text-red-400 font-medium">SELL:</span>
                        <ul className="text-slate-400 mt-0.5 space-y-0.5">
                          <li>• Diabate 2 fouls Q1</li>
                          <li>• LaMelo injury scare</li>
                          <li>• Down 15+ at half</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Pass Conditions */}
                  {(prediction.conviction < 40 || prediction.moneylineAnalysis?.recommendation === 'pass') && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <span className="text-xs text-red-400 font-medium">PASS SIGNAL: </span>
                      <span className="text-xs text-red-300">
                        {prediction.conviction < 40
                          ? `Low conviction (${prediction.conviction}) - reduce or skip`
                          : 'Model recommends passing on this game'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Model explanation */}
      <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Hybrid Prediction Model</h3>
        <p className="text-xs text-slate-400 mb-3">
          Backtested on 709 NBA games (2025-26 season): <span className="text-[#00A3B4]">63.2% accuracy</span>, 11.4 MAE
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-500">
          <div>
            <p className="text-[#00A3B4] font-medium mb-1">Elo Component (55%)</p>
            <ul className="space-y-0.5">
              <li>• FiveThirtyEight methodology</li>
              <li>• K-factor: 20, Home: +70 Elo</li>
              <li>• Margin of victory multiplier</li>
              <li>• Long-term team strength</li>
            </ul>
          </div>
          <div>
            <p className="text-[#F9A01B] font-medium mb-1">Net Rating Component (45%)</p>
            <ul className="space-y-0.5">
              <li>• Rolling windows (40/30/20/10%)</li>
              <li>• Home court: +2.5 points</li>
              <li>• Momentum & streak bonuses</li>
              <li>• Recent form emphasis</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Sources: <a href="https://fivethirtyeight.com/methodology/how-our-nba-predictions-work/" className="text-slate-500 hover:text-slate-400">538 Elo</a> | <a href="https://barttorvik.com/" className="text-slate-500 hover:text-slate-400">Bart Torvik</a>
        </p>
      </div>
    </div>
  );
}
