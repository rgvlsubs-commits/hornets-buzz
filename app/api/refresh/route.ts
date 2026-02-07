import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    // Get API key from request body if provided
    const body = await request.json().catch(() => ({}));
    const oddsApiKey = body.oddsApiKey || process.env.ODDS_API_KEY;

    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_data.py');

    let command = `python "${scriptPath}"`;
    if (oddsApiKey) {
      command += ` --odds-api-key "${oddsApiKey}"`;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 120000, // 2 minute timeout
    });

    if (stderr && !stderr.includes('Warning')) {
      console.error('Script stderr:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'Data refreshed successfully',
      output: stdout,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support GET for cron jobs (Vercel Cron)
export async function GET() {
  return POST(new Request('http://localhost', { method: 'POST' }));
}
