// LocalHistory.jsx — Offline Local IndexedDB History Studio & Quick Access Manager
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllHistoryRecords, deleteHistoryRecord, clearAllHistory, getHistoryStats } from "./historyDB";

function DriveIconSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

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
        padding: "20px", background: "#FFFFFF",
        border: "3px solid #1a1a1a", borderRadius: "12px", marginBottom: "20px",
        boxShadow: "4px 4px 0px #1a1a1a"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "1.4rem" }}>🕒</span>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.3rem", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                Local Offline History
              </h2>
            </div>
            <p style={{ fontSize: "12px", color: "#525252", margin: 0 }}>
              🔒 100% Private in IndexedDB · Kept strictly inside your browser · Never uploaded to any cloud server.
            </p>
          </div>

          {records.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              style={{
                padding: "6px 12px", background: "#FEE2E2", border: "2px solid #1a1a1a",
                borderRadius: "8px", color: "#B91C1C", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                boxShadow: "2px 2px 0px #1a1a1a"
              }}
            >
              🗑️ Clear All
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginTop: "16px" }}>
          <div style={{ padding: "10px 14px", background: "#F0F9FF", borderRadius: "8px", border: "2px solid #1a1a1a" }}>
            <span style={{ fontSize: "10px", color: "#525252", textTransform: "uppercase", display: "block", fontWeight: 700 }}>Files Processed</span>
            <strong style={{ fontSize: "1.2rem", color: "#0284C7", fontFamily: "'JetBrains Mono', monospace" }}>{stats.count}</strong>
          </div>
          <div style={{ padding: "10px 14px", background: "#ECFDF5", borderRadius: "8px", border: "2px solid #1a1a1a" }}>
            <span style={{ fontSize: "10px", color: "#525252", textTransform: "uppercase", display: "block", fontWeight: 700 }}>Disk Space Saved</span>
            <strong style={{ fontSize: "1.2rem", color: "#059669", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(stats.totalSavedBytes)}</strong>
          </div>
          <div style={{ padding: "10px 14px", background: "#FAF5FF", borderRadius: "8px", border: "2px solid #1a1a1a" }}>
            <span style={{ fontSize: "10px", color: "#525252", textTransform: "uppercase", display: "block", fontWeight: 700 }}>Total Output Size</span>
            <strong style={{ fontSize: "1.2rem", color: "#7C3AED", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(stats.totalProcessedBytes)}</strong>
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
            flex: 1, minWidth: "180px", padding: "9px 14px", background: "#FFFFFF", border: "2px solid #1a1a1a",
            borderRadius: "8px", color: "#1a1a1a", fontSize: "12px", outline: "none",
            boxShadow: "2px 2px 0px #1a1a1a"
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
                padding: "7px 12px", fontSize: "11px", fontWeight: 700,
                background: filterType === f.id ? "#FFD93D" : "#FFFFFF",
                border: "2px solid #1a1a1a",
                borderRadius: "8px", color: "#1a1a1a", cursor: "pointer",
                boxShadow: filterType === f.id ? "2px 2px 0px #1a1a1a" : "none",
                transform: filterType === f.id ? "translate(-1px, -1px)" : "none"
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
          textAlign: "center", padding: "48px 20px", background: "#FFFFFF",
          border: "2px dashed #1a1a1a", borderRadius: "12px", color: "#525252"
        }}>
          <div style={{ fontSize: "2.4rem", marginBottom: "10px" }}>🗄️</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px", fontFamily: "'Space Grotesk', sans-serif" }}>
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
                padding: "12px 16px", background: "#FFFFFF", border: "2px solid #1a1a1a",
                borderRadius: "12px", gap: "14px", flexWrap: "wrap", transition: "all 0.15s",
                boxShadow: "3px 3px 0px #1a1a1a"
              }}
            >
              {/* Left: Thumbnail & Info */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "220px", flex: 1 }}>
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    style={{ width: "42px", height: "42px", objectFit: "cover", borderRadius: "8px", border: "2px solid #1a1a1a" }}
                  />
                ) : (
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "8px", background: "#FEF3C7",
                    border: "2px solid #1a1a1a",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem"
                  }}>
                    {getToolIcon(item.tool)}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.fileName}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                    <span style={{ fontSize: "10px", padding: "1px 6px", background: "#D8B4FE", border: "1px solid #1a1a1a", borderRadius: "4px", color: "#1a1a1a", fontWeight: 700 }}>
                      {item.tool}
                    </span>
                    <span style={{ fontSize: "11px", color: "#737373" }}>{timeAgo(item.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Middle: Size & Savings */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 700, color: "#0284C7" }}>
                    {fmt(item.newSize)}
                  </div>
                  {item.origSize > 0 && item.origSize !== item.newSize && (
                    <div style={{ fontSize: "10px", color: "#737373", textDecoration: "line-through" }}>
                      {fmt(item.origSize)}
                    </div>
                  )}
                </div>

                {item.savingsPct > 0 && (
                  <span style={{
                    fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "6px",
                    background: "#6EE7B7", border: "1px solid #1a1a1a", color: "#1a1a1a"
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
                    padding: "6px 12px", background: "#6EE7B7", border: "2px solid #1a1a1a",
                    borderRadius: "8px", color: "#1a1a1a", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                    boxShadow: "2px 2px 0px #1a1a1a"
                  }}
                  title="Re-Download to Device"
                >
                  ⬇ Download
                </button>

                <button
                  onClick={() => handleDriveUpload(item)}
                  style={{
                    padding: "6px 8px", background: "#FFFFFF", border: "2px solid #1a1a1a",
                    borderRadius: "8px", color: "#1a1a1a", fontSize: "11px", cursor: "pointer",
                    boxShadow: "2px 2px 0px #1a1a1a"
                  }}
                  title="Save to Google Drive"
                >
                  <DriveIconSmall />
                </button>

                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  style={{
                    padding: "6px 8px", background: "#FEE2E2", border: "2px solid #1a1a1a", borderRadius: "8px",
                    color: "#1a1a1a", fontSize: "11px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
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
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px"
        }}>
          <div style={{
            background: "#FFFFFF", border: "3px solid #1a1a1a", borderRadius: "16px",
            padding: "24px", maxWidth: "380px", width: "100%", textAlign: "center", boxShadow: "8px 8px 0px #1a1a1a"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "10px" }}>🗑️</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1a1a1a", marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>
              Clear All Local History?
            </div>
            <p style={{ fontSize: "12px", color: "#525252", marginBottom: "20px" }}>
              This will permanently delete all {records.length} saved local files from your browser&apos;s IndexedDB storage.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ flex: 1, padding: "9px", background: "#FFFFFF", border: "2px solid #1a1a1a", borderRadius: "8px", color: "#1a1a1a", fontWeight: 700, cursor: "pointer", boxShadow: "2px 2px 0px #1a1a1a" }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                style={{ flex: 1, padding: "9px", background: "#EF4444", border: "2px solid #1a1a1a", borderRadius: "8px", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "2px 2px 0px #1a1a1a" }}
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
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "flex-end", zIndex: 999
    }}>
      <div style={{
        width: "100%", maxWidth: "560px", height: "100%", background: "#FFFBEB",
        borderLeft: "3px solid #1a1a1a", padding: "24px 20px", overflowY: "auto",
        boxShadow: "-8px 0 0px #1a1a1a", boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.08em", background: "#FFD93D", border: "2px solid #1a1a1a", padding: "4px 8px", borderRadius: "6px" }}>
            IndexedDB File Drawer
          </span>
          <button
            onClick={onClose}
            style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#FEE2E2", border: "2px solid #1a1a1a", color: "#1a1a1a", fontWeight: 700, cursor: "pointer", boxShadow: "2px 2px 0px #1a1a1a" }}
          >
            ✕
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
