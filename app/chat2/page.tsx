'use client'

export default function Chat2Page() {
  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui' }}>
      <h1 style={{ color: 'green' }}>THIS IS CHAT2 - IT WORKS</h1>
      <p>If you see this on live Vercel, the app router is building new pages correctly.</p>
      <p>Local time check: {new Date().toLocaleTimeString()}</p>
      <button onClick={() => alert('Button works')}>Click me</button>
    </div>
  )
}