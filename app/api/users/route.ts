// app/api/users/route.ts - FIXED VERSION 3 - MAXIMUM DEBUGGING

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
    console.log('Request body received:', JSON.stringify(body, null, 2));

    if (!body.name || !body.type || !body.regulator) {
      console.log('Validation failed - missing required fields');
      return NextResponse.json({ success: false, error: 'Missing required fields: name, type, regulator' }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);
    console.log('Neon connection initialized');

    const mysql = require('mysql2/promise');
    const bluehostConn = await mysql.createConnection({
      host: process.env.BLUEHOST_HOST,
      user: process.env.BLUEHOST_USER,
      password: process.env.BLUEHOST_PASSWORD,
      database: process.env.BLUEHOST_DB,
    });
    console.log('Bluehost MySQL connected');

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
        ${JSON.stringify(body.geographies?.map((area: any) => ({
          ...area,
          state: typeof area.state === 'string' ? JSON.parse(area.state) : (area.state || []),
          county: typeof area.county === 'string' ? JSON.parse(area.county) : (area.county || []),
          town: typeof area.town === 'string' ? JSON.parse(area.town) : (area.town || []),
          tract_number: typeof area.tract_number === 'string' ? JSON.parse(area.tract_number) : (area.tract_number || []),
        })) || [])}::jsonb,
        ${body.customContext || null},
        NOW()
      )
      RETURNING id;
    `;

    const organization_id = newOrg.id;
    console.log('Organization created - organization_id:', organization_id);

    // Background HMDA cache - SUPER DEFENSIVE VERSION
    setImmediate(async () => {
      try {
        console.log(`[HMDA CACHE] START org=${organization_id}`);
        console.log('[HMDA CACHE] Initializing SQL connection...');
        
        const bgSql = neon(process.env.NEON_DATABASE_URL!);
        console.log('[HMDA CACHE] SQL connection initialized');
        
        // Clear old cache
        console.log('[HMDA CACHE] About to delete old cache...');
        const deleteResult = await bgSql`DELETE FROM cached_hmda WHERE organization_id = ${organization_id}`;
        console.log(`[HMDA CACHE] Cleared old cache - deleted ${deleteResult.length || 0} rows`);

        // Fetch organization geography
        console.log('[HMDA CACHE] Fetching organization geographies...');
        const orgRows = await bgSql`SELECT geographies FROM organizations WHERE id = ${organization_id}`;
        console.log(`[HMDA CACHE] Query returned ${orgRows.length} rows`);
        
        if (!orgRows || orgRows.length === 0) {
          console.log(`[HMDA CACHE] ERROR: No organization found with id=${organization_id}`);
          return;
        }

        console.log('[HMDA CACHE] Organization row:', JSON.stringify(orgRows[0]));
        
        if (!orgRows[0].geographies) {
          console.log(`[HMDA CACHE] ERROR: geographies field is null/undefined`);
          return;
        }

        if (!Array.isArray(orgRows[0].geographies)) {
          console.log(`[HMDA CACHE] ERROR: geographies is not an array, it's: ${typeof orgRows[0].geographies}`);
          return;
        }

        if (orgRows[0].geographies.length === 0) {
          console.log(`[HMDA CACHE] ERROR: geographies array is empty`);
          return;
        }

        const geo = orgRows[0].geographies[0];
        console.log(`[HMDA CACHE] First geography object:`, JSON.stringify(geo, null, 2));

        // Build WHERE clause components as strings
        const whereConditions: string[] = [];

        // State filter
        console.log('[HMDA CACHE] Processing state filter...');
        console.log('[HMDA CACHE] geo.state:', JSON.stringify(geo.state));
        if (geo.state?.includes('__ALL__')) {
          console.log('[HMDA CACHE] State: ALL (no filter)');
        } else if (geo.state && Array.isArray(geo.state) && geo.state.length > 0) {
          const stateList = geo.state.map((s: string) => `'${s.replace(/'/g, "''")}'`).join(',');
          whereConditions.push(`h.state IN (${stateList})`);
          console.log(`[HMDA CACHE] State filter: h.state IN (${stateList})`);
        } else {
          console.log('[HMDA CACHE] State: No filter (empty or invalid)');
        }

        // County filter
        console.log('[HMDA CACHE] Processing county filter...');
        console.log('[HMDA CACHE] geo.county:', JSON.stringify(geo.county));
        if (geo.county?.includes('__ALL__')) {
          console.log('[HMDA CACHE] County: ALL (no filter)');
        } else if (geo.county && Array.isArray(geo.county) && geo.county.length > 0) {
          const countyList = geo.county.map((c: string) => `'${c.replace(/'/g, "''")}'`).join(',');
          whereConditions.push(`h.county IN (${countyList})`);
          console.log(`[HMDA CACHE] County filter: h.county IN (${countyList})`);
        } else {
          console.log('[HMDA CACHE] County: No filter (empty or invalid)');
        }

        // Town filter
        console.log('[HMDA CACHE] Processing town filter...');
        console.log('[HMDA CACHE] geo.town:', JSON.stringify(geo.town));
        if (geo.town?.includes('__ALL__')) {
          console.log('[HMDA CACHE] Town: ALL (no filter)');
        } else if (geo.town && Array.isArray(geo.town) && geo.town.length > 0) {
          const townList = geo.town.map((t: string) => `'${t.replace(/'/g, "''")}'`).join(',');
          whereConditions.push(`h.town IN (${townList})`);
          console.log(`[HMDA CACHE] Town filter: h.town IN (${townList})`);
        } else {
          console.log('[HMDA CACHE] Town: No filter (empty or invalid)');
        }

        // Tract filter
        console.log('[HMDA CACHE] Processing tract filter...');
        console.log('[HMDA CACHE] geo.tract_number:', JSON.stringify(geo.tract_number));
        if (geo.tract_number?.includes('__ALL__')) {
          console.log('[HMDA CACHE] Tract: ALL (no filter)');
        } else if (geo.tract_number && Array.isArray(geo.tract_number) && geo.tract_number.length > 0) {
          const tractList = geo.tract_number.map((t: string) => `'${t.replace(/'/g, "''")}'`).join(',');
          whereConditions.push(`h.tract_number IN (${tractList})`);
          console.log(`[HMDA CACHE] Tract filter: h.tract_number IN (${tractList})`);
        } else {
          console.log('[HMDA CACHE] Tract: No filter (empty or invalid)');
        }

        const whereClause = whereConditions.length > 0 
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

        console.log(`[HMDA CACHE] Final WHERE clause: ${whereClause || '(no filters - will match ALL rows)'}`);

        if (!whereClause) {
          console.log('[HMDA CACHE] WARNING: No WHERE conditions! This will copy the ENTIRE hmda_us table!');
        }

        // Test query to count matches
        console.log('[HMDA CACHE] Running test count query...');
        const testQuery = `SELECT COUNT(*) as cnt FROM hmda_us h ${whereClause}`;
        console.log(`[HMDA CACHE] Test query: ${testQuery}`);
        
        const testResult = await bgSql.query(testQuery);
        console.log(`[HMDA CACHE] Test result:`, testResult);
        const expectedCount = testResult.rows?.[0]?.cnt || 0;
        console.log(`[HMDA CACHE] Expected rows to insert: ${expectedCount}`);

        if (expectedCount === 0) {
          console.log('[HMDA CACHE] WARNING: No matching HMDA records found!');
          console.log('[HMDA CACHE] This means your geography filters do not match any data in hmda_us table.');
          console.log('[HMDA CACHE] Check that state/county/town/tract values match exactly (case-sensitive)');
          return;
        }

        // Do the actual insert
        console.log('[HMDA CACHE] Starting INSERT query...');
        const insertQuery = `
          INSERT INTO cached_hmda (
            year, lender, lender_id, lender_state, regulator, uniqueid, geoid, statecountyid, 
            state, st, town, county, msa, msa_number, tract_number,
            property_value, borrower_income, purchaser_type, financing_type, loan_purpose, 
            occupancy, lien, open_or_closed_end, business_or_commercial, reverse_mortgage, 
            action_taken, product, amount, applications_received, application_dollars,
            originated_loans, originated_dollars, originated_and_purchased_loans, 
            originated_and_purchased_loan_dollars, approved_not_accepted, 
            approved_not_accepted_dollars, denied_applications, denied_application_dollars,
            purchased_loans, purchased_loan_dollars, withdrawn_applications, 
            withdrawn_application_dollars, spread, rate, income_level, borrower_income_level, 
            majority_minority, borrower_race, borrower_ethnicity, borrower_gender,
            minority_status, borrower_age, coapplicant, organization_id, cached_at
          )
          SELECT 
            h.year, h.lender, h.lender_id, h.lender_state, h.regulator, h.uniqueid, h.geoid, 
            h.statecountyid, h.state, h.st, h.town, h.county, h.msa, h.msa_number, h.tract_number,
            h.property_value, h.borrower_income, h.purchaser_type, h.financing_type, 
            h.loan_purpose, h.occupancy, h.lien, h.open_or_closed_end, h.business_or_commercial, 
            h.reverse_mortgage, h.action_taken, h.product, h.amount, h.applications_received, 
            h.application_dollars, h.originated_loans, h.originated_dollars, 
            h.originated_and_purchased_loans, h.originated_and_purchased_loan_dollars,
            h.approved_not_accepted, h.approved_not_accepted_dollars, h.denied_applications, 
            h.denied_application_dollars, h.purchased_loans, h.purchased_loan_dollars, 
            h.withdrawn_applications, h.withdrawn_application_dollars, h.spread, h.rate,
            h.income_level, h.borrower_income_level, h.majority_minority, h.borrower_race, 
            h.borrower_ethnicity, h.borrower_gender, h.minority_status, h.borrower_age, 
            h.coapplicant,
            ${organization_id} AS organization_id,
            NOW() AS cached_at
          FROM hmda_us h
          ${whereClause}
        `;

        console.log('[HMDA CACHE] Executing INSERT...');
        await bgSql.query(insertQuery);
        console.log(`[HMDA CACHE] INSERT completed successfully`);

        // Verify
        console.log('[HMDA CACHE] Verifying insert...');
        const verifyResult = await bgSql`
          SELECT COUNT(*) AS cnt FROM cached_hmda WHERE organization_id = ${organization_id}
        `;
        const actualCount = verifyResult[0]?.cnt || 0;
        console.log(`[HMDA CACHE] ✅ SUCCESS - Inserted ${actualCount} records (expected ${expectedCount})`);
        
        if (actualCount !== expectedCount) {
          console.log(`[HMDA CACHE] ⚠️ WARNING: Count mismatch! Expected ${expectedCount} but got ${actualCount}`);
        }

      } catch (err: any) {
        console.error(`[HMDA CACHE] ❌ FATAL ERROR for org=${organization_id}:`);
        console.error('[HMDA CACHE] Error message:', err?.message);
        console.error('[HMDA CACHE] Error name:', err?.name);
        console.error('[HMDA CACHE] Error stack:', err?.stack);
        console.error('[HMDA CACHE] Full error object:', JSON.stringify(err, null, 2));
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Organization saved! Your customized HMDA data is being compiled in the background.',
      organization_id,
      user_id,
      redirectTo: '/users'
    }, { status: 201 });

  } catch (error: any) {
    console.error('SAVE ORGANIZATION FAILED:', error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save organization', 
      details: error.message 
    }, { status: 500 });
  }
}

// GET and PATCH remain the same...
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

    const userRes = await sql`
      SELECT id, email, name, ai_subscription 
      FROM users 
      WHERE bluehost_id = ${bluehost_id}
      LIMIT 1
    `;

    if (userRes.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userRes[0];

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
