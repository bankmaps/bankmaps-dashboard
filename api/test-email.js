import { sendAdminPurchaseNotice } from '../lib/email.js';

export default async function handler(req, res) {
  try {
    await sendAdminPurchaseNotice(
      'Test email from BankMaps',
      '<p>This proves Postmark is working.</p>'
    );
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Postmark test failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
