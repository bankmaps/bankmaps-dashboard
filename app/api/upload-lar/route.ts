// app/api/upload-lar/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

const JWT_SECRET = process.env.JWT_SECRET!;

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function getUser(req: NextRequest, sql: any) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
    return user || null;
  } catch { return null; }
}

function generateUploadId() {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── GEOID CONSTRUCTION ───────────────────────────────────────────────────────

function buildGeoid(state: string, county: string, tract: string): string | null {
  const s = (state || '').trim();
  const c = (county || '').trim();
  const t = (tract || '').trim();
  if (!s || !c || !t || s === 'NA' || c === 'NA' || t === 'NA') return null;

  const statePad  = s.padStart(2, '0');
  const countyPad = c.padStart(3, '0');

  let tractNorm = '';
  if (t.includes('.')) {
    const [whole, dec] = t.split('.');
    tractNorm = whole.padStart(4, '0') + dec.padEnd(2, '0');
  } else if (t.length === 6) {
    tractNorm = t;
  } else {
    tractNorm = t.padStart(4, '0') + '00';
  }

  return statePad + countyPad + tractNorm;
}

// ─── SENTINEL CLEANUP ─────────────────────────────────────────────────────────

const SENTINELS = new Set(['NA', 'Exempt', 'na', 'exempt', '1111', '8888', '9999']);

function clean(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || SENTINELS.has(s)) return null;
  return s;
}

function cleanNum(v: any): number | null {
  const s = clean(v);
  if (s === null) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── LOAN AMOUNT NORMALIZATION ────────────────────────────────────────────────
// Standard HMDA xlsx: in dollars → divide by 1000 to get thousands
// QuestSoft HMDA: in dollars → divide by 1000
// QuestSoft SB / Standard SB: already in thousands → as-is

function normalizeLoanAmount(v: any, format: string): number | null {
  const n = cleanNum(v);
  if (n === null) return null;
  if (format === 'standard_hmda' || format === 'questsoft_hmda') {
    return Math.round(n / 1000);
  }
  return n;
}

// ─── RACE DERIVATION ──────────────────────────────────────────────────────────

function deriveRace(r1: any, r2: any, r3: any, r4: any, r5: any): string | null {
  const codes = [r1, r2, r3, r4, r5].map(v => (clean(v) || '')[0] || '');
  const has = (code: string) => codes.some(r => r === code);

  const asian    = has('2');
  const natamer  = has('1');
  const black    = has('3');
  const hawaiian = has('4');
  const white    = has('5');
  const first    = codes[0];

  if (first === '6') return 'NotProvided';
  if (first === '7') return 'NA';
  if (first === '8') return 'NA';

  const minorities = [asian, natamer, black, hawaiian].filter(Boolean).length;
  if (minorities >= 2) return '2orMore';
  if (natamer  && !asian && !black && !hawaiian) return 'NativeAmerican';
  if (asian    && !natamer && !black && !hawaiian) return 'Asian';
  if (black    && !natamer && !asian && !hawaiian) return 'Black';
  if (hawaiian && !natamer && !black && !asian)    return 'Hawaiian';
  if (white    && minorities === 0) return 'White';
  return null;
}

function isMinorityRace(race: string | null): boolean {
  return ['NativeAmerican', 'Asian', 'Black', 'Hawaiian', '2orMore'].includes(race || '');
}

function deriveBorrowerRace(
  r1a: any, r2a: any, r3a: any, r4a: any, r5a: any,
  r1c: any, r2c: any, r3c: any, r4c: any, r5c: any
): string | null {
  const raceApp   = deriveRace(r1a, r2a, r3a, r4a, r5a);
  const raceCoapp = deriveRace(r1c, r2c, r3c, r4c, r5c);
  const coappCodes = [r1c, r2c, r3c, r4c, r5c].map(v => (clean(v) || '')[0] || '');
  const appCodes   = [r1a, r2a, r3a, r4a, r5a].map(v => (clean(v) || '')[0] || '');
  const whiteCoapp = coappCodes.some(r => r === '5');
  const whiteApp   = appCodes.some(r => r === '5');

  const joint =
    (isMinorityRace(raceApp)   && (raceCoapp === 'White' || whiteCoapp)) ||
    (isMinorityRace(raceCoapp) && (raceApp   === 'White' || whiteApp));

  if (joint) return 'Joint';
  return raceApp;
}

// ─── ETHNICITY DERIVATION ─────────────────────────────────────────────────────

function deriveBorrowerEthnicity(
  e1a: any, e2a: any, e3a: any, e4a: any, e5a: any,
  e1c: any, e2c: any, e3c: any, e4c: any, e5c: any
): string | null {
  const ae = [e1a, e2a, e3a, e4a, e5a].map(v => (clean(v) || '')[0] || '');
  const ce = [e1c, e2c, e3c, e4c, e5c].map(v => (clean(v) || '')[0] || '');

  const first = ae[0];
  if (!first)    return 'NA';
  if (first === '4') return 'NA';
  if (first === '3') return 'NotProvided';

  const hispApp      = ae.some(e => e === '1');
  const nonHispApp   = ae[0] === '2' && !ae.slice(1).some(e => e === '1');
  const hispCoapp    = ce.some(e => e === '1');
  const nonHispCoapp = ce[0] === '2' && !ce.slice(1).some(e => e === '1');
  const bothApp      = ae.some(e => e === '1') && ae.some(e => e === '2');
  const bothCoapp    = ce.some(e => e === '1') && ce.some(e => e === '2');

  const joint =
    (hispApp && nonHispCoapp) || (hispCoapp && nonHispApp) ||
    (hispApp && bothCoapp)    || (hispCoapp && bothApp)    || bothApp;

  if (joint)                    return 'Joint';
  if (hispApp && !nonHispApp)   return 'Hispanic';
  if (nonHispApp && !hispApp)   return 'NonHispanic';
  return 'NA';
}

// ─── GENDER DERIVATION ────────────────────────────────────────────────────────

function deriveBorrowerGender(appSex: any, coAppSex: any): string | null {
  const a = clean(appSex) || '';
  const c = clean(coAppSex) || '';
  if ((a === '1' && c === '2') || (a === '2' && c === '1')) return 'Joint';
  if ((a === '6' || c === '6') && a !== '3' && a !== '4')   return 'Joint';
  if (a === '1') return 'Male';
  if (a === '2') return 'Female';
  if (a === '3') return 'NotProvided';
  if (a === '4') return 'NA';
  return null;
}

// ─── MINORITY STATUS ──────────────────────────────────────────────────────────

function deriveMinorityStatus(race: string | null, ethnicity: string | null): string | null {
  if (isMinorityRace(race) || race === 'Joint')            return 'Minority';
  if (ethnicity === 'Hispanic' || ethnicity === 'Joint')   return 'Minority';
  if (race === 'White' && ethnicity === 'NonHispanic')     return 'White';
  return 'Unknown';
}

// ─── ACTION FLAGS ─────────────────────────────────────────────────────────────

function deriveActionFlags(action: any, amt: number | null) {
  const a   = parseInt(clean(action) || '0');
  const amt0 = amt || 0;
  return {
    originated:                   a === 1 ? 1 : 0,
    originated_amount:            a === 1 ? amt0 : 0,
    approved_not_accepted:        (a === 2 || a === 8) ? 1 : 0,
    approved_not_accepted_amount: (a === 2 || a === 8) ? amt0 : 0,
    denied:                       (a === 3 || a === 7) ? 1 : 0,
    denied_amount:                (a === 3 || a === 7) ? amt0 : 0,
    withdrawn:                    a === 4 ? 1 : 0,
    withdrawn_amount:             a === 4 ? amt0 : 0,
    file_closed:                  a === 5 ? 1 : 0,
    file_closed_amount:           a === 5 ? amt0 : 0,
    purchased:                    a === 6 ? 1 : 0,
    purchased_amount:             a === 6 ? amt0 : 0,
    preapproval_denied:           a === 7 ? 1 : 0,
    preapproval_approved_na:      a === 8 ? 1 : 0,
    base_application:             a !== 6 ? 1 : 0,
    base_application_amount:      a !== 6 ? amt0 : 0,
    loan:                         (a === 1 || a === 6) ? 1 : 0,
    loan_amount_flag:             (a === 1 || a === 6) ? amt0 : 0,
  };
}

function deriveSBActionFlags(action: any, amt: number | null) {
  const a    = parseInt(clean(action) || '0');
  const amt0 = amt || 0;
  return {
    originated:        a === 1 ? 1 : 0,
    originated_amount: a === 1 ? amt0 : 0,
    purchased:         a === 6 ? 1 : 0,
    purchased_amount:  a === 6 ? amt0 : 0,
    loan:              (a === 1 || a === 6) ? 1 : 0,
    loan_amount_flag:  (a === 1 || a === 6) ? amt0 : 0,
  };
}

// ─── CRA LOAN SIZE ────────────────────────────────────────────────────────────

function deriveCRALoanSize(amt: number | null): string | null {
  if (amt === null) return null;
  if (amt < 100)  return 'small';
  if (amt < 250)  return 'medium';
  return 'large';
}

// ─── FORMAT DETECTION ─────────────────────────────────────────────────────────

type FileType   = 'hmda' | 'sblar';
type FormatType = 'standard_hmda' | 'questsoft_hmda' | 'standard_sblar' | 'questsoft_sblar';

function detectFormat(
  filename: string,
  headers: string[],
  firstDataRow: any[],
  rawText: string
): { fileType: FileType; format: FormatType } | null {

  const lower = filename.toLowerCase();
  const hUpper = new Set(headers.map(h => (h || '').toString().trim().toUpperCase()));

  // Fixed-width standard SB LAR
  if (rawText && (lower.endsWith('.txt') || lower.endsWith('.dat') || lower.endsWith('.csv'))) {
    const firstLine = rawText.trimStart().split('\n')[0] || '';
    if ((firstLine[0] === '3' || firstLine[0] === '9') && !firstLine.includes(',') && !firstLine.includes('|')) {
      return { fileType: 'sblar', format: 'standard_sblar' };
    }
  }

  // QuestSoft Small Business — REVCODE field
  if (hUpper.has('REVCODE')) {
    return { fileType: 'sblar', format: 'questsoft_sblar' };
  }

  // Standard HMDA — Record=2 + LEI or ULI
  const recordIdx = headers.findIndex(h => (h || '').toString().trim() === 'Record');
  if (recordIdx >= 0 && (hUpper.has('LEI') || hUpper.has('ULI'))) {
    if (String(firstDataRow[recordIdx] ?? '').trim() === '2') {
      return { fileType: 'hmda', format: 'standard_hmda' };
    }
  }

  // QuestSoft HMDA — race/ethnicity/gender fields
  if (
    hUpper.has('APPRACE1') || hUpper.has('APPETHNICITY1') || hUpper.has('APPSEX') ||
    headers.some(h => /^apprace\d/i.test(h || '')) ||
    headers.some(h => /^appethnicity\d/i.test(h || ''))
  ) {
    return { fileType: 'hmda', format: 'questsoft_hmda' };
  }

  return null;
}

// ─── FILE PARSING ─────────────────────────────────────────────────────────────

function parseFileToTable(
  buffer: Buffer,
  filename: string
): { headers: string[]; rows: any[][]; rawText: string } {

  const lower = filename.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb   = XLSX.read(buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const headers = (data[0] || []).map((h: any) => String(h ?? '').trim());
    const rows    = data.slice(1).filter((r: any[]) => r.some(v => v !== null && v !== ''));
    return { headers, rows, rawText: '' };
  }

  const text  = buffer.toString('utf-8').replace(/\x00/g, '');
  const lines = text.split('\n').map(l => l.replace(/\r/g, ''));

  // Fixed-width check
  const firstLine = lines.find(l => l.trim()) || '';
  if ((firstLine[0] === '3' || firstLine[0] === '9') && !firstLine.includes(',') && !firstLine.includes('|')) {
    return { headers: [], rows: [], rawText: text };
  }

  // Delimited (CSV, pipe, tab)
  const headers = parseDelimited(lines[0] || '').map(h => h.trim());
  const rows    = lines.slice(1).filter(l => l.trim()).map(parseDelimited);
  return { headers, rows, rawText: text };
}

function parseDelimited(line: string): string[] {
  // Detect delimiter
  const delim = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── RECORD BUILDERS ─────────────────────────────────────────────────────────

function buildHMDARecord(g: (col: string) => any, orgId: number, userId: number, uploadId: string, format: FormatType) {
  const loanAmt = normalizeLoanAmount(g('LoanAmount') ?? g('LNAMOUNTFL'), format);
  const action  = clean(g('ActionTaken') ?? g('ACTION'));
  const flags   = deriveActionFlags(action, loanAmt);

  const ar  = [g('AppRace1')??g('APPRACE1'), g('AppRace2')??g('APPRACE2'), g('AppRace3')??g('APPRACE3'), g('AppRace4')??g('APPRACE4'), g('AppRace5')??g('APPRACE5')];
  const cr  = [g('CoAppRace1')??g('COAPPRACE1'), g('CoAppRace2')??g('COAPPRACE2'), g('CoAppRace3')??g('COAPPRACE3'), g('CoAppRace4')??g('COAPPRACE4'), g('CoAppRace5')??g('COAPPRACE5')];
  const ae  = [g('AppEthnicity1')??g('APPETHNICITY1'), g('AppEthnicity2')??g('APPETHNICITY2'), g('AppEthnicity3')??g('APPETHNICITY3'), g('AppEthnicity4')??g('APPETHNICITY4'), g('AppEthnicity5')??g('APPETHNICITY5')];
  const ce  = [g('CoAppEthnicity1')??g('COAPETHNICITY1'), g('CoAppEthnicity2')??g('COAPETHNICITY2'), g('CoAppEthnicity3')??g('COAPETHNICITY3'), g('CoAppEthnicity4')??g('COAPETHNICITY4'), g('CoAppEthnicity5')??g('COAPETHNICITY5')];
  const appSex   = g('AppSex')   ?? g('APPSEX');
  const coAppSex = g('CoAppSex') ?? g('COAPPSEX');

  const borrowerRace      = deriveBorrowerRace(...ar as [any,any,any,any,any], ...cr as [any,any,any,any,any]);
  const borrowerEthnicity = deriveBorrowerEthnicity(...ae as [any,any,any,any,any], ...ce as [any,any,any,any,any]);
  const borrowerGender    = deriveBorrowerGender(appSex, coAppSex);
  const minorityStatus    = deriveMinorityStatus(borrowerRace, borrowerEthnicity);

  const rawAge    = clean(g('AppAge') ?? g('APL_AGE'));
  const borrowerAge = (rawAge && !['8888','9999','0'].includes(rawAge)) ? rawAge : null;

  // Geoid
  let geoid: string | null = null;
  if (format === 'standard_hmda') {
    const ct = clean(g('CensusTract'));
    geoid = (ct && ct !== 'NA') ? ct : null;
  } else {
    geoid = buildGeoid(
      clean(g('STCODE') ?? g('State')) || '',
      clean(g('CNTYCODE') ?? g('County')) || '',
      clean(g('CENSUSTRCT') ?? g('CensusTract')) || ''
    );
  }

  // Activity year from action date
  const actionDate = clean(g('ActionTakenDate') ?? g('ACTDATE'));
  let activityYear: string | null = null;
  if (actionDate) {
    if (actionDate.length === 8 && !actionDate.includes('/')) activityYear = actionDate.slice(0, 4);
    else if (actionDate.includes('/')) activityYear = actionDate.split('/').pop() || null;
  }

  // LTV / CLTV
  let ltv  = clean(g('LTV'));
  let cltv = clean(g('CombinedLoantoValueRatio') ?? g('CLTV'));
  if (!cltv && ltv) cltv = ltv;

  return {
    organization_id: orgId, uploaded_by: userId, upload_id: uploadId,
    source_format: format, activity_year: activityYear, geoid,
    loan_number:    clean(g('NULI') ?? g('APLNNO')),
    uli:            clean(g('ULI')),
    lei:            clean(g('LEI')),
    action_taken:   action,
    action_date:    actionDate,
    application_date: clean(g('ApplicationDate') ?? g('APDATE')),
    loan_type:      clean(g('LoanType') ?? g('LNTYPE')),
    loan_purpose:   clean(g('LoanPurpose') ?? g('LNPURPOSE')),
    loan_amount:    loanAmt,
    preapproval:    clean(g('Preapproval') ?? g('PREAPPR')),
    lien_status:    clean(g('LIENSTAT')),
    occupancy_type: clean(g('OccupancyType') ?? g('OCCUPANCY')),
    construction_method: clean(g('ConstructionMethod')),
    open_end_loc:   clean(g('OpenEndLineOfCredit') ?? g('LOCIndicator')),
    business_commercial: clean(g('BusinessCommercialPurpose') ?? g('BusinessCommercialIndicator')),
    reverse_mortgage: clean(g('ReverseMortgage') ?? g('ReverseMortgageIndicator')),
    state:   clean(g('State')  ?? g('PROPSTATE') ?? g('STCODE')),
    county:  clean(g('County') ?? g('CNTYCODE')),
    census_tract: clean(g('CensusTract') ?? g('CENSUSTRCT')),
    msa:     clean(g('MACODE')),
    app_ethnicity1: clean(ae[0]), app_ethnicity2: clean(ae[1]), app_ethnicity3: clean(ae[2]), app_ethnicity4: clean(ae[3]), app_ethnicity5: clean(ae[4]),
    coapp_ethnicity1: clean(ce[0]), coapp_ethnicity2: clean(ce[1]), coapp_ethnicity3: clean(ce[2]), coapp_ethnicity4: clean(ce[3]), coapp_ethnicity5: clean(ce[4]),
    app_race1: clean(ar[0]), app_race2: clean(ar[1]), app_race3: clean(ar[2]), app_race4: clean(ar[3]), app_race5: clean(ar[4]),
    coapp_race1: clean(cr[0]), coapp_race2: clean(cr[1]), coapp_race3: clean(cr[2]), coapp_race4: clean(cr[3]), coapp_race5: clean(cr[4]),
    app_sex: clean(appSex), coapp_sex: clean(coAppSex),
    app_age: clean(g('AppAge') ?? g('APL_AGE')),
    coapp_age: clean(g('CoAppAge') ?? g('CO_APL_AGE')),
    income:         clean(g('Income') ?? g('TINCOME')),
    purchaser_type: clean(g('TypeOfPurchaser') ?? g('PURCHTYPE')),
    rate_spread:    clean(g('RateSpread') ?? g('SPREAD')),
    hoepa_status:   clean(g('HOEPAStatus') ?? g('HOEPA')),
    denial_reason1: clean(g('DenialReason1') ?? g('DENIALR1')),
    denial_reason2: clean(g('DenialReason2') ?? g('DENIALR2')),
    denial_reason3: clean(g('DenialReason3') ?? g('DENIALR3')),
    denial_reason4: clean(g('DenialReason4') ?? g('DENIALR4')),
    app_credit_score:   clean(g('AppCreditScore')   ?? g('APCRSCORE')),
    coapp_credit_score: clean(g('CoAppCreditScore') ?? g('CAPCRSCORE')),
    credit_score_model: clean(g('AppCreditScoreModel') ?? g('APCRPROV')),
    debt_to_income:     clean(g('DebtToIncomeRatio') ?? g('DEBT_RATIO')),
    combined_ltv: cltv, ltv,
    note_rate:    clean(g('InterestRate') ?? g('NOTE_RATE')),
    loan_term:    clean(g('LoanTerm') ?? g('LOAN_TERM')),
    loan_grade:   clean(g('LN_GRADE')),
    qm_status:    clean(g('QM')),
    aus_type1:    clean(g('AUS_Type1') ?? g('AUS_TYPE1')),
    aus_decision1: clean(g('AUS_Decision1') ?? g('AUS_DECISION1')),
    property_value: clean(g('PropertyValue') ?? g('APPRVALUE')),
    total_units:    clean(g('TotalUnits')),
    branch_id:      clean(g('BRANCHID')),
    branch_name:    clean(g('BRANCHNAME')),
    officer_id:     clean(g('OriginatorNMLSRIdentifier') ?? g('OFFICERID')),
    officer_name:   clean(g('OFFICERNAME')),
    loan_rep:       clean(g('LOANREP')),
    loan_rep_name:  clean(g('LOANREPNAME')),
    // Derived
    borrower_race: borrowerRace, borrower_ethnicity: borrowerEthnicity,
    borrower_gender: borrowerGender, borrower_age: borrowerAge,
    minority_status: minorityStatus,
    ...flags,
    // Census — populated post-insert
    geoid_state: null, st: null, geoid_county: null, geoid_town: null,
    geoid_tract: null, geoid_msa: null, geoid_msa_name: null,
    income_level: null, majority_minority: null, borrower_income_level: null,
  };
}

function buildSBRecord(g: (col: string) => any, orgId: number, userId: number, uploadId: string, format: FormatType, overrides: Record<string, any> = {}) {
  const loanAmt = cleanNum(g('LNAMOUNT') ?? g('loan_amount'));
  const action  = clean(g('ACTION') ?? g('action_taken'));
  const flags   = deriveSBActionFlags(action, loanAmt);

  const actionDate = clean(g('ACTDATE') ?? g('action_date'));
  let activityYear: string | null = null;
  if (actionDate) {
    if (actionDate.length === 8 && !actionDate.includes('/')) activityYear = actionDate.slice(0, 4);
    else if (actionDate.includes('/')) activityYear = actionDate.split('/').pop() || null;
  }

  const state  = clean(g('STCODE')    ?? g('state'));
  const county = clean(g('CNTYCODE')  ?? g('county'));
  const tract  = clean(g('CENSUSTRCT') ?? g('census_tract'));
  const geoid  = buildGeoid(state || '', county || '', tract || '');

  return {
    organization_id: orgId, uploaded_by: userId, upload_id: uploadId,
    source_format: format, activity_year: activityYear, geoid,
    loan_number:   clean(g('APLNNO')),
    action_taken:  action,
    action_date:   actionDate,
    loan_type:     clean(g('LNTYPE')),
    loan_purpose:  clean(g('LNPURPOSE')),
    loan_amount:   loanAmt,
    loan_term:     clean(g('LOAN_TERM')),
    state, county, census_tract: tract,
    msa:           clean(g('MACODE')),
    gross_annual_revenues: clean(g('AnnualRevenue')),
    naics_code:    clean(g('NAICSSIC')),
    affiliate_code: clean(g('AFFCODE')),
    revenue_code:  clean(g('REVCODE')),
    branch_id:     clean(g('BRANCHID')),
    branch_name:   clean(g('BRANCHNAME')),
    officer_id:    clean(g('OFFICERID')),
    officer_name:  clean(g('OFFICERNAME')),
    assessment_area: clean(g('AAREA')),
    cra_loan_size: deriveCRALoanSize(loanAmt),
    ...flags,
    geoid_state: null, st: null, geoid_county: null, geoid_town: null,
    geoid_tract: null, geoid_msa: null, geoid_msa_name: null,
    income_level: null, majority_minority: null,
    ...overrides,
  };
}

// ─── FORMAT-SPECIFIC PARSERS ──────────────────────────────────────────────────

function parseStandardHMDA(rows: any[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const hMap: Record<string, number> = {};
  headers.forEach((h, i) => { hMap[h.trim()] = i; });
  return rows
    .filter(row => String(row[hMap['Record']] ?? '').trim() === '2')
    .map(row => {
      const g = (col: string) => { const i = hMap[col]; return i !== undefined ? row[i] : undefined; };
      return buildHMDARecord(g, orgId, userId, uploadId, 'standard_hmda');
    });
}

function parseQuestSoftHMDA(rows: any[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const hMap: Record<string, number> = {};
  headers.forEach((h, i) => { hMap[h.trim().toUpperCase()] = i; });
  return rows.map(row => {
    const g = (col: string) => { const i = hMap[col.toUpperCase()]; return i !== undefined ? row[i] : undefined; };
    return buildHMDARecord(g, orgId, userId, uploadId, 'questsoft_hmda');
  });
}

function parseQuestSoftSBLAR(rows: any[][], headers: string[], orgId: number, userId: number, uploadId: string) {
  const hMap: Record<string, number> = {};
  headers.forEach((h, i) => { hMap[h.trim().toUpperCase()] = i; });
  return rows.map(row => {
    const g = (col: string) => { const i = hMap[col.toUpperCase()]; return i !== undefined ? row[i] : undefined; };
    return buildSBRecord(g, orgId, userId, uploadId, 'questsoft_sblar');
  });
}

function parseStandardSBLAR(rawText: string, orgId: number, userId: number, uploadId: string) {
  const lines = rawText.split('\n').map(l => l.replace(/\r/g, ''));
  const records: any[] = [];
  let activityYear: string | null = null;
  let respondentId: string | null = null;

  for (const line of lines) {
    if (!line || line.length < 10) continue;
    if (line[0] === '3') {
      respondentId = line.slice(1, 11).trim();
      activityYear = line.slice(12, 16).trim();
      continue;
    }
    if (line[0] !== '9') continue;

    const loanId   = line.slice(16, 29).trim();
    const loanType = line.slice(42, 43).trim();
    const loanAmt  = parseFloat(line.slice(43, 49).trim()) || null;
    const actDate  = line.slice(49, 57).trim();
    const msa      = line.slice(57, 62).trim();
    const state    = line.slice(62, 64).trim();
    const county   = line.slice(64, 67).trim();
    const tractRaw = line.slice(67, 74).trim();
    const revInd   = line.slice(74, 75).trim();
    const geoid    = buildGeoid(state, county, tractRaw);
    const flags    = deriveSBActionFlags(null, loanAmt);

    records.push({
      organization_id: orgId, uploaded_by: userId, upload_id: uploadId,
      source_format: 'standard_sblar', activity_year: activityYear, geoid,
      loan_number: loanId, action_taken: null, action_date: actDate,
      loan_type: loanType, loan_purpose: null, loan_amount: loanAmt, loan_term: null,
      state, county, census_tract: tractRaw, msa,
      gross_annual_revenues: revInd === '1' ? 'under_1m' : revInd === '2' ? 'over_1m' : 'not_provided',
      naics_code: null, affiliate_code: null, revenue_code: revInd,
      branch_id: null, branch_name: null, officer_id: respondentId, officer_name: null, assessment_area: null,
      cra_loan_size: deriveCRALoanSize(loanAmt),
      ...flags,
      geoid_state: null, st: null, geoid_county: null, geoid_town: null,
      geoid_tract: null, geoid_msa: null, geoid_msa_name: null,
      income_level: null, majority_minority: null,
    });
  }
  return records;
}

// ─── BATCH INSERT ─────────────────────────────────────────────────────────────

async function insertHMDA(sql: any, records: any[]): Promise<number> {
  let n = 0;
  for (const r of records) {
    await sql`
      INSERT INTO hmda_lar_org (
        organization_id, uploaded_by, upload_id, source_format, activity_year, geoid,
        loan_number, uli, lei, action_taken, action_date, application_date,
        loan_type, loan_purpose, loan_amount, preapproval, lien_status,
        occupancy_type, construction_method, open_end_loc, business_commercial, reverse_mortgage,
        state, county, census_tract, msa,
        app_ethnicity1, app_ethnicity2, app_ethnicity3, app_ethnicity4, app_ethnicity5,
        coapp_ethnicity1, coapp_ethnicity2, coapp_ethnicity3, coapp_ethnicity4, coapp_ethnicity5,
        app_race1, app_race2, app_race3, app_race4, app_race5,
        coapp_race1, coapp_race2, coapp_race3, coapp_race4, coapp_race5,
        app_sex, coapp_sex, app_age, coapp_age,
        income, purchaser_type, rate_spread, hoepa_status,
        denial_reason1, denial_reason2, denial_reason3, denial_reason4,
        app_credit_score, coapp_credit_score, credit_score_model,
        debt_to_income, combined_ltv, ltv, note_rate, loan_term, loan_grade, qm_status,
        aus_type1, aus_decision1, property_value, total_units,
        branch_id, branch_name, officer_id, officer_name, loan_rep, loan_rep_name,
        borrower_race, borrower_ethnicity, borrower_gender, borrower_age, minority_status,
        originated, originated_amount, approved_not_accepted, approved_not_accepted_amount,
        denied, denied_amount, withdrawn, withdrawn_amount, file_closed, file_closed_amount,
        purchased, purchased_amount, preapproval_denied, preapproval_approved_na,
        base_application, base_application_amount, loan, loan_amount_flag,
        geoid_state, st, geoid_county, geoid_town, geoid_tract, geoid_msa, geoid_msa_name,
        income_level, majority_minority, borrower_income_level
      ) VALUES (
        ${r.organization_id}, ${r.uploaded_by}, ${r.upload_id}, ${r.source_format}, ${r.activity_year}, ${r.geoid},
        ${r.loan_number}, ${r.uli}, ${r.lei}, ${r.action_taken}, ${r.action_date}, ${r.application_date},
        ${r.loan_type}, ${r.loan_purpose}, ${r.loan_amount}, ${r.preapproval}, ${r.lien_status},
        ${r.occupancy_type}, ${r.construction_method}, ${r.open_end_loc}, ${r.business_commercial}, ${r.reverse_mortgage},
        ${r.state}, ${r.county}, ${r.census_tract}, ${r.msa},
        ${r.app_ethnicity1}, ${r.app_ethnicity2}, ${r.app_ethnicity3}, ${r.app_ethnicity4}, ${r.app_ethnicity5},
        ${r.coapp_ethnicity1}, ${r.coapp_ethnicity2}, ${r.coapp_ethnicity3}, ${r.coapp_ethnicity4}, ${r.coapp_ethnicity5},
        ${r.app_race1}, ${r.app_race2}, ${r.app_race3}, ${r.app_race4}, ${r.app_race5},
        ${r.coapp_race1}, ${r.coapp_race2}, ${r.coapp_race3}, ${r.coapp_race4}, ${r.coapp_race5},
        ${r.app_sex}, ${r.coapp_sex}, ${r.app_age}, ${r.coapp_age},
        ${r.income}, ${r.purchaser_type}, ${r.rate_spread}, ${r.hoepa_status},
        ${r.denial_reason1}, ${r.denial_reason2}, ${r.denial_reason3}, ${r.denial_reason4},
        ${r.app_credit_score}, ${r.coapp_credit_score}, ${r.credit_score_model},
        ${r.debt_to_income}, ${r.combined_ltv}, ${r.ltv}, ${r.note_rate}, ${r.loan_term}, ${r.loan_grade}, ${r.qm_status},
        ${r.aus_type1}, ${r.aus_decision1}, ${r.property_value}, ${r.total_units},
        ${r.branch_id}, ${r.branch_name}, ${r.officer_id}, ${r.officer_name}, ${r.loan_rep}, ${r.loan_rep_name},
        ${r.borrower_race}, ${r.borrower_ethnicity}, ${r.borrower_gender}, ${r.borrower_age}, ${r.minority_status},
        ${r.originated}, ${r.originated_amount}, ${r.approved_not_accepted}, ${r.approved_not_accepted_amount},
        ${r.denied}, ${r.denied_amount}, ${r.withdrawn}, ${r.withdrawn_amount}, ${r.file_closed}, ${r.file_closed_amount},
        ${r.purchased}, ${r.purchased_amount}, ${r.preapproval_denied}, ${r.preapproval_approved_na},
        ${r.base_application}, ${r.base_application_amount}, ${r.loan}, ${r.loan_amount_flag},
        ${r.geoid_state}, ${r.st}, ${r.geoid_county}, ${r.geoid_town}, ${r.geoid_tract}, ${r.geoid_msa}, ${r.geoid_msa_name},
        ${r.income_level}, ${r.majority_minority}, ${r.borrower_income_level}
      )
    `;
    n++;
  }
  return n;
}

async function insertSBLAR(sql: any, records: any[]): Promise<number> {
  let n = 0;
  for (const r of records) {
    await sql`
      INSERT INTO sblar_org (
        organization_id, uploaded_by, upload_id, source_format, activity_year, geoid,
        loan_number, action_taken, action_date, loan_type, loan_purpose,
        loan_amount, loan_term, state, county, census_tract, msa,
        gross_annual_revenues, naics_code, affiliate_code, revenue_code,
        branch_id, branch_name, officer_id, officer_name, assessment_area,
        cra_loan_size, originated, originated_amount, purchased, purchased_amount, loan, loan_amount_flag,
        geoid_state, st, geoid_county, geoid_town, geoid_tract, geoid_msa, geoid_msa_name,
        income_level, majority_minority
      ) VALUES (
        ${r.organization_id}, ${r.uploaded_by}, ${r.upload_id}, ${r.source_format}, ${r.activity_year}, ${r.geoid},
        ${r.loan_number}, ${r.action_taken}, ${r.action_date}, ${r.loan_type}, ${r.loan_purpose},
        ${r.loan_amount}, ${r.loan_term}, ${r.state}, ${r.county}, ${r.census_tract}, ${r.msa},
        ${r.gross_annual_revenues}, ${r.naics_code}, ${r.affiliate_code}, ${r.revenue_code},
        ${r.branch_id}, ${r.branch_name}, ${r.officer_id}, ${r.officer_name}, ${r.assessment_area},
        ${r.cra_loan_size}, ${r.originated}, ${r.originated_amount}, ${r.purchased}, ${r.purchased_amount}, ${r.loan}, ${r.loan_amount_flag},
        ${r.geoid_state}, ${r.st}, ${r.geoid_county}, ${r.geoid_town}, ${r.geoid_tract}, ${r.geoid_msa}, ${r.geoid_msa_name},
        ${r.income_level}, ${r.majority_minority}
      )
    `;
    n++;
  }
  return n;
}

// ─── CENSUS JOIN ──────────────────────────────────────────────────────────────

async function applyCensusJoin(sql: any, uploadId: string, table: 'hmda_lar_org' | 'sblar_org') {
  try {
    if (table === 'hmda_lar_org') {
      await sql`
        UPDATE hmda_lar_org t
        SET
          geoid_state    = c.state,
          st             = c.stateabbrev,
          geoid_county   = c.countyname,
          geoid_town     = c.townname,
          geoid_tract    = c.tractnumber,
          geoid_msa      = c.msa,
          geoid_msa_name = c.msaname,
          income_level   = c.lmitext,
          majority_minority = c.mmttext
        FROM census_us c
        WHERE t.upload_id    = ${uploadId}
          AND t.geoid        = c.geoid
          AND t.activity_year = c.year::text
      `;
    } else {
      await sql`
        UPDATE sblar_org t
        SET
          geoid_state    = c.state,
          st             = c.stateabbrev,
          geoid_county   = c.countyname,
          geoid_town     = c.townname,
          geoid_tract    = c.tractnumber,
          geoid_msa      = c.msa,
          geoid_msa_name = c.msaname,
          income_level   = c.lmitext,
          majority_minority = c.mmttext
        FROM census_us c
        WHERE t.upload_id    = ${uploadId}
          AND t.geoid        = c.geoid
          AND t.activity_year = c.year::text
      `;
    }
  } catch (err) {
    console.warn('[CENSUS JOIN] Non-fatal:', err);
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const organizationId = parseInt(formData.get('organizationId') as string);

    if (!file || !organizationId) {
      return NextResponse.json({ error: 'file and organizationId required' }, { status: 400 });
    }

    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uploadId  = generateUploadId();
    const buffer    = Buffer.from(await file.arrayBuffer());
    const { headers, rows, rawText } = parseFileToTable(buffer, file.name);
    const firstRow  = rows[0] || [];
    const detected  = detectFormat(file.name, headers, firstRow, rawText);

    if (!detected) {
      return NextResponse.json({
        error: 'Unable to confirm file format - please contact support@bankmaps.com for assistance'
      }, { status: 422 });
    }

    const { fileType, format } = detected;
    let inserted = 0;

    if (fileType === 'hmda') {
      const records = format === 'standard_hmda'
        ? parseStandardHMDA(rows, headers, organizationId, user.id, uploadId)
        : parseQuestSoftHMDA(rows, headers, organizationId, user.id, uploadId);
      inserted = await insertHMDA(sql, records);
      await applyCensusJoin(sql, uploadId, 'hmda_lar_org');
    } else {
      const records = format === 'standard_sblar'
        ? parseStandardSBLAR(rawText, organizationId, user.id, uploadId)
        : parseQuestSoftSBLAR(rows, headers, organizationId, user.id, uploadId);
      inserted = await insertSBLAR(sql, records);
      await applyCensusJoin(sql, uploadId, 'sblar_org');
    }

    return NextResponse.json({ success: true, uploadId, fileType, format, filename: file.name, inserted });

  } catch (error: any) {
    console.error('[UPLOAD-LAR] Error:', error);
    return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    if (!organizationId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hmda  = await sql`SELECT upload_id, source_format, activity_year, COUNT(*) as record_count, MIN(inserted_at) as uploaded_at FROM hmda_lar_org WHERE organization_id = ${organizationId} GROUP BY upload_id, source_format, activity_year ORDER BY MIN(inserted_at) DESC`;
    const sblar = await sql`SELECT upload_id, source_format, activity_year, COUNT(*) as record_count, MIN(inserted_at) as uploaded_at FROM sblar_org WHERE organization_id = ${organizationId} GROUP BY upload_id, source_format, activity_year ORDER BY MIN(inserted_at) DESC`;

    return NextResponse.json({ hmda, sblar });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    const uploadId = url.searchParams.get('uploadId');
    const fileType = url.searchParams.get('fileType');
    if (!organizationId || !uploadId || !fileType) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
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
