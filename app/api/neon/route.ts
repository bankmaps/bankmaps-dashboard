// NEON_ROUTE_UNIQUE_12345
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { sql: query } = await req.json();
    
    if (!query) {
      return NextResponse.json({ error: 'No SQL query provided' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!, {
      fullResults: true,
      arrayMode: false
    });
    
    // Execute raw SQL - neon() with fullResults handles raw strings
    const result = await sql(query);
    const rows = result.rows || [];
    
    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('Neon query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
