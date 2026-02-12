// app/api/users/route.ts - SYNCHRONOUS VERSION
// Caches HMDA data DURING the request instead of background

import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/users - request received');

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email?: string; name?: string };
    const bluehost_id = decoded.sub;

    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    if (!body.name || !body.type || !body.regulator) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    const mysql = require('mysql2/promise');
    const bluehostConn = await mysql.createConnection({
      host: process.env.BLUEHOST_HOST,
      user: process.env.BLUEHOST_USER,
      password: process.env.BLUEHOST_PASSWORD,
      database: process.env.BLUEHOST_DB,
    });

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
      }
    } catch (err) {
      console.error('Bluehost query failed:', err);
    } finally {
      await bluehostConn.end();
    }

    const [User] = await sql`
      INSERT INTO users (
        bluehost_id, email, name, ai_subscription, ai_subscription_expires,
        paid_organizations_count, max_allowed_organizations, last_ai_check, updated_at
      ) VALUES (
        ${bluehost_id}, ${body.email || decoded.email || 'unknown@email.com'}, ${fullName},
        ${aiSubscription}, ${aiSubscriptionExpires}, ${paidOrgCount}, ${maxAllowedOrg}, ${lastAiCheck}, NOW()
      )
      ON CONFLICT (bluehost_id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name, ai_subscription = EXCLUDED.ai_subscription,
        ai_subscription_expires = EXCLUDED.ai_subscription_expires,
        paid_organizations_count = EXCLUDED.paid_organizations_count,
        max_allowed_organizations = EXCLUDED.max_allowed_organizations,
        last_ai_check = EXCLUDED.last_ai_check, updated_at = NOW()
      RETURNING id;
    `;

    const user_id = User.id;

    const [newOrg] = await sql`
      INSERT INTO organizations (
        user_id, bluehost_id, name, type, regulator, states, linked_sources, geographies, custom_context, created_at
      ) VALUES (
        ${user_id}, ${bluehost_id}, ${body.name}, ${body.type}, ${body.regulator},
        ${JSON.stringify(body.states || [])}::jsonb, ${JSON.stringify(body.linked || {})}::jsonb,
        ${JSON.stringify(body.geographies?.map((area: any) => ({
          ...area,
          state: typeof area.state === 'string' ? JSON.parse(area.state) : (area.state || []),
          county: typeof area.county === 'string' ? JSON.parse(area.county) : (area.county || []),
          town: typeof area.town === 'string' ? JSON.parse(area.town) : (area.town || []),
          tract_number: typeof area.tract_number === 'string' ? JSON.parse(area.tract_number) : (area.tract_number || []),
        })) || [])}::jsonb,
        ${body.customContext || null}, NOW()
      )
      RETURNING id;
    `;

    const organization_id = newOrg.id;
    console.log(`Organization created - id: ${organization_id}`);

    // ═══════════════════════════════════════════════════════════
    // CACHE HMDA DATA SYNCHRONOUSLY (during the request)
    // ═══════════════════════════════════════════════════════════
    console.log('[HMDA] Starting cache for org', organization_id);
    
    await sql`DELETE FROM cached_hmda WHERE organization_id = ${organization_id}`;
    console.log('[HMDA] Cleared old cache');

    const [org] = await sql`SELECT geographies FROM organizations WHERE id = ${organization_id}`;
    if (!org?.geographies?.[0]) {
      console.log('[HMDA] No geographies, skipping cache');
      return NextResponse.json({
        success: true,
        message: 'Organization saved (no HMDA data cached - no geographies defined)',
        organization_id,
        user_id,
        redirectTo: '/users'
      }, { status: 201 });
    }

    const geo = org.geographies[0];
    const states = geo.state?.includes('__ALL__') ? [] : (geo.state || []);
    const counties = geo.county?.includes('__ALL__') ? [] : (geo.county || []);
    const towns = geo.town?.includes('__ALL__') ? [] : (geo.town || []);
    const tracts = geo.tract_number?.includes('__ALL__') ? [] : (geo.tract_number || []);

    console.log('[HMDA] Filters:', { states, counties, towns, tracts });

    let where = 'WHERE 1=1';
    if (states.length > 0) where += ` AND h.state IN (${states.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})`;
    if (counties.length > 0) where += ` AND h.county IN (${counties.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`;
    if (towns.length > 0) where += ` AND h.town IN (${towns.map(t => `'${t.replace(/'/g, "''")}'`).join(',')})`;
    if (tracts.length > 0) where += ` AND h.tract_number IN (${tracts.map(t => `'${t.replace(/'/g, "''")}'`).join(',')})`;
console.log('[HMDA] typeof sql.unsafe:', typeof sql.unsafe);
console.log('[HMDA] sql methods:', Object.getOwnPropertyNames(sql));
    const insertQuery = `
      INSERT INTO cached_hmda (
        year, lender, lender_id, lender_state, regulator, uniqueid, geoid, statecountyid,
        state, st, town, county, msa, msa_number, tract_number, property_value, borrower_income,
        purchaser_type, financing_type, loan_purpose, occupancy, lien, open_or_closed_end,
        business_or_commercial, reverse_mortgage, action_taken, product, amount,
        applications_received, application_dollars, originated_loans, originated_dollars,
        originated_and_purchased_loans, originated_and_purchased_loan_dollars,
        approved_not_accepted, approved_not_accepted_dollars, denied_applications,
        denied_application_dollars, purchased_loans, purchased_loan_dollars,
        withdrawn_applications, withdrawn_application_dollars, spread, rate, income_level,
        borrower_income_level, majority_minority, borrower_race, borrower_ethnicity,
        borrower_gender, minority_status, borrower_age, coapplicant, organization_id, cached_at
      )
      SELECT 
        h.year, h.lender, h.lender_id, h.lender_state, h.regulator, h.uniqueid, h.geoid,
        h.statecountyid, h.state, h.st, h.town, h.county, h.msa, h.msa_number, h.tract_number,
        h.property_value, h.borrower_income, h.purchaser_type, h.financing_type, h.loan_purpose,
        h.occupancy, h.lien, h.open_or_closed_end, h.business_or_commercial, h.reverse_mortgage,
        h.action_taken, h.product, h.amount, h.applications_received, h.application_dollars,
        h.originated_loans, h.originated_dollars, h.originated_and_purchased_loans,
        h.originated_and_purchased_loan_dollars, h.approved_not_accepted,
        h.approved_not_accepted_dollars, h.denied_applications, h.denied_application_dollars,
        h.purchased_loans, h.purchased_loan_dollars, h.withdrawn_applications,
        h.withdrawn_application_dollars, h.spread, h.rate, h.income_level,
        h.borrower_income_level, h.majority_minority, h.borrower_race, h.borrower_ethnicity,
        h.borrower_gender, h.minority_status, h.borrower_age, h.coapplicant,
        ${organization_id} AS organization_id, NOW() AS cached_at
      FROM hmda_us h
      ${where}
    `;

    console.log('[HMDA] Executing INSERT...');
    console.log('[HMDA] Full INSERT query:', insertQuery);
console.log('[HMDA] Query length:', insertQuery.length);
    await sql.unsafe(insertQuery);
    
    const [count] = await sql`SELECT COUNT(*) AS cnt FROM cached_hmda WHERE organization_id = ${organization_id}`;
    console.log(`[HMDA] ✅ Cached ${count.cnt} records`);

    return NextResponse.json({
      success: true,
      message: `Organization saved! Cached ${count.cnt} HMDA records.`,
      organization_id,
      user_id,
      cached_records: count.cnt,
      redirectTo: '/users'
    }, { status: 201 });

  } catch (error: any) {
    console.error('ERROR:', error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save organization', 
      details: error.message 
    }, { status: 500 });
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

    const userRes = await sql`SELECT id, email, name, ai_subscription FROM users WHERE bluehost_id = ${bluehost_id} LIMIT 1`;
    if (userRes.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const user = userRes[0];
    const orgs = await sql`SELECT user_id, name, type, regulator, states, linked_sources, geographies, custom_context FROM organizations WHERE bluehost_id = ${bluehost_id}`;

    return NextResponse.json({
      name: user.name,
      email: user.email,
      ai_subscription: user.ai_subscription,
      organizations: orgs,
    });
  } catch (error) {
    console.error("GET error:", error);
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

    await sql`UPDATE users SET name = ${body.name || null}, email = ${body.email || null}, updated_at = NOW() WHERE bluehost_id = ${bluehost_id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
