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
  spread?: number;          // Spread at game time (closing line)
  openingSpread?: number;   // Opening spread when first posted
  closingSpread?: number;   // Closing spread right before tipoff
  impliedWinPct?: number;   // Vegas implied win probability
  coveredSpread?: boolean;  // Did they cover?
  clv?: number;             // Closing Line Value (closing - opening, positive = got better number)
  // Opponent & rest data
  opponentNetRating?: number;  // Opponent's net rating
  restDays?: number;           // Days of rest before game
  isBackToBack?: boolean;      // Back-to-back game?
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

// Individual player injury
export interface PlayerInjury {
  name: string;
  position?: string;
  status: 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'DAY-TO-DAY' | 'AVAILABLE';
  injury: string;           // e.g., "right knee soreness"
  isKeyStar?: boolean;      // Is this a key player for the team?
  impactRating?: number;    // 1-5 scale of how much this affects the game
}

// Injury report for a game
export interface GameInjuryReport {
  hornetsInjuries: PlayerInjury[];
  opponentInjuries: PlayerInjury[];
  hornetsCore5Status: 'ALL_HEALTHY' | 'SOME_QUESTIONABLE' | 'KEY_PLAYER_OUT';
  opponentKeyPlayersStatus: string;  // e.g., "2 starters questionable"
  injuryImpact: string;              // Plain English summary
  spreadAdjustment?: number;         // Suggested adjustment based on injuries
  lastUpdated: string;
}

// Upcoming game with odds
export interface UpcomingGame {
  gameId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  spread: number | null;        // Current spread (null if no line yet)
  openingSpread?: number | null; // Opening spread when first posted
  spreadMovement?: number;       // Current - Opening (negative = line moved toward Hornets)
  moneyline: number | null;
  impliedWinPct: number | null;
  overUnder: number | null;
  hasRealOdds?: boolean;
  openingTimestamp?: string;    // When opening line was captured
  lastUpdated?: string;         // When current line was last updated
  // Opponent & rest data for predictions
  opponentNetRating?: number;    // Opponent's net rating
  restDays?: number;             // Days of rest before game
  isBackToBack?: boolean;        // Back-to-back game?
  opponentRestDays?: number;     // Opponent's days of rest
  opponentIsBackToBack?: boolean; // Is opponent on back-to-back?
  // Injury report
  injuryReport?: GameInjuryReport;
}

// League team with all metrics and ranks
export interface LeagueTeam {
  teamId: number;
  teamName: string;
  teamAbbrev: string;
  netRating: number;
  ortg: number;
  drtg: number;
  elo: number;
  wins: number;
  losses: number;
  netRatingRank: number;
  ortgRank: number;
  drtgRank: number;
  eloRank: number;
}

// League rankings data
export interface LeagueRankings {
  teams: LeagueTeam[];
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

  // League rankings (top 15 + Hornets for each metric)
  leagueRankings?: LeagueRankings;
}
