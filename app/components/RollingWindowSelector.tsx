'use client';

import { motion } from 'framer-motion';

interface RollingWindowSelectorProps {
  selectedWindow: number;
  onWindowChange: (window: number) => void;
  maxGames: number;
}

const WINDOWS = [4, 7, 10];

export default function RollingWindowSelector({
  selectedWindow,
  onWindowChange,
  maxGames,
}: RollingWindowSelectorProps) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-slate-400">Sample Size:</span>
      <div className="flex bg-slate-800 rounded-lg p-1">
        {WINDOWS.map((window) => {
          const isDisabled = window > maxGames;
          const isSelected = selectedWindow === window;

          return (
            <button
              key={window}
              onClick={() => !isDisabled && onWindowChange(window)}
              disabled={isDisabled}
              className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isDisabled
                  ? 'text-slate-600 cursor-not-allowed'
                  : isSelected
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId="window-selector"
                  className="absolute inset-0 bg-teal-600 rounded-md"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">Last {window}</span>
            </button>
          );
        })}
        <button
          onClick={() => onWindowChange(maxGames)}
          className={`relative px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            selectedWindow === maxGames && !WINDOWS.includes(maxGames)
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {selectedWindow === maxGames && !WINDOWS.includes(maxGames) && (
            <motion.div
              layoutId="window-selector"
              className="absolute inset-0 bg-teal-600 rounded-md"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-10">All ({maxGames})</span>
        </button>
      </div>
    </div>
  );
}
