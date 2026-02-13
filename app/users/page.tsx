"use client";

import { useState, Suspense } from "react";
import TokenProvider from "./features/TokenProvider";
import ManageProfile from "./features/ManageProfile";
import ManageUsers from "./features/ManageUsers";
import DistributionLists from "./features/DistributionLists";
import Dashboard from "./features/Dashboard";

export default function UsersPage() {
  const [openSection, setOpenSection] = useState<string | null>("Dashboard");
  const [activeItem, setActiveItem] = useState<string>("dashboard");

  const menuGroups = [
    {
      title: "Dashboard",
      items: [{ id: "dashboard", label: "Home" }],
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
        { id: "exam-guides", label: "Exam Guidelines" },
        { id: "regulations", label: "Regulations" },
        { id: "comm-dev-lists", label: "Community Development" },
        { id: "vendors", label: "Vendors" },
      ],
    },
    {
      title: "Download Center",
      items: [
        { id: "new-files", label: "New Files" },
        { id: "archives", label: "Archives" },
      ],
    },
  ];

  return (
    <Suspense fallback={<div className="flex h-screen bg-gray-100 items-center justify-center">Loading...</div>}>
      <TokenProvider>
        <div className="flex h-screen bg-gray-100">
          {/* Sidebar */}
          <div className="hidden md:block w-80 bg-[oklch(71.5%_0.143_215.221)] border-r border-[oklch(71.5%_0.143_215.221)/0.3] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-8">
                  <img src="/logo.png" alt="BankMaps Logo" className="w-20 h-20 object-contain" />
                  <h2 className="text-2xl font-bold text-black">CRA Assistant</h2>
                </div>
                <nav className="space-y-2">
                  {menuGroups.map((group) => (
                    <div key={group.title}>
                      <button
                        onClick={() => setOpenSection(openSection === group.title ? null : group.title)}
                        className={`w-full flex justify-between items-center px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 ${
                          openSection === group.title
                            ? "bg-[oklch(91.7%_0.08_205.041)] text-black shadow-sm"
                            : "text-white hover:bg-[oklch(91.7%_0.08_205.041)/0.8]"
                        }`}
                      >
                        <span>{group.title}</span>
                        <span className={`text-sm transition-transform duration-200 ${openSection === group.title ? "rotate-180" : "rotate-0"}`}>▼</span>
                      </button>
                      <div
                        className={`ml-4 mt-1 space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${
                          openSection === group.title ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setActiveItem(item.id)}
                            className={`w-full text-left px-5 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                              activeItem === item.id
                                ? "bg-[oklch(91.7%_0.08_205.041)] text-black"
                                : "text-white hover:bg-[oklch(91.7%_0.08_205.041)/0.8] hover:text-black"
                            }`}
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

            {/* Main content area */}
            <div className="flex-1 flex flex-col">
              <header className="bg-white border-b px-8 py-4 flex justify-between items-center">
                <h1 className="text-xl font-semibold text-gray-900">
                  {activeItem === "dashboard" ? "Dashboard" : activeItem.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                </h1>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">Welcome, Stuart</span>
                  <button className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-900">Logout</button>
                </div>
              </header>

              <main className="flex-1 p-8 overflow-auto">
                <div className="bg-white rounded-xl shadow border border-gray-200 p-8 min-h-[70vh]">
                  {activeItem === "dashboard" && <Dashboard />}
                  {activeItem === "manage-profile" && <ManageProfile />}
                  {activeItem === "manage-users" && <ManageUsers />}
                  {activeItem === "distrib-list" && <DistributionLists />}
                  {!["dashboard", "manage-profile", "manage-users", "distrib-list"].includes(activeItem) && (
                    <div className="text-center py-20 text-gray-500">
                      <p className="text-xl font-medium">
                        {activeItem.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} – coming soon
                      </p>
                    </div>
                  )}
                </div>
              </main>
            </div>
          </div>
        </TokenProvider>
      </Suspense>
    );
  }
}
