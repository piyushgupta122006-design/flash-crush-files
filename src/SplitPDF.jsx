// SplitPDF.jsx — Split & Extract PDF Pages with visual preview
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 50;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

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

// Load PDF.js from CDN
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF engine"));
    document.head.appendChild(s);
  });
}

// Parse range string like "1-3, 5, 7-10" into array of page numbers (1-indexed)
function parsePageRanges(rangeStr, totalPages) {
  const pages = new Set();
  const parts = rangeStr.split(",").map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: "${part}"`);
      if (start < 1 || end > totalPages || start > end) throw new Error(`Range "${part}" is out of bounds (1-${totalPages})`);
      for (let i = start; i <= end; i++) pages.add(i);
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1 || num > totalPages) throw new Error(`Page ${part} is out of bounds (1-${totalPages})`);
      pages.add(num);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

const SPLIT_MODES = [
  { id: "extract", label: "Extract Range", desc: "Pick specific pages (e.g. 1-3, 5, 8)", icon: "📄" },
  { id: "split-all", label: "Split All Pages", desc: "Each page → individual PDF in a ZIP", icon: "📦" },
  { id: "split-every", label: "Split Every N", desc: "Chunk into groups of N pages each", icon: "✂️" },
];

export default function SplitPDF({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [thumbnails, setThumbnails] = useState([]); // [{ pageNum, url }]
  const [mode, setMode] = useState("extract");
  const [rangeInput, setRangeInput] = useState("");
  const [splitN, setSplitN] = useState(2);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);
  const inputRef = useRef(null);
  const pdfBytesRef = useRef(null);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported.");
      setStage("error");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      setStage("error");
      return;
    }
    setFile(f);
    setErrorMsg("");
    setStage("loaded");

    // Read and render thumbnails
    try {
      const arrayBuffer = await f.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(arrayBuffer);

      const pdfjs = await loadPdfJs();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const numPages = pdfDoc.numPages;
      setTotalPages(numPages);
      setRangeInput(`1-${numPages}`);

      // Generate small thumbnails
      const thumbs = [];
      const maxThumbs = Math.min(numPages, 60); // limit for performance
      for (let i = 1; i <= maxThumbs; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        thumbs.push({ pageNum: i, url: canvas.toDataURL("image/jpeg", 0.6) });
      }
      setThumbnails(thumbs);
      // Select all pages by default
      setSelectedPages(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
    } catch (err) {
      setErrorMsg("Failed to load PDF: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.ensurePickerReady();
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true).setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf");
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147").setOAuthToken(token).addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "document.pdf";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: "application/pdf" }));
            } catch (err) {
              setErrorMsg(err.message || "Failed to download from Drive.");
              setStage("error");
            }
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  const togglePage = (pageNum) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectAll = () => setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i + 1)));
  const deselectAll = () => setSelectedPages(new Set());

  const executeSplit = async () => {
    if (!pdfBytesRef.current) return;
    setStage("processing");
    setProgress(5);
    setErrorMsg("");

    try {
      const srcDoc = await PDFDocument.load(pdfBytesRef.current);
      const baseName = file.name.replace(/\.[^.]+$/, "");

      if (mode === "extract") {
        // Extract specific pages into one PDF
        setProgressMsg("Parsing page range...");
        let pagesToExtract;
        try {
          pagesToExtract = parsePageRanges(rangeInput, totalPages);
        } catch (err) {
          throw new Error(err.message);
        }
        if (pagesToExtract.length === 0) throw new Error("No pages selected.");

        setProgressMsg(`Extracting ${pagesToExtract.length} pages...`);
        setProgress(20);

        const newDoc = await PDFDocument.create();
        const indices = pagesToExtract.map(p => p - 1); // pdf-lib uses 0-indexed
        const copiedPages = await newDoc.copyPages(srcDoc, indices);
        copiedPages.forEach(page => newDoc.addPage(page));

        setProgress(80);
        setProgressMsg("Building PDF...");
        const pdfBytes = await newDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const name = `${baseName}_pages_${rangeInput.replace(/\s/g, "")}.pdf`;
        setResultBlob(blob);
        setResultName(name);
        setResultInfo(`Extracted ${pagesToExtract.length} pages · ${fmt(blob.size)}`);

      } else if (mode === "split-all") {
        // Each page → individual PDF, packaged in ZIP
        setProgressMsg("Splitting into individual pages...");
        const zip = new JSZip();
        const folder = zip.folder(`${baseName}_split`);

        for (let i = 0; i < totalPages; i++) {
          setProgress(Math.round(10 + (i / totalPages) * 70));
          setProgressMsg(`Splitting page ${i + 1} of ${totalPages}...`);

          const singleDoc = await PDFDocument.create();
          const [copied] = await singleDoc.copyPages(srcDoc, [i]);
          singleDoc.addPage(copied);
          const singleBytes = await singleDoc.save();
          folder.file(`${baseName}_page_${String(i + 1).padStart(3, "0")}.pdf`, singleBytes);
        }

        setProgress(85);
        setProgressMsg("Packing ZIP archive...");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setResultBlob(zipBlob);
        setResultName(`${baseName}_split_all.zip`);
        setResultInfo(`${totalPages} individual PDFs · ${fmt(zipBlob.size)}`);

      } else if (mode === "split-every") {
        // Split into chunks of N pages
        const n = Math.max(1, Math.min(splitN, totalPages));
        const chunks = Math.ceil(totalPages / n);
        setProgressMsg(`Splitting into chunks of ${n} pages...`);
        const zip = new JSZip();
        const folder = zip.folder(`${baseName}_chunks`);

        for (let c = 0; c < chunks; c++) {
          setProgress(Math.round(10 + (c / chunks) * 70));
          const start = c * n;
          const end = Math.min(start + n, totalPages);
          setProgressMsg(`Building chunk ${c + 1} of ${chunks} (pages ${start + 1}-${end})...`);

          const chunkDoc = await PDFDocument.create();
          const indices = Array.from({ length: end - start }, (_, i) => start + i);
          const copiedPages = await chunkDoc.copyPages(srcDoc, indices);
          copiedPages.forEach(page => chunkDoc.addPage(page));
          const chunkBytes = await chunkDoc.save();
          folder.file(`${baseName}_part_${String(c + 1).padStart(2, "0")}.pdf`, chunkBytes);
        }

        setProgress(85);
        setProgressMsg("Packing ZIP archive...");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setResultBlob(zipBlob);
        setResultName(`${baseName}_split_${n}pages.zip`);
        setResultInfo(`${chunks} PDFs (${n} pages each) · ${fmt(zipBlob.size)}`);
      }

      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Split failed.");
      setStage("error");
    }
  };

  const reset = () => {
    thumbnails.forEach(t => { try { URL.revokeObjectURL(t.url); } catch {} });
    setThumbnails([]);
    setFile(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setTotalPages(0);
    setSelectedPages(new Set());
    pdfBytesRef.current = null;
  };

  const drivePickLabel = () => {
    if (pickLoading || auth.authStatus === "loading") return "Loading...";
    if (auth.authStatus === "signedin") {
      const name = auth.user?.name?.split(" ")[0] || auth.user?.email?.split("@")[0];
      return `Import from Drive  ·  ${name}`;
    }
    return "Import from Drive";
  };

  return (
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">Split & Extract PDF</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · Visual Preview</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(168, 85, 247, 0.4)", boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)" }}>
              ✂️
            </div>
            <div className="comp-title">Split & Extract PDF Pages</div>
          </div>
          <p className="comp-sub">Extract specific pages, split all pages into individual PDFs, or chunk into groups.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && !file && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">✂️</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" : "Drag & drop your PDF to split"}</p>
              <p className="drop-sub">Select PDF to split or extract pages · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>
                  📁 Browse PDF
                </button>
                <button className="drop-btn-drive"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && (
                <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>
              )}
            </div>
          )}

          {/* ── Selected File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "processing" || stage === "error") && (
            <div className="file-row">
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)} · {totalPages} pages</div>
              </div>
              {stage !== "processing" && (
                <button className="close-btn" onClick={reset}>✕</button>
              )}
            </div>
          )}

          {/* ── Error Message ── */}
          {stage === "error" && file && errorMsg && (
            <div style={{ padding: "0 20px 10px" }}>
              <div className="error-box">⚠ {errorMsg}</div>
            </div>
          )}

          {/* ── Split Mode Selector ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="level-wrap">
              <span className="level-label">1. Choose Split Mode</span>
              <div className="level-grid">
                {SPLIT_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`level-btn${mode === m.id ? " active" : ""}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span style={{ fontSize: "1.3rem" }}>{m.icon}</span>
                    <span className="level-name">{m.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Mode-specific Controls ── */}
          {(stage === "loaded" || stage === "done") && mode === "extract" && (
            <div style={{ padding: "0 20px 16px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                2. Enter Page Range (e.g. 1-3, 5, 8-10)
              </label>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder={`1-${totalPages}`}
                style={{
                  width: "100%", padding: "12px 16px", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "14px", color: "#fff", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#8b5cf6"; e.target.style.boxShadow = "0 0 20px rgba(139,92,246,0.3)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
              />
              <div style={{ fontSize: "12px", color: "var(--text-sub)", marginTop: "6px" }}>
                Total pages: <strong style={{ color: "#fff" }}>{totalPages}</strong> · Separate ranges with commas
              </div>
            </div>
          )}

          {(stage === "loaded" || stage === "done") && mode === "split-every" && (
            <div style={{ padding: "0 20px 16px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                2. Pages per chunk
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={splitN}
                  onChange={(e) => setSplitN(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: "80px", padding: "12px 16px", textAlign: "center",
                    background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "14px", color: "#fff", outline: "none",
                  }}
                />
                <span style={{ fontSize: "13px", color: "var(--text-sub)" }}>
                  → {Math.ceil(totalPages / Math.max(1, splitN))} output PDFs
                </span>
              </div>
            </div>
          )}

          {/* ── Visual Page Thumbnails (for Extract mode) ── */}
          {(stage === "loaded" || stage === "done") && mode === "extract" && thumbnails.length > 0 && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Visual Page Selector ({selectedPages.size}/{totalPages} selected)
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={selectAll} style={{
                    padding: "4px 10px", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                    borderRadius: "8px", color: "#c084fc", fontSize: "11px", fontWeight: 700, cursor: "pointer"
                  }}>Select All</button>
                  <button onClick={deselectAll} style={{
                    padding: "4px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px", color: "#94a3b8", fontSize: "11px", fontWeight: 700, cursor: "pointer"
                  }}>Clear</button>
                </div>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(80px, 100%), 1fr))",
                gap: "8px", maxHeight: "280px", overflowY: "auto", padding: "6px",
                borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)"
              }}>
                {thumbnails.map((t) => {
                  const isSelected = selectedPages.has(t.pageNum);
                  return (
                    <div
                      key={t.pageNum}
                      onClick={() => {
                        togglePage(t.pageNum);
                        // Also update range input based on selection
                      }}
                      style={{
                        position: "relative", cursor: "pointer",
                        border: isSelected ? "2px solid #8b5cf6" : "2px solid transparent",
                        borderRadius: "8px", overflow: "hidden",
                        opacity: isSelected ? 1 : 0.45,
                        transition: "all 0.15s ease",
                        background: "rgba(0,0,0,0.3)",
                      }}
                    >
                      <img src={t.url} alt={`Page ${t.pageNum}`}
                        style={{ width: "100%", display: "block" }} />
                      <span style={{
                        position: "absolute", bottom: "3px", left: "50%", transform: "translateX(-50%)",
                        background: isSelected ? "rgba(139,92,246,0.9)" : "rgba(0,0,0,0.7)",
                        color: "#fff", fontSize: "9px", fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: "1px 6px", borderRadius: "4px"
                      }}>{t.pageNum}</span>
                      {isSelected && (
                        <span style={{
                          position: "absolute", top: "3px", right: "3px",
                          background: "#8b5cf6", color: "#fff",
                          width: "16px", height: "16px", borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "10px", fontWeight: 800
                        }}>✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Split / Extract Button ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="action-wrap">
              <button className="btn-compress" onClick={executeSplit}>
                {mode === "extract" ? "⚡ Extract Selected Pages" :
                  mode === "split-all" ? "⚡ Split All Pages to ZIP" :
                    `⚡ Split into ${Math.ceil(totalPages / Math.max(1, splitN))} Chunks`}
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Processing PDF...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Results ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{ margin: "10px 0 20px", background: "rgba(168, 85, 247, 0.08)", borderColor: "rgba(168, 85, 247, 0.3)" }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {totalPages} Pages · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Output</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "#c084fc" }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{ background: "rgba(168, 85, 247, 0.18)", borderColor: "#a855f7", color: "#c084fc" }}>
                  ✂️ Split Complete
                </div>
              </div>

              <ActionButtons
                blob={resultBlob}
                fileName={resultName}
                onReset={reset}
                auth={auth}
              />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · Split & Extract PDF Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
