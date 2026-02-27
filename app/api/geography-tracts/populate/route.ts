// app/api/geography-tracts/populate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

const JWT_SECRET = process.env.JWT_SECRET!;
const CENSUS_VINTAGES = [2018, 2020, 2024];

// Map census vintage to the correct census_us year
const VINTAGE_TO_YEAR: Record<number, string> = {
  2018: '2018',
  2020: '2022',
  2024: '2024',
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const body = await req.json();
    const { organization_id, geographies } = body;

    if (!organization_id || !geographies) {
      return NextResponse.json({ error: 'Missing organization_id or geographies' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    console.log(`[GEOGRAPHY_TRACTS] START org=${organization_id}, geographies=${geographies.length}`);

    for (const geo of geographies) {
      const geoName = geo.name || 'Assessment Area';
      const states = geo.state?.includes('__ALL__') ? [] : (geo.state || []).map((s: string) => s.trim());
      const counties = geo.county?.includes('__ALL__') ? [] : (geo.county || []).map((c: string) => c.trim());
      const towns = geo.town?.includes('__ALL__') ? [] : (geo.town || []).map((t: string) => t.trim());
      const tracts = geo.tract_number?.includes('__ALL__') ? [] : (geo.tract_number || []);

      console.log(`[GEOGRAPHY_TRACTS] Processing geography: "${geoName}"`, { states, counties, towns, tracts: tracts.length });

      if (states.length === 0) {
        console.log(`[GEOGRAPHY_TRACTS] No states selected for "${geoName}" - skipping`);
        continue;
      }

      const geoColor = geo.color || '#91bfdb';

      // Process each vintage
      for (const vintage of CENSUS_VINTAGES) {
        const censusYear = VINTAGE_TO_YEAR[vintage];
        try {
          // Delete existing tracts for this org + geography + vintage
          await sql`
            DELETE FROM geography_tracts 
            WHERE organization_id = ${organization_id} 
              AND geography_name = ${geoName}
              AND census_vintage = ${vintage}
          `;

          if (tracts.length > 0) {
            // Case 1: Specific tracts
            await sql`
              INSERT INTO geography_tracts (organization_id, geography_name, census_vintage, geoid, color, state, county, town, msa, msa_number, tract_number)
              SELECT ${organization_id}, ${geoName}, ${vintage}, ctb.geoid, ${geoColor},
                     c.state, c.county, c.town, c.msa, c.msa_number, c.tract_number
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid AND c.year = ${censusYear}
              WHERE ctb.census_vintage = ${vintage}
                AND ctb.geoid = ANY(${tracts})
              ON CONFLICT (organization_id, geography_name, census_vintage, geoid) DO UPDATE SET
                state = EXCLUDED.state, county = EXCLUDED.county, town = EXCLUDED.town,
                msa = EXCLUDED.msa, msa_number = EXCLUDED.msa_number, tract_number = EXCLUDED.tract_number
            `;
          } else if (states.length > 0 && counties.length > 0 && towns.length > 0) {
            // Case 2: State + county + towns
            await sql`
              INSERT INTO geography_tracts (organization_id, geography_name, census_vintage, geoid, color, state, county, town, msa, msa_number, tract_number)
              SELECT ${organization_id}, ${geoName}, ${vintage}, ctb.geoid, ${geoColor},
                     c.state, c.county, c.town, c.msa, c.msa_number, c.tract_number
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid AND c.year = ${censusYear}
              WHERE ctb.census_vintage = ${vintage}
                AND TRIM(c.state) = ANY(${states})
                AND TRIM(c.county) = ANY(${counties})
                AND TRIM(c.town) = ANY(${towns})
              ON CONFLICT (organization_id, geography_name, census_vintage, geoid) DO UPDATE SET
                state = EXCLUDED.state, county = EXCLUDED.county, town = EXCLUDED.town,
                msa = EXCLUDED.msa, msa_number = EXCLUDED.msa_number, tract_number = EXCLUDED.tract_number
            `;
          } else if (states.length > 0 && counties.length > 0) {
            // Case 3: State + county (all towns)
            await sql`
              INSERT INTO geography_tracts (organization_id, geography_name, census_vintage, geoid, color, state, county, town, msa, msa_number, tract_number)
              SELECT ${organization_id}, ${geoName}, ${vintage}, ctb.geoid, ${geoColor},
                     c.state, c.county, c.town, c.msa, c.msa_number, c.tract_number
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid AND c.year = ${censusYear}
              WHERE ctb.census_vintage = ${vintage}
                AND TRIM(c.state) = ANY(${states})
                AND TRIM(c.county) = ANY(${counties})
              ON CONFLICT (organization_id, geography_name, census_vintage, geoid) DO UPDATE SET
                state = EXCLUDED.state, county = EXCLUDED.county, town = EXCLUDED.town,
                msa = EXCLUDED.msa, msa_number = EXCLUDED.msa_number, tract_number = EXCLUDED.tract_number
            `;
          } else if (states.length > 0) {
            // Case 4: State only
            await sql`
              INSERT INTO geography_tracts (organization_id, geography_name, census_vintage, geoid, color, state, county, town, msa, msa_number, tract_number)
              SELECT ${organization_id}, ${geoName}, ${vintage}, ctb.geoid, ${geoColor},
                     c.state, c.county, c.town, c.msa, c.msa_number, c.tract_number
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid AND c.year = ${censusYear}
              WHERE ctb.census_vintage = ${vintage}
                AND TRIM(c.state) = ANY(${states})
              ON CONFLICT (organization_id, geography_name, census_vintage, geoid) DO UPDATE SET
                state = EXCLUDED.state, county = EXCLUDED.county, town = EXCLUDED.town,
                msa = EXCLUDED.msa, msa_number = EXCLUDED.msa_number, tract_number = EXCLUDED.tract_number
            `;
          }

          const countResult = await sql`
            SELECT COUNT(*) as count 
            FROM geography_tracts 
            WHERE organization_id = ${organization_id} 
              AND geography_name = ${geoName}
              AND census_vintage = ${vintage}
          `;

          console.log(`[GEOGRAPHY_TRACTS] ✅ Vintage ${vintage}: ${countResult[0].count} tracts for "${geoName}"`);

        } catch (error: any) {
          console.error(`[GEOGRAPHY_TRACTS] ERROR for "${geoName}" vintage ${vintage}:`, error.message);
        }
      }
    }

    console.log(`[GEOGRAPHY_TRACTS] ✅ COMPLETE org=${organization_id}`);

    return NextResponse.json({ success: true, message: 'Geography tracts populated' });

  } catch (error: any) {
    console.error('[GEOGRAPHY_TRACTS] FATAL ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
