'use client';

import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

/* ---------------- similarity helper ---------------- */
const similarity = (a, b) => {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (!a || !b) return 0;
  const m = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[0][i] = i;
  for (let j = 0; j <= b.length; j++) m[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[j][i] = Math.min(
        m[j][i - 1] + 1,
        m[j - 1][i] + 1,
        m[j - 1][i - 1] + cost
      );
    }
  }
  return 1 - m[b.length][a.length] / Math.max(a.length, b.length);
};

/* =================================================== */

export default function Page() {
  const [currentStep, setCurrentStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [selectedOrgType, setSelectedOrgType] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);

  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);
  const [geoData, setGeoData] = useState([]);

  const [candidates, setCandidates] = useState({});
  const [orgMatches, setOrgMatches] = useState({});
  const [selectedLenderPerSource, setSelectedLenderPerSource] = useState({});

  /* ---------------- fetch static data ---------------- */
  useEffect(() => {
    fetch('/data/hmda_list.json').then(r => r.json()).then(j => setHmdaList(j.data || []));
    fetch('/data/cra_list.json').then(r => r.json()).then(j => setCraList(j.data || []));
    fetch('/data/branch_list.json').then(r => r.json()).then(j => setBranchList(j.data || []));
    fetch('/data/geographies.json').then(r => r.json()).then(j => setGeoData(j.data || []));
  }, []);

  /* ---------------- org-type rules ---------------- */
  const sourceConfig = useMemo(() => {
    switch (selectedOrgType) {
      case 'Bank':
        return { hmda: true, cra: true, branch: true, fdic: true };
      case 'Credit Union':
        return { hmda: true, branch: true, ncua: true };
      case 'Mortgage Company':
        return { hmda: true };
      default:
        return {};
    }
  }, [selectedOrgType]);

  /* ---------------- state filters ---------------- */
  const byState = list =>
    selectedStates.length === 0 ? list : list.filter(i => selectedStates.includes(i.lender_state));

  /* ---------------- matching engine ---------------- */
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!orgName || !selectedOrgType || selectedStates.length === 0) {
        setCandidates({});
        setOrgMatches({});
        setSelectedLenderPerSource({});
        return;
      }

      const buildLocal = list =>
        list.map(i => ({
          label: `${i.lender} (${i.lender_state} – ${i.regulator || '?'})`,
          value: i.lender_id,
          score: similarity(orgName, i.lender),
        }));

      const nextCandidates = {};
      const nextMatches = {};
      const nextSelected = {};

      if (sourceConfig.hmda) {
        const arr = buildLocal(byState(hmdaList));
        nextCandidates.hmda = arr;
        nextMatches.hmda = arr.sort((a,b)=>b.score-a.score)[0] || null;
        nextSelected.hmda = nextMatches.hmda?.value || null;
      }

      if (sourceConfig.cra) {
        const arr = buildLocal(byState(craList));
        nextCandidates.cra = arr;
        nextMatches.cra = arr.sort((a,b)=>b.score-a.score)[0] || null;
        nextSelected.cra = nextMatches.cra?.value || null;
      }

      if (sourceConfig.branch) {
        const arr = buildLocal(byState(branchList));
        nextCandidates.branch = arr;
        nextMatches.branch = arr.sort((a,b)=>b.score-a.score)[0] || null;
        nextSelected.branch = nextMatches.branch?.value || null;
      }

      if (sourceConfig.fdic) {
        try {
          const r = await fetch(
            `https://banks.data.fdic.gov/api/institutions?filters=NAME%20LIKE%20%22${encodeURIComponent(orgName)}%22&limit=25`
          );
          const d = await r.json();
          const arr = (d.data || []).map(i => ({
            label: i.data.NAME,
            value: i.data.RSSD,
            score: similarity(orgName, i.data.NAME),
          }));
          nextCandidates.fdic = arr;
          nextMatches.fdic = arr.sort((a,b)=>b.score-a.score)[0] || null;
          nextSelected.fdic = nextMatches.fdic?.value || null;
        } catch {}
      }

      if (sourceConfig.ncua) {
        try {
          const r = await fetch(
            `https://mapping.ncua.gov/api/cudata?name=like:${encodeURIComponent(orgName)}&limit=25`
          );
          const d = await r.json();
          const arr = (d || []).map(i => ({
            label: i.CU_Name,
            value: i.CU_Number,
            score: similarity(orgName, i.CU_Name),
          }));
          nextCandidates.ncua = arr;
          nextMatches.ncua = arr.sort((a,b)=>b.score-a.score)[0] || null;
          nextSelected.ncua = nextMatches.ncua?.value || null;
        } catch {}
      }

      setCandidates(nextCandidates);
      setOrgMatches(nextMatches);
      setSelectedLenderPerSource(nextSelected);
    }, 600);

    return () => clearTimeout(timer);
  }, [orgName, selectedOrgType, selectedStates, sourceConfig]);

  /* ---------------- UI helpers ---------------- */
  const uniqueStates = [...new Set(geoData.map(i => i.st || i.state))].filter(Boolean).sort();
  const stateOptions = uniqueStates.map(s => ({ value: s, label: s }));

  /* ---------------- Step 4 UI ---------------- */
  const renderConnections = () => (
    <>
      <h2>Step 4 – Database Connections</h2>

      <div style={{padding:16, background:'#f8f9fa', border:'1px solid #ddd', borderRadius:8}}>
        {Object.keys(sourceConfig).map(k => (
          <div key={k}>
            <strong>{k.toUpperCase()} Match</strong> —{' '}
            {orgMatches[k]
              ? `${orgMatches[k].label} ${Math.round(orgMatches[k].score * 100)}%`
              : 'No strong match'}
          </div>
        ))}
      </div>

      {Object.keys(sourceConfig).map(k => (
        <div key={k} style={{marginTop:20}}>
          <label style={{fontWeight:600}}>{k.toUpperCase()}</label>
          <select
            value={selectedLenderPerSource[k] || ''}
            onChange={e =>
              setSelectedLenderPerSource(p => ({ ...p, [k]: e.target.value || null }))
            }
            style={{width:'100%', padding:10}}
          >
            <option value="">— Do not link / None —</option>
            {(candidates[k] || []).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ))}
    </>
  );

  /* ---------------- main render ---------------- */
  return (
    <div style={{maxWidth:720, margin:'0 auto', padding:40}}>
      {currentStep === 1 && (
        <input value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Organization name" />
      )}

      {currentStep === 2 && (
        <select value={selectedOrgType} onChange={e=>setSelectedOrgType(e.target.value)}>
          <option value="">Select type</option>
          <option>Bank</option>
          <option>Credit Union</option>
          <option>Mortgage Company</option>
        </select>
      )}

      {currentStep === 3 && (
        <Select isMulti options={stateOptions}
          value={stateOptions.filter(o=>selectedStates.includes(o.value))}
          onChange={o=>setSelectedStates(o?o.map(x=>x.value):[])}
        />
      )}

      {currentStep === 4 && renderConnections()}
    </div>
  );
}
