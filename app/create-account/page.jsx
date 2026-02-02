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

  const [orgMatches, setOrgMatches] = useState({
    hmda: null,
    cra: null,
    branch: null,
    fdic: null,
    ncua: null,
  });

  const [candidates, setCandidates] = useState({
    hmda: [],
    cra: [],
    branch: [],
    fdic: [],
    ncua: [],
  });

  const [selectedLenderPerSource, setSelectedLenderPerSource] = useState({
    hmda: null,
    cra: null,
    branch: null,
    fdic: null,
    ncua: null,
  });

  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);
  const [geoData, setGeoData] = useState([]);

  // Load data
  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then(res => res.json())
      .then(json => setHmdaList(json.data || []))
      .catch(err => console.error('HMDA failed:', err));

    fetch('/data/cra_list.json')
      .then(res => res.json())
      .then(json => setCraList(json.data || []))
      .catch(err => console.error('CRA failed:', err));

    fetch('/data/branch_list.json')
      .then(res => res.json())
      .then(json => setBranchList(json.data || []))
      .catch(err => console.error('Branch failed:', err));

    fetch('/data/geographies.json')
      .then(res => res.json())
      .then(json => setGeoData(json.data || []))
      .catch(err => console.error('Geo failed:', err));
  }, []);

  // Filtered lists
  const filteredHmdaList = useMemo(() =>
    selectedStates.length === 0 ? hmdaList : hmdaList.filter(item => selectedStates.includes(item.lender_state)),
  [selectedStates, hmdaList]);

  const filteredCraList = useMemo(() =>
    selectedStates.length === 0 ? craList : craList.filter(item => selectedStates.includes(item.lender_state)),
  [selectedStates, craList]);

  const filteredBranchList = useMemo(() =>
    selectedStates.length === 0 ? branchList : branchList.filter(item => selectedStates.includes(item.lender_state)),
  [selectedStates, branchList]);

  // Matching + candidates
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName.trim() || !selectedOrgType || selectedStates.length === 0) {
        setOrgMatches({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });
        setCandidates({ hmda: [], cra: [], branch: [], fdic: [], ncua: [] });
        return;
      }

      const getLocalCandidates = (list, limit = 12) => {
        return list
          .map(item => {
            const score = similarity(orgName, item.lender);
            return {
              label: `${item.lender} (${item.lender_state} – ${item.regulator || '?'}) – ${Math.round(score * 100)}%`,
              value: item.lender_id,
              score,
            };
          })
          .filter(m => m.score > 0.55)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      };

      const hmdaCands = getLocalCandidates(filteredHmdaList);
      const craCands  = getLocalCandidates(filteredCraList);
      const branchCands = getLocalCandidates(filteredBranchList);

      let fdicCands = [];
      try {
        const res = await fetch(
          `https://banks.data.fdic.gov/api/institutions?filters=NAME%20LIKE%20%22${encodeURIComponent(orgName)}%22&fields=NAME%2CRSSD%2CCITY%2CSTALP&limit=10`
        );
        const data = await res.json();
        fdicCands = (data.data || []).map(item => {
          const score = similarity(orgName, item.data.NAME);
          return {
            label: `${item.data.NAME} (RSSD ${item.data.RSSD}, ${item.data.CITY}, ${item.data.STALP}) – ${Math.round(score * 100)}%`,
            value: item.data.RSSD,
            score,
          };
        }).filter(m => m.score > 0.55).sort((a,b) => b.score - a.score);
      } catch (e) {
        console.error('FDIC failed:', e);
      }

      let ncuaCands = [];
      try {
        const res = await fetch(
          `https://mapping.ncua.gov/api/cudata?name=like:${encodeURIComponent(orgName)}&limit=10`
        );
        const data = await res.json();
        ncuaCands = (data || []).map(item => {
          const score = similarity(orgName, item.CU_Name);
          return {
            label: `${item.CU_Name} (Charter ${item.CU_Number}, ${item.City}, ${item.State}) – ${Math.round(score * 100)}%`,
            value: item.CU_Number,
            score,
          };
        }).filter(m => m.score > 0.55).sort((a,b) => b.score - a.score);
      } catch (e) {
        console.error('NCUA failed:', e);
      }

      setCandidates({
        hmda: hmdaCands,
        cra: craCands,
        branch: branchCands,
        fdic: fdicCands,
        ncua: ncuaCands,
      });

      setOrgMatches({
        hmda: hmdaCands[0] || null,
        cra: craCands[0] || null,
        branch: branchCands[0] || null,
        fdic: fdicCands[0] || null,
        ncua: ncuaCands[0] || null,
      });

      // Auto-preselect best matches
      setSelectedLenderPerSource({
        hmda: hmdaCands[0]?.value || null,
        cra: craCands[0]?.value || null,
        branch: branchCands[0]?.value || null,
        fdic: fdicCands[0]?.value || null,
        ncua: ncuaCands[0]?.value || null,
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [orgName, selectedOrgType, selectedStates, filteredHmdaList, filteredCraList, filteredBranchList]);

  // States for step 3
  const uniqueStates = useMemo(() =>
    [...new Set(geoData.map(item => item.st || item.state))].filter(Boolean).sort(),
  [geoData]);

  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  // Navigation helpers
  const canAdvance = () => {
    if (currentStep === 1) return orgName.trim().length >= 3;
    if (currentStep === 2) return !!selectedOrgType;
    if (currentStep === 3) return selectedStates.length > 0;
    return true;
  };

  const nextStep = () => {
    if (!canAdvance()) return alert('Please complete the current step');
    setCurrentStep(p => Math.min(p + 1, 4));
  };

  const prevStep = () => setCurrentStep(p => Math.max(p - 1, 1));

  const handleSave = () => {
    console.log({
      name: orgName.trim(),
      type: selectedOrgType,
      states: selectedStates,
      links: selectedLenderPerSource,
    });
    alert('Saved! (TODO: send to backend)');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div>
            <h2>Step 1 – Organization Name</h2>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. XYZ Savings Bank"
              style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '6px' }}
            />
          </div>
        );

      case 2:
        return (
          <div>
            <h2>Step 2 – Organization Type</h2>
            <select
              value={selectedOrgType}
              onChange={e => setSelectedOrgType(e.target.value)}
              style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '6px' }}
            >
              <option value="">-- Select --</option>
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
              value={stateOptions.filter(opt => selectedStates.includes(opt.value))}
              onChange={opts => setSelectedStates(opts ? opts.map(o => o.value) : [])}
              placeholder="Select state(s)..."
            />
          </div>
        );

      case 4:
        return (
          <div>
            <h2>Step 4 – Database Connections</h2>

            <p style={{ marginBottom: '16px' }}>
              Best matches found for <strong>{orgName.trim() || 'your organization'}</strong>:
            </p>

            <div style={{
              padding: '16px',
              background: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
              marginBottom: '32px',
              fontSize: '15px',
              lineHeight: '1.6'
            }}>
              <div>
                <strong>HMDA Match</strong> - {orgMatches.hmda ? orgMatches.hmda.label.split(' – ')[0] + ' ' + Math.round(orgMatches.hmda.score * 100) + '%' : 'No strong match found'}
              </div>
              <div>
                <strong>CRA Match</strong> - {orgMatches.cra ? orgMatches.cra.label.split(' – ')[0] + ' ' + Math.round(orgMatches.cra.score * 100) + '%' : 'No strong match found'}
              </div>
              <div>
                <strong>Branch Match</strong> - {orgMatches.branch ? orgMatches.branch.label.split(' – ')[0] + ' ' + Math.round(orgMatches.branch.score * 100) + '%' : 'No strong match found'}
              </div>
              <div>
                <strong>FDIC Match</strong> - {orgMatches.fdic ? orgMatches.fdic.label.split(' (RSSD')[0] + ' ' + Math.round(orgMatches.fdic.score * 100) + '%' : 'No strong match found'}
              </div>
              <div>
                <strong>NCUA Match</strong> - {orgMatches.ncua ? orgMatches.ncua.label.split(' (Charter')[0] + ' ' + Math.round(orgMatches.ncua.score * 100) + '%' : 'No strong match found'}
              </div>
            </div>

            <p style={{ fontWeight: '500', margin: '0 0 16px 0' }}>
              Use the drop down lists below to override the matches
            </p>

            {['hmda', 'cra', 'branch', 'fdic', 'ncua'].map(key => (
              <div key={key} style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase' }}>
                  {key}
                </label>
                <select
                  value={selectedLenderPerSource[key] || ''}
                  onChange={e => setSelectedLenderPerSource(prev => ({
                    ...prev,
                    [key]: e.target.value || null
                  }))}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  <option value="">— Do not link / None —</option>
                  {candidates[key].map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px' }}>
      <h1>Create Account</h1>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '32px 0' }}>
        {[1,2,3,4].map(s => (
          <div
            key={s}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: currentStep >= s ? '#0066cc' : '#e0e0e0',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            {s}
          </div>
        ))}
      </div>

      {renderStep()}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '48px' }}>
        {currentStep > 1 && (
          <button
            onClick={prevStep}
            style={{ padding: '12px 28px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px' }}
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
              marginLeft: 'auto',
              cursor: canAdvance() ? 'pointer' : 'not-allowed'
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            style={{ padding: '12px 28px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', marginLeft: 'auto' }}
          >
            Save & Continue
          </button>
        )}
      </div>
    </div>
  );
}
