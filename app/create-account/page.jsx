// app/create-account/page.jsx

'use client';

import { useState, useMemo } from 'react';
import lendersData from '../../data/hmda_list.json';     // <-- exact name you said
import geoData from '../../data/geographies.json';       // <-- exact name you said

export default function Page() {
  const [selectedLender, setSelectedLender] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [selectedTown, setSelectedTown] = useState('');

  const uniqueStates = useMemo(() => {
    const statesSet = new Set(geoData.map(item => item.state));
    return Array.from(statesSet).sort();
  }, []);

  const counties = useMemo(() => {
    if (!selectedState) return [];
    const filtered = geoData.filter(item => item.state === selectedState);
    const countiesSet = new Set(filtered.map(item => item.county));
    return Array.from(countiesSet).sort();
  }, [selectedState]);

  const towns = useMemo(() => {
    if (!selectedState || !selectedCounty) return [];
    const filtered = geoData.filter(
      item => item.state === selectedState && item.county === selectedCounty
    );
    const townsSet = new Set(filtered.map(item => item.town));
    return Array.from(townsSet).sort();
  }, [selectedState, selectedCounty]);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ selectedLender, selectedState, selectedCounty, selectedTown });
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Create Account</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <select value={selectedLender} onChange={e => setSelectedLender(e.target.value)} required>
          <option value="">-- Select Lender --</option>
          {lendersData.map(l => (
            <option key={l.lender_id} value={l.lender_id}>
              {l.lender} ({l.lender_state} - {l.regulator})
            </option>
          ))}
        </select>

        <select 
          value={selectedState} 
          onChange={e => { setSelectedState(e.target.value); setSelectedCounty(''); setSelectedTown(''); }} 
          required
        >
          <option value="">-- Select State --</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select 
          value={selectedCounty} 
          onChange={e => { setSelectedCounty(e.target.value); setSelectedTown(''); }} 
          disabled={!selectedState} 
          required
        >
          <option value="">-- Select County --</option>
          {counties.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select 
          value={selectedTown} 
          onChange={e => setSelectedTown(e.target.value)} 
          disabled={!selectedCounty} 
          required
        >
          <option value="">-- Select Town --</option>
          {towns.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button type="submit" style={{ padding: '10px', background: 'blue', color: 'white' }}>
          Create Account
        </button>
      </form>
    </div>
  );
}
