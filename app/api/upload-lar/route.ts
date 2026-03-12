// app/api/upload-lar/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

async function getUser(req: NextRequest, sql: any) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
  const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
  return user || null;
}

function generateUploadId() {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── HMDA LAR PARSERS ────────────────────────────────────────────────────────

function parseQuestSoftHMDA(rows: string[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const h = (name: string) => headers.indexOf(name);
  const records = [];

  for (const row of rows) {
    if (row.length < 10) continue;
    const get = (col: string) => row[h(col)]?.trim() || null;

    records.push({
      organization_id: orgId,
      uploaded_by: userId,
      upload_id: uploadId,
      source_format: 'questsoft',
      activity_year: get('ACTDATE') ? get('ACTDATE')!.split('/')[2] : null,
      loan_number: get('APLNNO'),
      uli: get('UniversalLoanIdentifier'),
      lei: null,
      action_taken: get('ACTION'),
      action_date: get('ACTDATE'),
      application_date: get('APDATE'),
      loan_type: get('LNTYPE'),
      loan_purpose: get('LNPURPOSE'),
      loan_amount: get('LNAMOUNTFL'),
      preapproval: get('PREAPPR'),
      lien_status: get('LIENSTAT'),
      occupancy_type: get('PROPTYPE'),
      construction_method: get('ConstructionMethod'),
      open_end_loc: get('LOCIndicator'),
      business_commercial: get('BusinessCommercialIndicator'),
      reverse_mortgage: get('ReverseMortgageIndicator'),
      state: get('PROPSTATE'),
      county: get('CNTYCODE'),
      census_tract: get('CENSUSTRCT'),
      msa: get('MACODE'),
      app_ethnicity1: get('AppEthnicity1'),
      app_race1: get('AppRace1'),
      app_sex: get('AppSex'),
      app_age: get('APL_AGE'),
      coapp_ethnicity1: get('CoAppEthnicity1'),
      coapp_race1: get('CoAppRace1'),
      coapp_sex: get('CoAppSex'),
      coapp_age: get('CO_APL_AGE'),
      income: get('TINCOME'),
      purchaser_type: get('PURCHTYPE'),
      rate_spread: get('SPREAD'),
      hoepa_status: get('HOEPA'),
      denial_reason1: get('DENIALR1'),
      denial_reason2: get('DENIALR2'),
      denial_reason3: get('DENIALR3'),
      denial_reason4: get('DENIALR4'),
      app_credit_score: get('APCRSCORE'),
      coapp_credit_score: get('CAPCRSCORE'),
      credit_score_model: get('APCRPROV'),
      debt_to_income: get('DEBT_RATIO'),
      combined_ltv: get('CLTV'),
      ltv: get('LTV'),
      appraisal_value: get('APPRVALUE'),
      note_rate: get('NOTE_RATE'),
      loan_term: get('LOAN_TERM'),
      loan_grade: get('LN_GRADE'),
      qm_status: get('QM'),
      aus_type1: get('AUS_TYPE1'),
      aus_decision1: get('AUS_DECISION1'),
      property_value: get('APPRVALUE'),
      branch_id: get('BRANCHID'),
      branch_name: get('BRANCHNAME'),
      officer_id: get('OFFICERID'),
      officer_name: get('OFFICERNAME'),
      loan_rep: get('LOANREP'),
      loan_rep_name: get('LOANREPNAME'),
    });
  }
  return records;
}

function parseStandardHMDA(rows: string[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const h = (name: string) => headers.indexOf(name);
  const records = [];

  for (const row of rows) {
    if (!row[0] || row[0] === '1') continue; // skip header/transmittal rows
    const get = (col: string) => row[h(col)]?.toString().trim() || null;

    const actDate = get('ActionTakenDate');
    const year = actDate && actDate.length >= 4 ? actDate.slice(0, 4) : null;

    records.push({
      organization_id: orgId,
      uploaded_by: userId,
      upload_id: uploadId,
      source_format: 'standard',
      activity_year: year,
      loan_number: get('NULI'),
      uli: get('ULI'),
      lei: get('LEI'),
      action_taken: get('ActionTaken'),
      action_date: actDate,
      application_date: get('ApplicationDate'),
      loan_type: get('LoanType'),
      loan_purpose: get('LoanPurpose'),
      loan_amount: get('LoanAmount'),
      preapproval: get('Preapproval'),
      lien_status: get('LIENSTAT'),
      occupancy_type: get('OccupancyType'),
      construction_method: get('ConstructionMethod'),
      open_end_loc: get('OpenEndLineOfCredit'),
      business_commercial: get('BusinessCommercialPurpose'),
      reverse_mortgage: get('ReverseMortgage'),
      state: get('State'),
      county: get('County'),
      census_tract: get('CensusTract'),
      msa: null,
      app_ethnicity1: get('AppEthnicity1'),
      app_race1: get('AppRace1'),
      app_sex: get('AppSex'),
      app_age: get('AppAge'),
      coapp_ethnicity1: get('CoAppEthnicity1'),
      coapp_race1: get('CoAppRace1'),
      coapp_sex: get('CoAppSex'),
      coapp_age: get('CoAppAge'),
      income: get('Income'),
      purchaser_type: get('TypeOfPurchaser'),
      rate_spread: get('RateSpread'),
      hoepa_status: get('HOEPAStatus'),
      denial_reason1: get('DenialReason1'),
      denial_reason2: get('DenialReason2'),
      denial_reason3: get('DenialReason3'),
      denial_reason4: get('DenialReason4'),
      app_credit_score: get('AppCreditScore'),
      coapp_credit_score: get('CoAppCreditScore'),
      credit_score_model: get('AppCreditScoreModel'),
      debt_to_income: get('DebtToIncomeRatio'),
      combined_ltv: get('CombinedLoantoValueRatio'),
      ltv: null,
      appraisal_value: get('PropertyValue'),
      note_rate: get('InterestRate'),
      loan_term: get('LoanTerm'),
      loan_grade: null,
      qm_status: null,
      aus_type1: get('AUS_Type1'),
      aus_decision1: get('AUS_Decision1'),
      property_value: get('PropertyValue'),
      branch_id: null,
      branch_name: null,
      officer_id: get('OriginatorNMLSRIdentifier'),
      officer_name: null,
      loan_rep: null,
      loan_rep_name: null,
    });
  }
  return records;
}

// ─── SMALL BUSINESS LAR PARSERS ──────────────────────────────────────────────

function parseQuestSoftSBLAR(rows: string[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const h = (name: string) => headers.indexOf(name);
  const records = [];

  for (const row of rows) {
    if (row.length < 5) continue;
    const get = (col: string) => row[h(col)]?.trim() || null;

    records.push({
      organization_id: orgId,
      uploaded_by: userId,
      upload_id: uploadId,
      source_format: 'questsoft',
      activity_year: get('ACTDATE') ? get('ACTDATE')!.split('/')[2] : null,
      loan_number: get('APLNNO'),
      action_taken: get('ACTION'),
      action_date: get('ACTDATE'),
      loan_type: get('LNTYPE'),
      loan_purpose: get('LNPURPOSE'),
      loan_amount: get('LNAMOUNT'),
      loan_term: get('LOAN_TERM'),
      state: get('PROPSTATE'),
      county: get('CNTYCODE'),
      census_tract: get('CENSUSTRCT'),
      msa: get('MACODE'),
      gross_annual_revenues: get('AnnualRevenue'),
      naics_code: get('NAICSSIC'),
      affiliate_code: get('AFFCODE'),
      revenue_code: get('REVCODE'),
      branch_id: get('BRANCHID'),
      branch_name: get('BRANCHNAME'),
      officer_id: get('OFFICERID'),
      officer_name: get('OFFICERNAME'),
      assessment_area: get('AAREA'),
    });
  }
  return records;
}

function parseStandardSBLAR(text: string, orgId: number, userId: number, uploadId: string) {
  const lines = text.split('\n').map(l => l.replace(/\r/g, ''));
  const records = [];
  let activityYear: string | null = null;
  let respondentId: string | null = null;

  for (const line of lines) {
    if (!line || line.length < 10) continue;

    const recordType = line[0];

    // Transmittal record — extract year and respondent ID
    if (recordType === '3') {
      respondentId = line.slice(1, 11).trim();
      activityYear = line.slice(12, 16).trim();
      continue;
    }

    if (recordType !== '9') continue;

    // Loan record — confirmed field positions
    const loanId       = line.slice(16, 29).trim();
    const loanType     = line.slice(42, 43).trim();
    const loanAmount   = line.slice(43, 49).trim();  // in thousands
    const actionDate   = line.slice(49, 57).trim();  // YYYYMMDD
    const msa          = line.slice(57, 62).trim();
    const state        = line.slice(62, 64).trim();
    const county       = line.slice(64, 67).trim();
    const censusTract  = line.slice(67, 74).trim();
    const grossRevInd  = line.slice(74, 75).trim();

    records.push({
      organization_id: orgId,
      uploaded_by: userId,
      upload_id: uploadId,
      source_format: 'standard',
      activity_year: activityYear,
      loan_number: loanId,
      action_taken: null,       // not in standard format
      action_date: actionDate,
      loan_type: loanType,
      loan_purpose: null,
      loan_amount: loanAmount,
      loan_term: null,
      state,
      county,
      census_tract: censusTract,
      msa,
      gross_annual_revenues: grossRevInd === '1' ? 'under_1m' : grossRevInd === '2' ? 'over_1m' : 'not_provided',
      naics_code: null,
      affiliate_code: null,
      revenue_code: grossRevInd,
      branch_id: null,
      branch_name: null,
      officer_id: respondentId,
      officer_name: null,
      assessment_area: null,
    });
  }

  return records;
}

// ─── BATCH INSERT HELPER ─────────────────────────────────────────────────────

async function batchInsertHMDA(sql: any, records: any[]) {
  let inserted = 0;
  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    for (const r of batch) {
      await sql`
        INSERT INTO hmda_lar_org (
          organization_id, uploaded_by, upload_id, source_format, activity_year,
          loan_number, uli, lei, action_taken, action_date, application_date,
          loan_type, loan_purpose, loan_amount, preapproval, lien_status,
          occupancy_type, construction_method, open_end_loc, business_commercial, reverse_mortgage,
          state, county, census_tract, msa,
          app_ethnicity1, app_race1, app_sex, app_age,
          coapp_ethnicity1, coapp_race1, coapp_sex, coapp_age,
          income, purchaser_type, rate_spread, hoepa_status,
          denial_reason1, denial_reason2, denial_reason3, denial_reason4,
          app_credit_score, coapp_credit_score, credit_score_model,
          debt_to_income, combined_ltv, ltv, appraisal_value,
          note_rate, loan_term, loan_grade, qm_status,
          aus_type1, aus_decision1, property_value,
          branch_id, branch_name, officer_id, officer_name, loan_rep, loan_rep_name
        ) VALUES (
          ${r.organization_id}, ${r.uploaded_by}, ${r.upload_id}, ${r.source_format}, ${r.activity_year},
          ${r.loan_number}, ${r.uli}, ${r.lei}, ${r.action_taken}, ${r.action_date}, ${r.application_date},
          ${r.loan_type}, ${r.loan_purpose}, ${r.loan_amount}, ${r.preapproval}, ${r.lien_status},
          ${r.occupancy_type}, ${r.construction_method}, ${r.open_end_loc}, ${r.business_commercial}, ${r.reverse_mortgage},
          ${r.state}, ${r.county}, ${r.census_tract}, ${r.msa},
          ${r.app_ethnicity1}, ${r.app_race1}, ${r.app_sex}, ${r.app_age},
          ${r.coapp_ethnicity1}, ${r.coapp_race1}, ${r.coapp_sex}, ${r.coapp_age},
          ${r.income}, ${r.purchaser_type}, ${r.rate_spread}, ${r.hoepa_status},
          ${r.denial_reason1}, ${r.denial_reason2}, ${r.denial_reason3}, ${r.denial_reason4},
          ${r.app_credit_score}, ${r.coapp_credit_score}, ${r.credit_score_model},
          ${r.debt_to_income}, ${r.combined_ltv}, ${r.ltv}, ${r.appraisal_value},
          ${r.note_rate}, ${r.loan_term}, ${r.loan_grade}, ${r.qm_status},
          ${r.aus_type1}, ${r.aus_decision1}, ${r.property_value},
          ${r.branch_id}, ${r.branch_name}, ${r.officer_id}, ${r.officer_name}, ${r.loan_rep}, ${r.loan_rep_name}
        )
      `;
      inserted++;
    }
  }
  return inserted;
}

async function batchInsertSBLAR(sql: any, records: any[]) {
  let inserted = 0;
  for (const r of records) {
    await sql`
      INSERT INTO sblar_org (
        organization_id, uploaded_by, upload_id, source_format, activity_year,
        loan_number, action_taken, action_date, loan_type, loan_purpose,
        loan_amount, loan_term, state, county, census_tract, msa,
        gross_annual_revenues, naics_code, affiliate_code, revenue_code,
        branch_id, branch_name, officer_id, officer_name, assessment_area
      ) VALUES (
        ${r.organization_id}, ${r.uploaded_by}, ${r.upload_id}, ${r.source_format}, ${r.activity_year},
        ${r.loan_number}, ${r.action_taken}, ${r.action_date}, ${r.loan_type}, ${r.loan_purpose},
        ${r.loan_amount}, ${r.loan_term}, ${r.state}, ${r.county}, ${r.census_tract}, ${r.msa},
        ${r.gross_annual_revenues}, ${r.naics_code}, ${r.affiliate_code}, ${r.revenue_code},
        ${r.branch_id}, ${r.branch_name}, ${r.officer_id}, ${r.officer_name}, ${r.assessment_area}
      )
    `;
    inserted++;
  }
  return inserted;
}

// ─── CSV PARSER ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[], rows: string[][] } {
  const lines = text.split('\n').map(l => l.replace(/\r/g, ''));
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseCSVLine);
  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── FORMAT DETECTION ────────────────────────────────────────────────────────

function detectFormat(filename: string, firstLine: string): { fileType: 'hmda' | 'sblar' | 'unknown', format: 'questsoft' | 'standard' | 'unknown' } {
  const lower = filename.toLowerCase();

  // Standard fixed-width SB LAR: starts with record type 3 or 9, no commas
  if ((lower.endsWith('.txt') || lower.endsWith('.dat')) && !firstLine.includes(',')) {
    if (firstLine[0] === '3' || firstLine[0] === '9') {
      return { fileType: 'sblar', format: 'standard' };
    }
  }

  // Standard HMDA LAR xlsx — handled separately before this function
  // QuestSoft CSV formats — detect by header columns
  if (firstLine.includes('APLNNO') && firstLine.includes('LNAMOUNTFL')) {
    return { fileType: 'hmda', format: 'questsoft' };
  }
  if (firstLine.includes('APLNNO') && firstLine.includes('LNAMOUNT') && !firstLine.includes('LNAMOUNTFL')) {
    return { fileType: 'sblar', format: 'questsoft' };
  }
  // Standard HMDA LAR CSV (exported from xlsx)
  if (firstLine.includes('LEI') && firstLine.includes('ULI') && firstLine.includes('ActionTaken')) {
    return { fileType: 'hmda', format: 'standard' };
  }

  return { fileType: 'unknown', format: 'unknown' };
}

// ─── MAIN POST HANDLER ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const organizationId = parseInt(formData.get('organizationId') as string);
    const fileTypeHint = formData.get('fileType') as string | null; // 'hmda' | 'sblar'

    if (!file || !organizationId) {
      return NextResponse.json({ error: 'file and organizationId required' }, { status: 400 });
    }

    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uploadId = generateUploadId();
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
      .replace(/\x00/g, '');

    const firstLine = text.split('\n')[0];
    const { fileType, format } = detectFormat(file.name, firstLine);

    const resolvedType = (fileTypeHint as 'hmda' | 'sblar') || fileType;

    if (resolvedType === 'unknown') {
      return NextResponse.json({ error: 'Could not detect file format. Please ensure this is a QuestSoft CSV or standard LAR file.' }, { status: 422 });
    }

    let inserted = 0;

    if (resolvedType === 'hmda') {
      let records;
      if (format === 'questsoft') {
        const { headers, rows } = parseCSV(text);
        records = parseQuestSoftHMDA(rows, headers, organizationId, user.id, uploadId);
      } else {
        // Standard format CSV (converted from xlsx)
        const { headers, rows } = parseCSV(text);
        records = parseStandardHMDA(rows, headers, organizationId, user.id, uploadId);
      }
      inserted = await batchInsertHMDA(sql, records);

    } else if (resolvedType === 'sblar') {
      let records;
      if (format === 'standard') {
        records = parseStandardSBLAR(text, organizationId, user.id, uploadId);
      } else {
        const { headers, rows } = parseCSV(text);
        records = parseQuestSoftSBLAR(rows, headers, organizationId, user.id, uploadId);
      }
      inserted = await batchInsertSBLAR(sql, records);
    }

    return NextResponse.json({
      success: true,
      uploadId,
      fileType: resolvedType,
      format,
      filename: file.name,
      inserted,
    });

  } catch (error: any) {
    console.error('[UPLOAD-LAR] Error:', error);
    return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
  }
}

// ─── GET: list uploads for an org ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    if (!organizationId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 });

    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hmda = await sql`
      SELECT upload_id, source_format, activity_year, COUNT(*) as record_count, MIN(inserted_at) as uploaded_at
      FROM hmda_lar_org
      WHERE organization_id = ${organizationId}
      GROUP BY upload_id, source_format, activity_year
      ORDER BY MIN(inserted_at) DESC
    `;

    const sblar = await sql`
      SELECT upload_id, source_format, activity_year, COUNT(*) as record_count, MIN(inserted_at) as uploaded_at
      FROM sblar_org
      WHERE organization_id = ${organizationId}
      GROUP BY upload_id, source_format, activity_year
      ORDER BY MIN(inserted_at) DESC
    `;

    return NextResponse.json({ hmda, sblar });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}

// ─── DELETE: remove an upload batch ──────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    const uploadId = url.searchParams.get('uploadId');
    const fileType = url.searchParams.get('fileType'); // 'hmda' | 'sblar'

    if (!organizationId || !uploadId || !fileType) {
      return NextResponse.json({ error: 'organizationId, uploadId, fileType required' }, { status: 400 });
    }

    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (fileType === 'hmda') {
      await sql`DELETE FROM hmda_lar_org WHERE organization_id = ${organizationId} AND upload_id = ${uploadId}`;
    } else {
      await sql`DELETE FROM sblar_org WHERE organization_id = ${organizationId} AND upload_id = ${uploadId}`;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
