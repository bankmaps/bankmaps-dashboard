// app/api/generate-reports/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { put } from '@vercel/blob';

const JWT_SECRET   = process.env.JWT_SECRET!;
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bankmaps.com';
const POSTMARK_KEY = process.env.POSTMARK_API_KEY!;
const FROM_EMAIL   = 'noreply@bankmaps.com';

// ─── CATEGORY REGISTRY ────────────────────────────────────────────────────────

export const CATEGORY_GROUPS = {
  maps: [
    { id: 'boundary_maps',    label: 'Boundary Maps',              dataGate: null          },
    { id: 'demographic_maps', label: 'Demographic Maps',           dataGate: null          },
    { id: 'hmda_maps',        label: 'HMDA Maps',                  dataGate: 'hmda'        },
    { id: 'small_biz_maps',   label: 'Small Business Maps',        dataGate: 'sblar'       },
    { id: 'outreach_maps',    label: 'Outreach Maps',              dataGate: 'outreach'    },
    { id: 'donations_maps',   label: 'Donations Maps',             dataGate: 'donations'   },
    { id: 'investments_maps', label: 'Investments Maps',           dataGate: 'investments' },
    { id: 'cd_maps',          label: 'Community Development Maps', dataGate: 'cd'          },
    { id: 'branch_maps',      label: 'Branch Maps',                dataGate: 'branch'      },
  ],
  reports: [
    { id: 'cra_performance',     label: 'CRA Performance Summaries',          dataGate: null          },
    { id: 'fair_lending',        label: 'Fair Lending Performance Summaries', dataGate: 'hmda'        },
    { id: 'lending_test',        label: 'Lending Test Reports',               dataGate: 'hmda'        },
    { id: 'redlining',           label: 'Redlining Reports',                  dataGate: 'hmda'        },
    { id: 'race_eth_gmi',        label: 'Race / Ethnicity / GMI Reports',     dataGate: 'hmda'        },
    { id: 'hmda_outlier',        label: 'HMDA Outlier Reports',               dataGate: 'hmda'        },
    { id: 'outreach_reports',    label: 'Outreach Reports',                   dataGate: 'outreach'    },
    { id: 'donations_reports',   label: 'Donations Reports',                  dataGate: 'donations'   },
    { id: 'investments_reports', label: 'Investments Reports',                dataGate: 'investments' },
    { id: 'cd_reports',          label: 'Community Development Reports',      dataGate: 'cd'          },
  ],
  other: [
    { id: 'tract_lists',         label: 'Tract Lists',                  dataGate: null    },
    { id: 'hmda_tract_reports',  label: 'HMDA Tract Reports',           dataGate: 'hmda'  },
    { id: 'sblar_tract_reports', label: 'Small Business Tract Reports', dataGate: 'sblar' },
    { id: 'hmda_rankings',       label: 'HMDA Rankings',                dataGate: 'hmda'  },
    { id: 'sblar_rankings',      label: 'Small Business Rankings',      dataGate: 'sblar' },
    { id: 'branch_rankings',     label: 'Branch Rankings',              dataGate: 'branch'},
  ],
} as const;

export const ALL_CATEGORIES = [
  ...CATEGORY_GROUPS.maps,
  ...CATEGORY_GROUPS.reports,
  ...CATEGORY_GROUPS.other,
];

// Category ID → page param (expand as pages are built)
const CATEGORY_PAGE_MAP: Record<string, string> = {
  boundary_maps: 'aa-maps',
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function getUser(req: NextRequest, sql: any) {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET) as { sub: number };
    const [u] = await sql`
      SELECT id, email, name, email_reports_complete, email_reports_stale
      FROM users WHERE bluehost_id=${decoded.sub} LIMIT 1
    `;
    return u ?? null;
  } catch { return null; }
}

// ─── DATA GATE RESOLUTION ─────────────────────────────────────────────────────

async function resolveGates(sql: any, orgId: number, linkedSources: Record<string, any>): Promise<Set<string>> {
  const g = new Set<string>();
  if (linkedSources?.hmda)   g.add('hmda');
  if (linkedSources?.cra)    g.add('sblar');
  if (linkedSources?.branch) g.add('branch');
  const [hn] = await sql`SELECT CAST(COUNT(*) AS integer) AS n FROM hmda_lar_org WHERE organization_id=${orgId}`;
  const [sn] = await sql`SELECT CAST(COUNT(*) AS integer) AS n FROM sblar_org WHERE organization_id=${orgId}`;
  if (parseInt(String(hn?.n ?? 0)) > 0) g.add('hmda');
  if (parseInt(String(sn?.n ?? 0)) > 0) g.add('sblar');
  return g;
}

// ─── VERSION MANAGEMENT ───────────────────────────────────────────────────────

async function nextVersion(sql: any, orgId: number, geo: string, cat: string): Promise<number> {
  const [r] = await sql`
    SELECT COALESCE(MAX(version),0)+1 AS v FROM generated_reports
    WHERE organization_id=${orgId} AND geography_name=${geo} AND category=${cat}
  `;
  return r?.v ?? 1;
}

async function pruneVersions(sql: any, orgId: number, geo: string, cat: string, keep = 3) {
  await sql`
    DELETE FROM generated_reports WHERE id IN (
      SELECT id FROM generated_reports
      WHERE organization_id=${orgId} AND geography_name=${geo} AND category=${cat} AND status='complete'
      ORDER BY version DESC OFFSET ${keep}
    )
  `;
}

// ─── STALE FLAG ───────────────────────────────────────────────────────────────

export async function markStale(sql: any, orgId: number, reason: string) {
  await sql`
    UPDATE organizations
    SET reports_stale=TRUE, reports_stale_reason=${reason}, reports_stale_since=NOW()
    WHERE id=${orgId}
  `;
}

async function clearStaleIfDone(sql: any, orgId: number) {
  const [r] = await sql`
    SELECT CAST(COUNT(*) AS integer) AS n FROM generated_reports
    WHERE organization_id=${orgId} AND status IN ('pending','generating')
  `;
  if (parseInt(String(r?.n ?? 1)) === 0) {
    await sql`
      UPDATE organizations
      SET reports_stale=FALSE, reports_stale_reason=NULL, reports_stale_since=NULL
      WHERE id=${orgId}
    `;
  }
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Postmark-Account-Token': POSTMARK_KEY },
      body: JSON.stringify({ From: FROM_EMAIL, To: to, Subject: subject, HtmlBody: html, MessageStream: 'outbound' }),
    });
  } catch (e) { console.warn('[EMAIL]', e); }
}

const emailComplete = (name: string, geo: string, cats: string[]) => `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0d9488;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">BankMaps — Reports Ready</h1>
  </div>
  <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="color:#374151">Hi ${name},</p>
    <p style="color:#374151">Your reports for <strong>${geo}</strong> are ready to download:</p>
    <ul style="background:#f0fdf4;border-left:4px solid #0d9488;padding:12px 16px 12px 28px;border-radius:4px;color:#374151">
      ${cats.map(c => `<li style="margin:3px 0">${c}</li>`).join('')}
    </ul>
    <p style="margin-top:24px">
      <a href="${APP_URL}/users?section=download-center"
         style="background:#0d9488;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        Go to Download Center →
      </a>
    </p>
    <p style="color:#9ca3af;font-size:12px;margin-top:28px">Manage email preferences in Account → Notifications.</p>
  </div>
</div>`;

const emailStale = (name: string, reason: string) => `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#f59e0b;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">BankMaps — Reports Need Updating</h1>
  </div>
  <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="color:#374151">Hi ${name},</p>
    <p style="color:#374151">Your reports may be out of date: <strong>${reason}</strong></p>
    <p style="margin-top:24px">
      <a href="${APP_URL}/users?section=download-center"
         style="background:#f59e0b;color:white;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        Regenerate Reports →
      </a>
    </p>
    <p style="color:#9ca3af;font-size:12px;margin-top:28px">Manage email preferences in Account → Notifications.</p>
  </div>
</div>`;

// ─── SINGLE PDF GENERATION ────────────────────────────────────────────────────

async function generateOnePDF(
  sql: any, orgId: number, geoName: string, categoryId: string, rowId: number
): Promise<boolean> {
  try {
    await sql`UPDATE generated_reports SET status='generating' WHERE id=${rowId}`;

    const pageParam = CATEGORY_PAGE_MAP[categoryId];
    if (!pageParam) {
      // Page not yet built — mark complete with note (not an error)
      await sql`
        UPDATE generated_reports
        SET status='complete', completed_at=NOW(), error_message='Category page not yet implemented'
        WHERE id=${rowId}
      `;
      return false;
    }

    const res = await fetch(`${APP_URL}/api/print-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, geographyName: geoName, categoryId, pageParam }),
    });
    if (!res.ok) throw new Error(`print-pdf ${res.status}`);

    const buf  = await res.arrayBuffer();
    const key  = `reports/${orgId}/${geoName.replace(/\s+/g, '_')}/${categoryId}_${rowId}_${Date.now()}.pdf`;
    const blob = await put(key, buf, { access: 'public', contentType: 'application/pdf' });

    await sql`
      UPDATE generated_reports
      SET status='complete', completed_at=NOW(), blob_url=${blob.url}, file_size_bytes=${buf.byteLength}
      WHERE id=${rowId}
    `;
    return true;
  } catch (err: any) {
    await sql`
      UPDATE generated_reports SET status='error', error_message=${err.message}, completed_at=NOW()
      WHERE id=${rowId}
    `;
    return false;
  }
}

// ─── POST — trigger generation ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const sql  = neon(process.env.NEON_DATABASE_URL!);
    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orgId, geographyName, categories, triggeredBy, replaceExisting, linkedSources } = await req.json();

    if (!orgId || !geographyName || !Array.isArray(categories) || !categories.length)
      return NextResponse.json({ error: 'orgId, geographyName, categories required' }, { status: 400 });

    const gates  = await resolveGates(sql, orgId, linkedSources ?? {});
    const queued: { categoryId: string; rowId: number }[] = [];

    for (const catId of categories) {
      const def = ALL_CATEGORIES.find(c => c.id === catId);
      if (!def) continue;
      if (def.dataGate && !gates.has(def.dataGate)) continue;
      if (replaceExisting) await pruneVersions(sql, orgId, geographyName, catId);
      const ver   = await nextVersion(sql, orgId, geographyName, catId);
      const [row] = await sql`
        INSERT INTO generated_reports (organization_id, geography_name, category, version, status, triggered_by)
        VALUES (${orgId}, ${geographyName}, ${catId}, ${ver}, 'pending', ${triggeredBy ?? 'manual'})
        RETURNING id
      `;
      queued.push({ categoryId: catId, rowId: row.id });
    }

    // Fire-and-forget
    (async () => {
      const doneLabels: string[] = [];
      for (const { categoryId, rowId } of queued) {
        const ok = await generateOnePDF(sql, orgId, geographyName, categoryId, rowId);
        if (ok) {
          const label = ALL_CATEGORIES.find(c => c.id === categoryId)?.label;
          if (label) doneLabels.push(label);
        }
      }
      await clearStaleIfDone(sql, orgId);
      if (doneLabels.length > 0 && user.email_reports_complete) {
        await sendEmail(user.email, `Your BankMaps reports are ready — ${geographyName}`, emailComplete(user.name, geographyName, doneLabels));
        for (const { rowId } of queued)
          await sql`UPDATE generated_reports SET notified_at=NOW() WHERE id=${rowId}`;
      }
    })().catch(e => console.error('[GENERATE-BG]', e));

    return NextResponse.json({ success: true, queued: queued.length, rowIds: queued.map(q => q.rowId) });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── GET — status + categories ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sql  = neon(process.env.NEON_DATABASE_URL!);
    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url     = new URL(req.url);
    const orgId   = parseInt(url.searchParams.get('orgId') ?? '0');
    const geoName = url.searchParams.get('geographyName');
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

    const [org] = await sql`
      SELECT reports_stale, reports_stale_reason, reports_stale_since, linked_sources
      FROM organizations WHERE id=${orgId}
    `;
    const gates = await resolveGates(sql, orgId, org?.linked_sources ?? {});

    const annotate = <T extends { readonly dataGate: string | null }>(arr: readonly T[]) =>
      arr.map(c => ({ ...c, available: !c.dataGate || gates.has(c.dataGate) }));

    const reports = geoName
      ? await sql`SELECT * FROM generated_reports WHERE organization_id=${orgId} AND geography_name=${geoName} ORDER BY created_at DESC`
      : await sql`SELECT * FROM generated_reports WHERE organization_id=${orgId} ORDER BY created_at DESC`;

    return NextResponse.json({
      stale:       org?.reports_stale        ?? false,
      staleReason: org?.reports_stale_reason ?? null,
      staleSince:  org?.reports_stale_since  ?? null,
      categories: {
        maps:    annotate(CATEGORY_GROUPS.maps),
        reports: annotate(CATEGORY_GROUPS.reports),
        other:   annotate(CATEGORY_GROUPS.other),
      },
      reports,
      emailPrefs: { complete: user.email_reports_complete, stale: user.email_reports_stale },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── DELETE — remove a report row ─────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const sql  = neon(process.env.NEON_DATABASE_URL!);
    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const rid = parseInt(url.searchParams.get('reportId') ?? '0');
    const oid = parseInt(url.searchParams.get('orgId')    ?? '0');
    if (!rid || !oid) return NextResponse.json({ error: 'reportId and orgId required' }, { status: 400 });
    await sql`DELETE FROM generated_reports WHERE id=${rid} AND organization_id=${oid}`;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PATCH — update email prefs ───────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const sql  = neon(process.env.NEON_DATABASE_URL!);
    const user = await getUser(req, sql);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { emailComplete: ec, emailStale: es } = await req.json();
    await sql`
      UPDATE users
      SET email_reports_complete = COALESCE(${ec ?? null}, email_reports_complete),
          email_reports_stale    = COALESCE(${es ?? null}, email_reports_stale)
      WHERE id=${user.id}
    `;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Exported helper for stale emails (called from upload/save routes) ────────

export async function notifyStaleIfEnabled(
  sql: any, orgId: number, reason: string
) {
  await markStale(sql, orgId, reason);
  // Fetch users for this org who have opted in to stale emails
  const users = await sql`
    SELECT u.email, u.name FROM users u
    WHERE u.organization_id = ${orgId} AND u.email_reports_stale = TRUE
  `;
  for (const u of users) {
    await sendEmail(u.email, 'BankMaps — Your reports need updating', emailStale(u.name, reason));
  }
}
