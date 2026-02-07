"use client";
import { useState } from 'react';
import { Menu, X, Home, UserPlus, Pencil, Upload, BarChart2, Scale, Megaphone, Globe } from 'lucide-react'; // ← install lucide-react: npm i lucide-react

export default function UsersPage() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'add-users', label: 'Add Users', icon: UserPlus },
    { id: 'edit-profile', label: 'Edit Profile', icon: Pencil },
    { id: 'upload-file', label: 'Upload File', icon: Upload },
    { id: 'cra-reports', label: 'CRA Reports', icon: BarChart2 },
    { id: 'fair-lending', label: 'Fair Lending Reports', icon: Scale },
    { id: 'outreach', label: 'Outreach Reports', icon: Megaphone },
    { id: 'community-dev', label: 'Community Development', icon: Globe },
  ];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 text-white border-b border-gray-800 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-white focus:outline-none" onClick={toggleSidebar}>
                {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <h1 className="text-xl font-bold tracking-tight">BankMaps</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300 hidden sm:block">Welcome, Stuart</span>
              <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm border border-gray-700 transition">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-20 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
            md:relative md:translate-x-0
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="h-full overflow-y-auto">
            <nav className="p-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setIsSidebarOpen(false); // close on mobile
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                      ${
                        activeSection === item.id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon size={20} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-10 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            {menuItems.find(i => i.id === activeSection)?.label || 'Dashboard'}
          </h1>

          <div className="bg-white rounded-xl shadow border border-gray-200 p-6 lg:p-8">
            {activeSection === 'dashboard' && (
              <div className="space-y-8">
                <p className="text-gray-600">
                  Welcome back, Stuart. Here's a snapshot of your BankMaps activity.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-blue-800 mb-1">Active Organizations</h3>
                    <p className="text-3xl font-bold text-blue-900">2</p>
                    <p className="text-sm text-blue-700 mt-1">All in good standing</p>
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Last Activity</h3>
                    <p className="text-3xl font-bold text-gray-900">2 days ago</p>
                    <p className="text-sm text-gray-600 mt-1">File upload • CRA data</p>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-6">
                    <h3 className="text-sm font-medium text-emerald-800 mb-1">Total Files</h3>
                    <p className="text-3xl font-bold text-emerald-900">47</p>
                    <p className="text-sm text-emerald-700 mt-1">Across all users</p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'add-users' && (
              <div className="max-w-md mx-auto space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Invite Team Member</h2>
                  <p className="text-gray-600 mb-6">
                    Send an invitation. The user will create their account upon acceptance.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="colleague@yourbank.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                      <option>Viewer (read-only)</option>
                      <option>Editor (upload & edit)</option>
                      <option>Admin (full control)</option>
                    </select>
                  </div>

                  <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm">
                    Send Invitation
                  </button>
                </div>
              </div>
            )}

            {activeSection !== 'dashboard' && activeSection !== 'add-users' && (
              <div className="text-center py-20 text-gray-500">
                <p className="text-xl font-medium mb-2">
                  {menuItems.find(i => i.id === activeSection)?.label} Coming Soon
                </p>
                <p>This section is under development.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
