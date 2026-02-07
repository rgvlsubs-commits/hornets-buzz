'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { LeagueRankings as LeagueRankingsType, LeagueTeam } from '@/lib/types';
import { RollingMetrics } from '@/lib/model';

interface LeagueRankingsProps {
  rankings: LeagueRankingsType;
  rollingMetrics?: RollingMetrics;
  windowLabel?: string;
  healthyOnly?: boolean;
}

type SortKey = 'netRating' | 'ortg' | 'drtg' | 'elo';

const HORNETS_TEAM_ID = 1610612766;

export default function LeagueRankings({
  rankings,
  rollingMetrics,
  windowLabel,
  healthyOnly = true,
}: LeagueRankingsProps) {
  const [sortBy, setSortBy] = useState<SortKey>('netRating');

  // Calculate Hornets' dynamic stats and ranks based on rolling metrics
  const teamsWithDynamicHornets = useMemo(() => {
    if (!rollingMetrics) return rankings.teams;

    // Create a copy of teams and update Hornets with rolling metrics
    return rankings.teams.map(team => {
      if (team.teamId !== HORNETS_TEAM_ID) return team;

      // Use rolling metrics for Hornets
      // Estimate Elo from rolling win% and point diff
      const games = rollingMetrics.wins + rollingMetrics.losses;
      const winPct = games > 0 ? rollingMetrics.wins / games : 0.5;
      let elo = 1500;
      if (games > 0) {
        const eloFromWinPct = winPct <= 0 ? 1200 : winPct >= 1 ? 1800 : 1504.6 - 450 * Math.log10((1 / winPct) - 1);
        const eloFromPointDiff = 1500 + rollingMetrics.pointDiff * 10;
        const winPctWeight = Math.max(0.3, 1 - games / 82);
        elo = winPctWeight * eloFromWinPct + (1 - winPctWeight) * eloFromPointDiff;
      }

      return {
        ...team,
        netRating: rollingMetrics.netRating,
        ortg: rollingMetrics.ortg,
        drtg: rollingMetrics.drtg,
        elo: Math.round(elo),
        wins: rollingMetrics.wins,
        losses: rollingMetrics.losses,
        // Ranks will be recalculated below
        netRatingRank: 0,
        ortgRank: 0,
        drtgRank: 0,
        eloRank: 0,
      };
    });
  }, [rankings.teams, rollingMetrics]);

  // Recalculate ranks for each metric
  const rankedTeams = useMemo(() => {
    const teams = [...teamsWithDynamicHornets];

    // Net Rating rank (higher is better)
    const byNR = [...teams].sort((a, b) => b.netRating - a.netRating);
    byNR.forEach((t, i) => { t.netRatingRank = i + 1; });

    // ORTG rank (higher is better)
    const byORTG = [...teams].sort((a, b) => b.ortg - a.ortg);
    byORTG.forEach((t, i) => { t.ortgRank = i + 1; });

    // DRTG rank (lower is better)
    const byDRTG = [...teams].sort((a, b) => a.drtg - b.drtg);
    byDRTG.forEach((t, i) => { t.drtgRank = i + 1; });

    // Elo rank (higher is better)
    const byElo = [...teams].sort((a, b) => b.elo - a.elo);
    byElo.forEach((t, i) => { t.eloRank = i + 1; });

    return teams;
  }, [teamsWithDynamicHornets]);

  const sortedTeams = [...rankedTeams].sort((a, b) => {
    if (sortBy === 'drtg') {
      // Lower is better for DRTG
      return a.drtg - b.drtg;
    }
    // Higher is better for all other metrics
    return b[sortBy] - a[sortBy];
  });

  const columns: { key: SortKey; label: string; abbr: string }[] = [
    { key: 'netRating', label: 'Net Rating', abbr: 'NET' },
    { key: 'ortg', label: 'Offensive Rating', abbr: 'ORTG' },
    { key: 'drtg', label: 'Defensive Rating', abbr: 'DRTG' },
    { key: 'elo', label: 'Elo Rating', abbr: 'ELO' },
  ];

  const formatValue = (key: SortKey, value: number): string => {
    if (key === 'elo') return Math.round(value).toString();
    if (key === 'netRating') return (value > 0 ? '+' : '') + value.toFixed(1);
    return value.toFixed(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">League Rankings</h2>
          {windowLabel && (
            <p className="text-xs text-[#F9A01B]">
              Hornets stats: {windowLabel} {healthyOnly ? '(Healthy)' : '(All Games)'}
            </p>
          )}
        </div>
        <div className="text-xs text-slate-500">Click column to sort</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-2 text-slate-400 font-medium text-sm w-12">#</th>
              <th className="text-left py-3 px-2 text-slate-400 font-medium text-sm">Team</th>
              <th className="text-center py-3 px-2 text-slate-400 font-medium text-sm w-16">W-L</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => setSortBy(col.key)}
                  className={`text-right py-3 px-2 font-medium text-sm cursor-pointer transition-colors hover:text-white ${
                    sortBy === col.key ? 'text-[#F9A01B]' : 'text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-end gap-1">
                    {col.abbr}
                    {sortBy === col.key && (
                      <span className="text-[#F9A01B]">
                        {col.key === 'drtg' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, index) => {
              const isHornets = team.teamId === HORNETS_TEAM_ID;
              const rank = index + 1;

              return (
                <motion.tr
                  key={team.teamId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={`border-b border-slate-800 transition-colors ${
                    isHornets
                      ? 'bg-[#F9A01B]/10 hover:bg-[#F9A01B]/20'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className={`py-2.5 px-2 text-sm ${isHornets ? 'text-[#F9A01B] font-bold' : 'text-slate-500'}`}>
                    {rank}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isHornets ? 'text-[#F9A01B]' : 'text-white'}`}>
                        {team.teamAbbrev}
                      </span>
                      {isHornets && (
                        <span className="text-xs bg-[#F9A01B]/20 text-[#F9A01B] px-1.5 py-0.5 rounded">
                          YOU
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-center text-sm text-slate-400">
                    {team.wins}-{team.losses}
                  </td>
                  {columns.map((col) => {
                    const value = team[col.key];
                    const colRank = col.key === 'netRating' ? team.netRatingRank
                      : col.key === 'ortg' ? team.ortgRank
                      : col.key === 'drtg' ? team.drtgRank
                      : team.eloRank;

                    const isGood = col.key === 'drtg' ? colRank <= 10 : colRank <= 10;
                    const isBad = col.key === 'drtg' ? colRank >= 21 : colRank >= 21;

                    return (
                      <td
                        key={col.key}
                        className={`py-2.5 px-2 text-right text-sm font-mono ${
                          isHornets
                            ? 'text-[#F9A01B] font-semibold'
                            : sortBy === col.key
                            ? isGood
                              ? 'text-[#00A3B4]'
                              : isBad
                              ? 'text-red-400'
                              : 'text-white'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatValue(col.key, value)}
                      </td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span>NET = Offensive - Defensive Rating</span>
          <span>ELO = Team strength rating</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#F9A01B]/20 border border-[#F9A01B]/50" />
          <span>Hornets</span>
        </div>
      </div>
    </motion.div>
  );
}
