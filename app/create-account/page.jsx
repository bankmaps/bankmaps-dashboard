'use client';
import { useState, useMemo, useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function Page() {
  const [lendersData, setLendersData] = useState([]);
  const [geoData, setGeoData] = useState([]);

  const [selectedLender, setSelectedLender] = useState(''); // still single for lender
  const [selectedStates, setSelectedStates] = useState([]); // now array for multi
  const [selectedCounties, setSelectedCounties] = useState([]); // array
  const [selectedTowns, setSelectedTowns] = useState([]); // array

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

  const safeLenders = Array.isArray(lendersData) ? lendersData : [];
  const safeGeo = Array.isArray(geoData) ? geoData : [];

  // Unique states (unchanged)
  const uniqueStates = useMemo(() => {
    const statesSet = new Set(safeGeo.map(item => item.state));
    return Array.from(statesSet).sort();
  }, [safeGeo]);

  // Counties filtered by selected states (multi-state support)
  const counties = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = safeGeo.filter(item => selectedStates.includes(item.state));
    return Array.from(new Set(filtered.map(item => item.county))).sort();
  }, [selectedStates, safeGeo]);

  // Towns filtered by selected states + selected counties
  const towns = useMemo(() => {
    if (selectedStates.length === 0 || selectedCounties.length === 0) return [];
    const filtered = safeGeo.filter(
      item =>
        selectedStates.includes(item.state) &&
        selectedCounties.includes(item.county)
    );
    return Array.from(new Set(filtered.map(item => item.town))).sort();
  }, [selectedStates, selectedCounties, safeGeo]);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({
      lender: selectedLender,
      states: selectedStates,
      counties: selectedCounties,
      towns: selectedTowns
    });
    // You can send this to your backend/API here
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      {!safeLenders.length && (
        <p style={{ color: 'red' }}>Warning: No lenders loaded from hmda_list.json</p>
      )}
      {!safeGeo.length && (
        <p style={{ color: 'red' }}>Warning: No geography data loaded from geographies.json</p>
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

        <label>State(s) - hold Ctrl/Cmd to select multiple</label>
        <select
          multiple
          value={selectedStates}
          onChange={e => {
            const options = [...e.target.options];
            const selected = options.filter(o => o.selected).map(o => o.value);
            setSelectedStates(selected);
            setSelectedCounties([]); // reset downstream
            setSelectedTowns([]);
          }}
          required
          style={{ height: '150px' }} // make taller for multi-select
        >
          {uniqueStates.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label>County(ies) - hold Ctrl/Cmd to select multiple</label>
        <select
          multiple
          value={selectedCounties}
          onChange={e => {
            const options = [...e.target.options];
            const selected = options.filter(o => o.selected).map(o => o.value);
            setSelectedCounties(selected);
            setSelectedTowns([]);
          }}
          disabled={selectedStates.length === 0}
          required
          style={{ height: '150px' }}
        >
          {counties.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label>Town(s) - hold Ctrl/Cmd to select multiple</label>
        <select
          multiple
          value={selectedTowns}
          onChange={e => {
            const options = [...e.target.options];
            const selected = options.filter(o => o.selected).map(o => o.value);
            setSelectedTowns(selected);
          }}
          disabled={selectedCounties.length === 0}
          required
          style={{ height: '150px' }}
        >
          {towns.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <button type="submit" style={{ padding: '12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px' }}>
          Create Account
        </button>
      </form>
    </div>
  );
}
