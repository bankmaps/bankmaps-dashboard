"use client";
import { useState } from 'react';

export default function UsersPage() {
  const [activeSection, setActiveSection] = useState('dashboard');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'add-users', label: 'Add Users', icon: '👤+' },
    { id: 'edit-profile', label: 'Edit Profile', icon: '✏️' },
    { id: 'upload-file', label: 'Upload File', icon: '📤' },
    { id: 'cra-reports', label: 'CRA Reports', icon: '📊' },
    { id: 'fair-lending', label: 'Fair Lending', icon: '⚖️' },
    { id: 'outreach', label: 'Outreach Reports', icon: '📣' },
    { id: 'community-dev', label: 'Community Development', icon: '🌍' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header - clean & modern */}
      <header className="bg-gray-900 text-white border-b border-gray-800">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold tracking-tight">BankMaps</div>
            <div className="text-xs px-2 py-0.5 bg-blue-600/30 rounded text-blue-300 font-medium">
              Dashboard
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300">Welcome, Stuart</span>
            <button className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-sm transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        {/* Modern Sidebar – fixed width, clean look */}
        <aside className="hidden md:block w-72 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          <div className="p-5">
            <nav className="space-y-1.5">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-all
                    ${
                      activeSection === item.id
                        ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600 font-semibold shadow-sm'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="text-lg opacity-80 w-6 text-center">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto bg-gray-50/70 p-6 lg:p-8">
          {/* Page title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-6 tracking-tight">
            {menuItems.find((i) => i.id === activeSection)?.label || 'Dashboard'}
          </h1>

          {/* Content wrapper – card-like feel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:p-8">
            {activeSection === 'dashboard' && (
              <>
                <p className="text-gray-600 mb-8 leading-relaxed">
                  Welcome back. Here's a quick overview of your BankMaps activity.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6">
                    <h3 className="font-semibold text-blue-800 mb-2">Active Organizations</h3>
                    <p className="text-3xl font-bold text-blue-700">2</p>
                    <p className="text-sm text-blue-600 mt-1">All in good standing</p>
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-6">
                    <h3 className="font-semibold text-gray-700 mb-2">Last Activity</h3>
                    <p className="text-2xl font-bold text-gray-800">2 days ago</p>
                    <p className="text-sm text-gray-600 mt-1">File upload • CRA data</p>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-6">
                    <h3 className="font-semibold text-emerald-800 mb-2">Total Files</h3>
                    <p className="text-3xl font-bold text-emerald-700">47</p>
                    <p className="text-sm text-emerald-600 mt-1">Across all users</p>
                  </div>
                </div>
              </>
            )}

            {activeSection === 'add-users' && (
              <div className="max-w-lg">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Invite a Sub-User</h2>
                <p className="text-gray-600 mb-8">
                  Send an invitation to a new team member. They'll set up their account after accepting.
                </p>

                <form className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      placeholder="colleague@bank.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Role
                    </label>
                    <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                      <option>Viewer – read-only access</option>
                      <option>Editor – can upload & edit</option>
                      <option>Admin – full access</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm"
                  >
                    Send Invitation
                  </button>
                </form>
              </div>
            )}

            {activeSection !== 'dashboard' && activeSection !== 'add-users' && (
              <div className="text-center py-16 text-gray-500">
                <div className="text-6xl mb-4">🚧</div>
                <h3 className="text-xl font-medium text-gray-700 mb-2">
                  {menuItems.find((i) => i.id === activeSection)?.label} Section
                </h3>
                <p>Feature coming soon – work in progress</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
