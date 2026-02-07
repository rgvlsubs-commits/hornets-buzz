'use client';

import { motion } from 'framer-motion';

interface FloatingControlsProps {
  selectedWindow: number;
  onWindowChange: (window: number) => void;
  maxGames: number;
  healthyOnly: boolean;
  onHealthyToggle: (healthy: boolean) => void;
  totalGames: number;
}

export default function FloatingControls({
  selectedWindow,
  onWindowChange,
  maxGames,
  healthyOnly,
  onHealthyToggle,
  totalGames,
}: FloatingControlsProps) {
  // Calculate the actual max for the slider based on healthyOnly mode
  const sliderMax = healthyOnly ? maxGames : totalGames;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50
                 bg-slate-900/95 backdrop-blur-md rounded-full
                 px-6 py-3 border border-slate-700/50 shadow-2xl
                 flex items-center gap-6"
      style={{
        boxShadow: '0 0 30px rgba(0, 120, 140, 0.2), 0 10px 40px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Range Slider */}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={sliderMax}
          step={1}
          value={Math.min(selectedWindow, sliderMax)}
          onChange={(e) => onWindowChange(parseInt(e.target.value))}
          className="w-32 md:w-48 h-2 cursor-pointer"
        />
        <span className="text-sm text-slate-300 min-w-[100px]">
          {selectedWindow >= sliderMax ? (
            <span className="text-[#00A3B4]">All {sliderMax} games</span>
          ) : (
            <>Last <span className="text-[#F9A01B] font-semibold">{selectedWindow}</span> games</>
          )}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-700" />

      {/* Healthy Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Healthy</span>
        <button
          onClick={() => onHealthyToggle(!healthyOnly)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
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
                ? 'left-7 bg-[#F9A01B]'
                : 'left-1 bg-slate-400'
            }`}
          />
        </button>
        <span className={`text-xs font-medium ${healthyOnly ? 'text-[#00A3B4]' : 'text-slate-500'}`}>
          {healthyOnly ? 'ON' : 'OFF'}
        </span>
      </div>
    </motion.div>
  );
}
