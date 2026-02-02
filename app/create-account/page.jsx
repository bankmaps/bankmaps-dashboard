'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

// Case-insensitive Levenshtein similarity
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
  const [currentStep, setCurrentStep] = useState(1);

  const [orgName, setOrgName] = useState('');
  const [selectedOrgType, setSelectedOrgType] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);

  const [selectedLender, setSelectedLender] = useState('');
  const [orgMatches, setOrgMatches] = useState({
    hmda: null,
    cra: null,
    branch: null,
    fdic: null,
    ncua: null,
  });

  const [lendersData, setLendersData] = useState([]);
  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);
  const [geoData, setGeoData] = useState([]); // still loading it, in case we need states list

  // Load data
  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then((res) => res.json())
      .then((json) => {
        setLendersData(json.data || []);
        setHmdaList(json.data || []);
      })
      .catch((err) => console.error('HMDA load failed:', err));

    fetch('/data/cra_list.json')
      .then((res) => res.json())
      .then((json) => setCraList(json.data || []))
      .catch((err) => console.error('CRA load failed:', err));

    fetch('/data/branch_list.json')
      .then((res) => res.json())
      .then((json) => setBranchList(json.data || []))
      .catch((err) => console.error('Branch load failed:', err));

    // Still load geo just for unique states
    fetch('/data/geographies.json')
      .then((res) => res.json())
      .then((json) => setGeoData(json.data || []))
      .catch((err) => console.error('Geo load failed:', err));
  }, []);

  // Filtered lists based on selected states (improves match quality)
  const filteredHmdaList = useMemo(() => {
    if (selectedStates.length === 0) return hmdaList;
    return hmdaList.filter((item) => selectedStates.includes(item.lender_state));
  }, [selectedStates, hmdaList]);

  const filteredCraList = useMemo(() => {
    if (selectedStates.length === 0) return craList;
    return craList.filter((item) => selectedStates.includes(item.lender_state));
  }, [selectedStates, craList]);

  const filteredBranchList = useMemo(() => {
    if (selectedStates.length === 0) return branchList;
    return branchList.filter((item) => selectedStates.includes(item.lender_state));
  }, [selectedStates, branchList]);

  // Matching logic – only when we have name + type + at least one state
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName.trim() || !selectedOrgType || selectedStates.length === 0) {
        setOrgMatches({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });
        return;
      }

      const matchInList = (list) => {
        const matches = list
          .map((item) => ({
            ...item,
            score: similarity(orgName, item.lender),
          }))
          .filter((item) => item.score > 0.6)
          .sort((a, b) => b.score - a.score);
        return matches.length > 0 ? matches[0] : null;
      };

      const localMatches = {
        hmda: matchInList(filteredHmdaList),
        cra: matchInList(filteredCraList),
        branch: matchInList(filteredBranchList),
      };

      let fdicMatch = null;
      try {
        const res = await fetch(
          `https://banks.data.fdic.gov/api/institutions?filters=NAME%20LIKE%20%22${encodeURIComponent(
            orgName
          )}%22&fields=NAME%2CRSSD%2CCITY%2CSTALP&limit=5`
        );
        const data = await res.json();
        const matches = (data.data || []).map((item) => ({
          name: item.data.NAME,
          id: item.data.RSSD,
          city: item.data.CITY,
          state: item.data.STALP,
          score: similarity(orgName, item.data.NAME),
        })).filter((m) => m.score > 0.6).sort((a, b) => b.score - a.score);
        fdicMatch = matches[0] ?? null;
      } catch (e) {
        console.error('FDIC fetch failed:', e);
      }

      let ncuaMatch = null;
      try {
        const res = await fetch(
          `https://mapping.ncua.gov/api/cudata?name=like:${encodeURIComponent(orgName)}&limit=5`
        );
        const data = await res.json();
        const matches = (data || []).map((item) => ({
          name: item.CU_Name,
          id: item.CU_Number,
          city: item.City,
          state: item.State,
          score: similarity(orgName, item.CU_Name),
        })).filter((m) => m.score > 0.6).sort((a, b) => b.score - a.score);
        ncuaMatch = matches[0] ?? null;
      } catch (e) {
        console.error('NCUA fetch failed:', e);
      }

      setOrgMatches({
        hmda: localMatches.hmda
          ? {
              label: `${localMatches.hmda.lender} (${localMatches.hmda.lender_state} - ${localMatches.hmda.regulator}) - ${Math.round(
                localMatches.hmda.score * 100
              )}%`,
              value: localMatches.hmda.lender_id,
              score: localMatches.hmda.score,
            }
          : null,
        cra: localMatches.cra
          ? {
              label: `${localMatches.cra.lender} (${localMatches.cra.lender_state} - ${localMatches.cra.regulator}) - ${Math.round(
                localMatches.cra.score * 100
              )}%`,
              value: localMatches.cra.lender_id,
              score: localMatches.cra.score,
            }
          : null,
        branch: localMatches.branch
          ? {
              label: `${localMatches.branch.lender} (${localMatches.branch.lender_state} - ${localMatches.branch.regulator}) - ${Math.round(
                localMatches.branch.score * 100
              )}%`,
              value: localMatches.branch.lender_id,
              score: localMatches.branch.score,
            }
          : null,
        fdic: fdicMatch
          ? {
              label: `${fdicMatch.name} (RSSD ${fdicMatch.id}, ${fdicMatch.city}, ${fdicMatch.state}) - ${Math.round(
                fdicMatch.score * 100
              )}%`,
              value: fdicMatch.id,
              score: fdicMatch.score,
            }
          : null,
        ncua: ncuaMatch
          ? {
              label: `${ncuaMatch.name} (Charter ${ncuaMatch.id}, ${ncuaMatch.city}, ${ncuaMatch.state}) - ${Math.round(
                ncuaMatch.score * 100
              )}%`,
              value: ncuaMatch.id,
              score: ncuaMatch.score,
            }
          : null,
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [orgName, selectedOrgType, selectedStates, filteredHmdaList, filteredCraList, filteredBranchList]);

  // Auto-select very strong match
  useEffect(() => {
    const all = [
      orgMatches.hmda,
      orgMatches.cra,
      orgMatches.branch,
      orgMatches.fdic,
      orgMatches.ncua,
    ].filter(Boolean);
    if (all.length === 0) return;
    const best = all.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
    if (best.score > 0.82) {
      setSelectedLender(best.value);
    }
  }, [orgMatches]);

  // ─── States for step 3 ──────────────────────────────────────
  const uniqueStates = useMemo(
    () =>
      [...new Set(geoData.map((item) => item.st || item.state))]
        .filter(Boolean)
        .sort(),
    [geoData]
  );

  const stateOptions = uniqueStates.map((s) => ({ value: s, label: s }));

  // ─── Navigation helpers ─────────────────────────────────────
  const canAdvance = () => {
    if (currentStep === 1) return orgName.trim().length >= 3;
    if (currentStep === 2) return !!selectedOrgType;
    if (currentStep === 3) return selectedStates.length > 0;
    return true;
  };

  const nextStep = () => {
    if (!canAdvance()) {
      alert('Please complete the current step.');
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedLender) {
      alert('Please select a database match in Step 4 (or confirm none match).');
      return;
    }

    const payload = {
      name: orgName.trim(),
      type: selectedOrgType,
      headquartersStates: selectedStates,
      linkedLenderId: selectedLender,
      // ← geography will be added later
    };

    console.log('Submitting:', payload);
    alert('Account setup saved! (TODO: send to backend)');
    // → redirect or next flow
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <h2>Step 1 – Organization Name</h2>
            <label>Enter the name as you want it to appear in reports:</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. XYZ Savings Bank"
              style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </div>
        );

      case 2:
        return (
          <div>
            <h2>Step 2 – Organization Type</h2>
            <select
              value={selectedOrgType}
              onChange={(e) => setSelectedOrgType(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="">-- Select Type --</option>
              <option value="Bank">Bank</option>
              <option value="Credit Union">Credit Union</option>
              <option value="Mortgage Company">Mortgage Company</option>
            </select>
          </div>
        );

      case 3:
        return (
          <div>
            <h2>Step 3 – Organization Headquarters State(s)</h2>
            <Select
              isMulti
              options={stateOptions}
              value={stateOptions.filter((opt) => selectedStates.includes(opt.value))}
              onChange={(opts) => setSelectedStates(opts ? opts.map((o) => o.value) : [])}
              placeholder="Select headquarters state(s)..."
              className="basic-multi-select"
              classNamePrefix="select"
            />
          </div>
        );

      case 4:
        return (
          <div>
            <h2>Step 4 – Database Connections</h2>
            <p>Potential matches found for <strong>{orgName || 'your organization'}</strong>:</p>

            <div style={{ margin: '20px 0' }}>
              {['hmda', 'cra', 'branch', 'fdic', 'ncua'].map((key) => {
                const match = orgMatches[key];
                if (!match) return null;
                const selected = selectedLender === match.value;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedLender(match.value)}
                    style={{
                      padding: '14px',
                      margin: '10px 0',
                      border: selected ? '2px solid #0066cc' : '1px solid #ddd',
                      borderRadius: '8px',
                      background: selected ? '#f0f8ff' : '#fafafa',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ textTransform: 'uppercase' }}>{key}:</strong>{' '}
                    {match.label}
                    {selected && (
                      <span style={{ marginLeft: '12px', color: '#0066cc', fontWeight: 'bold' }}>✓ Selected</span>
                    )}
                  </div>
                );
              })}

              {Object.values(orgMatches).every((m) => !m) && (
                <p style={{ color: '#c0392b', marginTop: '16px' }}>
                  No strong matches found. You can continue without linking for now.
                </p>
              )}
            </div>

            <p style={{ fontSize: '14px', color: '#555' }}>
              Click the best match above. You can change this later if needed.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '720px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      {/* Progress */}
      <div style={{ margin: '32px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: currentStep >= step ? '#0066cc' : '#e0e0e0',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '18px',
              }}
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      {renderStep()}

      {/* Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '48px' }}>
        {currentStep > 1 && (
          <button
            onClick={prevStep}
            style={{
              padding: '12px 28px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}

        {currentStep < 4 ? (
          <button
            onClick={nextStep}
            disabled={!canAdvance()}
            style={{
              padding: '12px 28px',
              background: canAdvance() ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: canAdvance() ? 'pointer' : 'not-allowed',
              marginLeft: 'auto',
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            style={{
              padding: '12px 28px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            Save & Continue
          </button>
        )}
      </div>

      {/* Optional debug – uncomment during dev */}
      {/* <pre style={{ marginTop: '60px', background: '#f8f9fa', padding: '16px', borderRadius: '8px', fontSize: '13px' }}>
        {JSON.stringify({ step: currentStep, orgName, type: selectedOrgType, states: selectedStates, lender: selectedLender }, null, 2)}
      </pre> */}
    </div>
  );
}
