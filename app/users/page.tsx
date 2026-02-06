import { Suspense } from 'react';

export default function UsersPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>BankMaps Organizations</h1>
      
      <div style={{ 
        background: '#fff', 
        borderRadius: '8px', 
        padding: '1.5rem', 
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        margin: '1.5rem 0'
      }}>
        <h2 style={{ marginTop: 0 }}>Your Organizations</h2>
        <p style={{ color: '#555', fontSize: '1.1rem' }}>
          Welcome back! This is where you would see your list of organizations.
        </p>
        <p>(This is a test placeholder page)</p>
      </div>

      <Suspense fallback={<p>Loading session info...</p>}>
        <TokenDisplay />
      </Suspense>

      <div style={{ marginTop: '2rem', color: '#666' }}>
        <a href="/">Home</a> • <a href="/create-account">Create new organization</a>
      </div>
    </main>
  );
}

function TokenDisplay() {
  // Client component to read URL token (safe in Next.js 13+)
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const token = searchParams.get('token');

  return (
    <div style={{ 
      marginTop: '1.5rem', 
      padding: '1rem', 
      background: '#f8f9fa', 
      borderRadius: '6px', 
      fontFamily: 'monospace',
      wordBreak: 'break-all',
      fontSize: '0.95rem'
    }}>
      <strong>Launch token:</strong><br />
      {token || '(no token provided in URL)'}
    </div>
  );
}
