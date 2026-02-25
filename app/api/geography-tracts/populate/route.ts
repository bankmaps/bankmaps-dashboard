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
      const states = geo.state?.includes('__ALL__') ? [] : (geo.state || []).map((s: string) => s.trim());
      const counties = geo.county?.includes('__ALL__') ? [] : (geo.county || []).map((c: string) => c.trim());
      const towns = geo.town?.includes('__ALL__') ? [] : (geo.town || []).map((t: string) => t.trim());
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
            SELECT DISTINCT ctb.geoid 
            FROM census_tract_boundaries ctb
            INNER JOIN census_us c ON c.geoid = ctb.geoid
            WHERE ctb.census_vintage = 2024
              AND TRIM(c.state) = ANY(${states})
              AND TRIM(c.county) = ANY(${counties})
              AND TRIM(c.town) = ANY(${towns})
          `;
          geoidList = geoidRows.map((r: any) => r.geoid);
        } else if (states.length > 0 && counties.length > 0) {
          // Case 3: State + county (all towns)
          console.log(`[GEOGRAPHY_TRACTS] Querying census_us: year=2024, states=${JSON.stringify(states)}, counties=${JSON.stringify(counties)}`);
          
          const geoidRows = await sql`
            SELECT DISTINCT ctb.geoid 
            FROM census_tract_boundaries ctb
            INNER JOIN census_us c ON c.geoid = ctb.geoid
            WHERE ctb.census_vintage = 2024
              AND TRIM(c.state) = ANY(${states})
              AND TRIM(c.county) = ANY(${counties})
          `;
          
          console.log(`[GEOGRAPHY_TRACTS] Query returned ${geoidRows.length} rows`);
          geoidList = geoidRows.map((r: any) => r.geoid);
        } else if (states.length > 0) {
          // Case 4: State only
          const geoidRows = await sql`
            SELECT DISTINCT ctb.geoid 
            FROM census_tract_boundaries ctb
            INNER JOIN census_us c ON c.geoid = ctb.geoid
            WHERE ctb.census_vintage = 2024
              AND TRIM(c.state) = ANY(${states})
          `;
          geoidList = geoidRows.map((r: any) => r.geoid);
        }

        // Get color from geography definition (or use default)
        const geoColor = geo.color || '#91bfdb';

        // Insert all geoids in batches
        if (geoidList.length > 0) {
          console.log(`[GEOGRAPHY_TRACTS] Inserting ${geoidList.length} geoids in batches...`);
          
          const batchSize = 100;
          for (let i = 0; i < geoidList.length; i += batchSize) {
            const batch = geoidList.slice(i, i + batchSize);
            
            // Build parameterized VALUES clause
            const values = batch.map((_, idx) => 
              `($${idx*4 + 1}, $${idx*4 + 2}, $${idx*4 + 3}, $${idx*4 + 4})`
            ).join(', ');
            
            const params = batch.flatMap(geoid => [organization_id, geoName, geoid, geoColor]);
            
            await sql(
              `INSERT INTO geography_tracts (organization_id, geography_name, geoid, color)
               VALUES ${values}
               ON CONFLICT (organization_id, geography_name, geoid) DO NOTHING`,
              params
            );
            
            console.log(`[GEOGRAPHY_TRACTS] Inserted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} rows`);
          }

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
