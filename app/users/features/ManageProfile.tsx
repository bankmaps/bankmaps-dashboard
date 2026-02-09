"use client";

import { useState, useEffect } from "react";
const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQ4LCJlbWFpbCI6InN0dWFydEBiYW5rbWFwcy5jb20iLCJuYW1lIjoicnlhbiIsImlhdCI6MTc3MDY1NjcxMywiZXhwIjoxNzcwNjYwMzEzfQ.YfGdqoxuu3jFpeLb6DUUFpRjgbbM50jbohHsFJ2w634";

export default function ManageProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User basics
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subscription, setSubscription] = useState("active");

  // Organizations list
  const [organizations, setOrganizations] = useState<any[]>([]);

  // Get token from URL (?token=...) on first load
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token") || localStorage.getItem("jwt_token"); // fallback to stored token

  // Store token for future fetches
  useEffect(() => {
    if (token && token !== localStorage.getItem("jwt_token")) {
      localStorage.setItem("jwt_token", token);
    }
  }, [token]);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setError("No authentication token found");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch("/api/users", {
          method: "GET",
          credentials: "include",
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();

        setName(data.name || "");
        setEmail(data.email || "");
        setSubscription(data.ai_subscription || "inactive");
        setOrganizations(data.organizations || []);
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  // Save handler
  const handleSave = async () => {
    if (!token) {
      setError("Not authenticated");
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/users", {
        method: "PATCH",
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
        credentials: "include",
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-600 text-center">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">Manage Profile</h1>

      {success && (
        <div className="mb-6 p-4 bg-green-100 text-green-800 rounded-lg">
          Profile updated successfully!
        </div>
      )}

      {/* User Basics */}
      <section className="mb-12 bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Subscription: <strong>{subscription}</strong>
        </p>
        <button
          onClick={handleSave}
          className="mt-6 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
        >
          Save Changes
        </button>
      </section>

      {/* Organizations placeholder */}
      <section className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Your Organizations</h2>
        {organizations.length === 0 ? (
          <p className="text-gray-500">No organizations added yet.</p>
        ) : (
          <div className="space-y-4">
            {organizations.map((org) => (
              <div key={org.id} className="border p-4 rounded-lg bg-gray-50">
                <p className="font-medium">{org.name}</p>
                <p className="text-sm text-gray-600">{org.type} • {org.regulator}</p>
                {/* Add edit button later */}
              </div>
            ))}
          </div>
        )}
        <button className="mt-6 text-teal-600 hover:text-teal-800">
          + Add New Organization
        </button>
      </section>
    </div>
  );
}
