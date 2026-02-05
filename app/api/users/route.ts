// app/api/users/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    // Get token from Authorization header (Bearer <token>)
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided in Authorization header' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email?: string; name?: string };
    const bluehost_id = decoded.sub;

    // Parse request body from create-account form
    const body = await req.json();

    // Basic validation
    if (!body.name || !body.type || !body.regulator) {
      return NextResponse.json({ error: 'Missing required fields: name, type, regulator' }, { status: 400 });
    }

    // Connect to Neon (use the standard env var name)
    const sql = neon(process.env.DATABASE_URL!);

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

    // Step 2: Insert new organization
    const [newOrg] = await sql`
      INSERT INTO organizations (
        ai_user_id,
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

    return NextResponse.json(
      {
        success: true,
        organization_id: newOrg.id,
        ai_user_id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Save organization error:', error);

    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    if (error.message?.includes('relation') || error.message?.includes('column')) {
      return NextResponse.json(
        { error: 'Database schema error - check table/column names' },
        { status: 500 }
      );
    }

    if (error.message?.includes('connection')) {
      return NextResponse.json({ error: 'Database connection failed - check DATABASE_URL' }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to save organization: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
