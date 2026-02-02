'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

const ALL_COUNTIES = '%%ALL_COUNTIES%%';
const ALL_TOWNS = '%%ALL_TOWNS%%';

// Case-insensitive fuzzy similarity (unchanged)
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
  const [currentStep, setCurrentStep] = useState(1); // 1 to 4
  const [selectedOrgType, setSelectedOrgType] = useState(''); // Bank, Credit Union, Mortgage Company
  const [selectedLender, setSelectedLender] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [selectedTowns, setSelectedTowns] = useState([]);

  const [orgName, setOrgName] = useState('');
  const [orgMatches, setOrgMatches] = useState({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });

  const [lendersData, setLendersData] = useState([]);
  const [geoData, setGeoData] = useState([]);
  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);

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

  // Filtered lists by selected states (using lender_state)
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

  // Debounced fuzzy match + FDIC/NCUA API calls
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName.trim() || currentStep !== 3) {
        setOrgMatches({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });
        return;
      }

      // Local fuzzy matches - top 1 per list
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
        hmda: matchInList(filteredHmdaList),
        cra: matchInList(filteredCraList),
        branch: matchInList(filteredBranchList)
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
    const statesSet = new Set(safeGeo.map(item => item.st || item.state));
    return Array.from(statesSet).filter(Boolean).sort();
  }, [safeGeo]);

  const counties = useMemo(() => {
    if (selectedStates.length === 0) return [];
    const filtered = safeGeo.filter(item => selectedStates.includes(item.st || item.state));
    return Array.from(new Set(filtered.map(item => item.county))).sort();
  }, [selectedStates, safeGeo]);

  const towns = useMemo(() => {
    if (selectedStates.length === 0 || selectedCounties.length === 0) return [];
    const filtered = safeGeo.filter(
      item => selectedStates.includes(item.st || item.state) && selectedCounties.includes(item.county)
    );
    return Array.from(new Set(filtered.map(item => item.town))).sort();
  }, [selectedStates, selectedCounties, safeGeo]);

  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  const countyOptions = useMemo(() => {
    return counties.map(c => {
      const stList = Array.from(
        new Set(safeGeo.filter(item => item.county === c && selectedStates.includes(item.st || item.state)).map(item => item.st || item.state))
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

  const nextStep = () => {
    if (currentStep === 1 && !selectedOrgType) return alert('Please select organization type');
    if (currentStep === 2 && selectedStates.length === 0) return alert('Please select at least one state');
    if (currentStep === 3 && !selectedLender) return alert('Please select a lender');
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({
      orgType: selectedOrgType,
      lender: selectedLender,
      states: selectedStates,
      counties: selectedCounties.includes(ALL_COUNTIES) ? 'All Counties' : selectedCounties,
      towns: selectedTowns.includes(ALL_TOWNS) ? 'All Towns' : selectedTowns
    });
    alert('All changes saved! (TODO: send to backend)');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <h2>Step 1: Select Organization Type</h2>
            <select
              value={selectedOrgType}
              onChange={e => setSelectedOrgType(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="">-- Select Type --</option>
              <option value="Bank">Bank</option>
              <option value="Credit Union">Credit Union</option>
              <option value="Mortgage Company">Mortgage Company</option>
            </select>
          </div>
        );

      case 2:
        return (
          <div>
            <h2>Step 2: Select Organization Headquarters State</h2>
            <Select
              isMulti
              options={stateOptions}
              value={stateOptions.filter(opt => selectedStates.includes(opt.value))}
              onChange={opts => {
                const vals = opts ? opts.map(o => o.value) : [];
                setSelectedStates(vals);
              }}
              placeholder="Select State(s)..."
              className="basic-multi-select"
              classNamePrefix="select"
            />
          </div>
        );

      case 3:
        return (
          <div>
            <h2>Step 3: Organization Name & Datasets </h2>
            <div>
              <label>Type your organization name (as you want to see it in your reports)</label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="e.g. XYZ Savings Bank"
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </div>

            {orgName.trim() && (
              <div style={{ marginTop: '8px', fontSize: '14px' }}>
                {orgMatches.hmda && (
                  <div>
                    <strong>HMDA best match:</strong> {orgMatches.hmda.label}
                  </div>
                )}
                {orgMatches.cra && (
                  <div>
                    <strong>CRA best match:</strong> {orgMatches.cra.label}
                  </div>
                )}
                {orgMatches.branch && (
                  <div>
                    <strong>Branch best match:</strong> {orgMatches.branch.label}
                  </div>
                )}
                {orgMatches.fdic && (
                  <div>
                    <strong>FDIC best match:</strong> {orgMatches.fdic.label}
                  </div>
                )}
                {orgMatches.ncua && (
                  <div>
                    <strong>NCUA best match:</strong> {orgMatches.ncua.label}
                  </div>
                )}
              </div>
            )}

            </div>
        );

      case 4:
        return (
          <div>
            <h2>Step 4: Confirm Your Selections</h2>
            <pre style={{ background: '#f8f9fa', padding: '16px', borderRadius: '6px' }}>
              {JSON.stringify(
                {
                  orgType: selectedOrgType,
                  lender: selectedLender,
                  states: selectedStates,
                  counties: selectedCounties.includes(ALL_COUNTIES) ? 'All Counties' : selectedCounties,
                  towns: selectedTowns.includes(ALL_TOWNS) ? 'All Towns' : selectedTowns
                },
                null,
                2
              )}
            </pre>
            <p>Review above and click "Save All Changes" below.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Create Account</h1>

      {/* Progress bar */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {[1, 2, 3, 4].map(step => (
            <div
              key={step}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: currentStep >= step ? '#0066cc' : '#ddd',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      {renderStep()}

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px' }}>
        {currentStep > 1 && (
          <button
            type="button"
            onClick={prevStep}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back
          </button>
        )}

        {currentStep < 4 ? (
          <button
            type="button"
            onClick={nextStep}
            style={{
              padding: '12px 24px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Next
          </button>
        ) : (
          <button
            type="submit"
            onClick={handleSubmit}
            style={{
              padding: '12px 24px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Save All Changes
          </button>
        )}
      </div>

      {/* Debug */}
      <pre style={{ marginTop: '40px', background: '#f8f9fa', padding: '16px', borderRadius: '6px' }}>
        {JSON.stringify(
          {
            step: currentStep,
            orgType: selectedOrgType,
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
