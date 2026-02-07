// Core player definitions
export interface Player {
  id: number;
  name: string;
  position: string;
  isRookie?: boolean;
}

// Game data
export interface Game {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  result: 'W' | 'L';
  hornetsScore: number;
  opponentScore: number;
  isQualified: boolean;
  missingStarters: string[];
  ortg: number;
  drtg: number;
  netRating: number;
  pace: number;
  efgPct: number;
  tsPct: number;
  // Betting data (from historical odds or estimated)
  spread?: number;          // Spread at game time (negative = favorite)
  impliedWinPct?: number;   // Vegas implied win probability
  coveredSpread?: boolean;  // Did they cover?
}

// Aggregated team metrics
export interface TeamMetrics {
  netRating: number;
  netRatingRank: number;
  ortg: number;
  ortgRank: number;
  drtg: number;
  drtgRank: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  pace: number;
  paceRank: number;
  efgPct: number;
  efgPctRank: number;
  tsPct: number;
  tsPctRank: number;
}

// Betting odds for a game
export interface GameOdds {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  spread: number; // Negative = favorite, Positive = underdog
  moneyline: number;
  impliedWinPct: number;
  overUnder: number;
}

// Historical spread tracking
export interface SpreadHistory {
  date: string;
  averageSpread: number;
  gamesCount: number;
}

// Respect metrics
export interface RespectMetrics {
  averageSpread: number;
  spreadTrend: number; // Positive = gaining respect
  impliedWinPct: number;
  actualWinPct: number;
  respectGap: number; // Actual - Implied (positive = underrated)
  underdogRecord: { wins: number; losses: number };
  spreadHistory: SpreadHistory[];
}

// Upcoming game with odds
export interface UpcomingGame {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  spread: number | null;  // null if no line yet
  moneyline: number | null;
  impliedWinPct: number | null;
  overUnder: number | null;
  hasRealOdds?: boolean;
}

// Main data structure
export interface BuzzData {
  lastUpdated: string;
  seasonStartDate: string;
  trackingStartDate: string;
  coreStarters: Player[];

  // Game data
  totalGames: number;
  qualifiedGames: number;
  games: Game[];

  // Aggregated metrics for qualified games
  metrics: TeamMetrics;

  // Respect/odds data
  respectMetrics: RespectMetrics;
  upcomingGames: UpcomingGame[];

  // League context
  leagueAverages: {
    netRating: number;
    ortg: number;
    drtg: number;
    pace: number;
    efgPct: number;
    tsPct: number;
  };
}
