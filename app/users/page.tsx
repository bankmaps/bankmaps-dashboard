
// app/users/page.jsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
//import jwt from 'jsonwebtoken';

export default function UsersDashboard() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [user, setUser] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No authentication token. Please log in again from the member portal.');
      setLoading(false);
      return;
    }

    // Verify token (client-side for quick feedback; server-side verification is also good)

    //try {
    //const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    //setUser(decoded);

      // Fetch organizations for this user
      fetch('/api/organizations', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setOrganizations(data.organizations || []);
          } else {
            setError(data.error || 'Failed to load organizations');
          }
          setLoading(false);
        })
        .catch(err => {
          setError('Network error loading organizations');
          setLoading(false);
        });

    } catch (err) {
      setError('Invalid or expired token. Please log in again.');
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading your dashboard...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>
        <h1>Error</h1>
        <p>{error}</p>
        <p><a href="https://bankmaps.com" style={{ color: '#0066cc' }}>Return to BankMaps member portal</a></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <h1>Welcome back, {user?.name || 'AI User'}!</h1>
      <p style={{ marginBottom: '32px' }}>
        This is your personal BankMaps AI dashboard. Below are your existing organization profiles.
      </p>

      {organizations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', background: '#f8f9fa', borderRadius: '8px' }}>
          <h2>No organizations found</h2>
          <p>You don't have any organization profiles yet.</p>
          <a 
            href={`/create-account?token=${token}`}
            style={{
              display: 'inline-block',
              marginTop: '16px',
              padding: '12px 28px',
              background: '#28a745',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            Create Your First Organization
          </a>
        </div>
      ) : (
        <div>
          <h2>Your Organizations ({organizations.length})</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {organizations.map((org: any) => (
              <li
                key={org.id}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                }}
              >
                <strong>{org.name}</strong>
                <div style={{ color: '#666', marginTop: '4px' }}>
                  Type: {org.type} • Regulator: {org.regulator}
                </div>
                <div style={{ marginTop: '8px' }}>
                  States: {org.states?.join(', ') || '—'}
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#888' }}>
                  Created: {new Date(org.created_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: '32px' }}>
            <a 
              href={`/create-account?token=${token}`}
              style={{
                padding: '10px 20px',
                background: '#0066cc',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                marginRight: '16px',
              }}
            >
              Add New Organization
            </a>
            <a href="#" style={{ color: '#0066cc' }}>Manage Subscription</a>
          </div>
        </div>
      )}
    </div>
  );
}
