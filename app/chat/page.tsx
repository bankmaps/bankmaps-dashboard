'use client'

import { useState } from 'react'

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAsk = async () => {
    if (!question.trim()) return

    setLoading(true)
    setAnswer('')

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      })

      const data = await res.json()

      if (data.error) {
        setAnswer(`Error: ${data.error}`)
      } else {
        setAnswer(data.answer || 'No response received.')
      }
    } catch (err) {
      setAnswer('Failed to get response. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white">
          <h1 className="text-3xl font-bold text-center">
            Chat with Your Documents
          </h1>
          <p className="mt-2 text-center text-indigo-100">
            Ask anything about your uploaded files...
          </p>
        </div>

        {/* Main content */}
        <div className="p-6 md:p-8">
          {/* Output box */}
          <div className="min-h-[200px] mb-6 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-y-auto shadow-inner">
            {answer ? (
              <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed text-lg">
                {answer}
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400 italic text-center py-20 text-lg">
                Your answer will appear here...
              </div>
            )}
          </div>

          {/* Input box */}
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about your documents..."
              className="flex-1 px-6 py-5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all shadow-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              disabled={loading}
            />
            <button
              onClick={handleAsk}
              disabled={loading || !question.trim()}
              className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 text-lg"
            >
              {loading ? 'Processing...' : 'Ask'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
          Powered by Groq + your documents • 2026
        </div>
      </div>
    </div>
  )
}