// app/api/assessment-area/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

export const runtime = 'nodejs';

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

    // Get org's geography definition
    const orgResult = await pool.query(
      `SELECT geographies FROM organizations WHERE id = $1`,
      [parseInt(orgId)]
    );

    if (!orgResult.rows.length) {
      await pool.end();
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const geographies = orgResult.rows[0].geographies || [];
    if (geographies.length === 0) {
      await pool.end();
      return NextResponse.json({ rows: [] });
    }

    // For now, use the first geography (typically "aa" assessment area)
    const geo = geographies[0];
    const states = Array.isArray(geo.state) ? geo.state : [];
    const counties = Array.isArray(geo.county) ? geo.county : [];
    const towns = Array.isArray(geo.town) ? geo.town.filter((t: string) => t !== '__ALL__') : [];
    const tracts = Array.isArray(geo.tract) ? geo.tract : [];

    // Build query to match tracts in this geography
    let insideGeoids: string[] = [];

    if (tracts.length > 0) {
      // Specific tracts selected
      const tractResult = await pool.query(
        `SELECT DISTINCT geoid FROM census_us WHERE year = $1 AND geoid = ANY($2)`,
        [year, tracts]
      );
      insideGeoids = tractResult.rows.map(r => r.geoid);
    } else if (states.length > 0 && counties.length > 0 && towns.length > 0) {
      // State + county + specific towns
      const townResult = await pool.query(
        `SELECT DISTINCT geoid FROM census_us 
         WHERE year = $1 AND state = ANY($2) AND county = ANY($3) AND town = ANY($4)`,
        [year, states, counties, towns]
      );
      insideGeoids = townResult.rows.map(r => r.geoid);
    } else if (states.length > 0 && counties.length > 0) {
      // State + county (all towns)
      const countyResult = await pool.query(
        `SELECT DISTINCT geoid FROM census_us 
         WHERE year = $1 AND state = ANY($2) AND county = ANY($3)`,
        [year, states, counties]
      );
      insideGeoids = countyResult.rows.map(r => r.geoid);
    } else if (states.length > 0) {
      // State only (all counties)
      const stateResult = await pool.query(
        `SELECT DISTINCT geoid FROM census_us 
         WHERE year = $1 AND state = ANY($2)`,
        [year, states]
      );
      insideGeoids = stateResult.rows.map(r => r.geoid);
    }

    // Get ALL tracts for the state(s) to limit scope
    const allTractsResult = await pool.query(
      `SELECT DISTINCT geoid FROM census_us WHERE year = $1 AND state = ANY($2)`,
      [year, states]
    );

    // Mark each tract as Inside or Outside
    const rows = allTractsResult.rows.map(row => ({
      geoid: row.geoid,
      in_assessment_area: insideGeoids.includes(row.geoid) ? 'Inside' : 'Outside'
    }));

    await pool.end();

    return NextResponse.json({ rows });

  } catch (error: any) {
    console.error('[ASSESSMENT] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
