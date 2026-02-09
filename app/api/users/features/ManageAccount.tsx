"use client";

import { useState, useEffect } from "react";

export default function ManageAccount() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User basics (from users table)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [aiSubscription, setAiSubscription] = useState("active"); // read-only for now

  // Organizations (from organizations table)
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [newOrg, setNewOrg] = useState({
    name: "",
    type: "",
    regulator: "",
    states: [] as string[],
  });

  // Fetch current user data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/profile", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) throw new Error("Failed to load profile");

        const data = await res.json();

        // Populate user basics
        setName(data.name || "");
        setEmail(data.email || "");
        setAiSubscription(data.ai_subscription || "inactive");

        // Populate organizations
        setOrganizations(data.organizations || []);
      } catch (err: any) {
        setError(err.message || "Error loading profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Handle save user basics
  const handleSaveUser = async () => {
    try {
      setError(null);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle add new organization
  const handleAddOrg = async () => {
    if (!newOrg.name || !newOrg.type) {
      setError("Name and type required");
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newOrg),
      });

      if (!res.ok) throw new Error("Failed to add organization");

      const added = await res.json();
      setOrganizations([...organizations, added]);
      setNewOrg({ name: "", type: "", regulator: "", states: [] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle edit organization (simple inline for now)
  const handleUpdateOrg = async (org: any) => {
    try {
      setError(null);
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(org),
      });

      if (!res.ok) throw new Error("Failed to update");

      setOrganizations(
        organizations.map((o) => (o.id === org.id ? { ...o, ...org } : o))
      );
      setEditingOrgId(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-600 text-center">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">Manage Account</h1>

      {/* Success message */}
      {success && (
        <div className="mb-6 p-4 bg-green-100 text-green-800 rounded-lg">
          Changes saved successfully!
        </div>
      )}

      {/* User Basics Section */}
      <section className="mb-12 bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Your Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Subscription: <strong>{aiSubscription}</strong> (contact support to change)
        </p>
        <button
          onClick={handleSaveUser}
          className="mt-6 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
        >
          Save Profile Changes
        </button>
      </section>

      {/* Organizations Section */}
      <section className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Your Organizations</h2>

        {/* List existing */}
        {organizations.length > 0 ? (
          <div className="space-y-6 mb-8">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="border rounded-lg p-4 bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-lg">{org.name}</h3>
                    <p className="text-sm text-gray-600">
                      Type: {org.type} • Regulator: {org.regulator}
                    </p>
                    <p className="text-sm text-gray-500">
                      States: {org.states?.join(", ") || "None"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      // TODO: open edit modal or inline edit
                      alert("Edit coming soon");
                    }}
                    className="text-teal-600 hover:text-teal-800"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 mb-6">No organizations added yet.</p>
        )}

        {/* Add new organization form */}
        <div className="border-t pt-6">
          <h3 className="font-medium mb-4">Add New Organization</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newOrg.type}
                onChange={(e) => setNewOrg({ ...newOrg, type: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select Type</option>
                <option value="Bank">Bank</option>
                <option value="Credit Union">Credit Union</option>
                <option value="Mortgage Company">Mortgage Company</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Regulator</label>
              <input
                type="text"
                value={newOrg.regulator}
                onChange={(e) => setNewOrg({ ...newOrg, regulator: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            {/* Add states multi-select later */}
          </div>
          <button
            onClick={handleAddOrg}
            className="mt-6 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
          >
            Add Organization
          </button>
        </div>
      </section>
    </div>
  );
}
