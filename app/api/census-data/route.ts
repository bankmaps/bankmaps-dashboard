// app/api/census-data/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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

    const orgId = req.nextUrl.searchParams.get('orgId');
    const year = req.nextUrl.searchParams.get('year');
    const metric = req.nextUrl.searchParams.get('metric');

    if (!orgId || !year || !metric) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Validate metric is in whitelist
    if (!ALLOWED_METRICS.includes(metric)) {
      return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Build query with whitelisted column name (safe to interpolate)
    const query = `
      SELECT DISTINCT c.geoid, c.${metric}
      FROM census_us c
      WHERE c.year = $1
        AND c.geoid IN (
          SELECT DISTINCT geoid 
          FROM cached_hmda 
          WHERE organization_id = $2
        )
    `;

    // Execute with parameterized values
    const rows = await sql(query, [year, parseInt(orgId)]);

    return NextResponse.json({ rows });

  } catch (error: any) {
    console.error('[CENSUS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
