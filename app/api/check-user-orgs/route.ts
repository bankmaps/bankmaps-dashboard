
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    // 1. Extract token from Authorization header (Bearer <token>)
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // 2. Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email?: string; name?: string };
    const bluehost_id = decoded.sub;

    // 3. Parse request body from create-account form
    const body = await req.json();

    // Basic validation
    if (!body.name || !body.type || !body.regulator) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 4. Connect to Neon (using your env var name)
    const sql = neon(process.env.NEON_DATABASE_URL!);

    // 5. Upsert ai_users row (create if missing, update name/email)
    const [aiUser] = await sql`
      INSERT INTO ai_users (
        bluehost_id, 
        email, 
        name, 
        ai_subscription, 
        paid_organizations_count, 
        max_allowed_organizations
      ) VALUES (
        ${bluehost_id},
        ${decoded.email || 'unknown@email.com'},
        ${decoded.name || 'Unknown User'},
        'active',  -- default on first save; update via billing later
        1,         -- start with 1 paid org (adjust based on your logic)
        5          -- default max; update on upgrade
      )
      ON CONFLICT (bluehost_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id;
    `;

    const ai_user_id = aiUser.id;

    // 6. Insert new organization
    const [newOrg] = await sql`
      INSERT INTO organizations (
        ai_user_id,
        name,
        type,
        regulator,
        states,
        linked_sources,
        geographies,
        custom_context
      ) VALUES (
        ${ai_user_id},
        ${body.name},
        ${body.type},
        ${body.regulator},
        ${JSON.stringify(body.states || [])}::jsonb,
        ${JSON.stringify(body.linked || {})}::jsonb,
        ${JSON.stringify(body.geographies || [])}::jsonb,
        ${body.customContext || null}
      )
      RETURNING id;
    `;

    // 7. Success response
    return NextResponse.json({ 
      success: true, 
      organization_id: newOrg.id,
      ai_user_id 
    }, { status: 201 });

  } catch (error) {
    console.error('Save organization error:', error);
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to save organization' }, { status: 500 });
  }
}
