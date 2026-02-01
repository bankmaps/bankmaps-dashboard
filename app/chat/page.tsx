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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e40af', color: 'white', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>Chat with Your Documents</h1>
        <p style={{ margin: '0.5rem 0 0', opacity: 0.9, fontSize: '1rem' }}>
          Ask anything about your uploaded files...
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem' }}>
        {messages.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.75rem' }}>No messages yet</p>
            <p>Ask a question to get started</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{
                maxWidth: '80%',
                padding: '1rem 1.25rem',
                borderRadius: '1.25rem',
                backgroundColor: msg.role === 'user' ? '#1d4ed8' : '#f3f4f6',
                color: msg.role === 'user' ? 'white' : '#111827',
                borderBottomRightRadius: msg.role === 'user' ? '0' : '1.25rem',
                borderBottomLeftRadius: msg.role === 'user' ? '1.25rem' : '0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5', fontSize: '1.05rem' }}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '1rem 1.25rem', borderRadius: '1.25rem', backgroundColor: '#f3f4f6', borderBottomLeftRadius: '0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <span style={{ color: '#6b7280' }}>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Fixed input */}
      <div style={{ borderTop: '1px solid #e5e7eb', backgroundColor: 'white', padding: '1rem 1.5rem', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Ask anything about your documents..."
            rows={1}
            style={{
              flex: 1,
              padding: '1.25rem',
              border: '1px solid #d1d5db',
              borderRadius: '1rem',
              backgroundColor: 'white',
              fontSize: '1.125rem',
              lineHeight: '1.5',
              minHeight: '60px',
              maxHeight: '180px',
              resize: 'vertical',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
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
            style={{
              padding: '1rem 2rem',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '1rem',
              fontSize: '1.125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              opacity: loading || !question.trim() ? 0.6 : 1,
              pointerEvents: loading || !question.trim() ? 'none' : 'auto'
            }}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
