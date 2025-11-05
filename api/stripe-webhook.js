// Vercel Serverless Function (Node 18+)
import { sendAdminPurchaseNotice } from '../lib/email.js';
import { buffer } from 'node:stream/consumers';
import Stripe from 'stripe';
import { Client } from 'pg';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

export const config = {
  api: { bodyParser: false } // we must verify the raw body
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verify failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const session = event.data.object;

  // quick notification for every completed checkout
  await sendAdminNotice(
    `New Purchase - ${session.amount_total ? (session.amount_total / 100).toFixed(2) : 'n/a'} ${session.currency ? String(session.currency).toUpperCase() : ''}`,
    `<p>Customer: ${session.customer_details?.email || session.customer_email || 'unknown'}</p>
     <p>Amount: ${session.amount_total ? (session.amount_total / 100).toFixed(2) : 'n/a'} ${session.currency ? String(session.currency).toUpperCase() : ''}</p>`
  );

  const clientRef = session.client_reference_id || ''; // base64 payload from signup
  let payload = {};
  try {
    payload = JSON.parse(Buffer.from(clientRef, 'base64url').toString('utf8'));
  } catch (_) {}

  const {
    intent_id = 'unknown',
    lenderid,
    lendername,
    percentile = 0,
    datayear = null // optional: allow forcing year; else max(datayear)
  } = payload || {};

  if (!lenderid) {
    console.error('Missing lenderid in client_reference_id payload');
    return res.status(200).json({ ok: true, missing: 'lenderid' });
  }

  const cust = (session.customer || session.customer_email || lenderid)
    .toString()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40);
  const tblLender = `cust_${cust}_hmda_lender`;
  const tblPeer = `cust_${cust}_hmda_peer`;

  const pg = new Client({ connectionString: process.env.NEON_DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  try {
    const { rows: yearRow } = await pg.query(
      datayear ? 'SELECT $1::int AS y' : 'SELECT MAX(datayear) AS y FROM hmda_test',
      datayear ? [datayear] : []
    );
    const y = Number(yearRow?.[0]?.y);

    // lender slice
    await pg.query(`DROP TABLE IF EXISTS ${tblLender}`);
    await pg.query(
      `CREATE TABLE ${tblLender} AS
       SELECT * FROM hmda_test
       WHERE datayear = $1 AND lenderid = $2`,
      [y, lenderid]
    );
    await pg.query(`CREATE INDEX ON ${tblLender}(msa)`);
    await pg.query(`CREATE INDEX ON ${tblLender}(datayear)`);

    // MSA set
    const { rows: msaRows } = await pg.query(`SELECT DISTINCT msa FROM ${tblLender} WHERE msa IS NOT NULL`);
    const msaList = msaRows.map(r => r.msa).filter(v => v !== null);

    if (msaList.length === 0) {
      console.warn('No MSAs found for lender; peer slice will be empty');
      await pg.query(`DROP TABLE IF EXISTS ${tblPeer}`);
      await pg.query(`CREATE TABLE ${tblPeer} AS SELECT * FROM hmda_test WHERE false`);
    } else {
      await pg.query(`DROP TABLE IF EXISTS ${tblPeer}`);
      await pg.query(
        `CREATE TABLE ${tblPeer} AS
         SELECT * FROM hmda_test
         WHERE datayear = $1 AND msa = ANY($2)`,
        [y, msaList]
      );
      await pg.query(`CREATE INDEX ON ${tblPeer}(msa)`);
      await pg.query(`CREATE INDEX ON ${tblPeer}(datayear)`);
    }

    // ===== EMAIL NOTIFICATION (ADMIN) =====
    try {
      const customerEmail =
        (session.customer_details && session.customer_details.email) ||
        session.customer_email ||
        'unknown';

      await sendAdminPurchaseNotice(
        `New BankMaps Purchase – ${session.amount_total ? (session.amount_total / 100).toFixed(2) : 'n/a'} ${session.currency ? String(session.currency).toUpperCase() : ''}`,
        `
        <h3>New BankMaps purchase</h3>
        <p><b>Lender:</b> ${lendername || lenderid}</p>
        <p><b>Customer email:</b> ${customerEmail}</p>
        <p><b>Year:</b> ${y}</p>
        <p><b>Tables:</b> ${tblLender}, ${tblPeer}</p>
        <p><b>Stripe amount:</b> ${
          session.amount_total ? (session.amount_total / 100).toFixed(2) : 'n/a'
        } ${session.currency ? String(session.currency).toUpperCase() : ''}
        </p>
        `
      );
    } catch (e) {
      console.error('Postmark admin email failed:', e);
    }

    console.log('Provisioned tables:', { y, cust, tblLender, tblPeer, lenderid, lendername, percentile });
    return res.status(200).json({ ok: true, y, cust, tblLender, tblPeer });
  } catch (e) {
    console.error('Provisioning failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    await pg.end();
  }
}
