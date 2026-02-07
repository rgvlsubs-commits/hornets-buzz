'use client';

import { motion } from 'framer-motion';
import { UpcomingGame } from '@/lib/types';
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
          <div className="w-3 h-3 rounded-full bg-green-500" />
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
                      <p className="text-slate-400 text-sm">DraftKings</p>
                      <p className={`text-xl font-bold ${game.spread < 0 ? 'text-green-400' : 'text-amber-400'}`}>
                        {game.spread > 0 ? '+' : ''}{game.spread}
                      </p>
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
                    <span
                      className={`text-sm font-medium px-2 py-0.5 rounded ${
                        prediction.confidence === 'high'
                          ? 'bg-green-500/20 text-green-400'
                          : prediction.confidence === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {prediction.confidenceScore}% confidence
                    </span>
                  </div>

                  {/* Number line container */}
                  <div className="relative px-4">
                    {/* Zone labels */}
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-red-400 font-medium">MISS SPREAD</span>
                      <span className="text-xs text-green-400 font-medium">COVER SPREAD</span>
                    </div>

                    {/* Track */}
                    <div className="relative h-14">
                      {/* Background gradient */}
                      <div className="absolute inset-x-0 top-6 h-4 rounded-full bg-gradient-to-r from-red-600/40 via-slate-600 to-green-600/40" />

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
                              className={`${isZero ? 'w-1 h-6 bg-amber-400' : 'w-0.5 h-4 bg-slate-400'}`}
                            />
                          </div>
                        );
                      })}

                      {/* Current spread marker */}
                      <div
                        className="absolute top-0 flex flex-col items-center"
                        style={{ left: '50%', transform: 'translateX(-50%)' }}
                      >
                        <div className="bg-amber-500 text-slate-900 text-xs font-bold px-2 py-0.5 rounded-t">
                          SPREAD: {game.spread! > 0 ? '+' : ''}{game.spread}
                        </div>
                        <div className="w-0.5 h-2 bg-amber-500" />
                      </div>

                      {/* Tick labels below */}
                      <div className="absolute -bottom-4 inset-x-0 flex justify-between text-xs text-slate-500">
                        <span>-15</span>
                        <span>-10</span>
                        <span>-5</span>
                        <span className="text-amber-400 font-bold">0</span>
                        <span>+5</span>
                        <span>+10</span>
                        <span>+15</span>
                      </div>

                      {/* Prediction marker */}
                      <motion.div
                        initial={{ left: '50%' }}
                        animate={{
                          left: `${((Math.max(-15, Math.min(15, prediction.predictedCover)) + 15) / 30) * 100}%`
                        }}
                        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                        className="absolute top-3 -translate-x-1/2"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 ${
                            willCover
                              ? 'bg-green-500 border-green-300 text-white'
                              : 'bg-red-500 border-red-300 text-white'
                          }`}
                        >
                          {prediction.predictedCover > 0 ? '+' : ''}{prediction.predictedCover.toFixed(1)}
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
                      <p className={`text-xl font-bold ${prediction.predictedMargin > 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                    <p className="text-xs text-slate-500 mb-1">Predicted Margin</p>
                    <p className={`text-lg font-bold ${prediction.predictedMargin > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {prediction.predictedMargin > 0 ? '+' : ''}{prediction.predictedMargin}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Expected Cover</p>
                    <p className={`text-lg font-bold ${willCover ? 'text-green-400' : 'text-red-400'}`}>
                      {willCover ? 'COVER' : 'MISS'} by {coverStrength.toFixed(1)}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Factor breakdown */}
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs text-slate-500 mb-2">Key Factors</p>
                <div className="flex flex-wrap gap-2">
                  {prediction.factors.map((factor, idx) => (
                    <span
                      key={idx}
                      className={`text-xs px-2 py-1 rounded ${
                        factor.impact > 0
                          ? 'bg-green-500/20 text-green-400'
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
            </div>
          );
        })}
      </div>

      {/* Model explanation */}
      <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Hybrid Prediction Model</h3>
        <p className="text-xs text-slate-400 mb-3">
          Backtested on 709 NBA games (2025-26 season): <span className="text-green-400">63.2% accuracy</span>, 11.4 MAE
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-500">
          <div>
            <p className="text-teal-400 font-medium mb-1">Elo Component (55%)</p>
            <ul className="space-y-0.5">
              <li>• FiveThirtyEight methodology</li>
              <li>• K-factor: 20, Home: +70 Elo</li>
              <li>• Margin of victory multiplier</li>
              <li>• Long-term team strength</li>
            </ul>
          </div>
          <div>
            <p className="text-purple-400 font-medium mb-1">Net Rating Component (45%)</p>
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
