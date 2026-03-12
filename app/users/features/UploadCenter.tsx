"use client";

import { useState, useEffect, useRef } from "react";
import { useOrganizations } from "./OrganizationsContext";

type Tab = "lar" | "documents";

interface LARUpload {
  upload_id: string;
  source_format: string;
  activity_year: string;
  record_count: number;
  uploaded_at: string;
  file_type: "hmda" | "sblar";
}

interface Document {
  filename: string;
  total_chunks: number;
  file_size_bytes: number;
  uploaded_at: string;
}

type UploadState = "idle" | "uploading" | "success" | "error";

const FORMAT_LABELS: Record<string, string> = {
  standard_hmda:    "Standard HMDA",
  questsoft_hmda:   "QuestSoft HMDA",
  standard_sblar:   "Standard CRA Small Business",
  questsoft_sblar:  "QuestSoft Small Business",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  hmda:  "HMDA LAR",
  sblar: "Small Business LAR",
};

export default function UploadCenter() {
  const { selectedOrgId } = useOrganizations();
  const [activeTab, setActiveTab]   = useState<Tab>("lar");
  const [larUploads, setLarUploads] = useState<LARUpload[]>([]);
  const [documents, setDocuments]   = useState<Document[]>([]);
  const [loading, setLoading]       = useState(false);

  const [larState,    setLarState]    = useState<UploadState>("idle");
  const [larMessage,  setLarMessage]  = useState("");
  const [docState,    setDocState]    = useState<UploadState>("idle");
  const [docMessage,  setDocMessage]  = useState("");
  const [dragOver,    setDragOver]    = useState<Tab | null>(null);

  const larInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") || "" : "";

  useEffect(() => { if (selectedOrgId) loadData(); }, [selectedOrgId]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [larRes, docRes] = await Promise.all([
        fetch(`/api/upload-lar?organizationId=${selectedOrgId}`,    { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/org-documents?organizationId=${selectedOrgId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const larData = await larRes.json();
      const docData = await docRes.json();

      // Merge hmda and sblar into one list with file_type tag
      const hmda  = (larData.hmda  || []).map((u: any) => ({ ...u, file_type: "hmda"  }));
      const sblar = (larData.sblar || []).map((u: any) => ({ ...u, file_type: "sblar" }));
      setLarUploads([...hmda, ...sblar].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()));
      setDocuments(docData.documents || []);
    } catch (err) {
      console.error("Failed to load upload data:", err);
    } finally {
      setLoading(false);
    }
  };

  const uploadLAR = async (file: File) => {
    if (!selectedOrgId) return;
    setLarState("uploading");
    setLarMessage(`Detecting format and uploading ${file.name}…`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", selectedOrgId.toString());

    try {
      const res  = await fetch("/api/upload-lar", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const formatLabel   = FORMAT_LABELS[data.format]   || data.format;
      const fileTypeLabel = FILE_TYPE_LABELS[data.fileType] || data.fileType;
      setLarState("success");
      setLarMessage(`✓ Detected as ${fileTypeLabel} (${formatLabel}) — ${Number(data.inserted).toLocaleString()} records loaded`);
      loadData();
    } catch (err: any) {
      setLarState("error");
      setLarMessage(err.message);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!selectedOrgId) return;
    setDocState("uploading");
    setDocMessage(`Indexing ${file.name}…`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", selectedOrgId.toString());

    try {
      const res  = await fetch("/api/org-documents", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDocState("success");
      setDocMessage(`✓ "${file.name}" indexed — ${data.chunks} chunks`);
      loadData();
    } catch (err: any) {
      setDocState("error");
      setDocMessage(err.message);
    }
  };

  const deleteLAR = async (uploadId: string, fileType: string) => {
    if (!selectedOrgId || !confirm("Delete this upload and all its records?")) return;
    await fetch(`/api/upload-lar?organizationId=${selectedOrgId}&uploadId=${uploadId}&fileType=${fileType}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const deleteDocument = async (filename: string) => {
    if (!selectedOrgId || !confirm(`Delete "${filename}"?`)) return;
    await fetch(`/api/org-documents?organizationId=${selectedOrgId}&filename=${encodeURIComponent(filename)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const handleDrop = (e: React.DragEvent, tab: Tab) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (tab === "lar") uploadLAR(file);
    else uploadDocument(file);
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  const statusClass = (state: UploadState) => {
    if (state === "uploading") return "bg-blue-50 text-blue-700 border border-blue-200";
    if (state === "success")   return "bg-green-50 text-green-700 border border-green-200";
    if (state === "error")     return "bg-red-50 text-red-700 border border-red-200";
    return "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload Center</h2>
        <p className="mt-1 text-sm text-gray-500">Upload CRA data files and documents. File formats are detected automatically.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            { id: "lar",       label: "HMDA & Small Business Loans" },
            { id: "documents", label: "My Documents"                },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-teal-600 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── LAR TAB ── */}
      {activeTab === "lar" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Accepted formats:</strong> .xlsx, .xls, .csv, .txt, .dat — HMDA and Small Business LARs are detected automatically.
            If a file cannot be identified you will receive an error with instructions.
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver("lar"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, "lar")}
            onClick={() => larInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver === "lar"
                ? "border-teal-400 bg-teal-50"
                : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop LAR file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv · .txt · .dat</p>
            <input ref={larInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.dat" className="hidden"
              onChange={e => e.target.files?.[0] && uploadLAR(e.target.files[0])} />
          </div>

          {/* Upload status */}
          {larState !== "idle" && (
            <div className={`rounded-lg p-3 text-sm ${statusClass(larState)}`}>
              {larState === "uploading" && (
                <span className="inline-block animate-spin mr-2">⟳</span>
              )}
              {larMessage}
            </div>
          )}

          {/* Uploaded files list */}
          {larUploads.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files</h3>
              <div className="space-y-2">
                {larUploads.map(u => (
                  <div key={`${u.file_type}-${u.upload_id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      {/* Badge */}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        u.file_type === "hmda"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {u.file_type === "hmda" ? "HMDA" : "Small Biz"}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {u.activity_year || "Unknown Year"} &mdash; {FORMAT_LABELS[u.source_format] || u.source_format}
                        </div>
                        <div className="text-xs text-gray-500">
                          {Number(u.record_count).toLocaleString()} records &middot; Uploaded {new Date(u.uploaded_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteLAR(u.upload_id, u.file_type)}
                      className="text-red-400 hover:text-red-600 p-1 ml-4">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {larUploads.length === 0 && !loading && (
            <p className="text-sm text-gray-400 text-center py-4">No LAR files uploaded yet.</p>
          )}
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Accepted formats:</strong> PDF, DOCX, DOC, TXT.
            Documents are chunked and embedded for AI-powered search in the CRA Assistant chat.
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver("documents"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, "documents")}
            onClick={() => docInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver === "documents"
                ? "border-teal-400 bg-teal-50"
                : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop document here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF · DOCX · DOC · TXT</p>
            <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
              onChange={e => e.target.files?.[0] && uploadDocument(e.target.files[0])} />
          </div>

          {docState !== "idle" && (
            <div className={`rounded-lg p-3 text-sm ${statusClass(docState)}`}>
              {docState === "uploading" && <span className="inline-block animate-spin mr-2">⟳</span>}
              {docMessage}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Indexed Documents</h3>
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.filename}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <svg className="h-8 w-8 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
                      </svg>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{doc.filename}</div>
                        <div className="text-xs text-gray-500">
                          {doc.total_chunks} chunks &middot; {formatBytes(doc.file_size_bytes)} &middot; {new Date(doc.uploaded_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteDocument(doc.filename)}
                      className="text-red-400 hover:text-red-600 p-1 ml-4">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {documents.length === 0 && !loading && (
            <p className="text-sm text-gray-400 text-center py-4">No documents uploaded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
