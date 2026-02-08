'use client';

import { useState, useEffect, useMemo } from 'react';
import { BuzzData } from '@/lib/types';
import {
  calculateRollingMetrics,
  calculateBuzzingMetrics,
  analyzeTrend,
  predictSpread,
  getHistoricalSpreads,
  RollingMetrics,
  TrendAnalysis,
  SpreadPrediction,
  PredictionMode,
} from '@/lib/model';
import BuzzMeter from './components/BuzzMeter';
import RespectMeter from './components/RespectMeter';
import StatsTable from './components/StatsTable';
import GameLog from './components/GameLog';
import ComparisonChart from './components/ComparisonChart';
import FloatingControls from './components/FloatingControls';
import RollingComparison from './components/RollingComparison';
import ATSPerformance from './components/ATSPerformance';
import SpreadPredictionComponent from './components/SpreadPrediction';
import LeagueRankings from './components/LeagueRankings';

export default function Home() {
  const [data, setData] = useState<BuzzData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'rolling' | 'ats' | 'predictions' | 'games'>('overview');
  const [selectedWindow, setSelectedWindow] = useState(10);
  const [healthyOnly, setHealthyOnly] = useState(true);
  const [predictionMode, setPredictionMode] = useState<PredictionMode>('standard');

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

    // Calculate max games based on healthyOnly filter
    const maxGames = healthyOnly ? data.qualifiedGames : data.totalGames;

    const rollingMetrics = {
      last4: calculateRollingMetrics(data.games, 4, spreads, healthyOnly),
      last7: calculateRollingMetrics(data.games, 7, spreads, healthyOnly),
      last10: calculateRollingMetrics(data.games, 10, spreads, healthyOnly),
      season: calculateRollingMetrics(data.games, maxGames, spreads, healthyOnly),
    };

    const trend = analyzeTrend(data.games);

    // Calculate buzzing metrics (last 15 healthy games)
    const buzzingMetrics = calculateBuzzingMetrics(data.games, spreads);

    // Generate predictions for upcoming games
    const predictions = new Map<string, SpreadPrediction>();
    for (const game of data.upcomingGames) {
      const prediction = predictSpread(
        game,
        rollingMetrics,
        trend,
        0,
        predictionMode,
        buzzingMetrics
      );
      predictions.set(game.gameId, prediction);
    }

    return { rollingMetrics, trend, predictions, spreads, maxGames, buzzingMetrics };
  }, [data, healthyOnly, predictionMode]);

  // Get currently selected window metrics
  const selectedMetrics = useMemo(() => {
    if (!computedData) return null;
    const { rollingMetrics, maxGames } = computedData;

    if (selectedWindow <= 4) return rollingMetrics.last4;
    if (selectedWindow <= 7) return rollingMetrics.last7;
    if (selectedWindow <= 10) return rollingMetrics.last10;
    return rollingMetrics.season;
  }, [computedData, selectedWindow]);

  // Handle window change - ensure it doesn't exceed max
  const handleWindowChange = (window: number) => {
    const maxGames = healthyOnly ? (data?.qualifiedGames ?? 10) : (data?.totalGames ?? 10);
    setSelectedWindow(Math.min(window, maxGames));
  };

  // Handle healthy toggle - reset window if needed
  const handleHealthyToggle = (healthy: boolean) => {
    setHealthyOnly(healthy);
    const newMax = healthy ? (data?.qualifiedGames ?? 10) : (data?.totalGames ?? 10);
    if (selectedWindow > newMax) {
      setSelectedWindow(newMax);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#00788C] mx-auto mb-4" />
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

  const { rollingMetrics, trend, predictions, spreads, maxGames } = computedData;

  return (
    <div className="min-h-screen pb-32 md:pb-24">
      {/* Header */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-[#005F6B] to-[#00788C]">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="text-4xl">🐝</div>
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                HOW MUCH ARE WE BUZZING?
              </h1>
              <div className="gold-accent-line w-48 md:w-64 my-2" />
              <p className="text-[#00A3B4] text-sm">
                Tracking the Core 5's buzz since Oct 22, 2025
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
                  <span className="ml-1 text-xs text-[#F9A01B]">R</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Quick stats bar - updates with window */}
        <div className="mb-8 p-4 bg-gradient-to-r from-[#005F6B]/30 to-[#00788C]/30 rounded-xl border border-[#00788C]/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">
              {healthyOnly ? 'Healthy Games' : 'All Games'}: Last {selectedWindow >= maxGames ? maxGames : selectedWindow}
            </span>
            <div className="flex items-center gap-2">
              {trend.direction === 'up' && (
                <span className="text-[#00A3B4] text-sm">↑ Trending Up</span>
              )}
              {trend.direction === 'down' && (
                <span className="text-red-400 text-sm">↓ Trending Down</span>
              )}
              {trend.streakLength >= 2 && (
                <span className={`text-sm ${trend.streakType === 'W' ? 'text-[#00A3B4]' : 'text-red-400'}`}>
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
              <p className={`text-2xl font-bold ${(selectedMetrics?.netRating ?? 0) > 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                {(selectedMetrics?.netRating ?? 0) > 0 ? '+' : ''}{selectedMetrics?.netRating.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">Net Rating</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${(selectedMetrics?.pointDiff ?? 0) > 0 ? 'text-[#00A3B4]' : 'text-red-400'}`}>
                {(selectedMetrics?.pointDiff ?? 0) > 0 ? '+' : ''}{selectedMetrics?.pointDiff.toFixed(1)}
              </p>
              <p className="text-sm text-slate-400">Point Diff</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#F9A01B]">
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
        <div className="flex flex-wrap gap-1.5 md:gap-2 mb-6 border-b border-slate-700 pb-2 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', mobileLabel: 'Overview' },
            { id: 'rolling', label: 'Rolling Trends', mobileLabel: 'Rolling' },
            { id: 'ats', label: 'vs Spread', mobileLabel: 'ATS' },
            { id: 'predictions', label: 'Predictions', mobileLabel: 'Predict' },
            { id: 'games', label: 'Game Log', mobileLabel: 'Games' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3 md:px-4 py-2 rounded-t-lg font-medium transition-colors text-sm md:text-base whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border-t border-l border-r border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span className="md:hidden">{tab.mobileLabel}</span>
              <span className="hidden md:inline">{tab.label}</span>
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
                windowLabel={selectedWindow >= maxGames ? 'All Games' : `Last ${selectedWindow} Games`}
              />
              <RespectMeter
                respectMetrics={data.respectMetrics}
                rollingMetrics={selectedMetrics ?? undefined}
                windowLabel={selectedWindow >= maxGames ? 'All Games' : `Last ${selectedWindow} Games`}
                games={data.games}
                windowSize={selectedWindow >= maxGames ? 999 : selectedWindow}
              />
            </div>

            {/* Stats table */}
            <StatsTable
              metrics={data.metrics}
              leagueAverages={data.leagueAverages}
            />

            {/* League Rankings */}
            {data.leagueRankings && (
              <LeagueRankings
                rankings={data.leagueRankings}
                rollingMetrics={selectedMetrics ?? undefined}
                windowLabel={selectedWindow >= maxGames ? 'All Games' : `Last ${selectedWindow} Games`}
                healthyOnly={healthyOnly}
              />
            )}

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

      {/* Floating Controls */}
      <FloatingControls
        selectedWindow={selectedWindow}
        onWindowChange={handleWindowChange}
        maxGames={data.qualifiedGames}
        healthyOnly={healthyOnly}
        onHealthyToggle={handleHealthyToggle}
        totalGames={data.totalGames}
        predictionMode={predictionMode}
        onPredictionModeChange={setPredictionMode}
      />
    </div>
  );
}
