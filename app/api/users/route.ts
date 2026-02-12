// app/api/users/route.ts - WORKING VERSION
// Uses Neon's query builder properly instead of unsafe()

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

    // Cache HMDA data synchronously
    console.log('[HMDA] Starting cache');
    
    await sql`DELETE FROM cached_hmda WHERE organization_id = ${organization_id}`;
    console.log('[HMDA] Cleared old cache');

    const [org] = await sql`SELECT geographies FROM organizations WHERE id = ${organization_id}`;
    if (!org?.geographies?.[0]) {
      console.log('[HMDA] No geographies');
      return NextResponse.json({
        success: true,
        message: 'Organization saved (no HMDA data cached)',
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

    // Build the INSERT using Neon's query builder with dynamic conditions
    // We'll use a workaround: select matching IDs first, then insert
    
    // Step 1: Get matching hmda_us IDs
    let matchQuery = sql`SELECT * FROM hmda_us WHERE 1=1`;
    
    if (states.length > 0) {
      const stateConditions = states.map(s => sql`state = ${s}`);
      matchQuery = sql`SELECT * FROM hmda_us WHERE (${stateConditions[0]}`;
      for (let i = 1; i < stateConditions.length; i++) {
        matchQuery = sql`SELECT * FROM hmda_us WHERE (${stateConditions[0]} OR ${stateConditions[i]})`;
      }
      matchQuery = sql`SELECT * FROM hmda_us WHERE state IN (${states[0]}${states.slice(1).map(s => sql`, ${s}`)})`;
    }

    // Actually, let's use a simpler approach: build conditions separately
    const conditions: any[] = [];
    
    if (states.length > 0) {
      conditions.push(sql`state = ANY(${states})`);
    }
    if (counties.length > 0) {
      conditions.push(sql`county = ANY(${counties})`);
    }
    if (towns.length > 0) {
      conditions.push(sql`town = ANY(${towns})`);
    }
    if (tracts.length > 0) {
      conditions.push(sql`tract_number = ANY(${tracts})`);
    }

    console.log('[HMDA] Built', conditions.length, 'conditions');

    // Insert with subquery
    if (conditions.length === 0) {
      console.log('[HMDA] No filters - would cache entire table, skipping');
      return NextResponse.json({
        success: true,
        message: 'Organization saved (no filters - HMDA cache skipped)',
        organization_id,
        user_id,
        redirectTo: '/users'
      }, { status: 201 });
    }

    // Build INSERT with proper WHERE
    let insertResult;
    
    if (states.length > 0 && counties.length > 0 && towns.length > 0 && tracts.length === 0) {
      // Specific case: state + county + town, no tract filter
      insertResult = await sql`
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
          ${organization_id}::bigint AS organization_id, NOW() AS cached_at
        FROM hmda_us h
        WHERE h.state = ANY(${states})
          AND h.county = ANY(${counties})
          AND h.town = ANY(${towns})
      `;
    } else if (states.length > 0 && counties.length > 0 && towns.length > 0 && tracts.length > 0) {
      // All filters
      insertResult = await sql`
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
          ${organization_id}::bigint AS organization_id, NOW() AS cached_at
        FROM hmda_us h
        WHERE h.state = ANY(${states})
          AND h.county = ANY(${counties})
          AND h.town = ANY(${towns})
          AND h.tract_number = ANY(${tracts})
      `;
    } else {
      console.log('[HMDA] Unsupported filter combination');
      return NextResponse.json({
        success: true,
        message: 'Organization saved (unsupported filter combo)',
        organization_id,
        user_id,
        redirectTo: '/users'
      }, { status: 201 });
    }

    console.log('[HMDA] INSERT complete');
    
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
    console.error('Stack:', error.stack);
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
