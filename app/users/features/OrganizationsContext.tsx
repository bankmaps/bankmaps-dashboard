"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface Organization {
  id: number;
  name: string;
  type: string;
  regulator: string;
  geographies: any[];
  states: any[];
}

interface OrganizationsContextType {
  organizations: Organization[];
  loading: boolean;
  selectedOrgId: number | null;
  setSelectedOrgId: (id: number | null) => void;
  selectedOrg: Organization | null;
}

const OrganizationsContext = createContext<OrganizationsContextType | undefined>(undefined);

export function OrganizationsProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      setLoading(false);
      return;
    }

    fetch("/api/organizations", { 
      headers: { Authorization: `Bearer ${token}` } 
    })
      .then(r => r.json())
      .then(data => {
        const orgs = data.organizations || [];
        setOrganizations(orgs);
        if (orgs.length > 0 && !selectedOrgId) {
          setSelectedOrgId(orgs[0].id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch organizations:", err);
        setLoading(false);
      });
  }, []);

  const selectedOrg = organizations.find(o => o.id === selectedOrgId) || null;

  return (
    <OrganizationsContext.Provider value={{
      organizations,
      loading,
      selectedOrgId,
      setSelectedOrgId,
      selectedOrg,
    }}>
      {children}
    </OrganizationsContext.Provider>
  );
}

export function useOrganizations() {
  const context = useContext(OrganizationsContext);
  if (!context) {
    throw new Error("useOrganizations must be used within OrganizationsProvider");
  }
  return context;
}
