// app/create-account/page.jsx

'use client';

import { useState, useMemo, useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function Page() {
  const [lendersData, setLendersData] = useState([]);
  const [geoData, setGeoData] = useState([]);

  const [selectedLender, setSelectedLender] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [selectedTown, setSelectedTown] = useState('');

  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then(res => res.json())
      .then(json => setLendersData(json.data || []))
      .catch(err => console.error('Lenders load failed:', err));

    fetch('/data/geographies.json')
      .then(res => res.json())
      .then(json => setGeoData(json.data || []))
      .catch(err => console.error('Geo load failed:', err));
  }, []);

  // Safety: ensure data is arrays before processing
  const safeLenders = Array.isArray(lendersData) ? lendersData : [];
  const safeGeo = Array.isArray(geoData) ? geoData : [];

  const uniqueStates = useMemo(() => {
    const statesSet = new Set(safeGeo.map(item => item.state));
    return Array.from(statesSet).sort();
  }, [safeGeo]);

  const counties = useMemo(() => {
    if (!selectedState) return [];
    const filtered = safeGeo.filter(item => item.state === selectedState);
    return Array.from(new Set(filtered.map(item => item.county))).sort();
  }, [selectedState, safeGeo]);

  const towns = useMemo(() => {
    if (!selectedState || !selectedCounty) return [];
    const filtered = safeGeo.filter(
      item => item.state === selectedState && item.county === selectedCounty
    );
    return Array.from(new Set(filtered.map(item => item.town))).sort();
  }, [selectedState, selectedCounty, safeGeo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({
      lender: selectedLender,
      state: selectedState,
      county: selectedCounty,
      town: selectedTown
    });
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      {!safeLenders.length && (
        <p style={{ color: 'red' }}>
          Warning: No lenders loaded from hmda_list.json
        </p>
      )}
      {!safeGeo.length && (
        <p style={{ color: 'red' }}>
          Warning: No geography data loaded from geographies.json
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <label>Lender</label>
        <select value={selectedLender} onChange={e => setSelectedLender(e.target.value)} required>
          <option value="">-- Select Lender --</option>
          {safeLenders.map(l => (
            <option key={l.lender_id} value={l.lender_id}>
              {l.lender} ({l.lender_state} - {l.regulator})
            </option>
          ))}
        </select>

        <label>State</label>
        <select
          value={selectedState}
          onChange={e => {
            setSelectedState(e.target.value);
            setSelectedCounty('');
            setSelectedTown('');
          }}
          required
        >
          <option value="">-- Select State --</option>
          {uniqueStates.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label>County</label>
        <select
          value={selectedCounty}
          onChange={e => {
            setSelectedCounty(e.target.value);
            setSelectedTown('');
          }}
          disabled={!selectedState}
          required
        >
          <option value="">-- Select County --</option>
          {counties.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label>Town</label>
        <select
          value={selectedTown}
          onChange={e => setSelectedTown(e.target.value)}
          disabled={!selectedCounty}
          required
        >
          <option value="">-- Select Town --</option>
          {towns.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button type="submit" style={{ padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px' }}>
          Create Account
        </button>
      </form>
    </div>
  );
}
