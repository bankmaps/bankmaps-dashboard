"use client";

import { useState, Suspense } from "react";
import TokenProvider from "./features/TokenProvider";

export default function UsersPage() {
  const [activeItem] = useState("dashboard");

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TokenProvider>
        <div className="min-h-screen bg-gray-100 p-4">
          <h1 className="text-3xl font-bold">Users Dashboard</h1>
          <p>Active section: {activeItem}</p>

          {/* If this builds, add back pieces one by one */}
        </div>
      </TokenProvider>
    </Suspense>
  );
}
