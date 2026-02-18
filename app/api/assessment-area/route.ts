// app/api/assessment-area/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const orgId = req.nextUrl.searchParams.get('orgId');
    const year = req.nextUrl.searchParams.get('year');

    if (!orgId || !year) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Get all tracts and mark which are in the assessment area
    const query = `
      SELECT 
        c.geoid,
        CASE 
          WHEN h.geoid IS NOT NULL THEN 'Inside'
          ELSE 'Outside'
        END as in_assessment_area
      FROM census_us c
      LEFT JOIN cached_hmda h ON c.geoid = h.geoid AND h.organization_id = $1
      WHERE c.year = $2
    `;

    const result = await pool.query(query, [parseInt(orgId), year]);
    await pool.end();

    return NextResponse.json({ rows: result.rows });

  } catch (error: any) {
    console.error('[ASSESSMENT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
