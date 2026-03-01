// app/api/popup/route.ts
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

    const geoid = req.nextUrl.searchParams.get('geoid');
    const year  = req.nextUrl.searchParams.get('year');

    if (!geoid || !year) {
      return NextResponse.json({ error: 'Missing geoid or year' }, { status: 400 });
    }

    const pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const query = `
      SELECT
        tract_text,
        townname,
        stateabbrev,
        countyname,
        msaname,
        income_level,
        majority_minority,
        tract_median_family_income,
        msa_median_family_income,
        tract_median_family_income_percent,
        total_population,
        white_nonhispanic_population,
        white_nonhispanic_population_percent,
        minority_population,
        minority_population_percent,
        asian_population,
        asian_population_percent,
        black_population,
        black_population_percent,
        hawaiian_other_pacific_islander_population,
        hawaiian_other_pacific_islander_population_percent,
        native_american_population,
        native_american_population_percent,
        two_or_more_races_population,
        two_or_more_races_population_percent,
        white_population,
        white_population_percent,
        other_race_population,
        other_race_population_percent,
        hispanic_population,
        hispanic_population_percent
      FROM census_us
      WHERE geoid = $1
        AND year  = $2
      LIMIT 1
    `;

    const result = await pool.query(query, [geoid, year]);
    await pool.end();

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Tract not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);

  } catch (error: any) {
    console.error('[POPUP] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
