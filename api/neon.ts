// /api/neon.ts  (repo root)
// Vercel Edge Function → Neon proxy (CORS for reports.bankmaps.com)

import { neon } from '@neondatabase/serverless';

const CORS = {
  'Access-Control-Allow-Origin': 'https://reports.bankmaps.com',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const { sql, params = [] } = await req.json();
    if (!sql || typeof sql !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing sql' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const query = neon(process.env.NEON_DATABASE_URL!);
    const rows = await query(sql, params);

    return new Response(JSON.stringify({ rows }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
