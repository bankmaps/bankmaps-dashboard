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
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      {/* Sidebar - Document list or branding */}
      <div className="hidden md:block w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">Your Documents</h2>
        <ul className="space-y-3">
          <li className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 cursor-pointer">
            • cra-exam-procedures.pdf
          </li>
          <li className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 cursor-pointer">
            • fair-lending-guidelines.pdf
          </li>
          <li className="text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 cursor-pointer">
            • ncua-credit-union-guide.pdf
          </li>
        </ul>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Chat with Your Documents</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">Powered by Groq • 2026</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-transparent to-gray-50 dark:to-gray-900">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
              <p className="text-2xl font-medium mb-4">Start a conversation</p
