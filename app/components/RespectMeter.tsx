'use client';

import { motion } from 'framer-motion';
import { RespectMetrics, Game } from '@/lib/types';
import { RollingMetrics } from '@/lib/model';
import { getRespectLevel } from '@/lib/utils';

interface RespectMeterProps {
  respectMetrics: RespectMetrics;
  rollingMetrics?: RollingMetrics;
  windowLabel?: string;
  games?: Game[];       // All qualified games for dynamic calculation
  windowSize?: number;  // Current window size for filtering games
}

export default function RespectMeter({
  respectMetrics,
  rollingMetrics,
  windowLabel,
  games = [],
  windowSize,
}: RespectMeterProps) {
  // Get the games for the current window
  const windowGames = windowSize && windowSize < 999
    ? games.filter(g => g.isQualified).slice(0, windowSize)
    : games.filter(g => g.isQualified);

  // Calculate actual win % from rolling metrics if provided
  const actualWinPct = rollingMetrics
    ? rollingMetrics.wins / Math.max(1, rollingMetrics.wins + rollingMetrics.losses)
    : respectMetrics.actualWinPct;

  // Calculate Vegas implied win % from games in the window
  const impliedWinPct = windowGames.length > 0
    ? windowGames.reduce((sum, g) => sum + (g.impliedWinPct || 0.5), 0) / windowGames.length
    : respectMetrics.impliedWinPct;

  // Calculate ATS record for the window
  const atsWins = windowGames.filter(g => g.coveredSpread === true).length;
  const atsLosses = windowGames.filter(g => g.coveredSpread === false).length;

  // Recalculate respect gap based on rolling performance vs Vegas expectation
  const respectGap = (actualWinPct - impliedWinPct) * 100;

  const { level, description } = getRespectLevel(respectGap);

  // Calculate visual position: -50 to +50 range, 0 = center
  const clampedGap = Math.max(-50, Math.min(50, respectGap));
  const barPosition = ((clampedGap + 50) / 100) * 100; // 0-100%

  const spreadImprovement = respectMetrics.spreadHistory.length >= 2
    ? respectMetrics.spreadHistory[0].averageSpread - respectMetrics.spreadHistory[respectMetrics.spreadHistory.length - 1].averageSpread
    : 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-slate-300 mb-2 text-center">
        Do People Respect the Buzz?
      </h2>
      {windowLabel && (
        <p className="text-xs text-[#F9A01B] mb-2 font-medium text-center">{windowLabel}</p>
      )}

      {/* Respect bar visualization */}
      <div className="relative h-12 mx-auto mb-6">
        {/* Background bar */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-gradient-to-r from-red-500 via-[#F9A01B] to-[#00788C] rounded-full opacity-30" />

        {/* Labels */}
        <div className="absolute -bottom-5 left-0 text-xs text-slate-500">Overrated</div>
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-slate-500">Fair</div>
        <div className="absolute -bottom-5 right-0 text-xs text-slate-500">Underrated</div>

        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-500" />

        {/* Indicator */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2"
          initial={{ left: '50%' }}
          animate={{ left: `${barPosition}%` }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          style={{ marginLeft: '-16px' }}
        >
          <div className="w-8 h-8 bg-[#F9A01B] rounded-full flex items-center justify-center shadow-lg shadow-[#F9A01B]/50">
            <span className="text-slate-900 font-bold text-xs">
              {respectGap > 0 ? '+' : ''}{Math.round(respectGap)}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Status */}
      <div className="text-center mt-8 mb-4">
        <div className="py-2 px-4 bg-slate-800/50 rounded-lg inline-block">
          <span className="text-lg font-bold text-[#00A3B4]">{level}</span>
          <p className="text-slate-400 text-xs">{description}</p>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-2xl font-bold text-white">
            {(actualWinPct * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Actual Win Rate</p>
          <p className="text-xs text-slate-500">
            {rollingMetrics ? `(${rollingMetrics.wins}-${rollingMetrics.losses})` : '(Qualified)'}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-2xl font-bold text-white">
            {(impliedWinPct * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">Vegas Implied</p>
          <p className="text-xs text-slate-500">
            {windowGames.length > 0 ? `(${windowGames.length} games)` : '(Markets)'}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className={`text-2xl font-bold ${atsWins > atsLosses ? 'text-[#00A3B4]' : atsWins < atsLosses ? 'text-red-400' : 'text-white'}`}>
            {atsWins}-{atsLosses}
          </p>
          <p className="text-xs text-slate-400">vs Spread</p>
          <p className="text-xs text-slate-500">(ATS Record)</p>
        </div>
      </div>

      {/* Trend indicator */}
      <div className="mt-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg">
          <span className={spreadImprovement > 0 ? 'text-[#00A3B4]' : 'text-red-400'}>
            {spreadImprovement > 0 ? '↑' : '↓'}
          </span>
          <span className="text-sm text-slate-300">
            Spread improved {Math.abs(spreadImprovement).toFixed(1)} pts since Oct 22
          </span>
        </div>
      </div>
    </div>
  );
}
