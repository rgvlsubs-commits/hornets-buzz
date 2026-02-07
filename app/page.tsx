'use client';

import { useState, useEffect, useMemo } from 'react';
import { BuzzData } from '@/lib/types';
import {
  calculateRollingMetrics,
  analyzeTrend,
  predictSpread,
  getHistoricalSpreads,
  RollingMetrics,
  TrendAnalysis,
  SpreadPrediction,
} from '@/lib/model';
import BuzzMeter from './components/BuzzMeter';
import RespectMeter from './components/RespectMeter';
import StatsTable from './components/StatsTable';
import GameLog from './components/GameLog';
import ComparisonChart from './components/ComparisonChart';
import RollingWindowSelector from './components/RollingWindowSelector';
import RollingComparison from './components/RollingComparison';
import ATSPerformance from './components/ATSPerformance';
import SpreadPredictionComponent from './components/SpreadPrediction';

export default function Home() {
  const [data, setData] = useState<BuzzData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'rolling' | 'ats' | 'predictions' | 'games'>('overview');
  const [selectedWindow, setSelectedWindow] = useState(10);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to load data');
        const buzzData = await response.json();
        setData(buzzData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute rolling metrics and predictions
  const computedData = useMemo(() => {
    if (!data) return null;

    const spreads = getHistoricalSpreads(data.games);

    const rollingMetrics = {
      last4: calculateRollingMetrics(data.games, 4, spreads),
      last7: calculateRollingMetrics(data.games, 7, spreads),
      last10: calculateRollingMetrics(data.games, 10, spreads),
      season: calculateRollingMetrics(data.games, data.qualifiedGames, spreads),
    };

    const trend = analyzeTrend(data.games);

    // Generate predictions for upcoming games
    const predictions = new Map<string, SpreadPrediction>();
    for (const game of data.upcomingGames) {
      const prediction = predictSpread(game, rollingMetrics, trend, 0);
      predictions.set(game.gameId, prediction);
    }

    return { rollingMetrics, trend, predictions, spreads };
  }, [data]);

  // Get currently selected window metrics
  const selectedMetrics = useMemo(() => {
    if (!computedData) return null;
    const { rollingMetrics } = computedData;

    if (selectedWindow <= 4) return rollingMetrics.last4;
    if (selectedWindow <= 7) return rollingMetrics.last7;
    if (selectedWindow <= 10) return rollingMetrics.last10;
    return rollingMetrics.season;
  }, [computedData, selectedWindow]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-teal-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading buzz data...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !computedData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-2">Failed to load data</p>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  const { rollingMetrics, trend, predictions, spreads } = computedData;

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-[#1D1160] to-[#00788C]">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🐝</div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                HORNETS BUZZ TRACKER
              </h1>
              <p className="text-teal-200 text-sm">
                Tracking the Core 5 since Dec 15, 2024
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Core starters banner */}
        <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400 mb-2">Core 5 Starters:</p>
          <div className="flex flex-wrap gap-2">
            {data.coreStarters.map((player) => (
              <span
                key={player.id}
                className="px-3 py-1 bg-slate-700 rounded-full text-sm text-white"
              >
                {player.name}
                <span className="text-slate-400 ml-1">({player.position})</span>
                {player.isRookie && (
                  <span className="ml-1 text-xs text-amber-400">R</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Window selector */}
        <div className="mb-6">
          <RollingWindowSelector
            selectedWindow={selectedWindow}
            onWindowChange={setSelectedWindow}
            maxGames={data.qualifiedGames}
          />
        </div>

        {/* Quick stats bar - updates with window */}
        <div className="mb-8 p-4 bg-gradient-to-r from-teal-900/50 to-purple-900/50 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">
              Last {selectedWindow <= 10 ? selectedWindow : data.qualifiedGames} Qualified Games
            </span>
            <div className="flex items-center gap-2">
              {trend.direction === 'up' && (
                <span className="text-green-400 text-sm">↑ Trending Up</span>
              )}
              {trend.direction === 'down' && (
                <span className="text-red-400 text-sm">↓ Trending Down</span>
              )}
              {trend.streakLength >= 2 && (
                <span className={`text-sm ${trend.streakType === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                  ({trend.streakLength}{trend.streakType} streak)
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">
                {selectedMetrics?.wins}-{selectedMetrics?.losses}
              </p>
              <p className="text-sm text-slate-400">Record</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${(selectedMetrics?.netRating ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(selectedMetrics?.netRating ?? 0) > 0 ? '+' : ''}{selectedMetrics?.netRating.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">Net Rating</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${(selectedMetrics?.pointDiff ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(selectedMetrics?.pointDiff ?? 0) > 0 ? '+' : ''}{selectedMetrics?.pointDiff.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">Point Diff</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-teal-400">
                {selectedMetrics?.ortg.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">ORTG</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-400">
                {selectedMetrics?.drtg.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">DRTG</p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-700 pb-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'rolling', label: 'Rolling Trends' },
            { id: 'ats', label: 'vs Spread' },
            { id: 'predictions', label: 'Predictions' },
            { id: 'games', label: 'Game Log' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border-t border-l border-r border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Meters row */}
            <div className="grid md:grid-cols-2 gap-6">
              <BuzzMeter
                metrics={data.metrics}
                rollingMetrics={selectedMetrics ?? undefined}
                windowLabel={selectedWindow <= 10 ? `Last ${selectedWindow} Games` : 'All Qualified Games'}
              />
              <RespectMeter
                respectMetrics={data.respectMetrics}
                rollingMetrics={selectedMetrics ?? undefined}
                windowLabel={selectedWindow <= 10 ? `Last ${selectedWindow} Games` : 'All Qualified Games'}
                games={data.games}
                windowSize={selectedWindow <= 10 ? selectedWindow : 999}
              />
            </div>

            {/* Stats table */}
            <StatsTable
              metrics={data.metrics}
              leagueAverages={data.leagueAverages}
            />

            {/* Odds chart with predictions */}
            <ComparisonChart
              spreadHistory={data.respectMetrics.spreadHistory}
              upcomingGames={data.upcomingGames}
              predictions={predictions}
            />
          </div>
        )}

        {activeTab === 'rolling' && (
          <RollingComparison
            metrics={rollingMetrics}
            trend={trend}
            selectedWindow={selectedWindow}
          />
        )}

        {activeTab === 'ats' && (
          <ATSPerformance
            games={data.games}
            spreads={spreads}
          />
        )}

        {activeTab === 'predictions' && (
          <SpreadPredictionComponent
            upcomingGames={data.upcomingGames}
            predictions={predictions}
            metrics={rollingMetrics}
            trend={trend}
          />
        )}

        {activeTab === 'games' && (
          <GameLog
            games={data.games}
            totalGames={data.totalGames}
            qualifiedGames={data.qualifiedGames}
          />
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>
            Last updated: {new Date(data.lastUpdated).toLocaleString()}
          </p>
          <p className="mt-1">
            Data from NBA API and The Odds API
          </p>
        </footer>
      </main>
    </div>
  );
}
