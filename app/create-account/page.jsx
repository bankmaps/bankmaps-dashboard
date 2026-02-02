'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

const ALL_COUNTIES = '%%ALL_COUNTIES%%';
const ALL_TOWNS = '%%ALL_TOWNS%%';

// Case-insensitive Levenshtein similarity (unchanged)
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
  const [orgMatches, setOrgMatches] = useState({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });

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

  // Debounced fuzzy match + FDIC/NCUA API calls
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName.trim()) {
        setOrgMatches({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });
        return;
      }

      // Local fuzzy matches - only top 1 per list
      const matchInList = (list) => {
        const matches = list
          .map(item => ({
            ...item,
            score: similarity(orgName, item.lender)
          }))
          .filter(item => item.score > 0.6)
          .sort((a, b) => b.score - a.score);
        return matches.length > 0 ? matches[0] : null;
      };

      const localMatches = {
        hmda: matchInList(hmdaList),
        cra: matchInList(craList),
        branch: matchInList(branchList)
      };

      // FDIC API (banks)
      let fdicMatch = null;
      try {
        const fdicRes = await fetch(
          `https://banks.data.fdic.gov/api/institutions?filters=NAME%20LIKE%20%22${encodeURIComponent(orgName)}%22&fields=NAME%2CRSSD%2CCITY%2CSTALP&limit=5`
        );
        const fdicData = await fdicRes.json();
        const matches = (fdicData.data || []).map(item => ({
          name: item.data.NAME,
          id: item.data.RSSD,
          city: item.data.CITY,
          state: item.data.STALP,
          score: similarity(orgName, item.data.NAME)
        }))
        .filter(item => item.score > 0.6)
        .sort((a, b) => b.score - a.score);
        fdicMatch = matches.length > 0 ? matches[0] : null;
      } catch (e) {
        console.error('FDIC fetch failed:', e);
      }

      // NCUA API (credit unions)
      let ncuaMatch = null;
      try {
        const ncuaRes = await fetch(
          `https://mapping.ncua.gov/api/cudata?name=like:${encodeURIComponent(orgName)}&limit=5`
        );
        const ncuaData = await ncuaRes.json();
        const matches = (ncuaData || []).map(item => ({
          name: item.CU_Name,
          id: item.CU_Number,
          city: item.City,
          state: item.State,
          score: similarity(orgName, item.CU_Name)
        }))
        .filter(item => item.score > 0.6)
        .sort((a, b) => b.score - a.score);
        ncuaMatch = matches.length > 0 ? matches[0] : null;
      } catch (e) {
        console.error('NCUA fetch failed:', e);
      }

      setOrgMatches({
        hmda: localMatches.hmda ? {
          label: `${localMatches.hmda.lender} (${localMatches.hmda.lender_state} - ${localMatches.hmda.regulator}) - ${Math.round(localMatches.hmda.score * 100)}% match`,
          value: localMatches.hmda.lender_id,
          score: localMatches.hmda.score
        } : null,
        cra: localMatches.cra ? {
          label: `${localMatches.cra.lender} (${localMatches.cra.lender_state} - ${localMatches.cra.regulator}) - ${Math.round(localMatches.cra.score * 100)}% match`,
          value: localMatches.cra.lender_id,
          score: localMatches.cra.score
        } : null,
        branch: localMatches.branch ? {
          label: `${localMatches.branch.lender} (${localMatches.branch.lender_state} - ${localMatches.branch.regulator}) - ${Math.round(localMatches.branch.score * 100)}% match`,
          value: localMatches.branch.lender_id,
          score: localMatches.branch.score
        } : null,
        fdic: fdicMatch ? {
          label: `${fdicMatch.name} (RSSD ${fdicMatch.id}, ${fdicMatch.city}, ${fdicMatch.state}) - ${Math.round(fdicMatch.score * 100)}% match`,
          value: fdicMatch.id,
          score: fdicMatch.score
        } : null,
        ncua: ncuaMatch ? {
          label: `${ncuaMatch.name} (Charter ${ncuaMatch.id}, ${ncuaMatch.city}, ${ncuaMatch.state}) - ${Math.round(ncuaMatch.score * 100)}% match`,
          value: ncuaMatch.id,
          score: ncuaMatch.score
        } : null
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [orgName, hmdaList, craList, branchList]);

  // Auto-fill on strong match (>80%)
  useEffect(() => {
    const allMatches = [
      orgMatches.hmda,
      orgMatches.cra,
      orgMatches.branch,
      orgMatches.fdic,
      orgMatches.ncua
    ].filter(Boolean);
    const best = allMatches[0];
    if (best && best.score > 0.8) {
      setSelectedLender(best.value);
    }
  }, [orgMatches]);

  // Geography logic (unchanged)
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
        new Set(safeGeo.filter(item => item.county === c && selectedStates.includes(item.state)).map(item => item.st || item.state))
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
              setOrgName('');
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

        {/* Matches - top match only per list */}
        {orgName.trim() && (
          <div style={{ marginTop: '8px', fontSize: '14px' }}>
            {orgMatches.hmda ? (
              <div>
<p>This is a test<br />This is a second line<br /> </p>
                
<strong>HMDA best match: <span onClick={() => setSelectedLender(orgMatches.hmda.value)} style={{ cursor: 'pointer', color: 'blue' }} >{orgMatches.hmda.label}</span></strong>
                <select
                  value=""
                  onChange={e => setSelectedLender(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginTop: '4px' }}
                >
                  <option value="">Select the organization yourself</option>
                  {hmdaList.map(l => (
                    <option key={l.lender_id} value={l.lender_id}>
                      {l.lender} ({l.lender_state} - {l.regulator})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>No match in HMDA list</div>
            )}

            {orgMatches.cra ? (
      <div>
<strong>CRA best match: <span onClick={() => setSelectedLender(orgMatches.cra.value)} style={{ cursor: 'pointer', color: 'blue' }} >{orgMatches.cra.label}</span></strong>
                <select
                  value=""
                  onChange={e => setSelectedLender(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginTop: '4px' }}
                >
                  <option value="">Select the organization yourself</option>
                  {craList.map(l => (
                    <option key={l.lender_id} value={l.lender_id}>
                      {l.lender} ({l.lender_state} - {l.regulator})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>No match in CRA list</div>
            )}

            {orgMatches.branch ? (
              <div>
<strong>Branch best match: <span onClick={() => setSelectedLender(orgMatches.branch.value)} style={{ cursor: 'pointer', color: 'blue' }} >{orgMatches.branch.label}</span></strong>
                <select
                  value=""
                  onChange={e => setSelectedLender(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginTop: '4px' }}
                >
                  <option value="">Select the organization yourself</option>
                  {branchList.map(l => (
                    <option key={l.lender_id} value={l.lender_id}>
                      {l.lender} ({l.lender_state} - {l.regulator})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>No match in Branch list</div>
            )}

            {orgMatches.fdic ? (
              <div>
<strong>FDIC best match: <span onClick={() => setSelectedLender(orgMatches.fdic.value)} style={{ cursor: 'pointer', color: 'blue' }} >{orgMatches.fdic.label}</span></strong>
                <select
                  value=""
                  onChange={e => setSelectedLender(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginTop: '4px' }}
                >
                  <option value="">Select the organization yourself</option>
                  {safeLenders.map(l => (
                    <option key={l.lender_id} value={l.lender_id}>
                      {l.lender} ({l.lender_state} - {l.regulator})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>No match in FDIC database</div>
            )}

            {orgMatches.ncua ? (
             <div>
<strong>NCUA best match: <span onClick={() => setSelectedLender(orgMatches.ncua.value)} style={{ cursor: 'pointer', color: 'blue' }} >{orgMatches.ncua.label}</span></strong>
                <select
                  value=""
                  onChange={e => setSelectedLender(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', marginTop: '4px' }}
                >
                  <option value="">Select the organization yourself</option>
                  {safeLenders.map(l => (
                    <option key={l.lender_id} value={l.lender_id}>
                      {l.lender} ({l.lender_state} - {l.regulator})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>No match in NCUA database</div>
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
