'use client';

import { useSearchParams } from 'next/navigation';

//export default function CreateAccountPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    console.error('Missing token in URL');

    return (
      <div style={{ padding: 24 }}>
        <h2>Invalid or missing link</h2>
        <p>
          Your account creation link is missing a required token.
          Please check your email and try again.
        </p>
      </div>
    );
  }

  // ✅ normal page render continues here
  return (
    <div>
      {/* your existing step UI */}
    </div>
  );
}



import { useState, useMemo, useEffect } from 'react';
import Select from 'react-select';

export const dynamic = 'force-dynamic';

const similarity = (a, b) => {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a.length === 0 || b.length === 0) return 0;

  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));

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

const SOURCE_CONFIG = {
  Bank: {
    sources: ['hmda', 'cra', 'branch', 'fdic'],
    labels: {
      hmda: 'HMDA',
      cra: 'CRA',
      branch: 'Branch',
      fdic: 'FDIC',
    },
  },
  'Credit Union': {
    sources: ['hmda', 'branch', 'ncua'],
    labels: {
      hmda: 'HMDA',
      branch: 'Branch',
      ncua: 'NCUA',
    },
  },
  'Mortgage Company': {
    sources: ['hmda'],
    labels: {
      hmda: 'HMDA',
    },
  },
};

export default function Page() {
  const [currentStep, setCurrentStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [selectedOrgType, setSelectedOrgType] = useState('');
  const [selectedRegulator, setSelectedRegulator] = useState('');
  const [selectedStates, setSelectedStates] = useState([]);

  const [orgMatches, setOrgMatches] = useState({});
  const [candidates, setCandidates] = useState({});
  const [selectedLenderPerSource, setSelectedLenderPerSource] = useState({});

  const [hmdaList, setHmdaList] = useState([]);
  const [craList, setCraList] = useState([]);
  const [branchList, setBranchList] = useState([]);
  const [fdicList, setFdicList] = useState([]);
  const [ncuaList, setNcuaList] = useState([]);
  const [hqStates, setHqStates] = useState([]);

  // ── New state for Step 3 & 4 ─────────────────────────────
  const [geographies, setGeographies] = useState([]);       // e.g. selected counties, MSAs, etc.
  const [customContext, setCustomContext] = useState('');   // notes, tags, free text

  const [geographiesList, setGeographiesList] = useState([]);

  const [currentGeography, setCurrentGeography] = useState({
    state: [],  // now array
    county: [],
    town: [],
    tract_number: [],
  });

  const [geographyType, setGeographyType] = useState('');      // "Assessment Area" | "REMA" | "Other" | ""
  const [geographyName, setGeographyName] = useState('');      // free text
  
  const [selectedGeographies, setSelectedGeographies] = useState([]);   // array of complete geographies added
  
  useEffect(() => {
    fetch('/data/hmda_list.json')
      .then((r) => r.json())
      .then((j) => setHmdaList(j.data || []));

    fetch('/data/cra_list.json')
      .then((r) => r.json())
      .then((j) => setCraList(j.data || []));

    fetch('/data/branch_list.json')
      .then((r) => r.json())
      .then((j) => setBranchList(j.data || []));

    fetch('/data/fdic_list.json')
      .then((r) => r.json())
      .then((j) => setFdicList(j.data || []));

    fetch('/data/ncua_list.json')
      .then((r) => r.json())
      .then((j) => setNcuaList(j.data || []));

    fetch('/data/hqstate_list.json')
      .then((r) => r.json())
      .then((j) => setHqStates(j.data || []));

    fetch('/data/geographies.json')
  .then(r => r.json())
  .then(j => {
    const data = j.data || j || [];
    setGeographiesList(data);
    if (data.length > 0) console.log('Sample geography entry:', data[0]);  // debug here
  })
  .catch(err => console.error('Failed to load geographies:', err));
  }, []);

  const filteredHmdaList = useMemo(
    () =>
      selectedStates.length === 0
        ? hmdaList
        : hmdaList.filter((i) => selectedStates.includes(i.lender_state)),
    [selectedStates, hmdaList]
  );

  const filteredCraList = useMemo(
    () =>
      selectedStates.length === 0
        ? craList
        : craList.filter((i) => selectedStates.includes(i.lender_state)),
    [selectedStates, craList]
  );

  const filteredBranchList = useMemo(
    () =>
      selectedStates.length === 0
        ? branchList
        : branchList.filter((i) => selectedStates.includes(i.lender_state)),
    [selectedStates, branchList]
  );

  const filteredFdicList = useMemo(
    () =>
      selectedStates.length === 0
        ? fdicList
        : fdicList.filter((i) => selectedStates.includes(i.lender_state)),
    [selectedStates, fdicList]
  );

  const filteredNcuaList = useMemo(
    () =>
      selectedStates.length === 0
        ? ncuaList
        : ncuaList.filter((i) => selectedStates.includes(i.lender_state)),
    [selectedStates, ncuaList]
  );

  const geographyStateOptions = useMemo(() => {
    if (!geographiesList.length) return [];
    const unique = [...new Set(geographiesList.map(i => i.state?.trim()).filter(Boolean))].sort();
    return unique.map(s => ({ value: s, label: s }));
  }, [geographiesList]);

  const geographyCountyOptions = useMemo(() => {
    if (!currentGeography.state.length) return [];
    const filtered = geographiesList.filter(i => currentGeography.state.includes(i.state));
    const unique = [...new Set(filtered.map(i => i.county?.trim()).filter(Boolean))].sort();
    return [
      { value: '__ALL__', label: 'All Counties (in selected states)' },
      ...unique.map(c => ({ value: c, label: c })),
    ];
  }, [geographiesList, currentGeography.state]);

  const geographyTownOptions = useMemo(() => {
    console.log('--- Town options debug ---');
    console.log('Selected states:', currentGeography.state);
    console.log('Selected counties:', currentGeography.county);

    if (!currentGeography.state.length || !currentGeography.county.length) {
      console.log('No upstream selections → returning empty');
      return [];
    }

    let filtered = geographiesList;

    // Handle 'All' for counties
    const counties = currentGeography.county.includes('__ALL__')
      ? [...new Set(geographiesList.map(i => i.county?.trim()).filter(Boolean))]
      : currentGeography.county;

    filtered = filtered.filter(item => {
      const matchesState = currentGeography.state.includes(item.state?.trim() || '');
      const matchesCounty = counties.includes(item.county?.trim() || '');
      return matchesState && matchesCounty;
    });

    console.log('After state+county filter → items left:', filtered.length);

    const towns = filtered.map(item => item.town?.trim() || '').filter(Boolean);
    console.log('Raw town values found:', towns.slice(0, 10)); // first 10 for visibility

    const uniqueTowns = [...new Set(towns)].sort();

    const options = [
      { value: '__ALL__', label: 'All Towns (in selected counties)' },
      ...uniqueTowns.map(t => ({ value: t, label: t })),
    ];

    console.log('Final town options count:', options.length - 1); // exclude All
    console.log('First few options:', options.slice(1, 6));

    return options;
  }, [geographiesList, currentGeography.state, currentGeography.county]);

  const geographyTractOptions = useMemo(() => {
    if (!currentGeography.state.length || !currentGeography.county.length || !currentGeography.town.length) return [];

    let filtered = geographiesList;

    const counties = currentGeography.county.includes('__ALL__')
      ? [...new Set(geographiesList.map(i => i.county?.trim()).filter(Boolean))]
      : currentGeography.county;

    const towns = currentGeography.town.includes('__ALL__')
      ? [...new Set(geographiesList.map(i => i.town?.trim()).filter(Boolean))]
      : currentGeography.town;

    filtered = filtered.filter(
      i =>
        currentGeography.state.includes(i.state) &&
        counties.includes(i.county) &&
        towns.includes(i.town)
    );

    const unique = [...new Set(filtered.map(i => i.tract_number?.trim()).filter(Boolean))].sort();

    return [
      { value: '__ALL__', label: 'All Tracts (in selected towns)' },
      ...unique.map(tr => ({ value: tr, label: tr })),
    ];
  }, [geographiesList, currentGeography.state, currentGeography.county, currentGeography.town]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!orgName.trim() || !selectedOrgType || !selectedRegulator || selectedStates.length === 0) {
        setOrgMatches({});
        setCandidates({});
        setSelectedLenderPerSource({});
        return;
      }

      const config = SOURCE_CONFIG[selectedOrgType];
      if (!config) return;

      const activeSources = config.sources;

      const formatLocal = (list, sourceType) =>
        list.map((item) => {
          const regulator = item.regulator || selectedRegulator || '?';
          const suffix = `${item.lender_state || '?'}–${regulator}–${sourceType.toUpperCase()}`;
          return {
            label: `${item.lender} (${suffix})`,
            value: item.lender_id,
            score: similarity(orgName, item.lender),
          };
        });

      let newCandidates = {};
      let newMatches = {};
      let newSelected = {};

      if (activeSources.includes('hmda')) {
        const cands = formatLocal(filteredHmdaList, 'hmda');
        newCandidates.hmda = [...cands].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
        newMatches.hmda = [...cands].sort((a, b) => b.score - a.score)[0] || null;
        newSelected.hmda = newMatches.hmda?.value || null;
      }

      if (activeSources.includes('cra')) {
        const cands = formatLocal(filteredCraList, 'cra');
        newCandidates.cra = [...cands].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
        newMatches.cra = [...cands].sort((a, b) => b.score - a.score)[0] || null;
        newSelected.cra = newMatches.cra?.value || null;
      }

      if (activeSources.includes('branch')) {
        const cands = formatLocal(filteredBranchList, 'branch');
        newCandidates.branch = [...cands].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
        newMatches.branch = [...cands].sort((a, b) => b.score - a.score)[0] || null;
        newSelected.branch = newMatches.branch?.value || null;
      }

      if (activeSources.includes('fdic')) {
        const cands = formatLocal(filteredFdicList, 'fdic');
        newCandidates.fdic = [...cands].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
        newMatches.fdic = [...cands].sort((a, b) => b.score - a.score)[0] || null;
        newSelected.fdic = newMatches.fdic?.value || null;
      }

      if (activeSources.includes('ncua')) {
        const cands = formatLocal(filteredNcuaList, 'ncua');
        newCandidates.ncua = [...cands].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
        newMatches.ncua = [...cands].sort((a, b) => b.score - a.score)[0] || null;
        newSelected.ncua = newMatches.ncua?.value || null;
      }

      setCandidates(newCandidates);
      setOrgMatches(newMatches);
      setSelectedLenderPerSource(newSelected);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    orgName,
    selectedOrgType,
    selectedRegulator,
    selectedStates,
    filteredHmdaList,
    filteredCraList,
    filteredBranchList,
    filteredFdicList,
    filteredNcuaList,
  ]);

  const stateOptions = useMemo(() => {
    if (!hqStates.length) return [];

    const uniqueAbbrevs = [...new Set(
      hqStates.map(item => item.state_abbrev?.trim()).filter(Boolean)
    )].sort();

    return uniqueAbbrevs.map(abbrev => {
      const entry = hqStates.find(item => item.state_abbrev === abbrev);
      const fullName = entry?.state_name || abbrev;
      return {
        value: abbrev,
        label: fullName
      };
    });
  }, [hqStates]);

  const regulatorOptions = [
    { value: 'FDIC', label: 'FDIC' },
    { value: 'FED', label: 'FED' },
    { value: 'OCC', label: 'OCC' },
    { value: 'NCUA', label: 'NCUA' },
    { value: 'Non-Bank', label: 'Non-Bank' },
  ];

  // ── Per-step validation ─────────────────────────────────
  const canProceedStep1 =
    orgName.trim().length >= 3 &&
    !!selectedOrgType &&
    !!selectedRegulator &&
    selectedStates.length > 0;

  const canProceedStep2 = true; // optional: could require at least one selectedLenderPerSource later

  const canProceedStep3 = selectedGeographies.length > 0; // placeholder — tighten later if geographies required
  const canProceedStep4 = true; // placeholder

  const canProceed =
    currentStep === 1 ? canProceedStep1 :
    currentStep === 2 ? canProceedStep2 :
    currentStep === 3 ? canProceedStep3 :
    canProceedStep4;

  const nextStep = () => {
    if (currentStep < 4 && canProceed) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

const handleSave = async () => {
  if (!token) {
    alert('No authentication token found. Please reload from the member portal with a valid ?token=...');
    return;
  }

  // Collect all your form data here – adjust field names to match what your API expects
  const payload = {
    name: orgName.trim(),
    type: selectedOrgType,
    regulator: selectedRegulator,
    states: selectedStates,
    geographies: selectedGeographies,     // your array of geo objects
    customContext: customContext.trim(),
    // If you have linked_sources or other fields:
    // linked: selectedLenderPerSource,
    // email: ... (if needed for user upsert)
  };

  console.log('Sending save payload:', payload);  // Debug in browser console

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`   // This is the critical line
      },
      body: JSON.stringify(payload)
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      alert(`Server error (${response.status}): ${errorText || 'Unknown issue'}`);
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('Failed to parse JSON from server:', parseErr);
      const text = await response.text();
      alert('Server sent invalid response: ' + text.substring(0, 200));
      return;
    }

    if (data.success) {
      alert('Organization saved successfully!');
      router.push('/users');  // Redirect to dashboard
    } else {
      alert('Save failed: ' + (data.error || 'Unknown server error'));
    }
  } catch (err) {
    console.error('Fetch / save failed:', err);
    alert('Network or save error: ' + err.message);
  }
};
  

  const config = SOURCE_CONFIG[selectedOrgType] || { sources: [], labels: {} };

  const renderStep1 = () => (
    <div>
      <h2>Step 1 – Organization Information</h2>

      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Organization Name
        </label>
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="e.g. East Cambridge Savings Bank"
          style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
        />
      </div>

      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Organization Type
        </label>
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

      <div style={{ marginBottom: '32px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Primary Federal Regulator
        </label>
        <select
          value={selectedRegulator}
          onChange={(e) => setSelectedRegulator(e.target.value)}
          style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="">-- Select Regulator --</option>
          {regulatorOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Headquarters State(s)
        </label>
        <Select
          isMulti
          options={stateOptions}
          value={stateOptions.filter((opt) => selectedStates.includes(opt.value))}
          onChange={(opts) => setSelectedStates(opts ? opts.map((o) => o.value) : [])}
          placeholder="Select one or more states..."
          className="basic-multi-select"
          classNamePrefix="select"
          isSearchable={true}
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h2>Step 2 – Database Connections</h2>

      <p style={{ marginBottom: '16px' }}>
        Best matches found for <strong>{orgName.trim() || 'your organization'}</strong>:
      </p>

      <div
        style={{
          padding: '16px',
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          marginBottom: '32px',
          fontSize: '15px',
          lineHeight: '1.6',
        }}
      >
        {config.sources.map((key) => (
          <div key={key}>
            <strong>{config.labels[key]} Match</strong> -{' '}
            {orgMatches[key]
              ? `${orgMatches[key].label.split(' (')[0]} (${Math.round(orgMatches[key].score * 100)}%)`
              : 'No strong match found'}
          </div>
        ))}
      </div>

      <p style={{ fontWeight: '500', margin: '0 0 20px 0' }}>
        Use the drop down lists below to override the matches
      </p>

      {config.sources.map((key) => (
        <div key={key} style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '500',
              textTransform: 'uppercase',
            }}
          >
            {config.labels[key]}
          </label>
          <select
            value={selectedLenderPerSource[key] || ''}
            onChange={(e) =>
              setSelectedLenderPerSource((prev) => ({
                ...prev,
                [key]: e.target.value || null,
              }))
            }
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            <option value="">— Do not link / None —</option>
            {(candidates[key] || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );

const renderStep3 = () => (
  <div>
    <h2>Step 3 – Organization Geographies</h2>
    <p style={{ color: '#666', marginBottom: '24px' }}>
      Add the geographic areas (state → county → town → tract) this organization serves or focuses on.
      These are independent of headquarters states selected in Step 1. You can select multiple at each level.
    </p>

    {/* New fields */}
    <div style={{ display: 'grid', gap: '20px', marginBottom: '32px' }}>
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Geography Type <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <select
          value={geographyType}
          onChange={(e) => setGeographyType(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="">— Select Type —</option>
          <option value="Assessment Area">Assessment Area</option>
          <option value="REMA">REMA</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Geography Name <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <input
          type="text"
          value={geographyName}
          onChange={(e) => setGeographyName(e.target.value)}
          placeholder="e.g. Boston Metro Area, Cape Cod Assessment Area, Custom Rural Zone"
          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        />
      </div>
    </div>

    <div style={{ display: 'grid', gap: '20px', marginBottom: '32px' }}>
      {/* State */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>State</label>
        <Select
          isMulti
          options={geographyStateOptions}
          value={geographyStateOptions.filter(opt => currentGeography.state.includes(opt.value))}
          onChange={(opts) => {
            const newValues = opts ? opts.map(o => o.value) : [];
            setCurrentGeography(prev => ({
              ...prev,
              state: newValues,
              county: [],
              town: [],
              tract_number: [],
            }));
          }}
          placeholder="Select one or more states..."
          className="basic-multi-select"
          classNamePrefix="select"
          isSearchable={true}
        />
      </div>

      {/* County */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>County</label>
        <Select
          isMulti
          options={geographyCountyOptions}
          value={geographyCountyOptions.filter(opt => currentGeography.county.includes(opt.value))}
          onChange={(opts) => {
            let newValues = opts ? opts.map(o => o.value) : [];
            if (newValues.includes('__ALL__')) {
              newValues = ['__ALL__'];
            } else {
              newValues = newValues.filter(v => v !== '__ALL__');
            }
            setCurrentGeography(prev => ({
              ...prev,
              county: newValues,
              town: [],
              tract_number: [],
            }));
          }}
          placeholder="Select one or more counties..."
          className="basic-multi-select"
          classNamePrefix="select"
          isSearchable={true}
          isDisabled={!currentGeography.state.length}
        />
      </div>

      {/* Town / City */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Town / City</label>
        <Select
          isMulti
          options={geographyTownOptions}
          value={geographyTownOptions.filter(opt => currentGeography.town.includes(opt.value))}
          onChange={(opts) => {
            let newValues = opts ? opts.map(o => o.value) : [];
            if (newValues.includes('__ALL__')) {
              newValues = ['__ALL__'];
            } else {
              newValues = newValues.filter(v => v !== '__ALL__');
            }
            setCurrentGeography(prev => ({
              ...prev,
              town: newValues,
              tract_number: [],
            }));
          }}
          placeholder="Select one or more towns..."
          className="basic-multi-select"
          classNamePrefix="select"
          isSearchable={true}
          isDisabled={!currentGeography.county.length}
        />
      </div>

      {/* Tract */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Census Tract Number</label>
        <Select
          isMulti
          options={geographyTractOptions}
          value={geographyTractOptions.filter(opt => currentGeography.tract_number.includes(opt.value))}
          onChange={(opts) => {
            let newValues = opts ? opts.map(o => o.value) : [];
            if (newValues.includes('__ALL__')) {
              newValues = ['__ALL__'];
            } else {
              newValues = newValues.filter(v => v !== '__ALL__');
            }
            setCurrentGeography(prev => ({
              ...prev,
              tract_number: newValues,
            }));
          }}
          placeholder="Select one or more tracts..."
          className="basic-multi-select"
          classNamePrefix="select"
          isSearchable={true}
          isDisabled={!currentGeography.town.length}
        />
      </div>
    </div>

    {/* Add button */}
    <button
      type="button"
      onClick={() => {
        const hasAllCounty = currentGeography.county.includes('__ALL__');
        const hasAllTown = currentGeography.town.includes('__ALL__');
        const hasAllTract = currentGeography.tract_number.includes('__ALL__');

        if (
          geographyType &&
          geographyName.trim() &&
          currentGeography.state.length &&
          (currentGeography.county.length || hasAllCounty) &&
          (currentGeography.town.length || hasAllTown) &&
          (currentGeography.tract_number.length || hasAllTract)
        ) {
          const newGeo = {
            type: geographyType,
            name: geographyName.trim(),
            state: [...currentGeography.state],
            county: [...currentGeography.county],
            town: [...currentGeography.town],
            tract_number: [...currentGeography.tract_number],
          };

          console.log('Adding geography:', newGeo);
          setSelectedGeographies(prev => [...prev, newGeo]);

          // Reset everything
          setGeographyType('');
          setGeographyName('');
          setCurrentGeography({ state: [], county: [], town: [], tract_number: [] });
        }
      }}
      disabled={
        !geographyType ||
        !geographyName.trim() ||
        !currentGeography.state.length ||
        (!currentGeography.county.length && !currentGeography.county.includes('__ALL__')) ||
        (!currentGeography.town.length && !currentGeography.town.includes('__ALL__')) ||
        (!currentGeography.tract_number.length && !currentGeography.tract_number.includes('__ALL__'))
      }
      style={{
        padding: '10px 20px',
        background: '#0066cc',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        marginBottom: '24px',
      }}
    >
      + Add this geography
    </button>

    {/* List of added geographies */}
    {selectedGeographies.length > 0 && (
      <div style={{ marginTop: '16px' }}>
        <h4 style={{ marginBottom: '12px' }}>Added geographies:</h4>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {selectedGeographies.map((geo, index) => (
            <li
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px',
                background: '#f8f9fa',
                borderRadius: '6px',
                marginBottom: '8px',
              }}
            >
              <span>
                <strong>{geo.type}</strong>: {geo.name}  
                → States: {geo.state.join(', ')}  
                → Counties: {geo.county.includes('__ALL__') ? 'All' : geo.county.join(', ')}  
                → Towns: {geo.town.includes('__ALL__') ? 'All' : geo.town.join(', ')}  
                → Tracts: {geo.tract_number.includes('__ALL__') ? 'All' : geo.tract_number.join(', ')}
              </span>
              <button
                type="button"
                onClick={() => setSelectedGeographies(prev => prev.filter((_, i) => i !== index))}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    )}

    {selectedGeographies.length === 0 && (
      <p style={{ color: '#6c757d', fontStyle: 'italic' }}>
        No geographies added yet.
      </p>
    )}
  </div>
);
  
  const renderStep4 = () => (
    <div>
      <h2>Step 4 – Custom Context</h2>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        Add any additional notes, tags, or context that helps describe this organization (optional).
      </p>

      <textarea
        value={customContext}
        onChange={(e) => setCustomContext(e.target.value)}
        placeholder="Examples: • Focus on affordable housing in rural areas\n• Recently acquired XYZ Credit Union\n• Specializes in commercial real estate in Boston metro..."
        style={{
          width: '100%',
          minHeight: '160px',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #ccc',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <p style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '8px' }}>
        This information can be used to improve matching accuracy and reporting later.
      </p>
    </div>
  );

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 20px' }}>
      <h1>Create Account</h1>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '32px 0' }}>
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: currentStep >= s ? '#0066cc' : '#e0e0e0',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1.2rem',
            }}
          >
            {s}
          </div>
        ))}
      </div>

      {currentStep === 1 ? renderStep1() :
       currentStep === 2 ? renderStep2() :
       currentStep === 3 ? renderStep3() :
       renderStep4()}

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
            disabled={!canProceed}
            style={{
              padding: '12px 28px',
              background: canProceed ? '#0066cc' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              marginLeft: 'auto',
              cursor: canProceed ? 'pointer' : 'not-allowed',
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            style={{
              padding: '12px 28px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              marginLeft: 'auto',
              cursor: 'pointer',
            }}
          >
            Save & Continue
          </button>
        )}
      </div>
    </div>
  );
}
