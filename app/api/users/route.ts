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

    // Connect to Neon
    const sql = neon(process.env.NEON_DATABASE_URL!);
    console.log('Neon connection initialized');

// Step 1: Get real name from members table
let fullName = 'Unknown User';
try {
  const memberRows = await sql`
    SELECT Fname, Lname
    FROM bankmaps_bankmaps.members
    WHERE bluehost_id = ${bluehost_id}
    LIMIT 1;
  `;

  if (memberRows.length > 0) {
    const member = memberRows[0];
    const fname = member.Fname?.trim() || '';
    const lname = member.Lname?.trim() || '';
    if (fname || lname) {
      fullName = `${fname} ${lname}`.trim();
    }
  } else {
    console.log('No member record found for bluehost_id:', bluehost_id);
  }
} catch (memberErr) {
  console.error('Failed to query members table:', memberErr);
  // continue with fallback name
}

// Use the real name (or fallback) in the upsert
const [User] = await sql`
  INSERT INTO users (
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
    ${fullName},   -- ← this uses Fname + Lname from members
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
    const user_id = User.id;
    console.log('User upserted - user_id:', user_id);

    // Step 2: Insert new organization - NOW INCLUDING bluehost_id
    const [newOrg] = await sql`
      INSERT INTO organizations (
        user_id,
        bluehost_id,
        name,
        type,
        regulator,
        states,
        linked_sources,
        geographies,
        custom_context,
        created_at
      ) VALUES (
        ${user_id},
        ${bluehost_id},
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
        user_id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('SAVE ORGANIZATION FAILED:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });

    return NextResponse.json(
      { success: false, error: 'Failed to save organization', details: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const bluehost_id = decoded.sub;

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Fetch user basics
    const userRes = await sql`
      SELECT user_id, email, name, ai_subscription 
      FROM users 
      WHERE bluehost_id = ${bluehost_id}
      LIMIT 1
    `;

    if (userRes.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userRes[0];

    // Fetch linked organizations
    const orgs = await sql`
      SELECT user_id, name, type, regulator, states, linked_sources, geographies, custom_context
      FROM organizations 
      WHERE bluehost_id = ${bluehost_id}
    `;

    return NextResponse.json({
      name: user.name,
      email: user.email,
      ai_subscription: user.ai_subscription,
      organizations: orgs,
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
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
    const bluehost_id = decoded.sub;

    const body = await req.json();

    const sql = neon(process.env.NEON_DATABASE_URL!);

    await sql`
      UPDATE users
      SET name = ${body.name || null},
          email = ${body.email || null},
          updated_at = NOW()
      WHERE bluehost_id = ${bluehost_id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/users error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
