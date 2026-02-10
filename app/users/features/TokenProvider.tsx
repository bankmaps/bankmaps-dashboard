"use client";

import { useEffect } from "react";

export default function TokenProvider() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");

    if (urlToken) {
      // Store the fresh token
      localStorage.setItem("jwt_token", urlToken);

      // Clean the URL (remove ?token=... so it doesn't persist on refresh)
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // Runs once on mount

  return null; // This component does nothing visible — just handles token
}
