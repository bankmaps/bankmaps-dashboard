"use client";

import { useState, useEffect, useMemo } from "react";
import Select from "react-select";

// ── Types ─────────────────────────────────────────────────
interface Affiliate {
  name: string;
  type: string;
  state: string;
  hmda_lender_id: string | null;
  hmda_lender_name: string | null;
}

interface Geography {
  name: string;
  type: string;
  state: string[];
  county: string[];
  town: string[];
  tract_number: string[];
}

// ── Levenshtein similarity ────────────────────────────────
const similarity = (a: string, b: string): number => {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (!a.length || !b.length) return 0;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++)
    for (let i = 1; i <= a.length; i++) {
      const ind = a[i-1] === b[j-1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i-1]+1, matrix[j-1][i]+1, matrix[j-1][i-1]+ind);
    }
  return 1 - matrix[b.length][a.length] / Math.max(a.length, b.length);
};

const SOURCE_CONFIG: Record<string, { sources: string[]; labels: Record<string, string> }> = {
  Bank:             { sources: ['hmda','cra','branch','fdic'],  labels: { hmda:'HMDA', cra:'CRA', branch:'Branch', fdic:'FDIC' } },
  'Credit Union':   { sources: ['hmda','branch','ncua'],        labels: { hmda:'HMDA', branch:'Branch', ncua:'NCUA' } },
  'Mortgage Company':{ sources: ['hmda'],                       labels: { hmda:'HMDA' } },
};

const AFFILIATE_TYPES = ['Mortgage', 'Consumer Finance', 'Commercial Finance', 'Other'];

export default function ManageProfile() {
  const token = typeof window !== 'undefined' ? localStorage.getItem("jwt_token") || "" : "";

  // ── Loading / status ──────────────────────────────────
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  // ── User ──────────────────────────────────────────────
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [subscription, setSubscription] = useState("active");

  // ── Org ───────────────────────────────────────────────
  const [orgId, setOrgId]       = useState<number | null>(null);
  const [orgName, setOrgName]   = useState("");
  const [orgType, setOrgType]   = useState("");
  const [regulator, setRegulator] = useState("");
  const [orgStates, setOrgStates] = useState<string[]>([]);
  const [customContext, setCustomContext] = useState("");

  // ── Linked sources ────────────────────────────────────
  const [linkedSources, setLinkedSources] = useState<Record<string, string | null>>({});
  const [linkedCandidates, setLinkedCandidates] = useState<Record<string, any[]>>({});

  // ── Affiliates ────────────────────────────────────────
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [showAddAffiliate, setShowAddAffiliate] = useState(false);
  const [newAffiliate, setNewAffiliate] = useState<Affiliate>({ name:'', type:'', state:'', hmda_lender_id:null, hmda_lender_name:null });
  const [affiliateCandidates, setAffiliateCandidates] = useState<any[]>([]);
  const [affiliateMatch, setAffiliateMatch] = useState<any>(null);
  const [affiliateOverride, setAffiliateOverride] = useState<string | null>(null);

  // ── Geographies ───────────────────────────────────────
  const [geographies, setGeographies]     = useState<Geography[]>([]);
  const [editingGeoIdx, setEditingGeoIdx] = useState<number | null>(null);
  const [editingGeo, setEditingGeo]       = useState<Geography | null>(null);
  const [showAddGeo, setShowAddGeo]       = useState(false);
  const [newGeo, setNewGeo]               = useState<Geography>({ name:'', type:'', state:[], county:[], town:[], tract_number:[] });

  // ── Reference data ────────────────────────────────────
  const [hmdaList, setHmdaList]     = useState<any[]>([]);
  const [craList, setCraList]       = useState<any[]>([]);
  const [branchList, setBranchList] = useState<any[]>([]);
  const [fdicList, setFdicList]     = useState<any[]>([]);
  const [ncuaList, setNcuaList]     = useState<any[]>([]);
  const [hqStates, setHqStates]     = useState<any[]>([]);
  const [geoList, setGeoList]       = useState<any[]>([]);

  // ── Load reference data ───────────────────────────────
  useEffect(() => {
    fetch('/data/hmda_list.json').then(r=>r.json()).then(j=>setHmdaList(j.data||[]));
    fetch('/data/cra_list.json').then(r=>r.json()).then(j=>setCraList(j.data||[]));
    fetch('/data/branch_list.json').then(r=>r.json()).then(j=>setBranchList(j.data||[]));
    fetch('/data/fdic_list.json').then(r=>r.json()).then(j=>setFdicList(j.data||[]));
    fetch('/data/ncua_list.json').then(r=>r.json()).then(j=>setNcuaList(j.data||[]));
    fetch('/data/hqstate_list.json').then(r=>r.json()).then(j=>setHqStates(j.data||[]));
    fetch('/data/geographies.json').then(r=>r.json()).then(j=>setGeoList(j.data||j||[]));
  }, []);

  // ── Load profile ──────────────────────────────────────
  useEffect(() => {
    if (!token) { setError("No authentication token"); setLoading(false); return; }
    const load = async () => {
      try {
        const [userRes, orgRes] = await Promise.all([
          fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/organizations", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!userRes.ok || !orgRes.ok) throw new Error("Failed to load profile");
        const userData = await userRes.json();
        const orgData  = await orgRes.json();

        setName(userData.name || "");
        setEmail(userData.email || "");
        setSubscription(userData.ai_subscription || "inactive");

        const org = orgData.organizations?.[0] || {};
        setOrgId(org.id || null);
        setOrgName(org.name || "");
        setOrgType(org.type || "");
        setRegulator(org.regulator || "");
        setOrgStates(org.states || []);
        setGeographies(org.geographies || []);
        setLinkedSources(org.linked_sources || {});
        setAffiliates(org.affiliates || []);
        setCustomContext(org.custom_context || "");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // ── Build linked source candidates when orgType or lists load ─
  useEffect(() => {
    if (!orgType) return;
    const config = SOURCE_CONFIG[orgType];
    if (!config) return;
    const listMap: Record<string, any[]> = { hmda: hmdaList, cra: craList, branch: branchList, fdic: fdicList, ncua: ncuaList };
    const cands: Record<string, any[]> = {};
    config.sources.forEach(key => {
      cands[key] = (listMap[key] || [])
        .map((item: any) => ({
          label: `${item.lender} (${item.lender_state})`,
          value: item.lender_id,
        }))
        .sort((a: any, b: any) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
    });
    setLinkedCandidates(cands);
  }, [orgType, hmdaList, craList, branchList, fdicList, ncuaList]);

  // ── Affiliate fuzzy match ─────────────────────────────
  useEffect(() => {
    const { name: affName, state: affState } = newAffiliate;
    if (!affName.trim() || !affState) { setAffiliateCandidates([]); setAffiliateMatch(null); setAffiliateOverride(null); return; }
    const timer = setTimeout(() => {
      const filtered = hmdaList.filter((i: any) => i.lender_state === affState);
      const scored = filtered.map((item: any) => ({
        label: `${item.lender} (${item.lender_state})`,
        value: item.lender_id,
        lender: item.lender,
        score: similarity(affName, item.lender),
      }));
      const sorted = [...scored].sort((a,b) => b.score - a.score);
      setAffiliateCandidates([...scored].sort((a,b) => a.label.localeCompare(b.label,'en',{sensitivity:'base'})));
      setAffiliateMatch(sorted[0] || null);
      setAffiliateOverride(sorted[0]?.value || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [newAffiliate.name, newAffiliate.state, hmdaList]);

  // ── State options ─────────────────────────────────────
  const stateOptions = useMemo(() => {
    const unique = [...new Set(hqStates.map((i:any) => i.state_abbrev?.trim()).filter(Boolean))].sort() as string[];
    return unique.map(abbrev => {
      const entry = hqStates.find((i:any) => i.state_abbrev === abbrev);
      return { value: abbrev, label: entry?.state_name || abbrev };
    });
  }, [hqStates]);

  // ── Geography cascade options ─────────────────────────
  const geoStateOptions = useMemo(() => {
    const unique = [...new Set(geoList.map((i:any) => i.state?.trim()).filter(Boolean))].sort() as string[];
    return unique.map(s => ({ value: s, label: s }));
  }, [geoList]);

  const countyOptions = (selectedStates: string[]) => {
    if (!selectedStates.length) return [];
    const filtered = geoList.filter((i:any) => selectedStates.includes(i.state));
    const unique = [...new Set(filtered.map((i:any) => i.county?.trim()).filter(Boolean))].sort() as string[];
    return [{ value:'__ALL__', label:'All Counties' }, ...unique.map(c => ({ value:c, label:c }))];
  };

  const townOptions = (selectedStates: string[], selectedCounties: string[]) => {
    if (!selectedStates.length || !selectedCounties.length) return [];
    const counties = selectedCounties.includes('__ALL__')
      ? [...new Set(geoList.map((i:any) => i.county?.trim()).filter(Boolean))] as string[]
      : selectedCounties;
    const filtered = geoList.filter((i:any) => selectedStates.includes(i.state?.trim()) && counties.includes(i.county?.trim()));
    const unique = [...new Set(filtered.map((i:any) => i.town?.trim()).filter(Boolean))].sort() as string[];
    return [{ value:'__ALL__', label:'All Towns' }, ...unique.map(t => ({ value:t, label:t }))];
  };

  const tractOptions = (selectedStates: string[], selectedCounties: string[], selectedTowns: string[]) => {
    if (!selectedStates.length || !selectedCounties.length || !selectedTowns.length) return [];
    const counties = selectedCounties.includes('__ALL__') ? [...new Set(geoList.map((i:any) => i.county?.trim()).filter(Boolean))] as string[] : selectedCounties;
    const towns = selectedTowns.includes('__ALL__') ? [...new Set(geoList.map((i:any) => i.town?.trim()).filter(Boolean))] as string[] : selectedTowns;
    const filtered = geoList.filter((i:any) =>
      selectedStates.includes(i.state?.trim()) &&
      counties.includes(i.county?.trim()) &&
      towns.includes(i.town?.trim())
    );
    const unique = [...new Set(filtered.map((i:any) => i.tract_number?.trim()).filter(Boolean))].sort() as string[];
    return [{ value:'__ALL__', label:'All Tracts' }, ...unique.map(t => ({ value:t, label:t }))];
  };

  // ── Save ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!token || !orgId) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      // Save user fields
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email }),
      });
      // Save org fields
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          org_id: orgId,
          name: orgName,
          type: orgType,
          regulator,
          states: orgStates,
          geographies,
          linked_sources: linkedSources,
          affiliates,
          custom_context: customContext,
        }),
      });
      if (!res.ok) throw new Error("Failed to save organization");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Geo helpers ───────────────────────────────────────
  const handleDeleteGeo = (idx: number) => setGeographies(prev => prev.filter((_,i) => i !== idx));

  const handleEditGeo = (idx: number) => {
    setEditingGeoIdx(idx);
    setEditingGeo({ ...geographies[idx] });
  };

  const handleSaveGeo = () => {
    if (!editingGeo || editingGeoIdx === null) return;
    setGeographies(prev => prev.map((g,i) => i === editingGeoIdx ? editingGeo : g));
    setEditingGeoIdx(null);
    setEditingGeo(null);
  };

  const handleAddGeo = () => {
    if (!newGeo.name.trim() || !newGeo.type) return;
    setGeographies(prev => [...prev, newGeo]);
    setNewGeo({ name:'', type:'', state:[], county:[], town:[], tract_number:[] });
    setShowAddGeo(false);
  };

  // ── Affiliate helpers ─────────────────────────────────
  const handleAddAffiliate = () => {
    if (!newAffiliate.name.trim() || !newAffiliate.type || !newAffiliate.state) return;
    const hmdaName = affiliateCandidates.find(c => c.value === affiliateOverride)?.lender || affiliateMatch?.lender || null;
    setAffiliates(prev => [...prev, { ...newAffiliate, hmda_lender_id: affiliateOverride || null, hmda_lender_name: hmdaName }]);
    setNewAffiliate({ name:'', type:'', state:'', hmda_lender_id:null, hmda_lender_name:null });
    setAffiliateMatch(null); setAffiliateOverride(null); setAffiliateCandidates([]);
    setShowAddAffiliate(false);
  };

  // ── Geo cascade form (reused for add and edit) ────────
  const GeoForm = ({ geo, setGeo, onSave, onCancel, saveLabel }: {
    geo: Geography; setGeo: (g: Geography) => void;
    onSave: () => void; onCancel: () => void; saveLabel: string;
  }) => {
    const co = countyOptions(geo.state);
    const to = townOptions(geo.state, geo.county);
    const tr = tractOptions(geo.state, geo.county, geo.town);
    return (
      <div style={{ display:'grid', gap:'16px' }}>
        <div>
          <label style={labelStyle}>Geography Name *</label>
          <input value={geo.name} onChange={e => setGeo({...geo, name:e.target.value})}
            style={inputStyle} placeholder="e.g. Boston Assessment Area" />
        </div>
        <div>
          <label style={labelStyle}>Type *</label>
          <select value={geo.type} onChange={e => setGeo({...geo, type:e.target.value})} style={inputStyle}>
            <option value="">— Select —</option>
            <option>Assessment Area</option><option>REMA</option><option>Other</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>State</label>
          <Select isMulti options={geoStateOptions}
            value={geoStateOptions.filter(o => geo.state.includes(o.value))}
            onChange={opts => setGeo({...geo, state:opts?opts.map(o=>o.value):[], county:[], town:[], tract_number:[]})}
            placeholder="Select states..." />
        </div>
        <div>
          <label style={labelStyle}>County</label>
          <Select isMulti options={co} isDisabled={!geo.state.length}
            value={co.filter(o => geo.county.includes(o.value))}
            onChange={opts => {
              let v = opts ? opts.map(o=>o.value) : [];
              if (v.includes('__ALL__')) v = ['__ALL__'];
              setGeo({...geo, county:v, town:[], tract_number:[]});
            }} placeholder="Select counties..." />
        </div>
        <div>
          <label style={labelStyle}>Town / City</label>
          <Select isMulti options={to} isDisabled={!geo.county.length}
            value={to.filter(o => geo.town.includes(o.value))}
            onChange={opts => {
              let v = opts ? opts.map(o=>o.value) : [];
              if (v.includes('__ALL__')) v = ['__ALL__'];
              setGeo({...geo, town:v, tract_number:[]});
            }} placeholder="Select towns..." />
        </div>
        <div>
          <label style={labelStyle}>Census Tract</label>
          <Select isMulti options={tr} isDisabled={!geo.town.length}
            value={tr.filter(o => geo.tract_number.includes(o.value))}
            onChange={opts => {
              let v = opts ? opts.map(o=>o.value) : [];
              if (v.includes('__ALL__')) v = ['__ALL__'];
              setGeo({...geo, tract_number:v});
            }} placeholder="Select tracts..." />
        </div>
        <div style={{ display:'flex', gap:'12px', marginTop:'8px' }}>
          <button onClick={onSave} style={btnPrimary}>{saveLabel}</button>
          <button onClick={onCancel} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    );
  };

  // ── Styles ────────────────────────────────────────────
  const labelStyle: React.CSSProperties = { display:'block', fontSize:'13px', fontWeight:500, color:'#374151', marginBottom:'6px' };
  const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:'6px', fontSize:'14px', boxSizing:'border-box' };
  const sectionStyle: React.CSSProperties = { marginBottom:'32px', background:'white', padding:'24px', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)', border:'1px solid #e5e7eb' };
  const btnPrimary: React.CSSProperties = { padding:'10px 24px', background:'#0d9488', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:500, fontSize:'14px' };
  const btnSecondary: React.CSSProperties = { padding:'10px 24px', background:'white', color:'#6b7280', border:'1px solid #d1d5db', borderRadius:'6px', cursor:'pointer', fontSize:'14px' };
  const btnDanger: React.CSSProperties = { padding:'6px 14px', background:'white', color:'#dc2626', border:'1px solid #dc2626', borderRadius:'6px', cursor:'pointer', fontSize:'13px' };
  const btnEdit: React.CSSProperties = { padding:'6px 14px', background:'white', color:'#0d9488', border:'1px solid #0d9488', borderRadius:'6px', cursor:'pointer', fontSize:'13px' };

  const config = SOURCE_CONFIG[orgType] || { sources:[], labels:{} };

  if (loading) return <div style={{ padding:'48px', textAlign:'center', color:'#6b7280' }}>Loading profile...</div>;

  return (
    <div style={{ maxWidth:'800px', margin:'0 auto', padding:'32px 24px' }}>
      <h1 style={{ fontSize:'28px', fontWeight:700, marginBottom:'32px', color:'#111827' }}>Manage Profile</h1>

      {error && <div style={{ marginBottom:'24px', padding:'14px', background:'#fef2f2', color:'#dc2626', borderRadius:'8px', border:'1px solid #fecaca' }}>{error}</div>}
      {success && <div style={{ marginBottom:'24px', padding:'14px', background:'#f0fdf4', color:'#16a34a', borderRadius:'8px', border:'1px solid #bbf7d0' }}>✅ Profile saved successfully!</div>}

      {/* ── Personal Information ── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'20px', color:'#111827' }}>Personal Information</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <p style={{ marginTop:'12px', fontSize:'13px', color:'#6b7280' }}>Subscription: <strong>{subscription}</strong></p>
      </section>

      {/* ── Organization Information ── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'20px', color:'#111827' }}>Organization Information</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'20px' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input value={orgName} onChange={e=>setOrgName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={orgType} onChange={e=>setOrgType(e.target.value)} style={inputStyle}>
              <option value="">Select Type</option>
              <option>Bank</option><option>Credit Union</option><option>Mortgage Company</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Regulator</label>
            <select value={regulator} onChange={e=>setRegulator(e.target.value)} style={inputStyle}>
              <option value="">Select Regulator</option>
              {['FDIC','FED','OCC','NCUA','Non-Bank'].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Headquarters State(s)</label>
            <Select isMulti options={stateOptions}
              value={stateOptions.filter(o => orgStates.includes(o.value))}
              onChange={opts => setOrgStates(opts ? opts.map(o=>o.value) : [])}
              placeholder="Select states..." />
          </div>
        </div>
      </section>

      {/* ── Linked Sources ── */}
      {config.sources.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'8px', color:'#111827' }}>Linked Sources</h2>
          <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'20px' }}>Override the database IDs linked to this organization.</p>
          <div style={{ display:'grid', gap:'16px' }}>
            {config.sources.map(key => (
              <div key={key}>
                <label style={labelStyle}>{config.labels[key]}</label>
                <select
                  value={linkedSources[key] || ''}
                  onChange={e => setLinkedSources(prev => ({ ...prev, [key]: e.target.value || null }))}
                  style={inputStyle}
                >
                  <option value="">— None / Unlinked —</option>
                  {(linkedCandidates[key] || []).map((opt:any) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {linkedSources[key] && (
                  <p style={{ fontSize:'12px', color:'#6b7280', marginTop:'4px' }}>
                    Current ID: <code>{linkedSources[key]}</code>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Affiliates ── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'8px', color:'#111827' }}>Affiliates</h2>
        <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'20px' }}>Lending affiliates whose HMDA data is included in reporting.</p>

        {affiliates.length > 0 && (
          <div style={{ marginBottom:'20px', display:'grid', gap:'10px' }}>
            {affiliates.map((aff, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px' }}>
                <div>
                  <span style={{ fontWeight:600 }}>{aff.name}</span>
                  <span style={{ color:'#6b7280', fontSize:'13px' }}> · {aff.type} · {aff.state}</span>
                  {aff.hmda_lender_name && <span style={{ color:'#0d9488', fontSize:'13px' }}> · HMDA: {aff.hmda_lender_name}</span>}
                </div>
                <button onClick={() => setAffiliates(prev => prev.filter((_,idx) => idx !== i))} style={btnDanger}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {!showAddAffiliate ? (
          <button onClick={() => setShowAddAffiliate(true)} style={btnEdit}>+ Add Affiliate</button>
        ) : (
          <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'20px', display:'grid', gap:'16px' }}>
            <div>
              <label style={labelStyle}>Affiliate Name *</label>
              <input value={newAffiliate.name} onChange={e => setNewAffiliate(p=>({...p,name:e.target.value}))} style={inputStyle} placeholder="e.g. ABC Mortgage LLC" />
            </div>
            <div>
              <label style={labelStyle}>Type of Affiliate *</label>
              <select value={newAffiliate.type} onChange={e => setNewAffiliate(p=>({...p,type:e.target.value}))} style={inputStyle}>
                <option value="">— Select —</option>
                {AFFILIATE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Headquarters State *</label>
              <Select options={stateOptions}
                value={stateOptions.find(o=>o.value===newAffiliate.state)||null}
                onChange={opt => setNewAffiliate(p=>({...p,state:opt?.value||''}))}
                placeholder="Select state..." isClearable />
            </div>
            {newAffiliate.name.trim().length >= 2 && newAffiliate.state && (
              <div>
                <label style={labelStyle}>HMDA Match</label>
                {affiliateMatch && (
                  <div style={{ padding:'8px 12px', background:'#e0f2fe', border:'1px solid #bae6fd', borderRadius:'6px', fontSize:'13px', marginBottom:'8px' }}>
                    Best match: <strong>{affiliateMatch.lender}</strong> ({Math.round(affiliateMatch.score*100)}% similarity)
                  </div>
                )}
                <select value={affiliateOverride||''} onChange={e=>setAffiliateOverride(e.target.value||null)} style={inputStyle}>
                  <option value="">— Skip / No HMDA link —</option>
                  {affiliateCandidates.map((c:any) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', gap:'12px' }}>
              <button onClick={handleAddAffiliate}
                disabled={!newAffiliate.name.trim() || !newAffiliate.type || !newAffiliate.state}
                style={{ ...btnPrimary, opacity: (!newAffiliate.name.trim()||!newAffiliate.type||!newAffiliate.state)?0.5:1 }}>
                + Add
              </button>
              <button onClick={() => setShowAddAffiliate(false)} style={btnSecondary}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Geographies ── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'8px', color:'#111827' }}>Geographies</h2>
        <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'20px' }}>Assessment areas and other geographic zones for this organization.</p>

        {geographies.length === 0 && !showAddGeo && (
          <p style={{ color:'#9ca3af', fontStyle:'italic', marginBottom:'16px' }}>No geographies added yet.</p>
        )}

        <div style={{ display:'grid', gap:'12px', marginBottom:'20px' }}>
          {geographies.map((geo, idx) => (
            <div key={idx} style={{ border:'1px solid #e5e7eb', borderRadius:'8px', overflow:'hidden' }}>
              {editingGeoIdx === idx ? (
                <div style={{ padding:'20px' }}>
                  <h4 style={{ fontWeight:600, marginBottom:'16px', color:'#111827' }}>Edit Geography</h4>
                  {editingGeo && (
                    <GeoForm geo={editingGeo} setGeo={setEditingGeo} onSave={handleSaveGeo}
                      onCancel={() => { setEditingGeoIdx(null); setEditingGeo(null); }} saveLabel="Save Changes" />
                  )}
                </div>
              ) : (
                <div style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', background:'#f9fafb' }}>
                  <div>
                    <p style={{ fontWeight:600, color:'#111827', marginBottom:'2px' }}>{geo.name}</p>
                    <p style={{ fontSize:'13px', color:'#6b7280' }}>{geo.type}</p>
                    <p style={{ fontSize:'12px', color:'#9ca3af', marginTop:'4px' }}>
                      States: {geo.state?.join(', ')||'—'} &nbsp;·&nbsp;
                      Counties: {geo.county?.includes('__ALL__')?'All':geo.county?.join(', ')||'—'} &nbsp;·&nbsp;
                      Towns: {geo.town?.includes('__ALL__')?'All':geo.town?.join(', ')||'—'}
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:'8px', flexShrink:0, marginLeft:'16px' }}>
                    <button onClick={() => handleEditGeo(idx)} style={btnEdit}>Edit</button>
                    <button onClick={() => handleDeleteGeo(idx)} style={btnDanger}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {!showAddGeo ? (
          <button onClick={() => setShowAddGeo(true)} style={btnEdit}>+ Add Geography</button>
        ) : (
          <div style={{ border:'1px solid #e5e7eb', borderRadius:'8px', padding:'20px' }}>
            <h4 style={{ fontWeight:600, marginBottom:'16px', color:'#111827' }}>New Geography</h4>
            <GeoForm geo={newGeo} setGeo={setNewGeo} onSave={handleAddGeo}
              onCancel={() => { setShowAddGeo(false); setNewGeo({ name:'', type:'', state:[], county:[], town:[], tract_number:[] }); }}
              saveLabel="Add Geography" />
          </div>
        )}
      </section>

      {/* ── Custom Context ── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'8px', color:'#111827' }}>Custom Context</h2>
        <p style={{ fontSize:'13px', color:'#6b7280', marginBottom:'12px' }}>Additional notes or context about this organization.</p>
        <textarea value={customContext} onChange={e=>setCustomContext(e.target.value)} rows={4}
          style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit' }}
          placeholder="e.g. Focus on affordable housing in rural areas..." />
      </section>

      {/* ── Save ── */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'12px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ ...btnPrimary, opacity:saving?0.7:1, padding:'12px 32px', fontSize:'15px', display:'flex', alignItems:'center', gap:'8px' }}>
          {saving && <span style={{ width:'14px', height:'14px', border:'2px solid white', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.6s linear infinite' }} />}
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
