import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No or invalid token provided' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // 2. Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const bluehost_id = decoded.sub;

    // LOG: Show the ID we're searching for
    console.log('CHECKING ORGS FOR bluehost_id:', bluehost_id);

    if (!bluehost_id) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
    }

    // 3. Connect to Neon
    const sql = neon(process.env.NEON_DATABASE_URL!);

    // 4. Count matching organizations
    const result = await sql`
      SELECT COUNT(*) as count
      FROM organizations
      WHERE bluehost_id = ${bluehost_id}
    `;

    // LOG: Show what the DB actually returned
    console.log('FOUND ORG COUNT:', Number(result[0].count));
    console.log('FULL RESULT ROW:', result[0]);

    const has_orgs = Number(result[0].count) > 0;

    // 5. Return simple response
    return NextResponse.json({ has_orgs }, { status: 200 });
  } catch (error) {
    console.error('check-user-orgs error:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
