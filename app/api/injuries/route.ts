import { NextResponse } from 'next/server';
import { GameInjuryReport, PlayerInjury } from '@/lib/types';
import fs from 'fs';
import path from 'path';

// Core 5 starters to monitor
const CORE_5_NAMES = [
  'LaMelo Ball',
  'Kon Knueppel',
  'Brandon Miller',
  'Miles Bridges',
  'Moussa Diabaté',
];

// Known star players by team (for impact assessment)
const TEAM_STARS: Record<string, string[]> = {
  'Detroit Pistons': ['Cade Cunningham', 'Jalen Duren', 'Tobias Harris'],
  'Cleveland Cavaliers': ['Donovan Mitchell', 'Darius Garland', 'Evan Mobley', 'Jarrett Allen', 'James Harden'],
  'Boston Celtics': ['Jayson Tatum', 'Jaylen Brown', 'Derrick White', 'Kristaps Porzingis'],
  'Oklahoma City Thunder': ['Shai Gilgeous-Alexander', 'Chet Holmgren', 'Jalen Williams'],
  'New York Knicks': ['Jalen Brunson', 'Karl-Anthony Towns', 'Mikal Bridges', 'OG Anunoby'],
  'Milwaukee Bucks': ['Giannis Antetokounmpo', 'Damian Lillard', 'Khris Middleton'],
  'Philadelphia 76ers': ['Joel Embiid', 'Tyrese Maxey', 'Paul George'],
  'Miami Heat': ['Jimmy Butler', 'Bam Adebayo', 'Tyler Herro'],
  'Atlanta Hawks': ['Trae Young', 'Jalen Johnson', 'De\'Andre Hunter'],
  'Houston Rockets': ['Jalen Green', 'Alperen Sengun', 'Fred VanVleet'],
  'Denver Nuggets': ['Nikola Jokic', 'Jamal Murray', 'Michael Porter Jr.'],
  'Los Angeles Lakers': ['LeBron James', 'Anthony Davis', 'Austin Reaves'],
  'Golden State Warriors': ['Stephen Curry', 'Draymond Green', 'Andrew Wiggins'],
  'Phoenix Suns': ['Kevin Durant', 'Devin Booker', 'Bradley Beal'],
  'Dallas Mavericks': ['Luka Doncic', 'Kyrie Irving', 'Klay Thompson'],
  'Memphis Grizzlies': ['Ja Morant', 'Jaren Jackson Jr.', 'Desmond Bane'],
  'New Orleans Pelicans': ['Zion Williamson', 'Brandon Ingram', 'CJ McCollum'],
  'Sacramento Kings': ['De\'Aaron Fox', 'Domantas Sabonis', 'Keegan Murray'],
  'Los Angeles Clippers': ['Kawhi Leonard', 'James Harden', 'Norman Powell'],
  'Minnesota Timberwolves': ['Anthony Edwards', 'Rudy Gobert', 'Julius Randle'],
  'Indiana Pacers': ['Tyrese Haliburton', 'Pascal Siakam', 'Myles Turner'],
  'Orlando Magic': ['Paolo Banchero', 'Franz Wagner', 'Jalen Suggs'],
  'Chicago Bulls': ['Zach LaVine', 'Coby White', 'Nikola Vucevic'],
  'Brooklyn Nets': ['Cam Thomas', 'Ben Simmons', 'Nic Claxton'],
  'Toronto Raptors': ['Scottie Barnes', 'RJ Barrett', 'Immanuel Quickley'],
  'Portland Trail Blazers': ['Anfernee Simons', 'Scoot Henderson', 'Jerami Grant'],
  'Utah Jazz': ['Lauri Markkanen', 'Collin Sexton', 'Jordan Clarkson'],
  'San Antonio Spurs': ['Victor Wembanyama', 'Devin Vassell', 'Keldon Johnson'],
  'Washington Wizards': ['Jordan Poole', 'Kyle Kuzma', 'Bilal Coulibaly'],
  'Charlotte Hornets': CORE_5_NAMES,
};

/**
 * Analyze injuries and generate plain English summary
 */
function analyzeInjuries(
  hornetsInjuries: PlayerInjury[],
  opponentInjuries: PlayerInjury[],
  opponentName: string
): { summary: string; adjustment: number; core5Status: GameInjuryReport['hornetsCore5Status'] } {
  const summaryParts: string[] = [];
  let adjustment = 0;

  // Check Core 5 status
  const core5Injured = hornetsInjuries.filter(p =>
    CORE_5_NAMES.some(name => p.name.toLowerCase().includes(name.toLowerCase()))
  );

  let core5Status: GameInjuryReport['hornetsCore5Status'] = 'ALL_HEALTHY';

  if (core5Injured.some(p => p.status === 'OUT' || p.status === 'DOUBTFUL')) {
    core5Status = 'KEY_PLAYER_OUT';
    const outPlayers = core5Injured.filter(p => p.status === 'OUT' || p.status === 'DOUBTFUL');
    summaryParts.push(`CAUTION: ${outPlayers.map(p => p.name).join(', ')} ${outPlayers.length > 1 ? 'are' : 'is'} out/doubtful. This significantly impacts our Core 5 thesis.`);
    adjustment -= 3.0 * outPlayers.length;
  } else if (core5Injured.some(p => p.status === 'QUESTIONABLE' || p.status === 'DAY-TO-DAY')) {
    core5Status = 'SOME_QUESTIONABLE';
    summaryParts.push(`Monitor: ${core5Injured.map(p => p.name).join(', ')} ${core5Injured.length > 1 ? 'are' : 'is'} questionable. Check status before tip-off.`);
  } else {
    summaryParts.push('All Core 5 starters are healthy and available.');
  }

  // Check opponent injuries
  const opponentStars = TEAM_STARS[opponentName] || [];
  const opponentStarsOut = opponentInjuries.filter(p =>
    (p.status === 'OUT' || p.status === 'DOUBTFUL') &&
    opponentStars.some(star => p.name.toLowerCase().includes(star.toLowerCase()))
  );

  const opponentStarsQuestionable = opponentInjuries.filter(p =>
    (p.status === 'QUESTIONABLE' || p.status === 'DAY-TO-DAY') &&
    opponentStars.some(star => p.name.toLowerCase().includes(star.toLowerCase()))
  );

  if (opponentStarsOut.length > 0) {
    summaryParts.push(`ADVANTAGE: ${opponentName} will be without ${opponentStarsOut.map(p => p.name).join(', ')}. This weakens their rotation significantly.`);
    adjustment += 2.0 * opponentStarsOut.length;
  }

  if (opponentStarsQuestionable.length > 0) {
    summaryParts.push(`${opponentName}'s ${opponentStarsQuestionable.map(p => p.name).join(', ')} ${opponentStarsQuestionable.length > 1 ? 'are' : 'is'} questionable - monitor for updates.`);
    adjustment += 0.5 * opponentStarsQuestionable.length;
  }

  if (opponentStarsOut.length === 0 && opponentStarsQuestionable.length === 0) {
    if (opponentInjuries.filter(p => p.status === 'OUT').length > 0) {
      summaryParts.push(`${opponentName} has some depth players out, but key rotation intact.`);
    } else {
      summaryParts.push(`${opponentName} appears healthy with no major injuries reported.`);
    }
  }

  // Add net assessment
  if (adjustment > 2) {
    summaryParts.push(`Net injury edge: +${adjustment.toFixed(1)} pts in Hornets' favor.`);
  } else if (adjustment < -2) {
    summaryParts.push(`Net injury impact: ${adjustment.toFixed(1)} pts. Consider reducing position.`);
  }

  return {
    summary: summaryParts.join(' '),
    adjustment: Math.round(adjustment * 10) / 10,
    core5Status,
  };
}

/**
 * GET /api/injuries?opponent=Detroit%20Pistons&gameId=123
 *
 * Returns injury report for an upcoming game.
 * In production, this would fetch from an injury API.
 * For now, returns manually curated data or placeholder.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const opponent = searchParams.get('opponent');
  const gameId = searchParams.get('gameId');

  if (!opponent) {
    return NextResponse.json({ error: 'opponent parameter required' }, { status: 400 });
  }

  // Load existing injury data if available
  const dataPath = path.join(process.cwd(), 'data', 'injury_reports.json');
  let injuryData: Record<string, GameInjuryReport> = {};

  try {
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf-8');
      injuryData = JSON.parse(content);
    }
  } catch {
    // File doesn't exist or is invalid, use empty object
  }

  // Check if we have cached data for this game (try gameId first, then opponent name)
  if (gameId && injuryData[gameId]) {
    return NextResponse.json(injuryData[gameId]);
  }
  if (opponent && injuryData[opponent]) {
    return NextResponse.json(injuryData[opponent]);
  }

  // Return placeholder - in production would fetch from injury API
  const placeholderReport: GameInjuryReport = {
    hornetsInjuries: [],
    opponentInjuries: [],
    hornetsCore5Status: 'ALL_HEALTHY',
    opponentKeyPlayersStatus: 'Status unknown - check closer to game time',
    injuryImpact: `Injury report pending for ${opponent} game. Check back closer to tip-off for updates.`,
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(placeholderReport);
}

/**
 * POST /api/injuries
 *
 * Update injury report for a game (called manually or by cron)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gameId, opponent, hornetsInjuries, opponentInjuries } = body;

    if (!opponent) {
      return NextResponse.json({ error: 'opponent required' }, { status: 400 });
    }

    // Analyze injuries
    const analysis = analyzeInjuries(
      hornetsInjuries || [],
      opponentInjuries || [],
      opponent
    );

    // Build report
    const report: GameInjuryReport = {
      hornetsInjuries: hornetsInjuries || [],
      opponentInjuries: opponentInjuries || [],
      hornetsCore5Status: analysis.core5Status,
      opponentKeyPlayersStatus: `${(opponentInjuries || []).filter((p: PlayerInjury) => p.status === 'OUT').length} players OUT`,
      injuryImpact: analysis.summary,
      spreadAdjustment: analysis.adjustment,
      lastUpdated: new Date().toISOString(),
    };

    // Save to file
    const dataPath = path.join(process.cwd(), 'data', 'injury_reports.json');
    let injuryData: Record<string, GameInjuryReport> = {};

    try {
      if (fs.existsSync(dataPath)) {
        const content = fs.readFileSync(dataPath, 'utf-8');
        injuryData = JSON.parse(content);
      }
    } catch {
      // Start fresh
    }

    const cacheKey = gameId || opponent;
    injuryData[cacheKey] = report;

    fs.writeFileSync(dataPath, JSON.stringify(injuryData, null, 2));

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update injuries' }, { status: 500 });
  }
}
