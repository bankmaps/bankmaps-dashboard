// app/api/geography-tracts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const orgId = req.nextUrl.searchParams.get('orgId');
    const geoName = req.nextUrl.searchParams.get('geography');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    let tracts;
    if (geoName) {
      // Get tracts for specific geography
      tracts = await sql`
        SELECT geoid, color
        FROM geography_tracts
        WHERE organization_id = ${parseInt(orgId)}
          AND geography_name = ${geoName}
      `;
    } else {
      // Get all tracts for this org (all geographies)
      tracts = await sql`
        SELECT geoid, geography_name, color
        FROM geography_tracts
        WHERE organization_id = ${parseInt(orgId)}
        ORDER BY geography_name
      `;
    }

    console.log(`[GEOGRAPHY_TRACTS] Found ${tracts.length} tracts for org ${orgId}${geoName ? `, geography "${geoName}"` : ''}`);

    return NextResponse.json({ tracts });

  } catch (error: any) {
    console.error('[GEOGRAPHY_TRACTS] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
