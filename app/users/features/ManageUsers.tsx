"use client";

export default function ManageUsers() {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") : null;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Manage Users</h2>

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
          This is a dummy Manage Users page for testing.
        </p>
        <div className="mt-6 space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search users..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              disabled
            />
            <button
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
              disabled
            >
              Add User
            </button>
          </div>
          <p className="text-sm text-gray-500 italic">
            (real table / list coming later)
          </p>
        </div>
      </div>
    </div>
  );
}
