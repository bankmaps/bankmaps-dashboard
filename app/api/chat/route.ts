// app/api/chat/route.ts
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const JWT_SECRET = process.env.JWT_SECRET!;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SYSTEM_PROMPT = `You are a CRA (Community Reinvestment Act) compliance expert assistant built into BankMaps, a professional CRA compliance dashboard. You help bank compliance officers, CRA managers, and executives understand their CRA obligations, analyze their lending data, interpret regulations, and prepare for CRA examinations.

Your expertise includes:
- CRA regulations and examination procedures (OCC, FDIC, FRB, NCUA)
- HMDA data analysis and reporting
- Assessment area delineation and analysis
- Lending, investment, and service tests
- Community development activities
- Fair lending compliance
- Geographic analysis of lending patterns

You have access to:
- The user's organization information and geographies
- Their HMDA lending data and statistics
- CRA regulatory guidance documents
- The current page/report the user is viewing

Always be specific, professional, and actionable. When analyzing data shown on the current page, reference it directly. If asked for citations, provide specific regulatory references (e.g., 12 CFR 25, CRA Q&A §__.22(a)-1).`;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const sql = neon(process.env.NEON_DATABASE_URL!);

    const body = await req.json();
    const { message, sessionId, organizationId, pageContext, history, uploadedFile } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Get user id from Neon
    const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Get org info
    let orgContext = '';
    if (organizationId) {
      const [org] = await sql`
        SELECT name, type, regulator, states, geographies, linked_sources, affiliates, custom_context
        FROM organizations WHERE id = ${organizationId} AND bluehost_id = ${decoded.sub}
      `;
      if (org) {
        orgContext = `
ORGANIZATION CONTEXT:
- Name: ${org.name}
- Type: ${org.type}
- Regulator: ${org.regulator}
- States: ${(org.states || []).join(', ')}
- Geographies: ${(org.geographies || []).map((g: any) => `${g.name} (${g.type})`).join(', ')}
${org.custom_context ? `- Notes: ${org.custom_context}` : ''}`;
      }
    }

    // Semantic search against pdf_chunks (global) and pdf_chunks_org (org-specific)
    let relevantChunks = '';
    try {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: message,
      });
      const embedding = embeddingRes.data[0].embedding;
      const embeddingStr = `[${embedding.join(',')}]`;

      // Global CRA guidance
      const globalChunks = await sql`
        SELECT chunk_text, filename, page_start, page_end, 'global' as source
        FROM pdf_chunks
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 4
      `;

      // Org-specific documents
      let orgChunks: any[] = [];
      if (organizationId) {
        orgChunks = await sql`
          SELECT chunk_text, filename, page_start, page_end, 'org' as source
          FROM pdf_chunks_org
          WHERE organization_id = ${organizationId}
          ORDER BY embedding <=> ${embeddingStr}::vector
          LIMIT 3
        `;
      }

      const allChunks = [...(orgChunks.length > 0 ? orgChunks : []), ...globalChunks];

      if (allChunks.length > 0) {
        relevantChunks = '\nRELEVANT DOCUMENTS:\n' + allChunks.map((c: any) =>
          `[${c.source === 'org' ? 'Your document: ' : ''}${c.filename}, p.${c.page_start}-${c.page_end}]\n${c.chunk_text}`
        ).join('\n\n');
      }
    } catch (err) {
      console.error('[CHAT] Embedding/search error:', err);
    }

    // Build system prompt with context
    const fullSystem = SYSTEM_PROMPT
      + (orgContext ? '\n\n' + orgContext : '')
      + (pageContext ? '\n\nCURRENT PAGE CONTEXT:\n' + pageContext : '')
      + (relevantChunks ? '\n\n' + relevantChunks : '');

    // Build messages array from history
    const messages: any[] = (history || []).map((h: any) => ({
      role: h.role,
      content: h.content,
    }));

    // Add current message (with file if uploaded)
    if (uploadedFile) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: message },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: uploadedFile.mediaType,
              data: uploadedFile.data,
            },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    // Save user message to history
    await sql`
      INSERT INTO chat_history (user_id, organization_id, session_id, role, content, page_context)
      VALUES (${user.id}, ${organizationId || null}, ${sessionId}, 'user', ${message}, ${pageContext || null})
    `;

    // Stream response from Claude
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: fullSystem,
      messages,
    });

    // Collect full response for saving to DB
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              const text = chunk.delta.text;
              fullResponse += text;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          // Save assistant response to history
          await sql`
            INSERT INTO chat_history (user_id, organization_id, session_id, role, content)
            VALUES (${user.id}, ${organizationId || null}, ${sessionId}, 'assistant', ${fullResponse})
          `;

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('[CHAT] Error:', error.message);
    return NextResponse.json({ error: 'Chat failed', details: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const sql = neon(process.env.NEON_DATABASE_URL!);

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (sessionId) {
      // Get messages for a specific session
      const messages = await sql`
        SELECT role, content, created_at FROM chat_history
        WHERE user_id = ${user.id} AND session_id = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
      return NextResponse.json({ messages });
    } else {
      // Get recent sessions
      const sessions = await sql`
        SELECT DISTINCT ON (session_id)
          session_id, content as first_message, created_at, organization_id
        FROM chat_history
        WHERE user_id = ${user.id} AND role = 'user'
        ORDER BY session_id, created_at ASC
      `;
      // Get latest timestamp per session
      const sessionList = await sql`
        SELECT session_id, MAX(created_at) as last_message_at, COUNT(*) as message_count
        FROM chat_history
        WHERE user_id = ${user.id}
        GROUP BY session_id
        ORDER BY last_message_at DESC
        LIMIT 20
      `;
      return NextResponse.json({ sessions: sessionList });
    }

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number };
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    const [user] = await sql`SELECT id FROM users WHERE bluehost_id = ${decoded.sub} LIMIT 1`;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (sessionId) {
      await sql`DELETE FROM chat_history WHERE user_id = ${user.id} AND session_id = ${sessionId}`;
    } else {
      await sql`DELETE FROM chat_history WHERE user_id = ${user.id}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
