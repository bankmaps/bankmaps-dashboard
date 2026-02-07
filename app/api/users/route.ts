// app/api/users/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/users - request received');

    // Get token from Authorization header (Bearer <token>)
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid Authorization header');
      return NextResponse.json(
        { success: false, error: 'No token provided in Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    console.log('Token received (first 10 chars):', token.substring(0, 10) + '...');

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email?: string; name?: string };
    const bluehost_id = decoded.sub;
    console.log('JWT verified - bluehost_id:', bluehost_id);

    // Parse request body
    const body = await req.json();
    console.log('Request body received:', body);

    // Basic validation
    if (!body.name || !body.type || !body.regulator) {
      console.log('Validation failed - missing required fields');
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, type, regulator' },
        { status: 400 }
      );
    }

    // Connect to Neon using the name you confirmed
    const sql = neon(process.env.NEON_DATABASE_URL!);
    console.log('Neon connection initialized');

    // Step 1: Upsert ai_users row
    const [aiUser] = await sql`
      INSERT INTO ai_users (
        bluehost_id,
        email,
        name,
        ai_subscription,
        paid_organizations_count,
        max_allowed_organizations,
        updated_at
      ) VALUES (
        ${bluehost_id},
        ${body.email || decoded.email || 'unknown@email.com'},
        ${body.name || decoded.name || 'Unknown User'},
        'active',
        1,
        5,
        NOW()
      )
      ON CONFLICT (bluehost_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id;
    `;

    const ai_user_id = aiUser.id;
    console.log('User upserted - ai_user_id:', ai_user_id);

// Step 2: Insert new organization - NOW INCLUDING bluehost_id
const [newOrg] = await sql`
  INSERT INTO organizations (
    ai_user_id,
    bluehost_id,                    // ← THIS WAS MISSING
    name,
    type,
    regulator,
    states,
    linked_sources,
    geographies,
    custom_context,
    created_at
  ) VALUES (
    ${ai_user_id},
    ${bluehost_id},                 // ← THIS WAS MISSING (from JWT sub)
    ${body.name},
    ${body.type},
    ${body.regulator},
    ${JSON.stringify(body.states || [])}::jsonb,
    ${JSON.stringify(body.linked || {})}::jsonb,
    ${JSON.stringify(body.geographies || [])}::jsonb,
    ${body.customContext || null},
    NOW()
  )
  RETURNING id;
`;
    console.log('Organization inserted - id:', newOrg.id);

    return NextResponse.json(
      {
        success: true,
        organization_id: newOrg.id,
        ai_user_id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Full save error in /api/users:', error);

    let status = 500;
    let message = 'Failed to save organization';

    if (error instanceof jwt.JsonWebTokenError) {
      status = 401;
      message = 'Invalid or expired token';
    } else if (error.message?.includes('database') || error.message?.includes('neon')) {
      message = 'Database connection/query failed - check logs';
    } else if (error.message?.includes('relation') || error.message?.includes('column')) {
      message = 'Database schema error - check table/column names';
    } else if (error.message?.includes('connection')) {
      message = 'Database connection failed - check NEON_DATABASE_URL env var';
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
        details: error.message || 'No details available',
      },
      { status }
    );
  }
}
