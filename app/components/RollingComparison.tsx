'use client';

import { motion } from 'framer-motion';
import { RollingMetrics, TrendAnalysis } from '@/lib/model';
import { formatPlusMinus } from '@/lib/utils';

interface RollingComparisonProps {
  metrics: {
    last4: RollingMetrics;
    last7: RollingMetrics;
    last10: RollingMetrics;
    season: RollingMetrics;
  };
  trend: TrendAnalysis;
  selectedWindow: number;
}

export default function RollingComparison({
  metrics,
  trend,
  selectedWindow,
}: RollingComparisonProps) {
  const windows = [
    { key: 'last4', label: 'Last 4', data: metrics.last4 },
    { key: 'last7', label: 'Last 7', data: metrics.last7 },
    { key: 'last10', label: 'Last 10', data: metrics.last10 },
    { key: 'season', label: 'Season', data: metrics.season },
  ];

  const getBarWidth = (value: number, max: number = 15) => {
    return Math.min(100, Math.max(0, ((value + max) / (max * 2)) * 100));
  };

  const getNetRatingColor = (nr: number) => {
    if (nr >= 8) return 'bg-green-500';
    if (nr >= 4) return 'bg-teal-500';
    if (nr >= 0) return 'bg-yellow-500';
    if (nr >= -4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-300">
          Rolling Performance
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              trend.direction === 'up'
                ? 'bg-green-500/20 text-green-400'
                : trend.direction === 'down'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {trend.direction === 'up' && '↑ Trending Up'}
            {trend.direction === 'down' && '↓ Trending Down'}
            {trend.direction === 'stable' && '→ Stable'}
          </span>
          {trend.streakLength >= 2 && (
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                trend.streakType === 'W'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {trend.streakLength}{trend.streakType} Streak
            </span>
          )}
        </div>
      </div>

      {/* Net Rating Comparison */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Net Rating by Window</h3>
        <div className="space-y-3">
          {windows.map(({ key, label, data }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 text-sm text-slate-400">{label}</span>
              <div className="flex-1 h-8 bg-slate-800 rounded-lg relative overflow-hidden">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                {/* Bar */}
                <motion.div
                  initial={{ width: '50%' }}
                  animate={{ width: `${getBarWidth(data.netRating)}%` }}
                  transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                  className={`absolute top-1 bottom-1 left-0 rounded ${getNetRatingColor(data.netRating)}`}
                  style={{
                    left: data.netRating >= 0 ? '50%' : `${getBarWidth(data.netRating)}%`,
                    width: data.netRating >= 0
                      ? `${(data.netRating / 15) * 50}%`
                      : `${50 - getBarWidth(data.netRating)}%`
                  }}
                />
              </div>
              <span
                className={`w-16 text-right font-mono font-bold ${
                  data.netRating > 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {formatPlusMinus(data.netRating)}
              </span>
              <span className="w-12 text-right text-sm text-slate-500">
                {data.wins}-{data.losses}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-4 gap-4 text-center">
        {windows.map(({ key, label, data }) => {
          const isSelected =
            (selectedWindow === 4 && key === 'last4') ||
            (selectedWindow === 7 && key === 'last7') ||
            (selectedWindow === 10 && key === 'last10') ||
            (selectedWindow > 10 && key === 'season');

          return (
            <div
              key={key}
              className={`p-4 rounded-xl transition-colors ${
                isSelected
                  ? 'bg-teal-600/20 border border-teal-500/50'
                  : 'bg-slate-800/50'
              }`}
            >
              <p className="text-xs text-slate-400 mb-2">{label}</p>
              <p className={`text-xl font-bold ${data.netRating > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPlusMinus(data.netRating)}
              </p>
              <p className="text-sm text-slate-300 mt-1">
                {data.wins}-{data.losses}
              </p>
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-500">
                  ORTG: {data.ortg.toFixed(1)}
                </p>
                <p className="text-xs text-slate-500">
                  DRTG: {data.drtg.toFixed(1)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Momentum Indicator */}
      <div className="mt-6 p-4 bg-slate-800/50 rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Momentum Score</p>
            <p className="text-2xl font-bold text-white">
              {trend.momentum > 0 ? '+' : ''}{trend.momentum.toFixed(1)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Consistency</p>
            <p className="text-2xl font-bold text-white">
              {(trend.consistency * 100).toFixed(0)}%
            </p>
          </div>
          <div className="w-48">
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${50 + (trend.momentum / 10) * 50}%` }}
                className={`h-full ${trend.momentum > 0 ? 'bg-green-500' : 'bg-red-500'}`}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>Cold</span>
              <span>Hot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
