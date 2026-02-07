'use client';

import { Game } from '@/lib/types';
import { formatDate, formatPlusMinus } from '@/lib/utils';

interface ATSPerformanceProps {
  games: Game[];
  spreads: Map<string, number>;
}

interface GameWithATS extends Game {
  spread: number;
  coverMargin: number;
  covered: boolean | null; // null = push
}

export default function ATSPerformance({ games, spreads }: ATSPerformanceProps) {
  const qualifiedGames = games.filter(g => g.isQualified);

  const gamesWithATS: GameWithATS[] = qualifiedGames.slice(0, 10).map(game => {
    const spread = spreads.get(game.gameId) ?? (game.isHome ? -3 : 3);
    const margin = game.hornetsScore - game.opponentScore;
    const coverMargin = margin + spread;

    let covered: boolean | null = null;
    if (Math.abs(coverMargin) >= 0.5) {
      covered = coverMargin > 0;
    }

    return { ...game, spread, coverMargin, covered };
  });

  const atsRecord = {
    wins: gamesWithATS.filter(g => g.covered === true).length,
    losses: gamesWithATS.filter(g => g.covered === false).length,
    pushes: gamesWithATS.filter(g => g.covered === null).length,
  };

  const avgCoverMargin = gamesWithATS.length > 0
    ? gamesWithATS.reduce((sum, g) => sum + g.coverMargin, 0) / gamesWithATS.length
    : 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-lg font-semibold text-slate-300 mb-4">
        Against The Spread (Last 10)
      </h2>

      {/* ATS Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">
            {atsRecord.wins}-{atsRecord.losses}
            {atsRecord.pushes > 0 && <span className="text-slate-400">-{atsRecord.pushes}</span>}
          </p>
          <p className="text-sm text-slate-400">ATS Record</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold ${avgCoverMargin > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatPlusMinus(avgCoverMargin)}
          </p>
          <p className="text-sm text-slate-400">Avg Cover Margin</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">
            {((atsRecord.wins / Math.max(1, atsRecord.wins + atsRecord.losses)) * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-slate-400">Cover Rate</p>
        </div>
      </div>

      {/* Game-by-game breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Opponent</th>
              <th className="text-center py-2 font-medium">Result</th>
              <th className="text-right py-2 font-medium">Spread</th>
              <th className="text-right py-2 font-medium">Margin</th>
              <th className="text-center py-2 font-medium">ATS</th>
            </tr>
          </thead>
          <tbody>
            {gamesWithATS.map((game) => (
              <tr
                key={game.gameId}
                className="border-b border-slate-800 hover:bg-slate-800/50"
              >
                <td className="py-2 text-slate-300">{formatDate(game.date)}</td>
                <td className="py-2">
                  <span className="text-slate-400 mr-1">
                    {game.isHome ? 'vs' : '@'}
                  </span>
                  <span className="text-white">{game.opponent}</span>
                </td>
                <td className="py-2 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                      game.result === 'W'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {game.result}
                  </span>
                  <span className="ml-2 text-slate-400">
                    {game.hornetsScore}-{game.opponentScore}
                  </span>
                </td>
                <td className="py-2 text-right text-slate-300">
                  {game.spread > 0 ? '+' : ''}{game.spread}
                </td>
                <td className={`py-2 text-right font-medium ${
                  game.hornetsScore - game.opponentScore > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPlusMinus(game.hornetsScore - game.opponentScore)}
                </td>
                <td className="py-2 text-center">
                  {game.covered === true && (
                    <span className="inline-flex items-center justify-center w-16 px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-bold">
                      COVER {formatPlusMinus(game.coverMargin)}
                    </span>
                  )}
                  {game.covered === false && (
                    <span className="inline-flex items-center justify-center w-16 px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-bold">
                      MISS {formatPlusMinus(game.coverMargin)}
                    </span>
                  )}
                  {game.covered === null && (
                    <span className="inline-flex items-center justify-center w-16 px-2 py-1 rounded bg-slate-700 text-slate-400 text-xs font-bold">
                      PUSH
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
