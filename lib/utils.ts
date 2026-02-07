import { BuzzData } from './types';

// Format a number with + sign for positive values
export function formatPlusMinus(value: number, decimals: number = 1): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

// Format percentage
export function formatPct(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Get rank suffix (1st, 2nd, 3rd, etc.)
export function getRankSuffix(rank: number): string {
  if (rank >= 11 && rank <= 13) return 'th';
  switch (rank % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Format rank display
export function formatRank(rank: number): string {
  return `#${rank}`;
}

// Get color based on rank (1 = best, 30 = worst)
export function getRankColor(rank: number): string {
  if (rank <= 5) return 'text-green-400';
  if (rank <= 10) return 'text-teal-400';
  if (rank <= 15) return 'text-yellow-400';
  if (rank <= 20) return 'text-orange-400';
  return 'text-red-400';
}

// Get buzz level description
export function getBuzzLevel(netRatingRank: number): { level: string; emoji: string; description: string } {
  if (netRatingRank <= 3) {
    return { level: 'ELITE', emoji: '🔥', description: 'Championship-caliber buzz!' };
  }
  if (netRatingRank <= 8) {
    return { level: 'HIGH', emoji: '🐝', description: 'The hive is thriving!' };
  }
  if (netRatingRank <= 15) {
    return { level: 'MODERATE', emoji: '📈', description: 'Building momentum...' };
  }
  if (netRatingRank <= 22) {
    return { level: 'LOW', emoji: '😐', description: 'Room for improvement.' };
  }
  return { level: 'MINIMAL', emoji: '📉', description: 'Tough times in the hive.' };
}

// Get respect level description
export function getRespectLevel(respectGap: number): { level: string; description: string } {
  if (respectGap >= 15) {
    return { level: 'HEAVILY UNDERRATED', description: 'Vegas has no idea!' };
  }
  if (respectGap >= 8) {
    return { level: 'UNDERRATED', description: 'Not getting the respect they deserve.' };
  }
  if (respectGap >= 2) {
    return { level: 'SLIGHTLY UNDERRATED', description: 'Perception catching up to reality.' };
  }
  if (respectGap >= -2) {
    return { level: 'FAIRLY RATED', description: 'Market knows the buzz.' };
  }
  if (respectGap >= -8) {
    return { level: 'SLIGHTLY OVERRATED', description: 'Need to prove the doubters wrong.' };
  }
  return { level: 'OVERRATED', description: 'Time to earn that respect.' };
}

// Convert American odds to implied probability
export function oddsToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// Format date for display
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format full date
export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Calculate gauge rotation (for meter components)
export function calculateGaugeRotation(value: number, min: number, max: number): number {
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized)) * 180 - 90; // -90 to 90 degrees
}

// Load buzz data
export async function loadBuzzData(): Promise<BuzzData> {
  // In a real app, this would fetch from the JSON file or API
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error('Failed to load buzz data');
  }
  return response.json();
}
