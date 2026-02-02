'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

// Case-insensitive Levenshtein similarity (used internally only)
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

  useEffect(() => {
    fetch('/data/hmda_list.json').then(r => r.json()).then(j => setHmdaList(j.data || []));
    fetch('/data/cra_list.json').then(r => r.json()).then(j => setCraList(j.data || []));
    fetch('/data/branch_list.json').then(r => r.json()).then(j => setBranchList(j.data || []));
    fetch('/data/geographies.json').then(r => r.json()).then(j => setGeoData(j.data || []));
  }, []);

  const filteredHmdaList = useMemo(() =>
    selectedStates.length === 0 ? hmdaList : hmdaList.filter(i => selectedStates.includes(i.lender_state)),
  [selectedStates, hmdaList]);

  const filteredCraList = useMemo(() =>
    selectedStates.length === 0 ? craList : craList.filter(i => selectedStates.includes(i.lender_state)),
  [selectedStates, craList]);

  const filteredBranchList = useMemo(() =>
    selectedStates.length === 0 ? branchList : branchList.filter(i => selectedStates.includes(i.lender_state)),
  [selectedStates, branchList]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName.trim() || !selectedOrgType || selectedStates.length === 0) {
        setOrgMatches({ hmda: null, cra: null, branch: null, fdic: null, ncua: null });
        setCandidates({ hmda: [], cra: [], branch: [], fdic: [], ncua: [] });
        return;
      }

      const formatLocal = list => list.map(item => ({
        label: `${item.lender} (${item.lender_state} – ${item.regulator || '?'})`,
        value: item.lender_id,
        score: similarity(orgName, item.lender), // internal only
      }));

      const hmdaCands = formatLocal(filteredHmdaList);
      const craCands  = formatLocal(filteredCraList);
      const branchCands = formatLocal(filteredBranchList);

      let fdicCands = [];
      try {
        const r = await fetch(`https://banks.data.fdic.gov/api/institutions?filters=NAME%20LIKE%20%22${encodeURIComponent(orgName)}%22&fields=NAME%2CRSSD%2CCITY%2CSTALP&limit=30`);
        const d = await r.json();
        fdicCands = (d.data || []).map(i => ({
          label: `${i.data.NAME} (RSSD ${i.data.RSSD}, ${i.data.CITY}, ${i.data.STALP})`,
          value: i.data.RSSD,
          score: similarity(orgName, i.data.NAME),
        }));
      } catch {}

      let ncuaCands = [];
      try {
        const r = await fetch(`https://mapping.ncua.gov/api/cudata?name=like:${encodeURIComponent(orgName)}&limit=30`);
        const d = await r.json();
        ncuaCands = (d || []).map(i => ({
          label: `${i.CU_Name} (Charter ${i.CU_Number}, ${i.City}, ${i.State})`,
          value: i.CU_Number,
          score: similarity(orgName, i.CU_Name),
        }));
      } catch {}

      const sortAlpha = arr => arr.sort((a,b) => a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}));

      setCandidates({
        hmda: sortAlpha(hmdaCands),
        cra: sortAlpha(craCands),
        branch: sortAlpha(branchCands),
        fdic: sortAlpha(fdicCands),
        ncua: sortAlpha(ncuaCands),
      });

      const best = arr => arr.sort((a,b) => b.score - a.score)[0] || null;

      setOrgMatches({
        hmda: best(hmdaCands),
        cra: best(craCands),
        branch: best(branchCands),
        fdic: best(fdicCands),
        ncua: best(ncuaCands),
      });

      setSelectedLenderPerSource({
        hmda: best(hmdaCands)?.value || null,
        cra: best(craCands)?.value || null,
        branch: best(branchCands)?.value || null,
        fdic: best(fdicCands)?.value || null,
        ncua: best(ncuaCands)?.value || null,
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [orgName, selectedOrgType, selectedStates, filteredHmdaList, filteredCraList, filteredBranchList]);

  const uniqueStates = useMemo(() =>
    [...new Set(geoData.map(i => i.st || i.state))].filter(Boolean).sort(),
  [geoData]);

  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  const canAdvance = () => {
    if (currentStep === 1) return orgName.trim().length >= 3;
    if (currentStep === 2) return !!selectedOrgType;
    if (currentStep === 3) return selectedStates.length > 0;
    return true;
  };

  const nextStep = () => {
    if (!canAdvance()) return alert('Please complete the current step.');
    setCurrentStep(p => Math.min(p + 1, 4));
  };

  const prevStep = () => setCurrentStep(p => Math.max(p - 1, 1));

  const handleSave = () => {
    console.log({ name: orgName.trim(), type: selectedOrgType, states: selectedStates, linked: selectedLenderPerSource });
    alert('Saved! (TODO: backend)');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return (
        <div>
          <h2>Step 1 – Organization Name</h2>
          <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
            placeholder="e.g. XYZ Savings Bank"
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }} />
        </div>
      );

      case 2: return (
        <div>
          <h2>Step 2 – Organization Type</h2>
          <select value={selectedOrgType} onChange={e => setSelectedOrgType(e.target.value)}
            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}>
            <option value="">-- Select Type --</option>
            <option value="Bank">Bank</option>
            <option value="Credit Union">Credit Union</option>
            <option value="Mortgage Company">Mortgage Company</option>
          </select>
        </div>
      );

      case 3: return (
        <div>
          <h2>Step 3 – Organization Headquarters State(s)</h2>
          <Select isMulti options={stateOptions}
            value={stateOptions.filter(opt => selectedStates.includes(opt.value))}
            onChange={opts => setSelectedStates(opts ? opts.map(o => o.value) : [])}
            placeholder="Select state(s)..." className="basic-multi-select" classNamePrefix="select" />
        </div>
      );

      case 4: return (
        <div>
          <h2>Step 4 – Database Connections</h2>

          <p style={{ marginBottom: '16px' }}>
            Best matches found for <strong>{orgName.trim() || 'your organization'}</strong>:
          </p>

          <div style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6', marginBottom: '32px', fontSize: '15px', lineHeight: '1.6' }}>
            <div><strong>HMDA Match</strong> - {orgMatches.hmda ? `${orgMatches.hmda.label.split(' – ')[0]} ${Math.round(orgMatches.hmda.score * 100)}%` : 'No strong match found'}</div>
            <div><strong>CRA Match</strong> - {orgMatches.cra ? `${orgMatches.cra.label.split(' – ')[0]} ${Math.round(orgMatches.cra.score * 100)}%` : 'No strong match found'}</div>
            <div><strong>Branch Match</strong> - {orgMatches.branch ? `${orgMatches.branch.label.split(' – ')[0]} ${Math.round(orgMatches.branch.score * 100)}%` : 'No strong match found'}</div>
            <div><strong>FDIC Match</strong> - {orgMatches.fdic ? `${orgMatches.fdic.label.split(' (RSSD')[0]} ${Math.round(orgMatches.fdic.score * 100)}%` : 'No strong match found'}</div>
            <div><strong>NCUA Match</strong> - {orgMatches.ncua ? `${orgMatches.ncua.label.split(' (Charter')[0]} ${Math.round(orgMatches.ncua.score * 100)}%` : 'No strong match found'}</div>
          </div>

          <p style={{ fontWeight: '500', margin: '0 0 20px 0' }}>
            Use the drop down lists below to override the matches
          </p>

          {['hmda','cra','branch','fdic','ncua'].map(key => (
            <div key={key} style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', textTransform: 'uppercase' }}>
                {key.toUpperCase()}
              </label>
              <select
                value={selectedLenderPerSource[key] || ''}
                onChange={e => setSelectedLenderPerSource(prev => ({ ...prev, [key]: e.target.value || null }))}
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

      default: return null;
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px' }}>
      <h1>Create Account</h1>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '32px 0' }}>
        {[1,2,3,4].map(s => (
          <div key={s} style={{
            width: '48px', height: '48px', borderRadius: '50%',
            background: currentStep >= s ? '#0066cc' : '#e0e0e0',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem'
          }}>{s}</div>
        ))}
      </div>

      {renderStep()}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '48px' }}>
        {currentStep > 1 && (
          <button onClick={prevStep} style={{ padding: '12px 28px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Back
          </button>
        )}
        {currentStep < 4 ? (
          <button onClick={nextStep} disabled={!canAdvance()} style={{
            padding: '12px 28px', background: canAdvance() ? '#0066cc' : '#ccc', color: 'white', border: 'none', borderRadius: '6px',
            marginLeft: 'auto', cursor: canAdvance() ? 'pointer' : 'not-allowed'
          }}>
            Next
          </button>
        ) : (
          <button onClick={handleSave} style={{ padding: '12px 28px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', marginLeft: 'auto', cursor: 'pointer' }}>
            Save & Continue
          </button>
        )}
      </div>
    </div>
  );
}
