"use client";

import { useState, useEffect, useRef } from "react";
import { useOrganizations } from "./OrganizationsContext";

type Tab = "documents" | "hmda" | "sblar";

interface Upload {
  upload_id: string;
  source_format: string;
  activity_year: string;
  record_count: number;
  uploaded_at: string;
}

interface Document {
  filename: string;
  total_chunks: number;
  file_size_bytes: number;
  uploaded_at: string;
}

type UploadStatus = { state: "idle" | "uploading" | "success" | "error"; message: string };

export default function UploadCenter() {
  const { selectedOrgId } = useOrganizations();
  const [activeTab, setActiveTab] = useState<Tab>("hmda");
  const [hmdaUploads, setHmdaUploads] = useState<Upload[]>([]);
  const [sblarUploads, setSblarUploads] = useState<Upload[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [hmdaStatus, setHmdaStatus] = useState<UploadStatus>({ state: "idle", message: "" });
  const [sblarStatus, setSblarStatus] = useState<UploadStatus>({ state: "idle", message: "" });
  const [docStatus, setDocStatus] = useState<UploadStatus>({ state: "idle", message: "" });
  const [dragOver, setDragOver] = useState<Tab | null>(null);

  const hmdaInputRef = useRef<HTMLInputElement>(null);
  const sblarInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") || "" : "";

  useEffect(() => {
    if (selectedOrgId) loadData();
  }, [selectedOrgId]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    setLoadingData(true);
    try {
      const [larRes, docRes] = await Promise.all([
        fetch(`/api/upload-lar?organizationId=${selectedOrgId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/org-documents?organizationId=${selectedOrgId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const larData = await larRes.json();
      const docData = await docRes.json();
      setHmdaUploads(larData.hmda || []);
      setSblarUploads(larData.sblar || []);
      setDocuments(docData.documents || []);
    } catch (err) {
      console.error("Failed to load upload data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const uploadLAR = async (file: File, fileType: "hmda" | "sblar") => {
    if (!selectedOrgId) return;
    const setStatus = fileType === "hmda" ? setHmdaStatus : setSblarStatus;

    setStatus({ state: "uploading", message: `Uploading ${file.name}...` });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", selectedOrgId.toString());
    formData.append("fileType", fileType);

    try {
      const res = await fetch("/api/upload-lar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStatus({
        state: "success",
        message: `✓ ${file.name} — ${data.inserted.toLocaleString()} records loaded (${data.format} format)`,
      });
      loadData();
    } catch (err: any) {
      setStatus({ state: "error", message: `✗ ${err.message}` });
    }
  };

  const uploadDocument = async (file: File) => {
    if (!selectedOrgId) return;
    setDocStatus({ state: "uploading", message: `Indexing ${file.name}...` });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", selectedOrgId.toString());

    try {
      const res = await fetch("/api/org-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDocStatus({ state: "success", message: `✓ "${file.name}" indexed — ${data.chunks} chunks` });
      loadData();
    } catch (err: any) {
      setDocStatus({ state: "error", message: `✗ ${err.message}` });
    }
  };

  const deleteLAR = async (uploadId: string, fileType: "hmda" | "sblar") => {
    if (!selectedOrgId || !confirm("Delete this upload and all its records?")) return;
    await fetch(`/api/upload-lar?organizationId=${selectedOrgId}&uploadId=${uploadId}&fileType=${fileType}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const deleteDocument = async (filename: string) => {
    if (!selectedOrgId || !confirm(`Delete "${filename}"?`)) return;
    await fetch(`/api/org-documents?organizationId=${selectedOrgId}&filename=${encodeURIComponent(filename)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadData();
  };

  const handleDrop = (e: React.DragEvent, tab: Tab) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (tab === "hmda") uploadLAR(file, "hmda");
    else if (tab === "sblar") uploadLAR(file, "sblar");
    else uploadDocument(file);
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: "hmda", label: "HMDA LAR", desc: "Home Mortgage Disclosure Act loan data" },
    { id: "sblar", label: "Small Business LAR", desc: "CRA small business & small farm loans" },
    { id: "documents", label: "My Documents", desc: "PDFs, Word docs & text files for AI search" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload Center</h2>
        <p className="mt-1 text-gray-500 text-sm">Upload your CRA data files and documents for analysis and reporting.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-teal-600 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* HMDA LAR Tab */}
      {activeTab === "hmda" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Accepted formats:</strong> QuestSoft CSV export (.csv) or Standard HMDA LAR (.csv exported from .xlsx).
            Files are automatically detected — no format selection needed.
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver("hmda"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, "hmda")}
            onClick={() => hmdaInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver === "hmda" ? "border-teal-400 bg-teal-50" : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop HMDA LAR file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">QuestSoft CSV or Standard format CSV</p>
            <input ref={hmdaInputRef} type="file" accept=".csv,.xlsx" className="hidden"
              onChange={e => e.target.files?.[0] && uploadLAR(e.target.files[0], "hmda")} />
          </div>

          {/* Status */}
          {hmdaStatus.state !== "idle" && (
            <div className={`rounded-lg p-3 text-sm ${
              hmdaStatus.state === "uploading" ? "bg-blue-50 text-blue-700" :
              hmdaStatus.state === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {hmdaStatus.state === "uploading" && <span className="inline-block animate-spin mr-2">⟳</span>}
              {hmdaStatus.message}
            </div>
          )}

          {/* Existing uploads */}
          {hmdaUploads.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files</h3>
              <div className="space-y-2">
                {hmdaUploads.map(u => (
                  <div key={u.upload_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {u.activity_year || "Unknown Year"} — {u.source_format === "questsoft" ? "QuestSoft" : "Standard"} format
                      </div>
                      <div className="text-xs text-gray-500">
                        {Number(u.record_count).toLocaleString()} records · Uploaded {new Date(u.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => deleteLAR(u.upload_id, "hmda")}
                      className="text-red-400 hover:text-red-600 p-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hmdaUploads.length === 0 && !loadingData && (
            <p className="text-sm text-gray-400 text-center py-4">No HMDA LAR files uploaded yet.</p>
          )}
        </div>
      )}

      {/* Small Business LAR Tab */}
      {activeTab === "sblar" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Accepted formats:</strong> QuestSoft CSV export (.csv) or Standard CRA SB LAR fixed-width file (.txt or .dat).
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver("sblar"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, "sblar")}
            onClick={() => sblarInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver === "sblar" ? "border-teal-400 bg-teal-50" : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop Small Business LAR file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">QuestSoft CSV or Standard fixed-width (.txt, .dat)</p>
            <input ref={sblarInputRef} type="file" accept=".csv,.txt,.dat" className="hidden"
              onChange={e => e.target.files?.[0] && uploadLAR(e.target.files[0], "sblar")} />
          </div>

          {sblarStatus.state !== "idle" && (
            <div className={`rounded-lg p-3 text-sm ${
              sblarStatus.state === "uploading" ? "bg-blue-50 text-blue-700" :
              sblarStatus.state === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {sblarStatus.state === "uploading" && <span className="inline-block animate-spin mr-2">⟳</span>}
              {sblarStatus.message}
            </div>
          )}

          {sblarUploads.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files</h3>
              <div className="space-y-2">
                {sblarUploads.map(u => (
                  <div key={u.upload_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {u.activity_year || "Unknown Year"} — {u.source_format === "questsoft" ? "QuestSoft" : "Standard"} format
                      </div>
                      <div className="text-xs text-gray-500">
                        {Number(u.record_count).toLocaleString()} records · Uploaded {new Date(u.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => deleteLAR(u.upload_id, "sblar")}
                      className="text-red-400 hover:text-red-600 p-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sblarUploads.length === 0 && !loadingData && (
            <p className="text-sm text-gray-400 text-center py-4">No Small Business LAR files uploaded yet.</p>
          )}
        </div>
      )}

      {/* My Documents Tab */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Accepted formats:</strong> PDF, DOCX, DOC, TXT. Documents are chunked and embedded for AI-powered search in the CRA Assistant chat.
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver("documents"); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, "documents")}
            onClick={() => docInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver === "documents" ? "border-teal-400 bg-teal-50" : "border-gray-300 hover:border-teal-400 hover:bg-gray-50"
            }`}
          >
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop document here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, DOC, TXT</p>
            <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
              onChange={e => e.target.files?.[0] && uploadDocument(e.target.files[0])} />
          </div>

          {docStatus.state !== "idle" && (
            <div className={`rounded-lg p-3 text-sm ${
              docStatus.state === "uploading" ? "bg-blue-50 text-blue-700" :
              docStatus.state === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {docStatus.state === "uploading" && <span className="inline-block animate-spin mr-2">⟳</span>}
              {docStatus.message}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Indexed Documents</h3>
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.filename} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <svg className="h-8 w-8 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
                      </svg>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{doc.filename}</div>
                        <div className="text-xs text-gray-500">
                          {doc.total_chunks} chunks · {formatBytes(doc.file_size_bytes)} · {new Date(doc.uploaded_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteDocument(doc.filename)}
                      className="text-red-400 hover:text-red-600 p-1">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {documents.length === 0 && !loadingData && (
            <p className="text-sm text-gray-400 text-center py-4">No documents uploaded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
