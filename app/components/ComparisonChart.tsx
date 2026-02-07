'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { SpreadHistory, UpcomingGame } from '@/lib/types';
import { SpreadPrediction } from '@/lib/model';
import { formatDate } from '@/lib/utils';

interface ComparisonChartProps {
  spreadHistory: SpreadHistory[];
  upcomingGames: UpcomingGame[];
  predictions?: Map<string, SpreadPrediction>;
}

export default function ComparisonChart({
  spreadHistory,
  upcomingGames,
  predictions,
}: ComparisonChartProps) {
  const chartData = spreadHistory.map((item) => ({
    date: formatDate(item.date),
    spread: item.averageSpread,
  }));

  // Determine if a spread looks "off" based on model prediction
  const getSpreadEdge = (game: UpcomingGame) => {
    const prediction = predictions?.get(game.gameId);
    if (!prediction) return null;

    const edge = prediction.predictedCover;
    if (Math.abs(edge) < 2) return { type: 'fair', edge, label: 'Fair Line' };
    if (edge >= 5) return { type: 'strong-cover', edge, label: 'Strong Value' };
    if (edge >= 2) return { type: 'lean-cover', edge, label: 'Lean Cover' };
    if (edge <= -5) return { type: 'strong-fade', edge, label: 'Fade' };
    if (edge <= -2) return { type: 'lean-fade', edge, label: 'Lean Fade' };
    return { type: 'fair', edge, label: 'Fair Line' };
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-slate-300 mb-2">
        Spread Trend Since Dec 15
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Lower spread = more respect from oddsmakers
      </p>

      {/* Chart */}
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              domain={[0, 'auto']}
              tickFormatter={(value) => `+${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value) => value !== undefined ? [`+${Number(value).toFixed(1)}`, 'Avg Spread'] : ['', 'Avg Spread']}
            />
            <ReferenceLine
              y={0}
              stroke="#22c55e"
              strokeDasharray="5 5"
              label={{ value: 'Favorite', fill: '#22c55e', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="spread"
              stroke="#00788C"
              strokeWidth={3}
              dot={{ fill: '#00788C', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#F9A01B' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming games */}
      <div>
        <h3 className="text-md font-semibold text-slate-300 mb-3">
          Upcoming Games {predictions && <span className="text-xs text-slate-500 font-normal ml-2">with model predictions</span>}
        </h3>
        <div className="grid gap-3">
          {upcomingGames.slice(0, 5).map((game) => {
            const spreadEdge = getSpreadEdge(game);
            const prediction = predictions?.get(game.gameId);

            return (
              <div
                key={game.gameId}
                className={`p-3 rounded-lg border ${
                  spreadEdge?.type === 'strong-cover'
                    ? 'bg-green-900/20 border-green-700/50'
                    : spreadEdge?.type === 'lean-cover'
                    ? 'bg-green-900/10 border-green-800/30'
                    : spreadEdge?.type === 'strong-fade'
                    ? 'bg-red-900/20 border-red-700/50'
                    : spreadEdge?.type === 'lean-fade'
                    ? 'bg-red-900/10 border-red-800/30'
                    : 'bg-slate-800/50 border-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-between">
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
                        <p
                          className={`font-bold ${
                            game.spread < 0 ? 'text-green-400' : 'text-amber-400'
                          }`}
                        >
                          {game.spread > 0 ? '+' : ''}
                          {game.spread}
                        </p>
                        <p className="text-sm text-slate-500">
                          {game.spread < 0 ? 'Favored' : 'Underdog'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-slate-500">TBD</p>
                        <p className="text-sm text-slate-600">No line yet</p>
                      </>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    {game.moneyline !== null ? (
                      <>
                        <p className="text-slate-300">
                          {game.moneyline > 0 ? '+' : ''}
                          {game.moneyline}
                        </p>
                        <p className="text-xs text-slate-500">
                          {game.impliedWinPct !== null ? `${(game.impliedWinPct * 100).toFixed(0)}% implied` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500 text-sm">—</p>
                    )}
                  </div>
                </div>

                {/* Model prediction row */}
                {prediction && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-slate-400">
                        Model: <span className={`font-bold ${prediction.predictedMargin > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {prediction.predictedMargin > 0 ? '+' : ''}{prediction.predictedMargin}
                        </span> margin
                      </div>
                      <div className="text-xs text-slate-400">
                        vs Spread: <span className={`font-bold ${prediction.predictedCover > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {prediction.predictedCover > 0 ? '+' : ''}{prediction.predictedCover}
                        </span>
                      </div>
                    </div>
                    {spreadEdge && (
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          spreadEdge.type === 'strong-cover'
                            ? 'bg-green-500/30 text-green-300'
                            : spreadEdge.type === 'lean-cover'
                            ? 'bg-green-500/20 text-green-400'
                            : spreadEdge.type === 'strong-fade'
                            ? 'bg-red-500/30 text-red-300'
                            : spreadEdge.type === 'lean-fade'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {spreadEdge.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
