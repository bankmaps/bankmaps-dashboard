"use client";

import { ReactNode, useEffect } from "react";

/**
 * TokenProvider: A wrapper component that:
 * - Checks for a ?token=... query param on mount
 * - Saves it to localStorage as "jwt_token"
 * - Removes the token from the URL to prevent persistence
 * - Does **not** render anything itself — just passes children through
 *
 * Usage:
 *   <TokenProvider>
 *     <YourAppOrPage />
 *   </TokenProvider>
 */
export default function TokenProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Only run in browser environment
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");

    if (urlToken) {
      // Store the fresh token
      localStorage.setItem("jwt_token", urlToken);

      // Clean the URL (remove ?token=... so it doesn't show on refresh/back)
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // Runs once on component mount

  return <>{children}</>; // Render children — this is what makes it a wrapper
}
