// components/CreateAccount.jsx

'use client';  // ← important if this has interactive state (dropdowns)

import { useState, useMemo } from 'react';
import lendersData from '../data/lenders.json';       // adjust path if needed
import geoData from '../data/geography.json';

export default function CreateAccount() {
  const [selectedLender, setSelectedLender] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [selectedTown, setSelectedTown] = useState('');

  // Quick test: log data counts
  console.log('Lenders loaded:', lendersData?.length || 0);
  console.log('Geo rows loaded:', geoData?.length || 0);

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create Account</h1>
      <form className="space-y-4">
        {/* Lender dropdown placeholder */}
        <select value={selectedLender} onChange={e => setSelectedLender(e.target.value)}>
          <option value="">Select Lender</option>
          {/* We'll fill this next */}
        </select>

        {/* State, County, Town placeholders */}
        <select value={selectedState} onChange={e => setSelectedState(e.target.value)}>
          <option value="">Select State</option>
        </select>

        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
          Submit
        </button>
      </form>
    </div>
  );
}
