'use client';

import { useState } from 'react';
import { Game } from '@/lib/types';
import { formatDate, formatPlusMinus } from '@/lib/utils';

interface GameLogProps {
  games: Game[];
  totalGames: number;
  qualifiedGames: number;
}

export default function GameLog({ games, totalGames, qualifiedGames }: GameLogProps) {
  const [showExcluded, setShowExcluded] = useState(false);

  const qualifiedGamesList = games.filter((g) => g.isQualified);
  const excludedGamesList = games.filter((g) => !g.isQualified);

  const displayedGames = showExcluded ? games : qualifiedGamesList;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-300">Game Log</h2>
          <p className="text-sm text-slate-500">
            {qualifiedGames} of {totalGames} games qualified (all 5 starters played)
          </p>
        </div>
        <button
          onClick={() => setShowExcluded(!showExcluded)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showExcluded
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {showExcluded ? 'Showing All' : 'Show Excluded'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-slate-400 text-sm border-b border-slate-700">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Opponent</th>
              <th className="text-center py-2 font-medium">Result</th>
              <th className="text-right py-2 font-medium">ORTG</th>
              <th className="text-right py-2 font-medium">DRTG</th>
              <th className="text-right py-2 font-medium">NET</th>
              {showExcluded && (
                <th className="text-left py-2 font-medium pl-4">Status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayedGames.map((game) => (
              <tr
                key={game.gameId}
                className={`border-b border-slate-800 transition-colors ${
                  game.isQualified
                    ? 'hover:bg-slate-800/50'
                    : 'bg-slate-800/30 opacity-60'
                }`}
              >
                <td className="py-3 text-slate-300">{formatDate(game.date)}</td>
                <td className="py-3">
                  <span className="text-slate-400 mr-1">
                    {game.isHome ? 'vs' : '@'}
                  </span>
                  <span className="text-white">{game.opponent}</span>
                </td>
                <td className="py-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold ${
                      game.result === 'W'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {game.result}
                  </span>
                  <span className="ml-2 text-slate-400 text-sm">
                    {game.hornetsScore}-{game.opponentScore}
                  </span>
                </td>
                <td className="py-3 text-right text-slate-300">
                  {game.ortg.toFixed(1)}
                </td>
                <td className="py-3 text-right text-slate-300">
                  {game.drtg.toFixed(1)}
                </td>
                <td
                  className={`py-3 text-right font-semibold ${
                    game.netRating > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {formatPlusMinus(game.netRating)}
                </td>
                {showExcluded && (
                  <td className="py-3 pl-4">
                    {game.isQualified ? (
                      <span className="text-green-400 text-sm">Qualified</span>
                    ) : (
                      <div>
                        <span className="text-amber-400 text-sm">Excluded</span>
                        <p className="text-xs text-slate-500">
                          Missing: {game.missingStarters.join(', ')}
                        </p>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showExcluded && excludedGamesList.length > 0 && (
        <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
          <p className="text-sm text-slate-400">
            <span className="text-amber-400 font-medium">
              {excludedGamesList.length} games excluded
            </span>{' '}
            due to missing core starters. Click &quot;Show Excluded&quot; to see all games.
          </p>
        </div>
      )}
    </div>
  );
}
