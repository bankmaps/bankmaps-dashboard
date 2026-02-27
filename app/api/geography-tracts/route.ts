// app/api/geography-tracts/route.ts
// Returns geoids from geography_tracts for a given org, geography, and vintage year

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

// Map data year to census vintage (matches geography_tracts.vintage_year)
const YEAR_TO_VINTAGE: Record<number, number> = {
  2018: 2018, 2019: 2018,
  2020: 2020, 2021: 2020, 2022: 2020, 2023: 2020,
  2024: 2024, 2025: 2024,
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }
    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const orgId    = req.nextUrl.searchParams.get('orgId');
    const geoName  = decodeURIComponent(req.nextUrl.searchParams.get('geography') || '');
    const yearStr  = req.nextUrl.searchParams.get('year');

    if (!orgId || !geoName || !yearStr) {
      return NextResponse.json({ error: 'Missing orgId, geography, or year' }, { status: 400 });
    }

    const year    = parseInt(yearStr);
    const vintage = YEAR_TO_VINTAGE[year] || 2024;

    const sql = neon(process.env.NEON_DATABASE_URL!);

    const rows = await sql`
      SELECT geoid
      FROM geography_tracts
      WHERE organization_id = ${parseInt(orgId)}
        AND geography_name  = ${geoName}
        AND census_vintage  = ${vintage}
    `;

    const geoids = rows.map((r: any) => r.geoid);

    console.log(`[GEOGRAPHY-TRACTS] org=${orgId}, geo="${geoName}", year=${year}, vintage=${vintage} → ${geoids.length} geoids`);

    return NextResponse.json({ geoids, vintage, year });

  } catch (error: any) {
    console.error('[GEOGRAPHY-TRACTS] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch geography tracts' }, { status: 500 });
  }
}
