"use client";
import { useState } from "react";

export default function UsersPage() {
  const [active, setActive] = useState("dashboard");
  const menu = [
    { id: "dashboard", label: "Dashboard" },
    { id: "add-users", label: "Add Users" },
    { id: "edit-profile", label: "Edit Profile" },
    { id: "upload-file", label: "Upload File" },
    { id: "cra-reports", label: "CRA Reports" },
    { id: "fair-lending", label: "Fair Lending Reports" },
    { id: "outreach", label: "Outreach Reports" },
    { id: "community-dev", label: "Community Development" },
    { id: "calendar", label: "Calendar" },
    { id: "task-manager", label: "Task Manager" },
    { id: "activity-logs", label: "Activity Logs" },
    { id: "download-center", label: "Download Center" },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:block w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-8">BankMaps</h2>
          <nav className="space-y-1">
            {menu.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`
                  w-full text-left px-4 py-3 rounded-lg text-sm font-medium
                  ${active === item.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"}
                `}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold">
            {menu.find((m) => m.id === active)?.label || "Dashboard"}
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
          <div className="bg-white rounded-lg shadow p-8">
            {active === "dashboard" && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-blue-50 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-800">Active Organizations</h3>
                    <div className="text-4xl font-bold mt-2">2</div>
                    <p className="text-sm text-blue-700 mt-1">All in good standing</p>
                  </div>
                  <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-medium text-gray-700">Last Activity</h3>
                    <div className="text-4xl font-bold mt-2">2 days ago</div>
                    <p className="text-sm text-gray-600 mt-1">File upload • CRA data</p>
                  </div>
                  <div className="p-6 bg-green-50 rounded-lg border border-green-100">
                    <h3 className="font-medium text-green-800">Total Files</h3>
                    <div className="text-4xl font-bold mt-2">47</div>
                    <p className="text-sm text-green-700 mt-1">Across all users</p>
                  </div>
                </div>
              </div>
            )}

            {active === "add-users" && (
              <div className="max-w-lg">
                <h2 className="text-2xl font-bold mb-6">Add User</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="user@bank.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <select className="w-full px-4 py-2 border rounded-lg">
                      <option>Viewer</option>
                      <option>Editor</option>
                      <option>Admin</option>
                    </select>
                  </div>
                  <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    Send Invite
                  </button>
                </div>
              </div>
            )}

            {active !== "dashboard" && active !== "add-users" && (
              <div className="text-center py-20 text-gray-500">
                <p className="text-xl">{menu.find((m) => m.id === active)?.label} – coming soon</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
