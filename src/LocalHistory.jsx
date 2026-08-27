// LocalHistory.jsx — Offline Local IndexedDB History Studio & Quick Access Manager
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllHistoryRecords, deleteHistoryRecord, clearAllHistory, getHistoryStats } from "./historyDB";

function fmt(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function timeAgo(ts) {
  if (!ts) return "";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function getToolIcon(toolName = "") {
  const t = toolName.toLowerCase();
  if (t.includes("pdf")) return "📄";
  if (t.includes("passport")) return "🛂";
  if (t.includes("bg") || t.includes("remover")) return "🤖";
  if (t.includes("qr")) return "📱";
  if (t.includes("crop")) return "📐";
  if (t.includes("bulk")) return "📦";
  return "🖼️";
}

export default function LocalHistory({ auth, isOpen, onClose, isPage = false }) {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ count: 0, totalSavedBytes: 0, totalProcessedBytes: 0 });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all"); // "all" | "pdf" | "image" | "qr"
  const [confirmClear, setConfirmClear] = useState(false);

  const loadData = async () => {
    const list = await getAllHistoryRecords();
    setRecords(list);
    const s = await getHistoryStats();
    setStats(s);
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("flashcrush:history-updated", handleUpdate);
    return () => window.removeEventListener("flashcrush:history-updated", handleUpdate);
  }, []);

  const handleDownload = (item) => {
    if (!item.blob) return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleDriveUpload = async (item) => {
    if (!auth) return;
    try {
      if (auth.authStatus !== "signedin") {
        await auth.signIn();
        return;
      }
      await auth.uploadToDrive(item.blob, item.fileName);
      alert(`Saved "${item.fileName}" to your Google Drive!`);
    } catch (err) {
      alert("Drive save failed: " + err.message);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await deleteHistoryRecord(id);
    loadData();
  };

  const handleClearAll = async () => {
    await clearAllHistory();
    setConfirmClear(false);
    loadData();
  };

  // Filter & Search
  const filtered = records.filter(r => {
    const matchSearch = r.fileName.toLowerCase().includes(search.toLowerCase()) ||
                        r.tool.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterType === "pdf") return r.tool.toLowerCase().includes("pdf") || r.fileName.endsWith(".pdf");
    if (filterType === "image") return !r.tool.toLowerCase().includes("pdf") && !r.tool.toLowerCase().includes("qr");
    if (filterType === "qr") return r.tool.toLowerCase().includes("qr");
    return true;
  });

  const content = (
    <div className="history-container" style={{ width: "100%", maxWidth: isPage ? "1050px" : "100%", margin: isPage ? "0 auto" : "0" }}>

      {/* Header Banner */}
      <div style={{
        padding: "20px", background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.12))",
        border: "1px solid rgba(139,92,246,0.25)", borderRadius: "16px", marginBottom: "20px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "1.4rem" }}>🕒</span>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "1.3rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                Local Offline History
              </h2>
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
              🔒 100% Private in IndexedDB · Kept strictly inside your browser · Never uploaded to any cloud server.
            </p>
          </div>

          {records.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                padding: "6px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "8px", color: "#f87171", fontSize: "11px", fontWeight: 700, cursor: "pointer"
              }}
            >
              🗑️ Clear All
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginTop: "16px" }}>
          <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.3)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", display: "block" }}>Files Processed</span>
            <strong style={{ fontSize: "1.2rem", color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>{stats.count}</strong>
          </div>
          <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.3)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", display: "block" }}>Disk Space Saved</span>
            <strong style={{ fontSize: "1.2rem", color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(stats.totalSavedBytes)}</strong>
          </div>
          <div style={{ padding: "10px 14px", background: "rgba(0,0,0,0.3)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", display: "block" }}>Total Output Size</span>
            <strong style={{ fontSize: "1.2rem", color: "#c084fc", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(stats.totalProcessedBytes)}</strong>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="🔍 Search by file name or tool..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: "180px", padding: "8px 14px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "8px", color: "#fff", fontSize: "12px", outline: "none"
          }}
        />

        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "all", label: "All" },
            { id: "pdf", label: "📄 PDF" },
            { id: "image", label: "🖼️ Images" },
            { id: "qr", label: "📱 QR" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              style={{
                padding: "6px 12px", fontSize: "11px", fontWeight: 700,
                background: filterType === f.id ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                border: filterType === f.id ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px", color: filterType === f.id ? "#38bdf8" : "#94a3b8", cursor: "pointer"
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* History Items List */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 20px", background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "14px", color: "#94a3b8"
        }}>
          <div style={{ fontSize: "2.4rem", marginBottom: "10px" }}>🗄️</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            No History Items Yet
          </div>
          <div style={{ fontSize: "12px", maxWidth: "340px", margin: "0 auto" }}>
            Files processed in any FlashCrush tool (compressor, PDF tools, photo resizer, QR studio) will automatically appear here for instant re-download!
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map(item => (
            <div
              key={item.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px", gap: "14px", flexWrap: "wrap", transition: "all 0.2s"
              }}
            >
              {/* Left: Thumbnail & Info */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "220px", flex: 1 }}>
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.12)" }}
                  />
                ) : (
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "8px", background: "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem"
                  }}>
                    {getToolIcon(item.tool)}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.fileName}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                    <span style={{ fontSize: "10px", padding: "1px 6px", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "4px", color: "#c084fc", fontWeight: 700 }}>
                      {item.tool}
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>{timeAgo(item.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Middle: Size & Savings */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 800, color: "#38bdf8" }}>
                    {fmt(item.newSize)}
                  </div>
                  {item.origSize > 0 && item.origSize !== item.newSize && (
                    <div style={{ fontSize: "10px", color: "#94a3b8", textDecoration: "line-through" }}>
                      {fmt(item.origSize)}
                    </div>
                  )}
                </div>

                {item.savingsPct > 0 && (
                  <span style={{
                    fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px",
                    background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399"
                  }}>
                    -{item.savingsPct}%
                  </span>
                )}
              </div>

              {/* Right: Actions */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  onClick={() => handleDownload(item)}
                  style={{
                    padding: "6px 12px", background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)",
                    borderRadius: "8px", color: "#38bdf8", fontSize: "11px", fontWeight: 700, cursor: "pointer"
                  }}
                  title="Re-Download to Device"
                >
                  ⬇ Download
                </button>

                <button
                  onClick={() => handleDriveUpload(item)}
                  style={{
                    padding: "6px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px", color: "#cbd5e1", fontSize: "11px", cursor: "pointer"
                  }}
                  title="Save to Google Drive"
                >
                  <DriveIconSmall />
                </button>

                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  style={{
                    padding: "6px 8px", background: "none", border: "none",
                    color: "#94a3b8", fontSize: "12px", cursor: "pointer", transition: "color 0.2s"
                  }}
                  title="Delete from local history"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal for Clear All */}
      {confirmClear && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px"
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "16px",
            padding: "24px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.8)"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>🗑️</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
              Clear All Local History?
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "20px" }}>
              This will permanently delete all {records.length} saved local files from your browser&apos;s IndexedDB storage.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                style={{ flex: 1, padding: "8px", background: "#ef4444", border: "none", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer" }}
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // If used as a page `/history`
  if (isPage) {
    return (
      <div className="compressor-page">
        <div className="tool-page-bar">
          <button className="back-btn" onClick={() => navigate("/")}>← Back to Tools</button>
          <div className="tool-page-title">Offline Processing History</div>
          <div className="tool-page-meta">IndexedDB · 100% Private</div>
        </div>
        <div style={{ padding: "20px" }}>
          {content}
        </div>
      </div>
    );
  }

  // If used as drawer/modal
  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", justifyContent: "flex-end", zIndex: 999
    }}>
      <div style={{
        width: "100%", maxWidth: "560px", height: "100%", background: "#090d16",
        borderLeft: "1px solid rgba(255,255,255,0.1)", padding: "24px 20px", overflowY: "auto",
        boxShadow: "-10px 0 40px rgba(0,0,0,0.8)", boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            IndexedDB File Drawer
          </span>
          <button
            onClick={onClose}
            style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
