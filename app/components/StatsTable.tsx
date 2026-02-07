'use client';

import { TeamMetrics } from '@/lib/types';
import { formatPlusMinus, formatRank, getRankColor } from '@/lib/utils';

interface StatsTableProps {
  metrics: TeamMetrics;
  leagueAverages: {
    ortg: number;
    drtg: number;
    pace: number;
    efgPct: number;
    tsPct: number;
  };
}

export default function StatsTable({ metrics, leagueAverages }: StatsTableProps) {
  const stats = [
    {
      name: 'Offensive Rating',
      abbr: 'ORTG',
      value: metrics.ortg.toFixed(1),
      rank: metrics.ortgRank,
      vsAvg: metrics.ortg - leagueAverages.ortg,
      description: 'Points per 100 possessions',
    },
    {
      name: 'Defensive Rating',
      abbr: 'DRTG',
      value: metrics.drtg.toFixed(1),
      rank: metrics.drtgRank,
      vsAvg: leagueAverages.drtg - metrics.drtg, // Lower is better for DRTG
      description: 'Points allowed per 100 poss.',
      invertColor: true,
    },
    {
      name: 'Net Rating',
      abbr: 'NET',
      value: formatPlusMinus(metrics.netRating),
      rank: metrics.netRatingRank,
      vsAvg: metrics.netRating,
      description: 'ORTG minus DRTG',
    },
    {
      name: 'Effective FG%',
      abbr: 'eFG%',
      value: (metrics.efgPct * 100).toFixed(1) + '%',
      rank: metrics.efgPctRank,
      vsAvg: (metrics.efgPct - leagueAverages.efgPct) * 100,
      description: 'FG% adjusted for 3-pointers',
    },
    {
      name: 'True Shooting',
      abbr: 'TS%',
      value: (metrics.tsPct * 100).toFixed(1) + '%',
      rank: metrics.tsPctRank,
      vsAvg: (metrics.tsPct - leagueAverages.tsPct) * 100,
      description: 'Overall scoring efficiency',
    },
    {
      name: 'Pace',
      abbr: 'PACE',
      value: metrics.pace.toFixed(1),
      rank: metrics.paceRank,
      vsAvg: metrics.pace - leagueAverages.pace,
      description: 'Possessions per 48 minutes',
      neutral: true,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-slate-300 mb-4">
        Advanced Metrics (Qualified Games Only)
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-slate-400 text-sm border-b border-slate-700">
              <th className="text-left py-2 font-medium">Metric</th>
              <th className="text-right py-2 font-medium">Value</th>
              <th className="text-right py-2 font-medium">Rank</th>
              <th className="text-right py-2 font-medium">vs NBA Avg</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr
                key={stat.abbr}
                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[#F9A01B] font-mono text-sm w-12">
                      {stat.abbr}
                    </span>
                    <span className="text-white">{stat.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 ml-14">{stat.description}</p>
                </td>
                <td className="text-right py-3">
                  <span className="text-white font-semibold text-lg">{stat.value}</span>
                </td>
                <td className="text-right py-3">
                  <span className={`font-semibold ${getRankColor(stat.rank)}`}>
                    {formatRank(stat.rank)}
                  </span>
                </td>
                <td className="text-right py-3">
                  {!stat.neutral ? (
                    <span
                      className={`font-medium ${
                        stat.vsAvg > 0 ? 'text-[#00A3B4]' : 'text-red-400'
                      }`}
                    >
                      {stat.vsAvg > 0 ? '+' : ''}
                      {stat.vsAvg.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {stat.vsAvg > 0 ? '+' : ''}
                      {stat.vsAvg.toFixed(1)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record summary */}
      <div className="mt-6 flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-3xl font-bold text-white">
            {metrics.wins}-{metrics.losses}
          </p>
          <p className="text-sm text-slate-400">Record</p>
        </div>
        <div className="w-px h-12 bg-slate-700" />
        <div className="text-center">
          <p className={`text-3xl font-bold ${metrics.pointDifferential > 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
            {formatPlusMinus(metrics.pointDifferential)}
          </p>
          <p className="text-sm text-slate-400">Avg Margin</p>
        </div>
        <div className="w-px h-12 bg-slate-700" />
        <div className="text-center">
          <p className="text-3xl font-bold text-[#F9A01B]">
            {((metrics.wins / (metrics.wins + metrics.losses)) * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-slate-400">Win Rate</p>
        </div>
      </div>
    </div>
  );
}
