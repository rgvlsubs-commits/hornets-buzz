import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Lightweight odds-only refresh endpoint.
 * Faster than full refresh - only updates betting lines.
 * Uses 1 API request per call.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const oddsApiKey = body.oddsApiKey || process.env.ODDS_API_KEY;

    const scriptPath = path.join(process.cwd(), 'scripts', 'refresh_odds.py');

    let command = `python "${scriptPath}"`;
    if (oddsApiKey) {
      command += ` --odds-api-key "${oddsApiKey}"`;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 30000, // 30 second timeout (faster than full refresh)
    });

    if (stderr && !stderr.includes('Warning')) {
      console.error('Script stderr:', stderr);
    }

    // Parse the output to get update info
    const spreadUpdates = stdout.match(/Spread .+ -> .+/g) || [];

    return NextResponse.json({
      success: true,
      message: 'Odds refreshed successfully',
      updates: spreadUpdates.length,
      output: stdout,
    });
  } catch (error) {
    console.error('Odds refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST(new Request('http://localhost', { method: 'POST' }));
}
