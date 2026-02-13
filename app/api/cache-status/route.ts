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
    jwt.verify(token, JWT_SECRET);

    // Get orgId from query parameter instead of route param
    const orgId = parseInt(req.nextUrl.searchParams.get('orgId') || '0');
    if (!orgId) {
      return NextResponse.json({ error: 'Invalid organization ID' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);
    
    const statusResult = await sql`
      SELECT status, record_count, started_at, completed_at, error_message
      FROM cache_status
      WHERE organization_id = ${orgId}
    `;

    if (statusResult.length === 0) {
      return NextResponse.json({
        status: 'unknown',
        message: 'No cache status found'
      });
    }

    const status = statusResult[0];

    return NextResponse.json({
      status: status.status,
      recordCount: status.record_count,
      startedAt: status.started_at,
      completedAt: status.completed_at,
      errorMessage: status.error_message
    });
  } catch (error: any) {
    console.error('Cache status check error:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
