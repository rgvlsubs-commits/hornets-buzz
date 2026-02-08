'use client';

import { motion } from 'framer-motion';
import { PredictionMode } from '@/lib/model';

interface FloatingControlsProps {
  selectedWindow: number;
  onWindowChange: (window: number) => void;
  maxGames: number;
  healthyOnly: boolean;
  onHealthyToggle: (healthy: boolean) => void;
  totalGames: number;
  predictionMode: PredictionMode;
  onPredictionModeChange: (mode: PredictionMode) => void;
}

export default function FloatingControls({
  selectedWindow,
  onWindowChange,
  maxGames,
  healthyOnly,
  onHealthyToggle,
  totalGames,
  predictionMode,
  onPredictionModeChange,
}: FloatingControlsProps) {
  // Calculate the actual max for the slider based on healthyOnly mode
  const sliderMax = healthyOnly ? maxGames : totalGames;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50
                 bg-slate-900/95 backdrop-blur-md rounded-2xl md:rounded-full
                 px-4 py-3 md:px-6 border border-slate-700/50 shadow-2xl"
      style={{
        boxShadow: '0 0 30px rgba(0, 120, 140, 0.2), 0 10px 40px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Mobile: 2 rows, Desktop: 1 row */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        {/* Top row on mobile: Slider */}
        <div className="flex items-center gap-3 justify-between md:justify-start">
          <input
            type="range"
            min={1}
            max={sliderMax}
            step={1}
            value={Math.min(selectedWindow, sliderMax)}
            onChange={(e) => onWindowChange(parseInt(e.target.value))}
            className="flex-1 md:flex-none md:w-48 h-2 cursor-pointer"
          />
          <span className="text-sm text-slate-300 min-w-[80px] md:min-w-[100px] text-right md:text-left">
            {selectedWindow >= sliderMax ? (
              <span className="text-[#00A3B4]">All {sliderMax}</span>
            ) : (
              <span className="text-[#F9A01B] font-semibold">{selectedWindow} games</span>
            )}
          </span>
        </div>

        {/* Divider - hidden on mobile */}
        <div className="hidden md:block w-px h-6 bg-slate-700" />

        {/* Bottom row on mobile: Toggles */}
        <div className="flex items-center justify-between md:justify-start gap-4 md:gap-6">
          {/* Healthy Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Healthy</span>
            <button
              onClick={() => onHealthyToggle(!healthyOnly)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                healthyOnly
                  ? 'bg-[#00788C]'
                  : 'bg-slate-600'
              }`}
              aria-label={healthyOnly ? 'Showing healthy games only' : 'Showing all games'}
            >
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`absolute top-1 w-4 h-4 rounded-full shadow-md ${
                  healthyOnly
                    ? 'left-6 bg-[#F9A01B]'
                    : 'left-1 bg-slate-400'
                }`}
              />
            </button>
          </div>

          {/* Divider - hidden on mobile */}
          <div className="hidden md:block w-px h-6 bg-slate-700" />

          {/* Prediction Mode Toggle - 3 options */}
          {/* Bayesian is recommended for betting; Std/Buzz are diagnostics */}
          <div className="flex items-center">
            <button
              onClick={() => onPredictionModeChange('standard')}
              className={`px-2.5 py-1.5 rounded-l-full text-xs font-medium transition-colors ${
                predictionMode === 'standard'
                  ? 'bg-slate-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Standard: Full season data (diagnostic - conservative baseline)"
            >
              Std
            </button>
            <button
              onClick={() => onPredictionModeChange('bayesian')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                predictionMode === 'bayesian'
                  ? 'bg-[#00788C] text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Bayesian: Recommended for betting - blends Standard + Core 5 with shrinkage"
            >
              Bayes
            </button>
            <button
              onClick={() => onPredictionModeChange('buzzing')}
              className={`px-2.5 py-1.5 rounded-r-full text-xs font-medium transition-colors ${
                predictionMode === 'buzzing'
                  ? 'bg-[#F9A01B] text-slate-900'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Full Buzz: Core 5 only (diagnostic - aggressive upper bound)"
            >
              🐝
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
