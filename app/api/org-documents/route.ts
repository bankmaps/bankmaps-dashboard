// app/api/org-documents/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';

const JWT_SECRET = process.env.JWT_SECRET!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const CHUNK_SIZE_CHARS = 6000;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

async function getUserAndOrg(req: NextRequest, sql: any, organizationId: number) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
  const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
  if (!user) return null;
  const [org] = await sql`SELECT id FROM organizations WHERE id = ${organizationId} AND bluehost_id = ${decoded.sub} LIMIT 1`;
  if (!org) return null;
  return { userId: user.id };
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8191),
    });
    return res.data[0].embedding;
  } catch (err) {
    console.error('[EMBED] Failed:', err);
    return null;
  }
}

// Simple PDF text extractor using raw byte parsing (no native deps needed)
// For production consider a proper PDF library via edge-compatible approach
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // Extract readable text strings from PDF binary
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  // Pull text from BT/ET blocks and string literals
  const texts: string[] = [];

  // Match text in parentheses from stream content
  const streamRegex = /stream([\s\S]*?)endstream/g;
  let streamMatch;
  while ((streamMatch = streamRegex.exec(raw)) !== null) {
    const content = streamMatch[1];
    const textRegex = /\(([^)]{2,})\)/g;
    let m;
    while ((m = textRegex.exec(content)) !== null) {
      const t = m[1].replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\\\/g, '\\');
      if (t.trim().length > 3) texts.push(t);
    }
  }

  return texts.join(' ');
}

// POST - upload a PDF/doc, chunk, embed, store
export async function POST(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const organizationId = parseInt(formData.get('organizationId') as string);

    if (!file || !organizationId) {
      return NextResponse.json({ error: 'file and organizationId required' }, { status: 400 });
    }

    const auth = await getUserAndOrg(req, sql, organizationId);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS pdf_chunks_org (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        uploaded_by INTEGER NOT NULL,
        filename TEXT NOT NULL,
        chunk_id INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        page_start INTEGER,
        page_end INTEGER,
        chunk_text TEXT NOT NULL,
        embedding VECTOR(${EMBEDDING_DIM}),
        file_size_bytes BIGINT,
        inserted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, filename, chunk_id)
      )
    `;

    // Delete existing chunks for this file (re-upload)
    await sql`
      DELETE FROM pdf_chunks_org 
      WHERE organization_id = ${organizationId} AND filename = ${file.name}
    `;

    const buffer = await file.arrayBuffer();
    const fileSize = buffer.byteLength;

    // Extract text
    let fullText = '';
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      fullText = await extractTextFromPdf(buffer);
    } else {
      // Plain text / txt files
      fullText = new TextDecoder().decode(buffer);
    }

    if (!fullText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 });
    }

    // Chunk and embed
    const totalChunks = Math.ceil(fullText.length / CHUNK_SIZE_CHARS);
    let chunkId = 1;
    let pos = 0;
    let inserted = 0;

    while (pos < fullText.length) {
      const end = Math.min(pos + CHUNK_SIZE_CHARS, fullText.length);
      const chunkText = fullText.slice(pos, end);

      const embedding = await generateEmbedding(chunkText);
      if (embedding) {
        const embeddingStr = `[${embedding.join(',')}]`;
        await sql`
          INSERT INTO pdf_chunks_org 
            (organization_id, uploaded_by, filename, chunk_id, total_chunks, page_start, page_end, chunk_text, embedding, file_size_bytes)
          VALUES 
            (${organizationId}, ${auth.userId}, ${file.name}, ${chunkId}, ${totalChunks}, ${chunkId}, ${Math.min(totalChunks, chunkId + 1)}, ${chunkText}, ${embeddingStr}::vector, ${fileSize})
          ON CONFLICT (organization_id, filename, chunk_id) DO UPDATE SET
            chunk_text = EXCLUDED.chunk_text,
            embedding = EXCLUDED.embedding,
            total_chunks = EXCLUDED.total_chunks,
            inserted_at = CURRENT_TIMESTAMP
        `;
        inserted++;
      }

      pos = end;
      chunkId++;
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      chunks: inserted,
      totalChunks,
      fileSize,
    });

  } catch (error: any) {
    console.error('[ORG-DOCS] Upload error:', error);
    return NextResponse.json({ error: 'Upload failed', details: error.message }, { status: 500 });
  }
}

// GET - list documents for an org
export async function GET(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    if (!organizationId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 });

    const auth = await getUserAndOrg(req, sql, organizationId);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const docs = await sql`
      SELECT 
        filename,
        MAX(total_chunks) as total_chunks,
        MAX(file_size_bytes) as file_size_bytes,
        MAX(inserted_at) as uploaded_at
      FROM pdf_chunks_org
      WHERE organization_id = ${organizationId}
      GROUP BY filename
      ORDER BY MAX(inserted_at) DESC
    `;

    return NextResponse.json({ documents: docs });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}

// DELETE - remove a document and all its chunks
export async function DELETE(req: NextRequest) {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const organizationId = parseInt(url.searchParams.get('organizationId') || '0');
    const filename = url.searchParams.get('filename');

    if (!organizationId || !filename) {
      return NextResponse.json({ error: 'organizationId and filename required' }, { status: 400 });
    }

    const auth = await getUserAndOrg(req, sql, organizationId);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await sql`
      DELETE FROM pdf_chunks_org
      WHERE organization_id = ${organizationId} AND filename = ${filename}
    `;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
