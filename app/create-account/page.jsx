// app/create-account/page.jsx
'use client';
import { useState, useMemo, useEffect } from 'react';

export const dynamic = 'force-dynamic';

const ALL_COUNTIES = '%%ALL_COUNTIES%%';
const ALL_TOWNS = '%%ALL_TOWNS%%';

export default function Page() {
  const [lendersData, setLendersData] = useState([]);
  const [geoData, setGeoData] = useState([]);

  const [selectedLender, setSelectedLender] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [selectedTowns, setSelectedTowns] = useState([]);

  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then(r => r.json())
      .then(j => setLendersData(j.data || []));
    fetch('/data/geographies.json')
      .then(r => r.json())
      .then(j => setGeoData(j.data || []));
  }, []);

  const safeLenders = Array.isArray(lendersData) ? lendersData : [];
  const safeGeo = Array.isArray(geoData) ? geoData : [];

  const uniqueStates = useMemo(() => {
    const set = new Set(safeGeo.map(i => i.state));
    return Array.from(set).sort();
  }, [safeGeo]);

  const counties = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = safeGeo.filter(i => selectedStates.includes(i.state));
    return Array.from(new Set(filtered.map(i => i.county))).sort();
  }, [selectedStates, safeGeo]);

  const towns = useMemo(() => {
    if (selectedStates.length === 0 || selectedCounties.length === 0) return [];
    const filtered = safeGeo.filter(
      i => selectedStates.includes(i.state) && selectedCounties.includes(i.county)
    );
    return Array.from(new Set(filtered.map(i => i.town))).sort();
  }, [selectedStates, selectedCounties, safeGeo]);

  // Helper to toggle "All" selection
  const toggleAll = (allValue, currentArray, allArray, setter) => {
    if (currentArray.includes(allValue)) {
      setter(currentArray.filter(v => v !== allValue));
    } else {
      setter([allValue, ...allArray]);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      <form style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label>Lender</label>
          <select value={selectedLender} onChange={e => setSelectedLender(e.target.value)} required>
            <option value="">-- Select Lender --</option>
            {safeLenders.map(l => (
              <option key={l.lender_id} value={l.lender_id}>
                {l.lender} ({l.lender_state})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>State(s) - hold Ctrl/Cmd to select multiple</label>
          <select multiple value={selectedStates} onChange={e => {
            const vals = Array.from(e.target.selectedOptions, o => o.value);
            setSelectedStates(vals);
            setSelectedCounties([]);
            setSelectedTowns([]);
          }} style={{ height: '180px' }}>
            {uniqueStates.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label>County(ies)</label>
          <select multiple value={selectedCounties} onChange={e => {
            const vals = Array.from(e.target.selectedOptions, o => o.value);
            if (vals.includes(ALL_COUNTIES)) {
              toggleAll(ALL_COUNTIES, selectedCounties, counties, setSelectedCounties);
            } else {
              setSelectedCounties(vals.filter(v => v !== ALL_COUNTIES));
            }
            setSelectedTowns([]);
          }} disabled={selectedStates.length === 0} style={{ height: '200px' }}>
            <option value={ALL_COUNTIES}>=== All Counties ===</option>
            {counties.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Town(s)</label>
          <select multiple value={selectedTowns} onChange={e => {
            const vals = Array.from(e.target.selectedOptions, o => o.value);
            if (vals.includes(ALL_TOWNS)) {
              toggleAll(ALL_TOWNS, selectedTowns, towns, setSelectedTowns);
            } else {
              setSelectedTowns(vals.filter(v => v !== ALL_TOWNS));
            }
          }} disabled={selectedCounties.length === 0} style={{ height: '220px' }}>
            <option value={ALL_TOWNS}>=== All Towns ===</option>
            {towns.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <button type="submit" style={{ padding: '14px', background: '#0066cc', color: 'white', fontSize: '16px' }}>
          Create Account
        </button>
      </form>

      {/* Debug output */}
      <pre style={{ marginTop: '40px', fontSize: '12px' }}>
        {JSON.stringify({ selectedLender, selectedStates, selectedCounties, selectedTowns }, null, 2)}
      </pre>
    </div>
  );
}
