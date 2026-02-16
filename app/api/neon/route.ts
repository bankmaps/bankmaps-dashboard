// NEON_PROXY_ROUTE_UNIQUE_IDENTIFIER_67890
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { sql: query } = await req.json();
    
    if (!query) {
      return NextResponse.json({ error: 'No SQL query provided' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);
    const rows = await sql(query);
    
    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('Neon query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// This route is specifically for live.html map queries
export const runtime = 'edge';
