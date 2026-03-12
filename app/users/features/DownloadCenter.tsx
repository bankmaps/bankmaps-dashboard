"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrganizations } from "./OrganizationsContext";

interface Report {
  id: number;
  geography_name: string;
  category: string;
  activity_year: string | null;
  version: number;
  blob_url: string | null;
  file_size_bytes: number | null;
  status: "pending" | "generating" | "complete" | "error";
  triggered_by: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface CategoryDef {
  id: string;
  label: string;
  dataGate: string | null;
  available: boolean;
}

interface Categories {
  maps:    CategoryDef[];
  reports: CategoryDef[];
  other:   CategoryDef[];
}

const TRIGGER_LABELS: Record<string, string> = {
  geography_save:  "Geography save",
  data_upload:     "Data upload",
  linked_sources:  "Data connections",
  manual:          "Manual",
};

const STATUS_CONFIG = {
  pending:    { dot: "bg-gray-400",  text: "Queued"     },
  generating: { dot: "bg-blue-400 animate-pulse", text: "Generating…" },
  complete:   { dot: "bg-green-500", text: "Ready"      },
  error:      { dot: "bg-red-500",   text: "Error"      },
};

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── CATEGORY SELECTOR (compact checkbox grid) ────────────────────────────────

function CategorySelector({
  categories,
  selected,
  onChange,
}: {
  categories: Categories;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const allIds = [
    ...categories.maps,
    ...categories.reports,
    ...categories.other,
  ].filter(c => c.available).map(c => c.id);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  const group = (label: string, cats: CategoryDef[]) => (
    <div key={label}>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      {cats.map(c => (
        <label
          key={c.id}
          className={`flex items-center gap-2 mb-1.5 ${c.available ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
          title={!c.available ? `Upload ${c.dataGate} data to enable` : undefined}
        >
          <input
            type="checkbox"
            disabled={!c.available}
            checked={selected.includes(c.id) && c.available}
            onChange={() => toggle(c.id)}
            className="w-3.5 h-3.5 accent-teal-600"
          />
          <span className={`text-xs ${c.available ? "text-gray-700" : "text-gray-400"}`}>{c.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={() => onChange(selected.length === allIds.length ? [] : allIds)}
          className="text-xs text-teal-600 underline"
        >
          {selected.length === allIds.length ? "Deselect all" : "Select all available"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-1">
        {group("Maps", categories.maps)}
        {group("Performance Reports", categories.reports)}
        {group("Other", categories.other)}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function DownloadCenter() {
  const { selectedOrgId, organizations } = useOrganizations();
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") || "" : "";

  const [reports,    setReports]    = useState<Report[]>([]);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [stale,      setStale]      = useState(false);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [linkedSources, setLinkedSources] = useState<any>({});

  // Regen modal state
  const [showRegen,      setShowRegen]      = useState(false);
  const [regenGeo,       setRegenGeo]       = useState("");
  const [regenCats,      setRegenCats]      = useState<string[]>([]);
  const [regenReplace,   setRegenReplace]   = useState(false);
  const [regenLoading,   setRegenLoading]   = useState(false);
  const [regenQueued,    setRegenQueued]    = useState<number | null>(null);

  // Email prefs
  const [emailComplete, setEmailComplete] = useState(true);
  const [emailStale,    setEmailStale]    = useState(true);
  const [savingPrefs,   setSavingPrefs]   = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Filter
  const [filterGeo, setFilterGeo] = useState<string>("all");
  const [filterCat, setFilterCat] = useState<string>("all");

  // Poll for in-progress reports
  const [pollActive, setPollActive] = useState(false);

  const selectedOrg = organizations.find((o: any) => o.id === selectedOrgId);
  const geoNames: string[] = selectedOrg?.geographies?.map((g: any) => g.name) ?? [];

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const res  = await fetch(`/api/generate-reports?orgId=${selectedOrgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReports(data.reports || []);
      setCategories(data.categories || null);
      setStale(data.stale || false);
      setStaleReason(data.staleReason || null);
      setEmailComplete(data.emailPrefs?.complete ?? true);
      setEmailStale(data.emailPrefs?.stale ?? true);

      const hasInProgress = (data.reports || []).some(
        (r: Report) => r.status === "pending" || r.status === "generating"
      );
      setPollActive(hasInProgress);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedOrgId, token]);

  useEffect(() => {
    load();
    // Also load org linked_sources for gate checking
    if (selectedOrg) setLinkedSources(selectedOrg.linked_sources || {});
  }, [selectedOrgId]);

  // Auto-poll while reports are generating
  useEffect(() => {
    if (!pollActive) return;
    const t = setTimeout(() => load(), 4000);
    return () => clearTimeout(t);
  }, [pollActive, reports]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/generate-reports?reportId=${id}&orgId=${selectedOrgId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeleteId(null);
    load();
  };

  const handleRegen = async () => {
    if (!regenGeo || !regenCats.length || !selectedOrgId) return;
    setRegenLoading(true);
    try {
      const res  = await fetch("/api/generate-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orgId: selectedOrgId,
          geographyName: regenGeo,
          categories: regenCats,
          triggeredBy: "manual",
          replaceExisting: regenReplace,
          linkedSources,
        }),
      });
      const data = await res.json();
      setRegenQueued(data.queued ?? 0);
      setTimeout(() => { setShowRegen(false); setRegenQueued(null); load(); }, 2500);
    } catch (e) { console.error(e); }
    setRegenLoading(false);
  };

  const handleSaveEmailPrefs = async () => {
    setSavingPrefs(true);
    await fetch("/api/generate-reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emailComplete, emailStale }),
    });
    setSavingPrefs(false);
  };

  // Grouped + filtered reports
  const allCatDefs = categories
    ? [...categories.maps, ...categories.reports, ...categories.other]
    : [];
  const catLabel = (id: string) => allCatDefs.find(c => c.id === id)?.label ?? id;

  const filtered = reports.filter(r =>
    (filterGeo === "all" || r.geography_name === filterGeo) &&
    (filterCat === "all" || r.category === filterCat)
  );

  // Group by geography → category for display
  const grouped: Record<string, Record<string, Report[]>> = {};
  for (const r of filtered) {
    if (!grouped[r.geography_name]) grouped[r.geography_name] = {};
    if (!grouped[r.geography_name][r.category]) grouped[r.geography_name][r.category] = [];
    grouped[r.geography_name][r.category].push(r);
  }

  const uniqueGeos = [...new Set(reports.map(r => r.geography_name))];
  const uniqueCats = [...new Set(reports.map(r => r.category))];

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Download Center</h2>
          <p className="text-sm text-gray-500 mt-1">Generated maps and reports ready to download.</p>
        </div>
        <button
          onClick={() => { setShowRegen(true); setRegenQueued(null); setRegenGeo(""); setRegenCats([]); }}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Generate Reports
        </button>
      </div>

      {/* Stale banner */}
      {stale && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">⚠</span>
          <div>
            <p className="font-semibold text-amber-900 text-sm">Reports may be out of date</p>
            <p className="text-amber-700 text-sm">{staleReason || "A recent change may not be reflected in your reports."}</p>
            <button
              onClick={() => { setShowRegen(true); setRegenQueued(null); setRegenGeo(""); setRegenCats([]); }}
              className="mt-2 text-sm text-amber-800 underline font-medium"
            >
              Generate updated reports →
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {reports.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <select value={filterGeo} onChange={e => setFilterGeo(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white">
            <option value="all">All Geographies</option>
            {uniqueGeos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white">
            <option value="all">All Categories</option>
            {uniqueCats.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>
          {(filterGeo !== "all" || filterCat !== "all") && (
            <button onClick={() => { setFilterGeo("all"); setFilterCat("all"); }}
              className="text-sm text-gray-500 underline">Clear</button>
          )}
        </div>
      )}

      {/* Report list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">No reports yet</p>
          <p className="text-sm">Use "Generate Reports" to create your first PDF.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([geo, cats]) => (
            <div key={geo} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900 text-sm">{geo}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {Object.entries(cats).map(([catId, versions]) => (
                  <div key={catId} className="px-5 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      {catLabel(catId)}
                    </p>
                    <div className="space-y-1.5">
                      {versions.map(r => {
                        const sc = STATUS_CONFIG[r.status];
                        return (
                          <div key={r.id}
                            className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-50 group">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                              <div className="min-w-0">
                                <span className="text-sm text-gray-800">
                                  v{r.version}
                                  {r.activity_year && <span className="text-gray-500 ml-1">· {r.activity_year}</span>}
                                  <span className="text-gray-400 ml-2 text-xs">{sc.text}</span>
                                </span>
                                <div className="text-xs text-gray-400 mt-0.5">
                                  {formatDate(r.completed_at || r.created_at)}
                                  {r.file_size_bytes ? ` · ${formatBytes(r.file_size_bytes)}` : ""}
                                  {r.triggered_by ? ` · ${TRIGGER_LABELS[r.triggered_by] ?? r.triggered_by}` : ""}
                                </div>
                                {r.error_message && (
                                  <p className="text-xs text-red-500 mt-0.5">{r.error_message}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                              {r.status === "complete" && r.blob_url && (
                                <a
                                  href={r.blob_url}
                                  download
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1 rounded-md font-medium transition-colors"
                                >
                                  Download
                                </a>
                              )}
                              <button
                                onClick={() => setDeleteId(r.id)}
                                className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                title="Delete this version"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email prefs */}
      <div className="border border-gray-200 rounded-xl p-5 mt-8">
        <h3 className="font-semibold text-gray-900 text-sm mb-4">Email Notifications</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={emailComplete} onChange={e => setEmailComplete(e.target.checked)}
              className="w-4 h-4 accent-teal-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">Reports ready</p>
              <p className="text-xs text-gray-500">Email me when generated reports are ready to download</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={emailStale} onChange={e => setEmailStale(e.target.checked)}
              className="w-4 h-4 accent-teal-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">Reports need updating</p>
              <p className="text-xs text-gray-500">Email me when reports may be out of date after a change</p>
            </div>
          </label>
        </div>
        <button onClick={handleSaveEmailPrefs} disabled={savingPrefs}
          className="mt-4 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
          {savingPrefs ? "Saving…" : "Save preferences"}
        </button>
      </div>

      {/* Generate / Regen modal */}
      {showRegen && categories && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Generate Reports</h2>
              <button onClick={() => setShowRegen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {regenQueued !== null ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">✓</div>
                <p className="font-semibold text-gray-900">{regenQueued} report{regenQueued !== 1 ? "s" : ""} queued</p>
                <p className="text-sm text-gray-500 mt-1">Generation is running in the background. You'll receive an email when ready.</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Geography selector */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Geography *</label>
                  <select value={regenGeo} onChange={e => setRegenGeo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">— Select a geography —</option>
                    {geoNames.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Select categories</label>
                  <CategorySelector categories={categories} selected={regenCats} onChange={setRegenCats} />
                </div>

                {/* Version handling */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={regenReplace} onChange={e => setRegenReplace(e.target.checked)}
                      className="w-4 h-4 accent-teal-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Replace existing versions</p>
                      <p className="text-xs text-gray-500">Removes older versions beyond the 3-version limit. Uncheck to keep all.</p>
                    </div>
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleRegen}
                    disabled={!regenGeo || !regenCats.length || regenLoading}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
                  >
                    {regenLoading ? "Queuing…" : `Generate ${regenCats.length || 0} categor${regenCats.length === 1 ? "y" : "ies"}`}
                  </button>
                  <button onClick={() => setShowRegen(false)}
                    className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 mb-2">Delete this version?</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently remove the report file. Other versions of this report are not affected.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteId)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg">
                Delete
              </button>
              <button onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
