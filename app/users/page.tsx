"use client";

import { useState, Suspense, useEffect, useCallback } from "react";
import TokenProvider from "./features/TokenProvider";
import ManageProfile from "./features/ManageProfile";
import ManageUsers from "./features/ManageUsers";
import DistributionLists from "./features/DistributionLists";
import Dashboard from "./features/Dashboard";
import Maps from "./features/Maps";
import ChatWidget from "./features/ChatWidget";
import MyDocuments from "./features/MyDocuments";
import { OrganizationsProvider, useOrganizations } from "./features/OrganizationsContext";

// Inner layout has access to OrganizationsContext
function AppLayout({ activeItem, setActiveItem, openSection, setOpenSection }: {
  activeItem: string;
  setActiveItem: (id: string) => void;
  openSection: string | null;
  setOpenSection: (s: string | null) => void;
}) {
  const { selectedOrg, selectedOrgId } = useOrganizations();

  // Build page context string for the chat widget based on active view
  const buildPageContext = useCallback((): string => {
    if (!selectedOrg) return "";

    const base = `Organization: ${selectedOrg.name} (${selectedOrg.type}, regulated by ${selectedOrg.regulator})
States: ${(selectedOrg.states || []).join(", ")}
Geographies: ${(selectedOrg.geographies || []).map((g: any) => `${g.name} (${g.type})`).join(", ")}`;

    switch (activeItem) {
      case "dashboard":
        return `${base}

Current view: Dashboard overview
Organizations: ${selectedOrg.name} with ${(selectedOrg.geographies || []).length} assessment area(s).`;

      case "aa-maps":
        return `${base}

Current view: Assessment Area Maps
The user is viewing their CRA assessment area maps including income level (LMI) and majority-minority tract analysis. They can see choropleth maps of census tracts, branch locations, and summary statistics for their defined assessment areas.`;

      case "manage-profile":
        return `${base}

Current view: Manage Profile
The user is editing their organization profile including linked HMDA/CRA data sources, affiliates, and assessment area geographies.`;

      case "cra-reports":
        return `${base}

Current view: CRA Reports dashboard
The user is reviewing their CRA performance reports.`;

      default:
        return `${base}

Current view: ${activeItem.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`;
    }
  }, [activeItem, selectedOrg]);

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
        { id: "my-documents", label: "My Documents" },
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
        { id: "aa-maps", label: "Assessment Area Maps" },
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
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-80 bg-[oklch(71.5%_0.143_215.221)] border-r border-[oklch(71.5%_0.143_215.221)/0.3]">
        {/* Scrollable nav area */}
        <div className="flex-1 overflow-y-auto p-6">
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

        {/* Chat button pinned to bottom of sidebar */}
        <div className="p-4 border-t border-[oklch(61.5%_0.143_215.221)]">
          <div className="text-xs text-white/60 text-center">CRA Assistant is available below ↓</div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="p-4 overflow-y-auto" style={{ height: "100vh" }}>
          {activeItem === "aa-maps" ? (
            <Maps />
          ) : (
            <div className="bg-white rounded-xl shadow border border-gray-200 p-4">
              {activeItem === "dashboard" && <Dashboard />}
              {activeItem === "my-documents" && <MyDocuments />}
              {activeItem === "manage-profile" && <ManageProfile />}
              {activeItem === "manage-users" && <ManageUsers />}
              {activeItem === "distrib-list" && <DistributionLists />}
              {!["dashboard", "manage-profile", "manage-users", "distrib-list", "my-documents"].includes(activeItem) && (
                <div className="text-center py-20 text-gray-500">
                  <p className="text-xl font-medium">
                    {activeItem.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} – coming soon
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Chat widget - floats over everything, bottom-left */}
      <ChatWidget
        organizationId={selectedOrgId}
        pageContext={buildPageContext()}
      />
    </div>
  );
}

export default function UsersPage() {
  const [openSection, setOpenSection] = useState<string | null>("Dashboard");
  const [activeItem, setActiveItem] = useState<string>("dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const printTab = params.get("print");
    if (printTab) {
      setActiveItem(printTab);
      const sectionMap: Record<string, string> = {
        "aa-maps": "Live Reports",
        "cra-reports": "Live Reports",
        "fair-lending": "Live Reports",
      };
      if (sectionMap[printTab]) setOpenSection(sectionMap[printTab]);
    }
  }, []);

  return (
    <Suspense fallback={<div className="flex h-screen bg-gray-100 items-center justify-center">Loading...</div>}>
      <TokenProvider>
        <OrganizationsProvider>
          <AppLayout
            activeItem={activeItem}
            setActiveItem={setActiveItem}
            openSection={openSection}
            setOpenSection={setOpenSection}
          />
        </OrganizationsProvider>
      </TokenProvider>
    </Suspense>
  );
}
