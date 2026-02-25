// app/api/geography-tracts/populate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

const JWT_SECRET = process.env.JWT_SECRET!;

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
      const states = geo.state?.includes('__ALL__') ? [] : (geo.state || []);
      const counties = geo.county?.includes('__ALL__') ? [] : (geo.county || []);
      const towns = geo.town?.includes('__ALL__') ? [] : (geo.town || []);
      const tracts = geo.tract_number?.includes('__ALL__') ? [] : (geo.tract_number || []);

      console.log(`[GEOGRAPHY_TRACTS] Processing geography: "${geoName}"`, { states, counties, towns, tracts: tracts.length });

      if (states.length === 0) {
        console.log(`[GEOGRAPHY_TRACTS] No states selected for "${geoName}" - skipping`);
        continue;
      }

      try {
        // Delete existing tracts for this org + geography
        await sql`
          DELETE FROM geography_tracts 
          WHERE organization_id = ${organization_id} 
            AND geography_name = ${geoName}
        `;

        // Get all geoids for this geography from census_us (use year 2024 as reference)
        let geoidList: string[] = [];

        if (tracts.length > 0) {
          // Case 1: Specific tracts
          geoidList = tracts;
        } else if (states.length > 0 && counties.length > 0 && towns.length > 0) {
          // Case 2: State + county + towns
          const geoidRows = await sql`
            SELECT DISTINCT geoid 
            FROM census_us 
            WHERE year = '2024'
              AND state = ANY(${states})
              AND county = ANY(${counties})
              AND town = ANY(${towns})
          `;
          geoidList = geoidRows.map((r: any) => r.geoid);
        } else if (states.length > 0 && counties.length > 0) {
          // Case 3: State + county (all towns)
          const geoidRows = await sql`
            SELECT DISTINCT geoid 
            FROM census_us 
            WHERE year = '2024'
              AND state = ANY(${states})
              AND county = ANY(${counties})
          `;
          geoidList = geoidRows.map((r: any) => r.geoid);
        } else if (states.length > 0) {
          // Case 4: State only
          const geoidRows = await sql`
            SELECT DISTINCT geoid 
            FROM census_us 
            WHERE year = '2024'
              AND state = ANY(${states})
          `;
          geoidList = geoidRows.map((r: any) => r.geoid);
        }

        // Get color from geography definition (or use default)
        const geoColor = geo.color || '#91bfdb';

        // Batch insert all geoids
        if (geoidList.length > 0) {
          const values = geoidList.map(geoid => 
            `(${organization_id}, '${geoName.replace(/'/g, "''")}', '${geoid}', '${geoColor}')`
          ).join(',');

          await sql.unsafe(`
            INSERT INTO geography_tracts (organization_id, geography_name, geoid, color)
            VALUES ${values}
            ON CONFLICT (organization_id, geography_name, geoid) DO NOTHING
          `);

          console.log(`[GEOGRAPHY_TRACTS] ✅ Inserted ${geoidList.length} tracts for "${geoName}"`);
        } else {
          console.log(`[GEOGRAPHY_TRACTS] No geoids found for "${geoName}"`);
        }

      } catch (error: any) {
        console.error(`[GEOGRAPHY_TRACTS] ERROR for "${geoName}":`, error.message);
        console.error(`[GEOGRAPHY_TRACTS] Full error:`, error);
      }
    }

    console.log(`[GEOGRAPHY_TRACTS] ✅ COMPLETE org=${organization_id}`);

    return NextResponse.json({ success: true, message: 'Geography tracts populated' });

  } catch (error: any) {
    console.error('[GEOGRAPHY_TRACTS] FATAL ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
