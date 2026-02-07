"use client";

import { useState } from 'react';
import { Suspense } from 'react';

export default function UsersPage() {
  const [activeSection, setActiveSection] = useState('dashboard');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'add-users', label: 'Add Users' },
    { id: 'edit-profile', label: 'Edit Profile' },
    { id: 'upload-file', label: 'Upload File' },
    { id: 'cra-reports', label: 'CRA Reports' },
    { id: 'fair-lending', label: 'Fair Lending Reports' },
    { id: 'outreach', label: 'Outreach Reports' },
    { id: 'community-dev', label: 'Community Development' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">BankMaps Dashboard</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm">Welcome, User</span>
            <button className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-64px)] p-6 hidden md:block">
          <nav className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === item.id
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 lg:p-8">
          <h2 className="text-2xl font-bold mb-6">
            {menuItems.find((i) => i.id === activeSection)?.label || 'Dashboard'}
          </h2>

          {/* Dynamic content based on selection */}
          {activeSection === 'dashboard' && (
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">
                Welcome to your BankMaps dashboard. Select an option from the left menu.
              </p>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Placeholder cards */}
                <div className="border rounded-lg p-6 bg-gray-50">
                  <h3 className="font-semibold mb-2">Organizations</h3>
                  <p className="text-sm text-gray-600">2 active organizations</p>
                </div>
                <div className="border rounded-lg p-6 bg-gray-50">
                  <h3 className="font-semibold mb-2">Recent Activity</h3>
                  <p className="text-sm text-gray-600">Last upload: 2 days ago</p>
                </div>
                <div className="border rounded-lg p-6 bg-gray-50">
                  <h3 className="font-semibold mb-2">Quick Stats</h3>
                  <p className="text-sm text-gray-600">Files: 47 • Users: 3</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'add-users' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Add New Sub-User</h3>
              <p className="text-gray-600 mb-6">
                Enter the email and role for the new sub-user. They will receive an invitation.
              </p>
              {/* Form placeholder */}
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" className="w-full border rounded p-2" placeholder="user@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select className="w-full border rounded p-2">
                    <option>Viewer</option>
                    <option>Editor</option>
                    <option>Admin</option>
                  </select>
                </div>
                <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                  Send Invite
                </button>
              </div>
            </div>
          )}

          {/* Placeholder for other sections */}
          {activeSection !== 'dashboard' && activeSection !== 'add-users' && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
              <p>[Placeholder for {menuItems.find(i => i.id === activeSection)?.label} feature]</p>
              <p className="mt-2 text-sm">Coming soon...</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
