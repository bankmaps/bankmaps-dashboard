const express  = require('express');
const { chromium } = require('playwright');

const app  = express();
const PORT = process.env.PORT || 3001;
const SECRET = process.env.PDF_SERVER_SECRET; // shared secret with your Next.js app

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/render-pdf', async (req, res) => {
  const { url, secret } = req.body;

  if (SECRET && secret !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--enable-webgl',
        '--use-gl=swiftshader',          // software WebGL — works headless
        '--enable-accelerated-2d-canvas',
        '--disable-web-security',
      ],
    });

    const page = await browser.newPage();

    // Large viewport so maps render at full resolution
    await page.setViewportSize({ width: 1400, height: 900 });

    // Listen for the app to signal PDF bytes are ready
    const pdfBytesPromise = new Promise((resolve, reject) => {
      page.exposeFunction('__pdfReady__', (base64) => resolve(base64));
      // Timeout after 3 minutes
      setTimeout(() => reject(new Error('PDF render timeout after 3m')), 180_000);
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

    // Wait for the map and autoprint flow to complete
    const base64 = await pdfBytesPromise;

    const buf = Buffer.from(base64, 'base64');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Length', buf.length);
    res.send(buf);

  } catch (err) {
    console.error('[PDF-SERVER]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

app.listen(PORT, () => console.log(`PDF server listening on :${PORT}`));
