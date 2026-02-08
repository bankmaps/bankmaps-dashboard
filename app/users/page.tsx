"use client";
import { useState } from "react";

export default function UsersPage() {
  const [openSection, setOpenSection] = useState<string | null>("Dashboard & Overview");
  const [activeItem, setActiveItem] = useState<string>("Dashboard Home");

  const menuGroups = [
    {
      title: "Dashboard & Overview",
      items: [
        { id: "dashboard-home", label: "Dashboard Home" },
        { id: "quick-stats", label: "Quick Stats" },
        { id: "recent-activity", label: "Recent Activity" },
        { id: "notifications", label: "Notifications" },
      ],
    },
    {
      title: "User Management",
      items: [
        { id: "add-users", label: "Add Users" },
        { id: "edit-profile", label: "Edit Profile" },
        { id: "manage-roles", label: "Manage Roles" },
        { id: "user-list", label: "User List" },
        { id: "invite-history", label: "Invite History" },
      ],
    },
    {
      title: "File & Upload Tools",
      items: [
        { id: "upload-file", label: "Upload File" },
        { id: "view-files", label: "View Uploaded Files" },
        { id: "download-files", label: "Download Files" },
        { id: "file-history", label: "File History" },
        { id: "bulk-actions", label: "Bulk Actions" },
      ],
    },
    {
      title: "Reports & Compliance",
      items: [
        { id: "cra-reports", label: "CRA Reports" },
        { id: "fair-lending", label: "Fair Lending Reports" },
        { id: "outreach", label: "Outreach Reports" },
        { id: "community-dev", label: "Community Development" },
        { id: "export-reports", label: "Export Reports" },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar – wider for more items, scrollable if needed */}
      <div className="hidden md:block w-80 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-8 text-gray-900">BankMaps</h2>
          <nav className="space-y-2">
            {menuGroups.map((group) => (
              <div key={group.title}>
                {/* Main section button */}
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

                {/* Sub-items – slide down with animation */}
                <div
                  className={`ml-4 mt-1 space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${
                    openSection === group.title ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
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
        {/* Top bar */}
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">
            {activeItem.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "Dashboard"}
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
            {activeItem === "dashboard-home" && (
              <div>
                <h2 className="text-2xl font-bold mb-6 text-gray-900">Dashboard Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-blue-50 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-800">Active Organizations</h3>
                    <div class
