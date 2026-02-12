import { NextResponse } from 'next/server';

const GITHUB_REPO = 'rgvlsubs-commits/hornets-buzz';
const WORKFLOW_FILE = 'update-data.yml';

/**
 * Triggers the GitHub Actions "Update Hornets Buzz Data" workflow.
 * Used by the Vercel daily cron and can be called manually.
 */
async function triggerWorkflow() {
  const token = process.env.GH_PAT;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'GH_PAT environment variable not configured' },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) {
    return NextResponse.json({
      success: true,
      message: 'GitHub Actions workflow triggered. Data will update in ~2 minutes.',
    });
  }

  const errorText = await res.text();
  return NextResponse.json(
    { success: false, error: `GitHub API returned ${res.status}: ${errorText}` },
    { status: res.status }
  );
}

// GET handler for Vercel Cron
export async function GET(request: Request) {
  // Verify cron secret if configured (Vercel sends this automatically)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return triggerWorkflow();
}

// POST handler for manual triggers
export async function POST() {
  return triggerWorkflow();
}
