// app/api/geography-tracts/summary/route.ts
// Returns aggregated summary data for the assessment area summary tables

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

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

    const orgId   = req.nextUrl.searchParams.get('orgId');
    const geoName = req.nextUrl.searchParams.get('geography');
    const yearStr = req.nextUrl.searchParams.get('year');

    if (!orgId || !geoName || !yearStr) {
      return NextResponse.json({ error: 'Missing orgId, geography, or year' }, { status: 400 });
    }

    const year    = parseInt(yearStr);
    const vintage = YEAR_TO_VINTAGE[year] || 2024;

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // ── Boundary summary: distinct MSA names for this geography ──────────────
    const msaRows = await sql`
      SELECT DISTINCT msa, msa_number
      FROM geography_tracts
      WHERE organization_id = ${parseInt(orgId)}
        AND geography_name  = ${geoName}
        AND census_vintage  = ${vintage}
        AND msa IS NOT NULL
        AND msa != ''
      ORDER BY msa
    `;

    // ── Income level summary ──────────────────────────────────────────────────
    const incomeRows = await sql`
      SELECT
        c.income_level,
        COUNT(*)                        AS tract_count,
        SUM(c.households::numeric)      AS household_count
      FROM geography_tracts gt
      INNER JOIN census_us c ON c.geoid = gt.geoid AND c.year = ${String(year)}
      WHERE gt.organization_id = ${parseInt(orgId)}
        AND gt.geography_name  = ${geoName}
        AND gt.census_vintage  = ${vintage}
      GROUP BY c.income_level
      ORDER BY c.income_level
    `;

    // ── Majority minority summary ─────────────────────────────────────────────
    const minorityRows = await sql`
      SELECT
        c.majority_minority,
        COUNT(*)                        AS tract_count,
        SUM(c.households::numeric)      AS household_count
      FROM geography_tracts gt
      INNER JOIN census_us c ON c.geoid = gt.geoid AND c.year = ${String(year)}
      WHERE gt.organization_id = ${parseInt(orgId)}
        AND gt.geography_name  = ${geoName}
        AND gt.census_vintage  = ${vintage}
      GROUP BY c.majority_minority
      ORDER BY c.majority_minority
    `;

    // ── Compute totals and percentages ────────────────────────────────────────
    function computeSummary(rows: any[], labelField: string) {
      const totalTracts     = rows.reduce((s, r) => s + parseInt(r.tract_count), 0);
      const totalHouseholds = rows.reduce((s, r) => s + parseInt(r.household_count || 0), 0);

      const items = rows.map(r => ({
        label:            r[labelField] || 'NA',
        tract_count:      parseInt(r.tract_count),
        tract_pct:        totalTracts > 0 ? ((parseInt(r.tract_count) / totalTracts) * 100).toFixed(1) : '0.0',
        household_count:  parseInt(r.household_count || 0),
        household_pct:    totalHouseholds > 0 ? ((parseInt(r.household_count || 0) / totalHouseholds) * 100).toFixed(1) : '0.0',
      }));

      return { items, totalTracts, totalHouseholds };
    }

    const income   = computeSummary(incomeRows,   'income_level');
    const minority = computeSummary(minorityRows, 'majority_minority');

    // ── Income subtotal: Low + Moderate ──────────────────────────────────────
    const lmItems  = income.items.filter(i => i.label === 'Low' || i.label === 'Moderate');
    const lmTracts = lmItems.reduce((s, i) => s + i.tract_count, 0);
    const lmHh     = lmItems.reduce((s, i) => s + i.household_count, 0);
    const incomeLMSubtotal = {
      tract_count:     lmTracts,
      tract_pct:       income.totalTracts > 0 ? ((lmTracts / income.totalTracts) * 100).toFixed(1) : '0.0',
      household_count: lmHh,
      household_pct:   income.totalHouseholds > 0 ? ((lmHh / income.totalHouseholds) * 100).toFixed(1) : '0.0',
    };

    // ── Minority subtotal: all non-White, non-NA ──────────────────────────────
    const mmItems  = minority.items.filter(i => i.label !== 'White Majority' && i.label !== 'NA');
    const mmTracts = mmItems.reduce((s, i) => s + i.tract_count, 0);
    const mmHh     = mmItems.reduce((s, i) => s + i.household_count, 0);
    const minoritySubtotal = {
      tract_count:     mmTracts,
      tract_pct:       minority.totalTracts > 0 ? ((mmTracts / minority.totalTracts) * 100).toFixed(1) : '0.0',
      household_count: mmHh,
      household_pct:   minority.totalHouseholds > 0 ? ((mmHh / minority.totalHouseholds) * 100).toFixed(1) : '0.0',
    };

    return NextResponse.json({
      vintage,
      year,
      msas: msaRows,
      income: {
        ...income,
        lmSubtotal: incomeLMSubtotal,
      },
      minority: {
        ...minority,
        mmSubtotal: minoritySubtotal,
      },
    });

  } catch (error: any) {
    console.error('[GEOGRAPHY-TRACTS-SUMMARY] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary data' }, { status: 500 });
  }
}
