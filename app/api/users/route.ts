// app/api/users/route.ts

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/users - request received');

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Missing or invalid Authorization header');
      return NextResponse.json({ success: false, error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    console.log('Token received (first 10 chars):', token.substring(0, 10) + '...');

    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email?: string; name?: string };
    const bluehost_id = decoded.sub;
    console.log('JWT verified - bluehost_id:', bluehost_id);

    const body = await req.json();
    console.log('Request body received:', body);

    if (!body.name || !body.type || !body.regulator) {
      console.log('Validation failed - missing required fields');
      return NextResponse.json({ success: false, error: 'Missing required fields: name, type, regulator' }, { status: 400 });
    }

    // Connect to Neon
    const sql = neon(process.env.NEON_DATABASE_URL!);
    console.log('Neon connection initialized');

    // Connect to Bluehost MySQL
    const mysql = require('mysql2/promise');
    const bluehostConn = await mysql.createConnection({
      host: process.env.BLUEHOST_HOST,
      user: process.env.BLUEHOST_USER,
      password: process.env.BLUEHOST_PASSWORD,
      database: process.env.BLUEHOST_DB,
    });
    console.log('Bluehost MySQL connected');

    // Pull only checked fields from members
    let fullName = 'Unknown User';
    let aiSubscription = 'active';
    let aiSubscriptionExpires = null;
    let paidOrgCount = 1;
    let maxAllowedOrg = 5;
    let lastAiCheck = null;

    try {
      const [rows] = await bluehostConn.execute(
        'SELECT Fname, Lname, ai_subscription, ai_subscription_expires, paid_organizations_count, max_allowed_organizations, last_ai_check FROM members WHERE Id = ? LIMIT 1',
        [bluehost_id]
      );

      if (rows.length > 0) {
        const member = rows[0];
        fullName = `${member.Fname?.trim() || ''} ${member.Lname?.trim() || ''}`.trim() || 'Unknown User';
        aiSubscription = member.ai_subscription || aiSubscription;
        aiSubscriptionExpires = member.ai_subscription_expires || null;
        paidOrgCount = member.paid_organizations_count || paidOrgCount;
        maxAllowedOrg = member.max_allowed_organizations || maxAllowedOrg;
        lastAiCheck = member.last_ai_check || null;
        console.log('Pulled from Bluehost members:', { fullName, aiSubscription, paidOrgCount, maxAllowedOrg });
      } else {
        console.log('No member found in Bluehost for Id:', bluehost_id);
      }
    } catch (err) {
      console.error('Bluehost query failed:', err);
    } finally {
      await bluehostConn.end();
    }

    // Upsert users with Bluehost fields
    const [User] = await sql`
      INSERT INTO users (
        bluehost_id,
        email,
        name,
        ai_subscription,
        ai_subscription_expires,
        paid_organizations_count,
        max_allowed_organizations,
        last_ai_check,
        updated_at
      ) VALUES (
        ${bluehost_id},
        ${body.email || decoded.email || 'unknown@email.com'},
        ${fullName},
        ${aiSubscription},
        ${aiSubscriptionExpires},
        ${paidOrgCount},
        ${maxAllowedOrg},
        ${lastAiCheck},
        NOW()
      )
      ON CONFLICT (bluehost_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        ai_subscription = EXCLUDED.ai_subscription,
        ai_subscription_expires = EXCLUDED.ai_subscription_expires,
        paid_organizations_count = EXCLUDED.paid_organizations_count,
        max_allowed_organizations = EXCLUDED.max_allowed_organizations,
        last_ai_check = EXCLUDED.last_ai_check,
        updated_at = NOW()
      RETURNING id;
    `;

    const user_id = User.id;
    console.log('User upserted - user_id:', user_id);

    // Insert organization (unchanged)
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

    return NextResponse.json({ success: true, organization_id: newOrg.id, user_id }, { status: 201 });
  } catch (error: any) {
    console.error('SAVE ORGANIZATION FAILED:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to save organization', details: error.message }, { status: 500 });
  }
}

// GET and PATCH unchanged - keep as is

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
