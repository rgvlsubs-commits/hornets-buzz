import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

interface OddsOutcome {
  name: string;
  price?: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  markets: OddsMarket[];
}

interface OddsGame {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBookmaker[];
}

/**
 * Lightweight odds-only refresh — calls The Odds API directly from Vercel.
 * Returns updated upcoming games so the client can merge them in-memory.
 */
export async function POST() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'ODDS_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch current odds
    const params = new URLSearchParams({
      apiKey,
      regions: 'us',
      markets: 'spreads,h2h',
      oddsFormat: 'american',
      bookmakers: 'draftkings,fanduel,betmgm',
    });

    const oddsRes = await fetch(`${ODDS_API_BASE}/sports/basketball_nba/odds?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (oddsRes.status === 401) {
      return NextResponse.json({ success: false, error: 'Invalid Odds API key' }, { status: 401 });
    }
    if (!oddsRes.ok) {
      return NextResponse.json({ success: false, error: `Odds API returned ${oddsRes.status}` }, { status: 502 });
    }

    const remaining = oddsRes.headers.get('x-requests-remaining') ?? 'unknown';
    const oddsData: OddsGame[] = await oddsRes.json();

    // Load current data to get existing upcoming games
    const dataPath = path.join(process.cwd(), 'data', 'hornets_buzz.json');
    const buzzData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const upcomingGames = buzzData.upcomingGames ?? [];

    // Build odds lookup for Hornets games
    const oddsLookup: Record<string, { spread: number | null; moneyline: number | null }> = {};
    for (const game of oddsData) {
      const isHornetsHome = game.home_team.includes('Hornets');
      const isHornetsAway = game.away_team.includes('Hornets');
      if (!isHornetsHome && !isHornetsAway) continue;

      const opponent = isHornetsHome ? game.away_team : game.home_team;
      let spread: number | null = null;
      let moneyline: number | null = null;

      for (const bookmaker of game.bookmakers) {
        for (const market of bookmaker.markets) {
          if (market.key === 'spreads') {
            const hornetsOutcome = market.outcomes.find(o => o.name.includes('Hornets'));
            if (hornetsOutcome?.point != null) spread = hornetsOutcome.point;
          } else if (market.key === 'h2h') {
            const hornetsOutcome = market.outcomes.find(o => o.name.includes('Hornets'));
            if (hornetsOutcome?.price != null) moneyline = hornetsOutcome.price;
          }
        }
        if (spread !== null) break;
      }

      oddsLookup[opponent] = { spread, moneyline };
    }

    // Merge odds into upcoming games
    let updates = 0;
    const updatedGames = upcomingGames.map((game: Record<string, unknown>) => {
      const opponent = game.opponent as string;
      const matchedKey = Object.keys(oddsLookup).find(
        key => (opponent && key.includes(opponent)) || (opponent && opponent.includes(key))
      );

      if (!matchedKey) return game;

      const odds = oddsLookup[matchedKey];
      const oldSpread = game.spread as number | null;
      const newSpread = odds.spread;

      if (oldSpread !== newSpread) updates++;

      const openingSpread = game.openingSpread ?? oldSpread;
      const spreadMovement = openingSpread != null && newSpread != null
        ? Math.round((newSpread - (openingSpread as number)) * 10) / 10
        : undefined;

      return {
        ...game,
        spread: newSpread,
        moneyline: odds.moneyline,
        openingSpread: openingSpread,
        spreadMovement,
        lastUpdated: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      message: `Odds refreshed — ${updates} game(s) updated`,
      apiRequestsRemaining: remaining,
      upcomingGames: updatedGames,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
