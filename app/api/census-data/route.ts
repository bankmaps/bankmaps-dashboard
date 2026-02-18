// app/api/census-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET!;

// Whitelist allowed metrics for security
const ALLOWED_METRICS = [
  'income_level',
  'majority_minority',
  'tract_population',
  'median_family_income'
];

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const year = req.nextUrl.searchParams.get('year');
    const metric = req.nextUrl.searchParams.get('metric');

    if (!year || !metric) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Validate metric is in whitelist
    if (!ALLOWED_METRICS.includes(metric)) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });
    }

    // Use pg Pool for raw SQL
    const pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Query ALL census tracts for the year - no org filter
    const query = `
      SELECT DISTINCT geoid, ${metric}
      FROM census_us
      WHERE year = $1
    `;

    const result = await pool.query(query, [year]);
    await pool.end();

    return NextResponse.json({ rows: result.rows });

  } catch (error: any) {
    console.error('[CENSUS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
