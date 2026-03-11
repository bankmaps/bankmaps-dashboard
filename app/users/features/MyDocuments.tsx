"use client";

import { useState, useEffect, useRef } from "react";
import { useOrganizations } from "./OrganizationsContext";

interface OrgDocument {
  filename: string;
  total_chunks: number;
  file_size_bytes: number;
  uploaded_at: string;
}

export default function MyDocuments() {
  const { selectedOrgId, selectedOrg } = useOrganizations();
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") || "" : "";

  useEffect(() => {
    if (selectedOrgId) fetchDocuments();
  }, [selectedOrgId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org-documents?organizationId=${selectedOrgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!selectedOrgId) return;
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isTxt = file.type === "text/plain" || file.name.endsWith(".txt");
    if (!isPdf && !isTxt) {
      setError("Only PDF and text files are supported.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File must be under 20MB.");
      return;
    }

    setError(null);
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("organizationId", selectedOrgId.toString());

    try {
      setUploadProgress("Extracting text and generating embeddings...");
      const res = await fetch("/api/org-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadProgress(`✓ ${data.filename} — ${data.chunks} chunks indexed`);
      setTimeout(() => setUploadProgress(null), 3000);
      fetchDocuments();
    } catch (err: any) {
      setError(err.message);
      setUploadProgress(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (filename: string) => {
    if (!selectedOrgId) return;
    if (!confirm(`Delete "${filename}" and all its indexed chunks?`)) return;

    try {
      await fetch(`/api/org-documents?organizationId=${selectedOrgId}&filename=${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments(prev => prev.filter(d => d.filename !== filename));
    } catch (err) {
      setError("Failed to delete document.");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  if (!selectedOrgId) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>No organization selected.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">My Documents</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload PDFs and documents for <strong>{selectedOrg?.name}</strong>. These will be available to the CRA Assistant when answering questions.
        </p>
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "#0d9488" : "#d1d5db"}`,
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
          cursor: uploading ? "not-allowed" : "pointer",
          background: isDragging ? "#f0fdf4" : "#fafafa",
          transition: "all 0.2s",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: "none" }}
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        {uploading ? (
          <div>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-3" />
            <p className="text-sm text-teal-700 font-medium">{uploadProgress}</p>
          </div>
        ) : (
          <div>
            <svg className="mx-auto mb-3 h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drag & drop a PDF or text file, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, TXT · Max 20MB</p>
          </div>
        )}
      </div>

      {uploadProgress && !uploading && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          {uploadProgress}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Document list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Indexed Documents {documents.length > 0 && <span className="text-gray-400 font-normal">({documents.length})</span>}
        </h3>

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
            No documents uploaded yet. Add PDFs to enhance the CRA Assistant's knowledge for your organization.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.filename} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-teal-300 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(doc.file_size_bytes)} · {doc.total_chunks} chunks · Uploaded {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  className="ml-4 flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete document"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Documents are indexed using semantic embeddings and searched automatically when you use the CRA Assistant. They are private to your organization.
      </p>
    </div>
  );
}
