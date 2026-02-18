// BOUNDARY_GENERATE_ROUTE_UNIQUE_IDENTIFIER_99123
// app/api/boundaries/generate/route.ts
// Generates map boundaries for all census vintages for an organization's geographies

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

// Census vintage config
const CENSUS_VINTAGES = [2018, 2020, 2024];

// Conversion: square meters to square miles
const SQ_METERS_TO_SQ_MILES = 0.000000386102;

// ─── BACKGROUND BOUNDARY GENERATION ─────────────────────────────────────────

async function startBackgroundBoundaryGeneration(
  organization_id: number,
  geographies: any[]
) {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  try {
    console.log(`[BOUNDARY] START org=${organization_id}, geographies=${geographies.length}`);

    for (const geo of geographies) {
      const geoName = geo.name || 'Assessment Area';
      const states  = geo.state?.includes('__ALL__')       ? [] : (geo.state        || []);
      const counties = geo.county?.includes('__ALL__')     ? [] : (geo.county       || []);
      const towns    = geo.town?.includes('__ALL__')       ? [] : (geo.town         || []);
      const tracts   = geo.tract_number?.includes('__ALL__') ? [] : (geo.tract_number || []);

      console.log(`[BOUNDARY] Processing geography: "${geoName}"`, { states, counties, towns, tracts: tracts.length });

      // Skip if no geography selected
      if (states.length === 0) {
        console.log(`[BOUNDARY] No states selected for "${geoName}" - skipping`);
        continue;
      }

      // Generate boundary for each census vintage
      for (const vintage of CENSUS_VINTAGES) {
        try {
          console.log(`[BOUNDARY] Generating ${vintage} boundary for "${geoName}"`);

          // ── Query matching tracts from census_tract_boundaries ──────────────

          let tractRows: any[] = [];

          if (tracts.length > 0) {
            // Case 1: Specific tracts selected
            tractRows = await sql`
              SELECT geoid, geometry, aland, awater
              FROM census_tract_boundaries
              WHERE census_vintage = ${vintage}
                AND geoid = ANY(${tracts})
            `;
          } else if (states.length > 0 && counties.length > 0 && towns.length > 0) {
            // Case 2: State + county + town filter
            // Join with census_us (covers ALL tracts, not just those with HMDA activity)
            tractRows = await sql`
              SELECT DISTINCT ctb.geoid, ctb.geometry, ctb.aland, ctb.awater
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid
              WHERE ctb.census_vintage = ${vintage}
                AND c.state = ANY(${states})
                AND c.county = ANY(${counties})
                AND c.town = ANY(${towns})
            `;
          } else if (states.length > 0 && counties.length > 0) {
            // Case 3: State + county (all towns)
            console.log(`[BOUNDARY] Case 3: Querying census_us for state=${states} county=${counties} vintage=${vintage}`);
            const startTime = Date.now();
            tractRows = await sql`
              SELECT DISTINCT ctb.geoid, ctb.geometry, ctb.aland, ctb.awater
              FROM census_tract_boundaries ctb
              INNER JOIN census_us c ON c.geoid = ctb.geoid
              WHERE ctb.census_vintage = ${vintage}
                AND c.state = ANY(${states})
                AND c.county = ANY(${counties})
            `;
            const queryTime = Date.now() - startTime;
            console.log(`[BOUNDARY] Case 3: Query completed in ${queryTime}ms, found ${tractRows?.length || 0} tracts`);
          } else if (states.length > 0) {
            // Case 4: State only (all counties)
            tractRows = await sql`
              SELECT geoid, geometry, aland, awater
              FROM census_tract_boundaries
              WHERE census_vintage = ${vintage}
                AND LEFT(geoid, 2) = ANY(${states.map((s: string) => getStateFips(s))})
            `;
          }

          if (tractRows.length === 0) {
            console.log(`[BOUNDARY] No tracts found for "${geoName}" vintage ${vintage}`);
            continue;
          }

          console.log(`[BOUNDARY] Found ${tractRows.length} tracts for "${geoName}" vintage ${vintage}`);

          // ── Merge geometries using Turf.js ───────────────────────────────────

          const turf = await import('@turf/turf');

          // Build feature collection from tract geometries
          const features = tractRows
            .filter(row => row.geometry)
            .map(row => ({
              type: 'Feature' as const,
              geometry: row.geometry,
              properties: { geoid: row.geoid }
            }));

          if (features.length === 0) {
            console.log(`[BOUNDARY] No valid geometries for "${geoName}" vintage ${vintage}`);
            continue;
          }

          const featureCollection = turf.featureCollection(features);

          // Use Turf dissolve to merge all tract polygons into one boundary
          let mergedBoundary: any;
          try {
            console.log(`[BOUNDARY] Dissolving ${features.length} tract polygons`);
            
            // Dissolve merges all features into one
            const dissolved = turf.dissolve(featureCollection);
            
            if (!dissolved || !dissolved.features || dissolved.features.length === 0) {
              console.error(`[BOUNDARY] Dissolve returned no features for "${geoName}" vintage ${vintage}`);
              continue;
            }
            
            // Take the first (and should be only) feature from dissolved result
            mergedBoundary = dissolved.features[0];
            
            console.log(`[BOUNDARY] Dissolve successful, result type: ${mergedBoundary?.geometry?.type}`);
            
          } catch (dissolveError: any) {
            console.error(`[BOUNDARY] Dissolve failed for "${geoName}" vintage ${vintage}:`, dissolveError.message);
            continue;
          }
          
          if (!mergedBoundary || !mergedBoundary.geometry) {
            console.log(`[BOUNDARY] No valid boundary after dissolve for "${geoName}" vintage ${vintage}`);
            continue;
          }
          
          // Simplify boundary (reduce points for performance)
          const simplified = turf.simplify(mergedBoundary, { tolerance: 0.001, highQuality: false });
          const boundaryGeoJSON = simplified.geometry;

          // ── Calculate center point ───────────────────────────────────────────

          const center = turf.center(featureCollection);
          const centerPoint = {
            lng: center.geometry.coordinates[0],
            lat: center.geometry.coordinates[1]
          };

          // ── Calculate optimal zoom level ─────────────────────────────────────

          const bbox = turf.bbox(featureCollection); // [minLng, minLat, maxLng, maxLat]
          const bboxWidth  = bbox[2] - bbox[0]; // longitude span
          const bboxHeight = bbox[3] - bbox[1]; // latitude span
          const maxSpan = Math.max(bboxWidth, bboxHeight);

          let zoomLevel = 10.0;
          if (maxSpan > 10)      zoomLevel = 5.0;
          else if (maxSpan > 5)  zoomLevel = 6.0;
          else if (maxSpan > 2)  zoomLevel = 7.0;
          else if (maxSpan > 1)  zoomLevel = 8.5;
          else if (maxSpan > 0.5) zoomLevel = 9.5;
          else if (maxSpan > 0.2) zoomLevel = 10.5;
          else if (maxSpan > 0.1) zoomLevel = 11.5;
          else                    zoomLevel = 12.5;

          // ── Calculate area ───────────────────────────────────────────────────

          let totalAland  = 0;
          let totalAwater = 0;
          tractRows.forEach(row => {
            totalAland  += Number(row.aland  || 0);
            totalAwater += Number(row.awater || 0);
          });

          const landSqMiles  = Number((totalAland  * SQ_METERS_TO_SQ_MILES).toFixed(2));
          const waterSqMiles = Number((totalAwater * SQ_METERS_TO_SQ_MILES).toFixed(2));
          const totalSqMiles = Number((landSqMiles + waterSqMiles).toFixed(2));

          // ── Store in map_boundaries table ────────────────────────────────────

          await sql`
            INSERT INTO map_boundaries (
              organization_id,
              geography_name,
              census_vintage,
              boundary_geojson,
              center_point,
              zoom_level,
              land_area_sq_miles,
              water_area_sq_miles,
              total_area_sq_miles,
              updated_at
            )
            VALUES (
              ${organization_id},
              ${geoName},
              ${vintage},
              ${boundaryGeoJSON}::jsonb,
              ${centerPoint}::jsonb,
              ${zoomLevel},
              ${landSqMiles},
              ${waterSqMiles},
              ${totalSqMiles},
              NOW()
            )
            ON CONFLICT (organization_id, geography_name, census_vintage)
            DO UPDATE SET
              boundary_geojson       = EXCLUDED.boundary_geojson,
              center_point           = EXCLUDED.center_point,
              zoom_level             = EXCLUDED.zoom_level,
              land_area_sq_miles     = EXCLUDED.land_area_sq_miles,
              water_area_sq_miles    = EXCLUDED.water_area_sq_miles,
              total_area_sq_miles    = EXCLUDED.total_area_sq_miles,
              updated_at             = NOW()
          `;

          console.log(`[BOUNDARY] ✅ "${geoName}" vintage ${vintage}: ${totalSqMiles} sq miles, center: ${centerPoint.lat.toFixed(4)}, ${centerPoint.lng.toFixed(4)}, zoom: ${zoomLevel}`);

        } catch (vintageError: any) {
          console.error(`[BOUNDARY] ERROR "${geoName}" vintage ${vintage}:`, vintageError.message);
          console.error(`[BOUNDARY] Full error:`, vintageError);
        }
      }
    }

    console.log(`[BOUNDARY] ✅ COMPLETE org=${organization_id}`);

  } catch (error: any) {
    console.error(`[BOUNDARY] FATAL ERROR org=${organization_id}:`, error.message);
  }
}

// ─── HELPER: State name to FIPS code ─────────────────────────────────────────

function getStateFips(stateName: string): string {
  const fipsMap: Record<string, string> = {
    'Alabama': '01', 'Alaska': '02', 'Arizona': '04', 'Arkansas': '05',
    'California': '06', 'Colorado': '08', 'Connecticut': '09', 'Delaware': '10',
    'Florida': '12', 'Georgia': '13', 'Hawaii': '15', 'Idaho': '16',
    'Illinois': '17', 'Indiana': '18', 'Iowa': '19', 'Kansas': '20',
    'Kentucky': '21', 'Louisiana': '22', 'Maine': '23', 'Maryland': '24',
    'Massachusetts': '25', 'Michigan': '26', 'Minnesota': '27', 'Mississippi': '28',
    'Missouri': '29', 'Montana': '30', 'Nebraska': '31', 'Nevada': '32',
    'New Hampshire': '33', 'New Jersey': '34', 'New Mexico': '35', 'New York': '36',
    'North Carolina': '37', 'North Dakota': '38', 'Ohio': '39', 'Oklahoma': '40',
    'Oregon': '41', 'Pennsylvania': '42', 'Rhode Island': '44', 'South Carolina': '45',
    'South Dakota': '46', 'Tennessee': '47', 'Texas': '48', 'Utah': '49',
    'Vermont': '50', 'Virginia': '51', 'Washington': '53', 'West Virginia': '54',
    'Wisconsin': '55', 'Wyoming': '56', 'District of Columbia': '11',
    'Puerto Rico': '72'
  };
  return fipsMap[stateName] || '00';
}

// ─── API ROUTE ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET);

    const { organization_id, geographies } = await req.json();

    if (!organization_id || !geographies?.length) {
      return NextResponse.json({ error: 'Missing organization_id or geographies' }, { status: 400 });
    }

    console.log(`[BOUNDARY] Request received for org=${organization_id}`);

    // Start background boundary generation (non-blocking)
    startBackgroundBoundaryGeneration(organization_id, geographies).catch(err => {
      console.error('[BOUNDARY] Background process failed:', err.message);
    });

    // Return immediately
    return NextResponse.json({
      success: true,
      message: 'Boundary generation started in background',
      organization_id
    }, { status: 202 });

  } catch (error: any) {
    console.error('[BOUNDARY] Route error:', error);
    return NextResponse.json({ error: 'Failed to start boundary generation' }, { status: 500 });
  }
}

// ─── GET: Fetch boundaries for an organization ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    jwt.verify(authHeader.split(' ')[1], JWT_SECRET);

    const orgId   = req.nextUrl.searchParams.get('orgId');
    const vintage = req.nextUrl.searchParams.get('vintage');
    const geoName = req.nextUrl.searchParams.get('geography');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    let boundaries;
    if (vintage && geoName) {
      // Fetch specific boundary
      boundaries = await sql`
        SELECT *
        FROM map_boundaries
        WHERE organization_id = ${parseInt(orgId)}
          AND census_vintage   = ${parseInt(vintage)}
          AND geography_name   = ${geoName}
        LIMIT 1
      `;
    } else {
      // Fetch all boundaries for this org
      boundaries = await sql`
        SELECT *
        FROM map_boundaries
        WHERE organization_id = ${parseInt(orgId)}
        ORDER BY geography_name, census_vintage
      `;
    }

    return NextResponse.json({ boundaries });

  } catch (error: any) {
    console.error('[BOUNDARY] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch boundaries' }, { status: 500 });
  }
}
