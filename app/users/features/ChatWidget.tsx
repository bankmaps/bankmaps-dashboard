"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface Session {
  session_id: string;
  last_message_at: string;
  message_count: number;
}

interface ChatWidgetProps {
  organizationId: number | null;
  pageContext?: string;
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChatWidget({ organizationId, pageContext }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; data: string; mediaType: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("jwt_token") || "" : "";

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Load sessions when history panel opens
  useEffect(() => {
    if (showHistory) loadSessions();
  }, [showHistory]);

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/chat", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  const loadSession = async (sid: string) => {
    try {
      const res = await fetch(`/api/chat?sessionId=${sid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
      })));
      setSessionId(sid);
      setShowHistory(false);
    } catch (err) {
      console.error("Failed to load session:", err);
    }
  };

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/chat?sessionId=${sid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setSessions(prev => prev.filter(s => s.session_id !== sid));
    if (sid === sessionId) startNewChat();
  };

  const startNewChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSessionId(generateSessionId());
    setUploadedFile(null);
    setShowHistory(false);
    setInput("");
  };

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocStatus, setUploadDocStatus] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isDocx = file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isImage = file.type.startsWith("image/");
    const isTxt = file.type === "text/plain" || file.name.endsWith(".txt");

    if (!isPdf && !isDocx && !isImage && !isTxt) {
      alert("Supported files: PDF, DOCX, TXT, or images.");
      return;
    }

    // PDFs, DOCX, and text files get indexed into pdf_chunks_org for persistent search
    if ((isPdf || isDocx || isTxt) && organizationId) {
      setUploadingDoc(true);
      setUploadDocStatus(`Indexing ${file.name}...`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("organizationId", organizationId.toString());
        const res = await fetch("/api/org-documents", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setUploadDocStatus(`✓ "${file.name}" indexed — ${data.chunks} chunks. You can now ask questions about it.`);
        setTimeout(() => setUploadDocStatus(null), 5000);
      } catch (err: any) {
        setUploadDocStatus(`✗ Failed to index: ${err.message}`);
        setTimeout(() => setUploadDocStatus(null), 4000);
      } finally {
        setUploadingDoc(false);
      }
      return;
    }

    // Images get sent as base64 in the next message
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setUploadedFile({ name: file.name, data: base64, mediaType: file.type });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: Message = { role: "assistant", content: "", timestamp: new Date() };
    setMessages(prev => [...prev, assistantMessage]);

    abortRef.current = new AbortController();

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          sessionId,
          organizationId,
          pageContext,
          history,
          uploadedFile: uploadedFile ? { data: uploadedFile.data, mediaType: uploadedFile.mediaType } : null,
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      setUploadedFile(null);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const { text } = JSON.parse(data);
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + text,
                };
                return updated;
              });
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: "Sorry, something went wrong. Please try again.",
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const widgetWidth = isExpanded ? 680 : 400;
  const widgetHeight = isExpanded ? 700 : 520;

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed",
            bottom: "24px",
            left: "24px",
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #0d9488, #0891b2)",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(13,148,136,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            transition: "transform 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          title="CRA Assistant"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "24px",
            width: `${widgetWidth}px`,
            height: `${widgetHeight}px`,
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
            overflow: "hidden",
            transition: "width 0.25s, height 0.25s",
          }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #0d9488, #0891b2)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              <div>
                <div style={{ color: "white", fontWeight: 600, fontSize: "14px" }}>CRA Assistant</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px" }}>
                  {isStreaming ? "Typing..." : "Ready"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button onClick={() => setShowHistory(!showHistory)} title="Chat history"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                </svg>
              </button>
              <button onClick={startNewChat} title="New chat"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
              <button onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? "Shrink" : "Expand"}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  {isExpanded
                    ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                    : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  }
                </svg>
              </button>
              <button onClick={() => setIsOpen(false)} title="Minimize"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "6px", padding: "6px", cursor: "pointer", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13H5v-2h14v2z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* History panel */}
          {showHistory && (
            <div style={{ position: "absolute", top: "56px", left: 0, right: 0, bottom: 0, background: "white", zIndex: 10, overflowY: "auto", padding: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#111827" }}>Recent Conversations</h3>
              {sessions.length === 0 && <p style={{ color: "#9ca3af", fontSize: "13px" }}>No past conversations yet.</p>}
              {sessions.map(s => (
                <div key={s.session_id} onClick={() => loadSession(s.session_id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", marginBottom: "6px", background: "#f9fafb", border: "1px solid #e5e7eb" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#f9fafb")}
                >
                  <div>
                    <div style={{ fontSize: "13px", color: "#111827", fontWeight: 500 }}>
                      {new Date(s.last_message_at).toLocaleDateString()} {new Date(s.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{s.message_count} messages</div>
                  </div>
                  <button onClick={e => deleteSession(s.session_id, e)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: "4px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              ))}
              <button onClick={() => setShowHistory(false)}
                style={{ marginTop: "12px", width: "100%", padding: "8px", background: "#f3f4f6", border: "none", borderRadius: "8px", cursor: "pointer", color: "#374151", fontSize: "13px" }}>
                Back to Chat
              </button>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", marginTop: "40px" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="#d1d5db" style={{ margin: "0 auto 12px" }}>
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "#6b7280" }}>CRA Assistant</p>
                <p style={{ fontSize: "13px", marginTop: "4px" }}>Ask me anything about CRA compliance, your lending data, or the current report.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginTop: "16px" }}>
                  {[
                    "Summarize my assessment area",
                    "What is the LMI lending threshold?",
                    "Explain the lending test",
                    "How do I calculate my CRA rating?",
                  ].map(s => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{ padding: "6px 12px", background: "#f0fdf4", border: "1px solid #d1fae5", borderRadius: "20px", cursor: "pointer", fontSize: "12px", color: "#065f46" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? "linear-gradient(135deg, #0d9488, #0891b2)" : "#f3f4f6",
                  color: msg.role === "user" ? "white" : "#111827",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.content || (isStreaming && i === messages.length - 1 ? (
                    <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9ca3af", animation: "bounce 1s infinite" }} />
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9ca3af", animation: "bounce 1s infinite 0.15s" }} />
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9ca3af", animation: "bounce 1s infinite 0.3s" }} />
                    </span>
                  ) : "")}
                </div>
                {msg.role === "assistant" && msg.content && (
                  <button onClick={() => copyMessage(msg.content)}
                    style={{ marginTop: "4px", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}
                    title="Copy">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                    Copy
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(13,148,136,0.1)", border: "2px dashed #0d9488", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
              <p style={{ color: "#0d9488", fontWeight: 600 }}>Drop PDF or image here</p>
            </div>
          )}

          {/* Doc indexing status */}
          {(uploadingDoc || uploadDocStatus) && (
            <div style={{ padding: "6px 16px", background: uploadingDoc ? "#eff6ff" : uploadDocStatus?.startsWith("✓") ? "#f0fdf4" : "#fef2f2", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "8px" }}>
              {uploadingDoc && <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #0891b2", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
              <span style={{ fontSize: "12px", color: uploadingDoc ? "#0891b2" : uploadDocStatus?.startsWith("✓") ? "#065f46" : "#991b1b" }}>{uploadDocStatus || "Indexing..."}</span>
            </div>
          )}

          {/* File preview */}
          {uploadedFile && (
            <div style={{ padding: "6px 16px", background: "#f0fdf4", borderTop: "1px solid #d1fae5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "#065f46" }}>📎 {uploadedFile.name}</span>
              <button onClick={() => setUploadedFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "16px" }}>×</button>
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <button onClick={() => fileInputRef.current?.click()} title="Upload PDF or image"
                style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px", cursor: "pointer", color: "#6b7280", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,image/*" style={{ display: "none" }}
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about CRA, your data, or this report... (Enter to send)"
                rows={1}
                style={{
                  flex: 1, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px",
                  resize: "none", fontSize: "13px", fontFamily: "inherit", outline: "none",
                  maxHeight: "100px", overflowY: "auto", lineHeight: "1.5",
                }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 100) + "px";
                }}
              />
              {isStreaming ? (
                <button onClick={() => abortRef.current?.abort()}
                  style={{ background: "#dc2626", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", color: "white", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h12v12H6z"/>
                  </svg>
                </button>
              ) : (
                <button onClick={sendMessage} disabled={!input.trim()}
                  style={{ background: input.trim() ? "linear-gradient(135deg, #0d9488, #0891b2)" : "#e5e7eb", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: input.trim() ? "pointer" : "not-allowed", color: "white", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              )}
            </div>
            <p style={{ fontSize: "10px", color: "#9ca3af", marginTop: "6px", textAlign: "center" }}>
              Shift+Enter for new line · Drag & drop PDF or image
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
