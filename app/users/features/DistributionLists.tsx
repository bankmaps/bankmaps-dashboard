"use client";

export default function DistributionLists() {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") : null;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Distribution Lists</h2>

      {/* Debug: shows if TokenProvider worked */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <p className="text-sm font-medium text-gray-700 mb-2">Token from TokenProvider (localStorage):</p>
        <div className="font-mono text-sm bg-white p-3 rounded border border-gray-300 break-all">
          {token ? (
            <>
              <span className="text-green-700 font-medium">Found ✓</span>
              <br />
              {token.substring(0, 40)}... (first 40 chars)
            </>
          ) : (
            <span className="text-red-600">No token found – check TokenProvider</span>
          )}
        </div>
      </div>

      {/* Placeholder for real content */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-gray-600">
          This is a dummy Distribution Lists page for testing.
        </p>
        <div className="mt-6 space-y-4">
          <button
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled
          >
            Create New List
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <p className="font-medium">List: Team Leads</p>
              <p className="text-sm text-gray-500">12 members</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <p className="font-medium">List: All Users</p>
              <p className="text-sm text-gray-500">47 members</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 italic">
            (real list management coming later)
          </p>
        </div>
      </div>
    </div>
  );
}
