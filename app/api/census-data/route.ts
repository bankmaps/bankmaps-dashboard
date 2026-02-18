// app/api/census-data/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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
    const metric = req.nextUrl.searchParams.get('metric');

    if (!orgId || !year || !metric) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Query census data for the org's geography
    const rows = await sql`
      SELECT DISTINCT c.geoid, c.${sql(metric)}
      FROM census_us c
      WHERE c.year = ${year}
        AND c.geoid IN (
          SELECT DISTINCT geoid 
          FROM cached_hmda 
          WHERE organization_id = ${parseInt(orgId)}
        )
    `;

    return NextResponse.json({ rows });

  } catch (error: any) {
    console.error('[CENSUS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
