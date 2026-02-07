"use client";  // ← This line fixes the build error (required for useState)

import { Suspense, useState } from 'react';

export default function UsersPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-6">BankMaps Organizations</h1>

      {/* Placeholder org list section */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Organizations</h2>
        <p className="text-gray-600">
          Welcome back! This is where you would see your list of organizations.
        </p>
        <p className="text-gray-500 text-sm mt-2">(This is a test placeholder page)</p>
      </div>

      {/* Add Sub-User Section */}
      <AddSubUserSection />

      {/* Token display */}
      <Suspense fallback={<p className="text-gray-500">Loading session info...</p>}>
        <TokenDisplay />
      </Suspense>

      <div className="mt-8 text-gray-600 text-sm">
        <a href="/" className="hover:underline">Home</a> •{' '}
        <a href="/create-account" className="hover:underline">Create new organization</a>
      </div>
    </main>
  );
}

// Expandable Add Sub-User form
function AddSubUserSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Invite sent:', { email, role });
    // Later: POST to /api/sub-users/invite
    setIsOpen(false);
    setEmail('');
    setRole('viewer');
  };

  return (
    <div className="bg-white rounded-lg shadow mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-6 text-left hover:bg-gray-50"
      >
        <h3 className="text-lg font-medium">Add Sub-User</h3>
        <span className="text-gray-500">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="p-6 pt-0 border-t">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="subuser@example.com"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="viewer">Viewer (read/download only)</option>
                <option value="editor">Editor (upload/edit files)</option>
                <option value="admin">Admin (manage sub-users)</option>
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mr-3 px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Send Invite
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TokenDisplay() {
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const token = searchParams.get('token');

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded border border-gray-200 font-mono text-sm break-all">
      <strong>Launch token:</strong><br />
      {token || '(no token provided in URL)'}
    </div>
  );
}
