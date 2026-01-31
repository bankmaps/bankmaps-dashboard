'use client';
// Force fresh deploy - Jan 31 2026
import { useState } from 'react';

export default function ChatPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setAnswer('');
    setErrorMsg('');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API error ${res.status}: ${errText}`);
      }

      const data = await res.json();

      if (data.error) {
        setErrorMsg(data.error);
      } else {
        setAnswer(data.answer || 'No answer received');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 mt-10">
      <h1 className="text-3xl font-bold mb-6">Chat with Your Documents</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about your uploaded files..."
          rows={4}
          className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Ask'}
        </button>
      </form>

      {errorMsg && <p className="mt-6 text-red-600 font-medium">Error: {errorMsg}</p>}

      {answer && (
        <div className="mt-8 p-6 bg-gray-50 border rounded-lg">
          <h2 className="text-xl font-semibold mb-3">Answer:</h2>
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </div>
  );
}