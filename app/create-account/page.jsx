'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

const ALL_COUNTIES = '%%ALL_COUNTIES%%';
const ALL_TOWNS = '%%ALL_TOWNS%%';

// Case-insensitive fuzzy similarity
const similarity = (a, b) => {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a.length === 0 || b.length === 0) return 0;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
};

export default function Page() {
  const [lendersData, setLendersData] = useState([]);
  const [geoData, setGeoData] = useState([]);
  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);

  const [selectedLender, setSelectedLender] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [selectedTowns, setSelectedTowns] = useState([]);

  const [orgName, setOrgName] = useState('');
  const [orgMatches, setOrgMatches] = useState({ hmda: [], cra: [], branch: [] });

  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then(res => res.json())
      .then(json => {
        setLendersData(json.data || []);
        setHmdaList(json.data || []);
      })
      .catch(err => console.error('HMDA load failed:', err));

    fetch('/data/cra_list.json')
      .then(res => res.json())
      .then(json => setCraList(json.data || []))
      .catch(err => console.error('CRA load failed:', err));

    fetch('/data/branch_list.json')
      .then(res => res.json())
      .then(json => setBranchList(json.data || []))
      .catch(err => console.error('Branch load failed:', err));

    fetch('/data/geographies.json')
      .then(res => res.json())
      .then(json => setGeoData(json.data || []))
      .catch(err => console.error('Geo load failed:', err));
  }, []);

  // Filtered lists by selected states
  const filteredHmdaList = useMemo(() => {
    if (selectedStates.length === 0) return hmdaList;
    return hmdaList.filter(item => selectedStates.includes(item.lender_state));
  }, [selectedStates, hmdaList]);

  const filteredCraList = useMemo(() => {
    if (selectedStates.length === 0) return craList;
    return craList.filter(item => selectedStates.includes(item.lender_state));
  }, [selectedStates, craList]);

  const filteredBranchList = useMemo(() => {
    if (selectedStates.length === 0) return branchList;
    return branchList.filter(item => selectedStates.includes(item.lender_state));
  }, [selectedStates, branchList]);

  // Debounced fuzzy match (filtered by selected states)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!orgName.trim()) {
        setOrgMatches({ hmda: [], cra: [], branch: [] });
        return;
      }

      const matchInList = (list) => {
        return list
          .map(item => ({
            ...item,
            score: similarity(orgName, item.lender)
          }))
          .filter(item => item.score > 0.6)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(item => ({
            label: `${item.lender} (${item.lender_state} - ${item.regulator}) - ${Math.round(item.score * 100)}% match`,
            value: item.lender_id,
            score: item.score
          }));
      };

      setOrgMatches({
        hmda: matchInList(filteredHmdaList),
        cra: matchInList(filteredCraList),
        branch: matchInList(filteredBranchList)
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [orgName, filteredHmdaList, filteredCraList, filteredBranchList]);

  // Auto-fill on strong match (>80%)
  useEffect(() => {
    const allMatches = [...orgMatches.hmda, ...orgMatches.cra, ...orgMatches.branch];
    const best = allMatches[0];
    if (best && best.score > 0.8) {
      setSelectedLender(best.value);
    }
  }, [orgMatches]);

  // Geography logic
  const safeLenders = Array.isArray(lendersData) ? lendersData : [];
  const safeGeo = Array.isArray(geoData) ? geoData : [];

  const uniqueStates = useMemo(() => {
    const statesSet = new Set(safeGeo.map(item => item.state));
    return Array.from(statesSet).sort();
  }, [safeGeo]);

  const counties = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = safeGeo.filter(item => selectedStates.includes(item.state));
    return Array.from(new Set(filtered.map(item => item.county))).sort();
  }, [selectedStates, safeGeo]);

  const towns = useMemo(() => {
    if (selectedStates.length === 0 || selectedCounties.length === 0) return [];
    const filtered = safeGeo.filter(
      item => selectedStates.includes(item.state) && selectedCounties.includes(item.county)
    );
    return Array.from(new Set(filtered.map(item => item.town))).sort();
  }, [selectedStates, selectedCounties, safeGeo]);

  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  const countyOptions = useMemo(() => {
    return counties.map(c => {
      const stList = Array.from(
        new Set(
          safeGeo
            .filter(item => item.county === c && selectedStates.includes(item.state))
            .map(item => item.st || item.state)  // prefer st
        )
      ).sort().join(', ');
      return {
        value: c,
        label: `${stList} - ${c}`
      };
    });
  }, [counties, selectedStates, safeGeo]);

  const townOptions = useMemo(() => {
    return towns.map(t => {
      const townInfo = safeGeo.find(item => item.town === t && selectedCounties.includes(item.county));
      const st = townInfo?.st || townInfo?.state || '';
      const county = townInfo?.county || '';
      return {
        value: t,
        label: `${st} - ${county} - ${t}`
      };
    });
  }, [towns, selectedStates, selectedCounties, safeGeo]);

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
        {/* State multi-select first */}
        <div>
          <label>Select State(s) to filter organization matches</label>
          <Select
            isMulti
            options={stateOptions}
            value={stateOptions.filter(opt => selectedStates.includes(opt.value))}
            onChange={opts => {
              const vals = opts ? opts.map(o => o.value) : [];
              setSelectedStates(vals);
              setOrgName(''); // reset match when states change
              setSelectedLender('');
            }}
            placeholder="Select State(s)..."
            className="basic-multi-select"
            classNamePrefix="select"
          />
        </div>

        {/* Organization input */}
        <div>
          <label>Type your organization name (optional auto-match)</label>
          <input
            type="text"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            placeholder="e.g. East Cambridge Savings Bank"
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
        </div>

        {/* Matches */}
        {orgName.trim() && (
          <div style={{ marginTop: '8px', fontSize: '14px' }}>
            {orgMatches.hmda.length > 0 ? (
              <div>
                <strong>HMDA matches:</strong>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {orgMatches.hmda.map(match => (
                    <li key={match.value} onClick={() => setSelectedLender(match.value)} style={{ cursor: 'pointer', color: 'blue' }}>
                      {match.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>No match in HMDA list</div>
            )}

            {orgMatches.cra.length > 0 ? (
              <div>
                <strong>CRA matches:</strong>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {orgMatches.cra.map(match => (
                    <li key={match.value} onClick={() => setSelectedLender(match.value)} style={{ cursor: 'pointer', color: 'blue' }}>
                      {match.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>No match in CRA list</div>
            )}

            {orgMatches.branch.length > 0 ? (
              <div>
                <strong>Branch matches:</strong>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {orgMatches.branch.map(match => (
                    <li key={match.value} onClick={() => setSelectedLender(match.value)} style={{ cursor: 'pointer', color: 'blue' }}>
                      {match.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>No match in Branch list</div>
            )}
          </div>
        )}

        {/* Lender dropdown */}
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

        {/* Geography sections */}
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
                setSelectedCounties(counties.length > 0 ? [ALL_COUNTIES, ...counties] : []);
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
                setSelectedTowns(towns.length > 0 ? [ALL_TOWNS, ...towns] : []);
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
