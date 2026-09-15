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
    <div className={`history-container w-full ${isPage ? "max-w-5xl mx-auto" : ""}`}>

      {/* Header Banner */}
      <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-5 sm:p-6 border border-m3-outline-variant shadow-m3-elevation-1 mb-5 transition-colors">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🕒</span>
              <h2 className="text-lg sm:text-title-large font-medium text-m3-on-surface font-display">
                Local Offline History
              </h2>
            </div>
            <p className="text-xs text-m3-on-surface-variant font-sans">
              🔒 100% Private in IndexedDB · Kept strictly inside your browser · Never uploaded to any cloud server.
            </p>
          </div>

          {records.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-full px-3.5 py-1.5 bg-m3-error-container text-m3-on-error-container hover:opacity-90 transition-all text-xs font-medium font-sans flex items-center gap-1.5 shadow-m3-elevation-0 hover:shadow-m3-elevation-1"
            >
              <span>🗑️</span>
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="p-3 px-4 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant/40">
            <span className="text-[11px] text-m3-on-surface-variant font-medium tracking-wide uppercase block">Files Processed</span>
            <strong className="text-lg text-m3-primary font-mono">{stats.count}</strong>
          </div>
          <div className="p-3 px-4 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant/40">
            <span className="text-[11px] text-m3-on-surface-variant font-medium tracking-wide uppercase block">Disk Space Saved</span>
            <strong className="text-lg text-emerald-600 dark:text-emerald-400 font-mono">{fmt(stats.totalSavedBytes)}</strong>
          </div>
          <div className="p-3 px-4 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant/40">
            <span className="text-[11px] text-m3-on-surface-variant font-medium tracking-wide uppercase block">Total Output Size</span>
            <strong className="text-lg text-m3-on-surface font-mono">{fmt(stats.totalProcessedBytes)}</strong>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex gap-2.5 flex-wrap mb-4 items-center">
        <input
          type="text"
          placeholder="🔍 Search by file name or tool..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] py-2 px-4 rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container text-m3-on-surface placeholder:text-m3-on-surface-variant/70 border border-m3-outline-variant focus:outline-none focus:ring-2 focus:ring-m3-primary text-xs font-sans transition-all shadow-m3-elevation-0"
        />

        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: "all", label: "All" },
            { id: "pdf", label: "📄 PDF" },
            { id: "image", label: "🖼️ Images" },
            { id: "qr", label: "📱 QR" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all font-sans whitespace-nowrap ${
                filterType === f.id
                  ? "bg-m3-secondary-container text-m3-on-secondary-container shadow-m3-elevation-1 font-semibold"
                  : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface-variant hover:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* History Items List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 px-6 rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-dashed border-m3-outline-variant text-m3-on-surface-variant transition-colors">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high flex items-center justify-center text-2xl text-m3-primary">
            🗄️
          </div>
          <h3 className="text-sm font-medium text-m3-on-surface mb-1 font-display">
            No History Items Yet
          </h3>
          <p className="text-xs text-m3-on-surface-variant max-w-sm mx-auto leading-relaxed font-sans">
            Files processed in any FlashCrush tool will automatically appear here for private, offline re-download.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(item => (
            <div
              key={item.id}
              className="rounded-2xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-3 sm:p-4 border border-m3-outline-variant shadow-m3-elevation-0 hover:shadow-m3-elevation-1 transition-all flex items-center justify-between gap-3 flex-wrap"
            >
              {/* Left: Thumbnail & Info */}
              <div className="flex items-center gap-3 min-w-[200px] flex-1">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover border border-m3-outline-variant/40"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant/40 flex items-center justify-center text-lg text-m3-primary">
                    {getToolIcon(item.tool)}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-medium text-m3-on-surface truncate max-w-[180px] sm:max-w-xs font-sans">
                    {item.fileName}
                  </div>
                  <div className="flex gap-2 items-center mt-0.5">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-m3-secondary-container text-m3-on-secondary-container font-sans">
                      {item.tool}
                    </span>
                    <span className="text-[11px] text-m3-on-surface-variant font-sans">{timeAgo(item.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* Middle: Size & Savings */}
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs sm:text-sm font-mono font-medium text-m3-primary">
                    {fmt(item.newSize)}
                  </div>
                  {item.origSize > 0 && item.origSize !== item.newSize && (
                    <div className="text-[10px] text-m3-on-surface-variant/70 line-through font-mono">
                      {fmt(item.origSize)}
                    </div>
                  )}
                </div>

                {item.savingsPct > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                    -{item.savingsPct}%
                  </span>
                )}
              </div>

              {/* Right: Actions */}
              <div className="flex gap-1.5 items-center">
                <button
                  onClick={() => handleDownload(item)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium bg-m3-primary text-m3-on-primary hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] shadow-m3-elevation-0 hover:shadow-m3-elevation-1 flex items-center gap-1.5 transition-all font-sans"
                  title="Re-Download to Device"
                >
                  <span>⬇</span>
                  <span>Download</span>
                </button>

                <button
                  onClick={() => handleDriveUpload(item)}
                  className="rounded-full p-2 bg-m3-surface-container-low dark:bg-m3-surface-container-high hover:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest border border-m3-outline-variant transition-all flex items-center justify-center text-m3-on-surface"
                  title="Save to Google Drive"
                >
                  <DriveIconSmall />
                </button>

                <button
                  onClick={(e) => handleDelete(item.id, e)}
                  className="rounded-full p-1.5 w-7 h-7 flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-error-container hover:text-m3-on-error-container transition-all text-xs"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-6 max-w-sm w-full text-center border border-m3-outline-variant shadow-m3-elevation-3 transition-colors">
            <div className="text-3xl mb-2.5">🗑️</div>
            <h3 className="text-base sm:text-title-medium font-medium text-m3-on-surface mb-1.5 font-display">
              Clear All Local History?
            </h3>
            <p className="text-xs text-m3-on-surface-variant leading-relaxed mb-5 font-sans">
              This will permanently delete all {records.length} saved local files from your browser&apos;s IndexedDB storage.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2 px-4 rounded-full border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high text-xs font-medium transition-all font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="flex-1 py-2 px-4 rounded-full bg-m3-error text-m3-on-error hover:opacity-90 text-xs font-medium transition-all font-sans shadow-m3-elevation-1"
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
        <div className="rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant shadow-m3-elevation-1 p-2.5 px-4 flex items-center justify-between mb-6 transition-colors">
          <button className="rounded-full px-3.5 py-1 text-xs font-medium bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-high dark:hover:bg-m3-surface-container-highest border border-m3-outline-variant transition-all font-sans" onClick={() => navigate("/")}>
            ← Back to Tools
          </button>
          <div className="text-sm font-medium text-m3-on-surface font-display">Offline Processing History</div>
          <div className="text-xs text-m3-on-surface-variant font-sans">IndexedDB · 100% Private</div>
        </div>
        <div className="p-0 sm:p-2">
          {content}
        </div>
      </div>
    );
  }

  // If used as drawer/modal
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-end z-[999]">
      <div className="w-full max-w-xl h-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border-l border-m3-outline-variant p-5 sm:p-6 overflow-y-auto shadow-m3-elevation-3 transition-colors">
        <div className="flex justify-between items-center mb-4">
          <span className="rounded-full px-3 py-1 text-xs font-medium bg-m3-secondary-container text-m3-on-secondary-container tracking-wide font-sans">
            IndexedDB File Drawer
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-m3-surface-container-low dark:bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface transition-all text-xs font-bold"
          >
            ✕
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
