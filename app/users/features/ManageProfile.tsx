"use client";

import { useState, useEffect } from "react";
// Read stored token from localStorage (set by page.tsx)
const token = localStorage.getItem("jwt_token") || "";

export default function ManageProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User basics
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subscription, setSubscription] = useState("active");

  // Organization info (single org for simplicity)
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [regulator, setRegulator] = useState("");
  const [states, setStates] = useState<string[]>([]);

  // Geographies
  const [geographies, setGeographies] = useState<any[]>([]);
  const [editingGeoIndex, setEditingGeoIndex] = useState<number | null>(null);
  const [newGeo, setNewGeo] = useState({
    state: [],
    county: [],
    town: [],
    tract_number: [],
    type: "",
    name: "",
  });

  // Custom context
  const [customContext, setCustomContext] = useState("");

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/users", {
          method: "GET",
          credentials: "include",
          headers: {
  "Content-Type": "application/json",
 },
},
        });

        if (!res.ok) throw new Error("Failed to load profile");

        const data = await res.json();

        setName(data.name || "");
        setEmail(data.email || "");
        setSubscription(data.ai_subscription || "inactive");

        const org = data.organizations?.[0] || {};
        setOrgName(org.name || "");
        setOrgType(org.type || "");
        setRegulator(org.regulator || "");
        setStates(org.states || []);

        setGeographies(org.geographies || []);
        setCustomContext(org.custom_context || "");
      } catch (err: any) {
        setError(err.message || "Error loading profile");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Save handler
  const handleSave = async () => {
    try {
      setError(null);
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: {
  "Content-Type": "application/json",
},
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          organization: {
            name: orgName,
            type: orgType,
            regulator,
            states,
            geographies,
            custom_context: customContext,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Geography handlers
  const handleAddGeo = () => {
    if (!newGeo.name || !newGeo.type) {
      setError("Name and type required");
      return;
    }
    setGeographies([...geographies, newGeo]);
    setNewGeo({ state: [], county: [], town: [], tract_number: [], type: "", name: "" });
  };

  const handleUpdateGeo = (index: number) => {
    const updated = [...geographies];
    // Save the current state (you can add more fields later)
    setGeographies(updated);
    setEditingGeoIndex(null);
  };

  const handleDeleteGeo = (index: number) => {
    const updated = geographies.filter((_, i) => i !== index);
    setGeographies(updated);
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
      </section>

      {/* Organization Info */}
      <section className="mb-12 bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Organization Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={orgType}
              onChange={(e) => setOrgType(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">Select Type</option>
              <option value="Bank">Bank</option>
              <option value="Credit Union">Credit Union</option>
              <option value="Mortgage Company">Mortgage Company</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Regulator</label>
            <input
              type="text"
              value={regulator}
              onChange={(e) => setRegulator(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">States</label>
            <input
              type="text"
              value={states.join(", ")}
              onChange={(e) => setStates(e.target.value.split(", "))}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="MA, NY, CA"
            />
          </div>
        </div>
      </section>

      {/* Geographies */}
      <section className="mb-12 bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Geographies</h2>
        {geographies.length === 0 ? (
          <p className="text-gray-500">No geographies added yet.</p>
        ) : (
          <div className="space-y-4">
            {geographies.map((geo, index) => (
              <div key={index} className="border p-4 rounded-lg bg-gray-50">
                {editingGeoIndex === index ? (
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={geo.name}
                      onChange={(e) => {
                        const updated = [...geographies];
                        updated[index].name = e.target.value;
                        setGeographies(updated);
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Name"
                    />
                    <select
                      value={geo.type}
                      onChange={(e) => {
                        const updated = [...geographies];
                        updated[index].type = e.target.value;
                        setGeographies(updated);
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Type</option>
                      <option value="Assessment Area">Assessment Area</option>
                      <option value="REMA">REMA</option>
                      <option value="Other">Other</option>
                    </select>
                    {/* Add more inputs for state, county, town, tract_number */}
                    <button onClick={() => handleUpdateGeo(index)} className="bg-teal-600 text-white px-4 py-2 rounded-lg">
                      Save
                    </button>
                    <button onClick={() => setEditingGeoIndex(null)} className="ml-2 text-gray-600">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">{geo.name}</p>
                    <p className="text-sm text-gray-600">{geo.type}</p>
                    <button onClick={() => setEditingGeoIndex(index)} className="text-teal-600 hover:text-teal-800">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteGeo(index)} className="ml-2 text-red-600 hover:text-red-800">
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Add new geography form */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-4">Add New Geography</h3>
          <div className="space-y-4">
            <input
              type="text"
              value={newGeo.name}
              onChange={(e) => setNewGeo({ ...newGeo, name: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Name"
            />
            <select
              value={newGeo.type}
              onChange={(e) => setNewGeo({ ...newGeo, type: e.target.value })}
              className="w-full px-4 py-2 border rounded-lg"
            >
              <option value="">Type</option>
              <option value="Assessment Area">Assessment Area</option>
              <option value="REMA">REMA</option>
              <option value="Other">Other</option>
            </select>
            {/* Add more inputs for state, county, town, tract_number */}
            <button onClick={handleAddGeo} className="bg-teal-600 text-white px-4 py-2 rounded-lg">
              Add Geography
            </button>
          </div>
        </div>
      </section>

      {/* Custom Context */}
      <section className="mb-12 bg-white p-6 rounded-xl shadow border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Custom Context</h2>
        <textarea
          value={customContext}
          onChange={(e) => setCustomContext(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          rows={4}
          placeholder="Additional notes or context"
        />
      </section>

      <button
        onClick={handleSave}
        className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition"
      >
        Save All Changes
      </button>
    </div>
  );
}
