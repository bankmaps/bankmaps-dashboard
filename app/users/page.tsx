"use client";
import { useState } from "react";

export default function UsersPage() {
  const [openSection, setOpenSection] = useState<string | null>("Dashboard & Overview");
  const [activeItem, setActiveItem] = useState<string>("Dashboard Home");

  const menuGroups = [
    {
      title: "Dashboard",
      items: [
        { id: "dashboard-home", label: "Home" },
      ],
    },
    {
      title: "Account",
      items: [
        { id: "manage-profile", label: "Manage Profile" },
        { id: "manage-users", label: "Manage Users" },
        { id: "distrib-list", label: "Distribution Lists" },
        { id: "notifications", label: "Notifications" },
        { id: "logs", label: "Activity Logs" },
      ],
    },
    {
      title: "Tools",
      items: [
        { id: "upload-file", label: "Upload Data" },
        { id: "view-files", label: "Calendar" },
        { id: "download-files", label: "Task Manager" },
        { id: "file-history", label: "Geocoding" },
        { id: "bulk-actions", label: "File Validation" },
      ],
    },
    {
      title: "Live Reports",
      items: [
        { id: "cra-reports", label: "CRA Reports" },
        { id: "fair-lending", label: "Fair Lending Reports" },
        { id: "outreach", label: "Outreach Activities" },
        { id: "community-dev", label: "Community Development" },
        { id: "inv-donat", label: "Investments & Donations" },
      ],
    },
    {
      title: "Resources",
      items: [
        { id: "how-to", label: "How to Guides" },
        { id: "regulations", label: "Exam Guidelines" },
        { id: "regulations", label: "Regulations" },
        { id: "comm-dev-lists", label: "Community Development" },
        { id: "vendors", label: "Vendors" },
      ],
    },
    {
      title: "Download Center",
      items: [
        { id: "cra-reportsx", label: "New Files" },
        { id: "fair-lendingx", label: "Archives" },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:block w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-8 text-gray-900">BankMaps</h2>
          <nav className="space-y-2">
            {menuGroups.map((group) => (
              <div key={group.title}>
                {/* Main section header – clickable to toggle */}
                <button
                  onClick={() => setOpenSection(openSection === group.title ? null : group.title)}
                  className={`
                    w-full flex justify-between items-center px-4 py-3 rounded-lg text-base font-semibold
                    transition-all duration-200
                    ${openSection === group.title
                      ? "bg-blue-50 text-blue-800 shadow-sm"
                      : "text-gray-800 hover:bg-gray-50"}
                  `}
                >
                  <span>{group.title}</span>
                  <span
                    className={`text-sm transition-transform duration-200 ${
                      openSection === group.title ? "rotate-180" : "rotate-0"
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {/* Collapsible sub-items */}
                <div
                  className={`
                    ml-4 mt-1 space-y-1 overflow-hidden transition-all duration-300 ease-in-out
                    ${openSection === group.title ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}
                  `}
                >
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveItem(item.id)}
                      className={`
                        w-full text-left px-5 py-2.5 rounded-md text-sm font-medium
                        transition-colors duration-150
                        ${
                          activeItem === item.id
                            ? "bg-blue-600 text-white"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        }
                      `}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">
            {activeItem.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Dashboard"}
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Welcome, Stuart</span>
            <button className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900">
              Logout
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="bg-white rounded-xl shadow border border-gray-200 p-8">
            {/* Dashboard content */}
            {activeItem === "dashboard-home" && (
              <div>
                <h2 className="text-2xl font-bold mb-6 text-gray-900">Dashboard Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-blue-50 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-800">Active Organizations</h3>
                    <div className="text-4xl font-bold mt-2 text-blue-900">2</div>
                    <p className="text-sm text-blue-700 mt-1">All in good standing</p>
                  </div>
                  <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-700">Last Activity</h3>
                    <div className="text-4xl font-bold mt-2 text-gray-900">2 days ago</div>
                    <p className="text-sm text-gray-600 mt-1">File upload • CRA data</p>
                  </div>
                  <div className="p-6 bg-green-50 rounded-lg border border-green-100">
                    <h3 className="font-medium text-green-800">Total Files</h3>
                    <div className="text-4xl font-bold mt-2 text-green-900">47</div>
                    <p className="text-sm text-green-700 mt-1">Across all users</p>
                  </div>
                </div>
              </div>
            )}

            {/* Add Users form */}
            {activeItem === "add-users" && (
              <div className="max-w-lg mx-auto">
                <h2 className="text-2xl font-bold mb-6 text-gray-900">Add New User</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    <select className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                      <option>Viewer</option>
                      <option>Editor</option>
                      <option>Admin</option>
                    </select>
                  </div>
                  <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition">
                    Send Invite
                  </button>
                </div>
              </div>
            )}

            {/* Placeholder for all other items */}
            {activeItem !== "dashboard-home" && activeItem !== "add-users" && (
              <div className="text-center py-20 text-gray-500">
                <p className="text-xl font-medium">
                  {activeItem.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} – coming soon
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
