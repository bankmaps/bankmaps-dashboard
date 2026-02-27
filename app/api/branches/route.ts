// app/api/branches/route.ts
// Returns branch locations for an organization by linking
// organizations.linked_sources['Branch'] to branch_us.lender_id

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
    if (!orgId) {
      return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Get the Branch lender_id from linked_sources jsonb
    const orgRows = await sql`
      SELECT linked_sources->>'Branch' AS branch_lender_id
      FROM organizations
      WHERE id = ${parseInt(orgId)}
    `;

    if (!orgRows.length || !orgRows[0].branch_lender_id) {
      console.log(`[BRANCHES] No branch lender_id for org=${orgId}`);
      return NextResponse.json({ branches: [] });
    }

    const lenderId = orgRows[0].branch_lender_id;
    console.log(`[BRANCHES] org=${orgId}, lender_id=${lenderId}`);

    // Fetch branches from branch_us
    const branchRows = await sql`
      SELECT lat, lon, branchtype, lendername, regulator, branchaddress, branchcity, branchstate
      FROM branch_us
      WHERE lender_id = ${lenderId}
        AND lat IS NOT NULL
        AND lon IS NOT NULL
    `;

    console.log(`[BRANCHES] Found ${branchRows.length} branches for lender_id=${lenderId}`);

    return NextResponse.json({ branches: branchRows });

  } catch (error: any) {
    console.error('[BRANCHES] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }
}
