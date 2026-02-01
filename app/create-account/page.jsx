'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

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

  const uniqueStates = useMemo(() => {
    const statesSet = new Set(safeGeo.map(item => item.state));
    return Array.from(statesSet).sort();
  }, [safeGeo]);

  // Counties: sorted by ST then County
  const counties = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = safeGeo.filter(item => selectedStates.includes(item.state));

    // Group by ST, collect counties, sort
    const grouped = {};
    filtered.forEach(item => {
      const st = item.st || item.state;  // prefer st if present
      if (!grouped[st]) grouped[st] = new Set();
      grouped[st].add(item.county);
    });

    // Sort STs, then counties within each
    const sorted = [];
    Object.keys(grouped).sort().forEach(st => {
      Array.from(grouped[st]).sort().forEach(county => {
        sorted.push({ st, county });
      });
    });

    return sorted;
  }, [selectedStates, safeGeo]);

  // Towns: sorted by ST then Town
  const towns = useMemo(() => {
    if (selectedStates.length === 0 || selectedCounties.length === 0) return [];
    const filtered = safeGeo.filter(
      item => selectedStates.includes(item.state) && selectedCounties.includes(item.county)
    );

    const grouped = {};
    filtered.forEach(item => {
      const st = item.st || item.state;
      if (!grouped[st]) grouped[st] = new Set();
      grouped[st].add(item.town);
    });

    const sorted = [];
    Object.keys(grouped).sort().forEach(st => {
      Array.from(grouped[st]).sort().forEach(town => {
        sorted.push({ st, town });
      });
    });

    return sorted;
  }, [selectedStates, selectedCounties, safeGeo]);

  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  const countyOptions = useMemo(() => {
    return counties.map(({ st, county }) => ({
      value: county,
      label: `${st} - ${county}`
    }));
  }, [counties]);

  const townOptions = useMemo(() => {
    return towns.map(({ st, town }) => ({
      value: town,
      label: `${st} - ${town}`
    }));
  }, [towns]);

  const allCountiesOption = { value: ALL_COUNTIES, label: '=== All Counties ===' };
  const allTownsOption = { value: ALL_TOWNS, label: '=== All Towns ===' };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({
      lender: selectedLender,
      states: selectedStates,
      counties: selectedCounties.includes(ALL_COUNTIES) ? 'All Counties' : selectedCounties,
      towns: selectedTowns.includes(ALL_TOWNS) ? 'All Towns' : selectedTowns
    });
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      {!safeLenders.length && (
        <p style={{ color: 'red' }}>Warning: No lenders loaded from hmda_list.json</p>
      )}
      {!safeGeo.length && (
        <p style={{ color: 'red' }}>Warning: No geography data loaded from geographies.json</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label>Lender</label>
          <select
            value={selectedLender}
            onChange={e => setSelectedLender(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            <option value="">-- Select Lender --</option>
            {safeLenders.map(l => (
              <option key={l.lender_id} value={l.lender_id}>
                {l.lender} ({l.lender_state} - {l.regulator})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>State(s)</label>
          <Select
            isMulti
            options={stateOptions}
            value={stateOptions.filter(opt => selectedStates.includes(opt.value))}
            onChange={opts => {
              const vals = opts ? opts.map(o => o.value) : [];
              setSelectedStates(vals);
              setSelectedCounties([]);
              setSelectedTowns([]);
            }}
            placeholder="Select State(s)..."
            className="basic-multi-select"
            classNamePrefix="select"
          />
        </div>

        <div>
          <label>County(ies)</label>
          <Select
            isMulti
            options={[allCountiesOption, ...countyOptions]}
            value={[
              ...(selectedCounties.includes(ALL_COUNTIES) ? [allCountiesOption] : []),
              ...countyOptions.filter(opt => selectedCounties.includes(opt.value))
            ]}
            onChange={opts => {
              const vals = opts ? opts.map(o => o.value) : [];
              if (vals.includes(ALL_COUNTIES)) {
                setSelectedCounties(counties.length > 0 ? [ALL_COUNTIES, ...counties.map(c => c.county)] : []);
              } else {
                setSelectedCounties(vals);
              }
              setSelectedTowns([]);
            }}
            isDisabled={selectedStates.length === 0}
            placeholder="Select County(ies)..."
            className="basic-multi-select"
            classNamePrefix="select"
          />
        </div>

        <div>
          <label>Town(s)</label>
          <Select
            isMulti
            options={[allTownsOption, ...townOptions]}
            value={[
              ...(selectedTowns.includes(ALL_TOWNS) ? [allTownsOption] : []),
              ...townOptions.filter(opt => selectedTowns.includes(opt.value))
            ]}
            onChange={opts => {
              const vals = opts ? opts.map(o => o.value) : [];
              if (vals.includes(ALL_TOWNS)) {
                setSelectedTowns(towns.length > 0 ? [ALL_TOWNS, ...towns.map(t => t.town)] : []);
              } else {
                setSelectedTowns(vals);
              }
            }}
            isDisabled={selectedCounties.length === 0}
            placeholder="Select Town(s)..."
            className="basic-multi-select"
            classNamePrefix="select"
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '14px',
            background: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Create Account
        </button>
      </form>

      <pre style={{ marginTop: '40px', background: '#f8f9fa', padding: '16px', borderRadius: '6px' }}>
        {JSON.stringify(
          {
            lender: selectedLender,
            states: selectedStates,
            counties: selectedCounties.includes(ALL_COUNTIES) ? 'All Counties' : selectedCounties,
            towns: selectedTowns.includes(ALL_TOWNS) ? 'All Towns' : selectedTowns
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}
