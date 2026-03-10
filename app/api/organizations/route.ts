// app/api/organizations/route.ts
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

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const sql = neon(process.env.NEON_DATABASE_URL!);

    const orgs = await sql`
      SELECT id, name, type, regulator, states, geographies, linked_sources, affiliates, custom_context
      FROM organizations 
      WHERE bluehost_id = ${decoded.sub}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ organizations: orgs });

  } catch (error: any) {
    console.error('[ORGS GET] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const body = await req.json();
    const sql = neon(process.env.NEON_DATABASE_URL!);

    const { org_id, name, type, regulator, states, geographies, linked_sources, affiliates, custom_context } = body;

    if (!org_id) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 });
    }

    // Verify this org belongs to this user
    const [existing] = await sql`
      SELECT id FROM organizations WHERE id = ${org_id} AND bluehost_id = ${decoded.sub}
    `;
    if (!existing) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    await sql`
      UPDATE organizations SET
        name            = ${name},
        type            = ${type},
        regulator       = ${regulator},
        states          = ${JSON.stringify(states || [])}::jsonb,
        geographies     = ${JSON.stringify(geographies || [])}::jsonb,
        linked_sources  = ${JSON.stringify(linked_sources || {})}::jsonb,
        affiliates      = ${JSON.stringify(affiliates || [])}::jsonb,
        custom_context  = ${custom_context || null}
      WHERE id = ${org_id} AND bluehost_id = ${decoded.sub}
    `;

    console.log(`[ORGS PATCH] Updated org ${org_id} for user ${decoded.sub}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[ORGS PATCH] Error:', error.message);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}
