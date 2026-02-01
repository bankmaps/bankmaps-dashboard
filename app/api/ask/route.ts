import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import Groq from 'groq-sdk';
import { sql } from 'drizzle-orm';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Missing or invalid question' }, { status: 400 });
    }

    const questionText = question.trim();

    // Turn question into keywords using Groq
    const rewrite = await groq.chat.completions.create({
      model: 'gemma-7b-it',
      temperature: 0.1,
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content: 'Convert the question into a simple list of search keywords separated by spaces. Return only the keywords, nothing else.'
        },
        { role: 'user', content: questionText }
      ],
    });

    const keywords = rewrite.choices?.[0]?.message?.content?.trim() || questionText;
    const keywordList = keywords.split(/\s+/).filter(Boolean);

    if (keywordList.length === 0) {
      return NextResponse.json({ answer: 'No valid search terms.' });
    }

    const conn = neon(process.env.NEON_DATABASE_URL!);
    const db = drizzle(conn);

    // Search pdf_chunks table using LIKE on chunk_text
    const conditions = keywordList.map(k => sql`chunk_text ILIKE ${'%' + k + '%'}`);
    const whereClause = conditions.length > 0 ? sql.join(conditions, sql` OR `) : sql`true`;

    const result = await db.execute(sql`
      SELECT chunk_text as content
      FROM pdf_chunks
      WHERE ${whereClause}
      LIMIT 5;
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ answer: 'No relevant information found in your documents.' });
    }

    const context = result.rows.map((r: any) => r.content).join('\n\n---\n\n');

    // Generate answer with Groq
    const answerRes = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are a helpful and professional AI assistant. Answer the question using ONLY the provided context. Be natural, clear, and structured. Use Markdown for formatting: **bold** for key headings, bullet lists for points, etc. If no answer in context, say exactly: "No relevant information found during my search."\n\nContext:\n${context}`
        },
        { role: 'user', content: questionText }
      ],
    });

    const answer = answerRes.choices?.[0]?.message?.content?.trim() || 'No answer generated';
    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error('API full error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
