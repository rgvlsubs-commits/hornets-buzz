'use client';

import { motion } from 'framer-motion';
import { TeamMetrics } from '@/lib/types';
import { RollingMetrics } from '@/lib/model';
import { formatPlusMinus, formatRank, getBuzzLevel, getRankColor } from '@/lib/utils';

interface BuzzMeterProps {
  metrics: TeamMetrics;
  rollingMetrics?: RollingMetrics;
  windowLabel?: string;
}

export default function BuzzMeter({ metrics, rollingMetrics, windowLabel }: BuzzMeterProps) {
  // Use rolling metrics if provided, otherwise use season metrics
  const netRating = rollingMetrics?.netRating ?? metrics.netRating;
  const netRatingRank = rollingMetrics
    ? estimateRankFromNetRating(rollingMetrics.netRating)
    : metrics.netRatingRank;
  const wins = rollingMetrics?.wins ?? metrics.wins;
  const losses = rollingMetrics?.losses ?? metrics.losses;

  const { level, description } = getBuzzLevel(netRatingRank);

  // Calculate needle rotation: rank 1 = 90deg (right), rank 30 = -90deg (left)
  const needleRotation = 90 - ((netRatingRank - 1) / 29) * 180;

// Estimate rank from net rating (rough approximation)
function estimateRankFromNetRating(nr: number): number {
  if (nr >= 10) return 1;
  if (nr >= 8) return 3;
  if (nr >= 6) return 5;
  if (nr >= 4) return 8;
  if (nr >= 2) return 12;
  if (nr >= 0) return 15;
  if (nr >= -2) return 18;
  if (nr >= -4) return 22;
  if (nr >= -6) return 25;
  return 28;
}

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-slate-300 mb-2 text-center">
        How Much Are We Buzzing?
      </h2>

      {/* Gauge */}
      <div className="relative w-64 h-36 mx-auto mb-4">
        {/* Background arc */}
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Gradient definitions */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#00A3B4" />
              <stop offset="100%" stopColor="#00788C" />
            </linearGradient>
          </defs>

          {/* Background track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#334155"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Colored arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Tick marks */}
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (-180 + i * 45) * (Math.PI / 180);
            const x1 = 100 + 65 * Math.cos(angle);
            const y1 = 100 + 65 * Math.sin(angle);
            const x2 = 100 + 75 * Math.cos(angle);
            const y2 = 100 + 75 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#64748b"
                strokeWidth="2"
              />
            );
          })}

          {/* Labels */}
          <text x="15" y="108" fill="#94a3b8" fontSize="10" textAnchor="middle">
            30
          </text>
          <text x="100" y="25" fill="#94a3b8" fontSize="10" textAnchor="middle">
            15
          </text>
          <text x="185" y="108" fill="#94a3b8" fontSize="10" textAnchor="middle">
            1
          </text>
        </svg>

        {/* Needle */}
        <motion.div
          className="absolute bottom-2 left-1/2 origin-bottom"
          initial={{ rotate: -90 }}
          animate={{ rotate: needleRotation }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
          style={{ width: '4px', height: '70px', marginLeft: '-2px' }}
        >
          <div className="w-full h-full bg-gradient-to-t from-[#F9A01B] to-[#FDB927] rounded-full shadow-lg shadow-[#F9A01B]/50" />
        </motion.div>

        {/* Center dot */}
        <div className="absolute bottom-0 left-1/2 w-4 h-4 -ml-2 bg-slate-700 rounded-full border-2 border-[#F9A01B]" />
      </div>

      {/* Stats display */}
      <div className="text-center">
        {windowLabel && (
          <p className="text-xs text-[#00A3B4] mb-2 font-medium">{windowLabel}</p>
        )}
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-3xl font-bold text-white">
            {formatPlusMinus(netRating)}
          </span>
          <span className={`text-xl font-semibold ${getRankColor(netRatingRank)}`}>
            {formatRank(netRatingRank)}
          </span>
        </div>
        <p className="text-slate-400 text-sm">Net Rating (NBA Rank)</p>

        {rollingMetrics && (
          <p className="text-slate-500 text-xs mt-1">
            Record: {wins}-{losses} ({((wins / Math.max(1, wins + losses)) * 100).toFixed(0)}%)
          </p>
        )}

        <div className="mt-4 py-2 px-4 bg-slate-800/50 rounded-lg inline-block">
          <span className="text-lg font-bold text-[#F9A01B]">{level}</span>
          <p className="text-slate-400 text-xs">{description}</p>
        </div>
      </div>
    </div>
  );
}
