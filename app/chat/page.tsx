'use client'

import { useState, useRef, useEffect } from 'react'

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const handleAsk = async () => {
    if (!question.trim()) return

    const userMsg = question.trim()
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setQuestion('')
    setLoading(true)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg })
      })

      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer || 'No response received.' }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get response.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header - full width */}
      <header className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-5 shadow-md">
        <h1 className="text-3xl font-bold text-center">THIS IS A TEST - FIXED LAYOUT 12345</h1>
        <p className="text-center text-indigo-100 mt-1">Ask anything about your uploaded files...</p>
      </header>

      {/* Messages - full height, scrollable */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <p className="text-2xl font-medium mb-4">No messages yet</p>
            <p>Ask a question to get started</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] md:max-w-[75%] p-5 rounded-2xl shadow-md ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none border border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed text-base">
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <span className="animate-pulse">Thinking</span>
                <span className="animate-pulse">.</span>
                <span className="animate-pulse">.</span>
                <span className="animate-pulse">.</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Fixed large input at bottom */}
      <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex gap-4 items-end">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask anything about your documents..."
            rows={1}
            className="flex-1 p-5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none shadow-sm"
            style={{ minHeight: '80px', maxHeight: '240px' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAsk()
              }
            }}
            disabled={loading}
          />
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium transition disabled:opacity-50 shadow-md"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </footer>
    </div>
  )
}
