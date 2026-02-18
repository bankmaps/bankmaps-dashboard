// app/api/organizations/route.ts
// Lightweight endpoint - returns orgs from Neon only, no Bluehost dependency

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
      SELECT id, name, type, regulator, geographies, states
      FROM organizations 
      WHERE bluehost_id = ${decoded.sub}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ organizations: orgs });

  } catch (error: any) {
    console.error('[ORGS] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }
}
