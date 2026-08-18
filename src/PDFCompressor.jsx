// PDFCompressor.jsx
// Strategy:
//   1. Render each page via PDF.js → JPEG → rebuild PDF with pdf-lib
//   2. Smart fallback: if result > original, return original bytes (never increase size)
//   3. Quality levels tuned for both text and image PDFs

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 30;
const MAX_SIZE    = MAX_SIZE_MB * 1024 * 1024;

// Compression levels tuned for real reduction without destroying readability
const LEVELS = [
  { id: "low",    label: "Low",    desc: "Light compression, near-original quality",  icon: "🟢", scale: 1.8, quality: 0.88 },
  { id: "medium", label: "Medium", desc: "~35–55% smaller, good readability",          icon: "🟡", scale: 1.4, quality: 0.72 },
  { id: "high",   label: "High",   desc: "~55–80% smaller, readable text",             icon: "🔴", scale: 1.0, quality: 0.50 },
];

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024)        return bytes + " B";
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

// Load PDF.js from CDN once
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

// Render one PDF.js page → JPEG blob at given scale & quality
function renderPageToJpeg(pdfPage, scale, quality) {
  return new Promise(async (resolve, reject) => {
    try {
      const viewport = pdfPage.getViewport({ scale });
      const canvas   = document.createElement("canvas");
      canvas.width   = Math.floor(viewport.width);
      canvas.height  = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      // White background so transparent PNGs don't go black
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
        "image/jpeg", quality
      );
    } catch (e) { reject(e); }
  });
}

export default function PDFCompressor({ auth }) {
  const navigate = useNavigate();
  const [file,           setFile]           = useState(null);
  const [dragging,       setDragging]       = useState(false);
  const [level,          setLevel]          = useState("medium");
  const [stage,          setStage]          = useState("idle");
  const [progress,       setProgress]       = useState(0);
  const [progressMsg,    setProgressMsg]    = useState("");
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [pickLoading,    setPickLoading]    = useState(false);
  const [usedFallback,   setUsedFallback]   = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are allowed."); setStage("error"); return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`); setStage("error"); return;
    }
    setFile(f); setStage("ready"); setResult(null);
    setErrorMsg(""); setCompressedBlob(null); setUsedFallback(false);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.pickFromDrive(["application/pdf"], (f) => handleFile(f), token);
    } catch (err) {
      setErrorMsg(err.message || "Could not import from Drive. Try again."); setStage("error");
    } finally { setPickLoading(false); }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ── MAIN COMPRESSION ──────────────────────────────────────────────────────
  const compress = async () => {
    setStage("compressing");
    setProgress(2); setProgressMsg("Loading PDF engine...");
    setErrorMsg(""); setUsedFallback(false);

    const sel = LEVELS.find((l) => l.id === level);

    try {
      const pdfjsLib    = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();

      setProgress(8); setProgressMsg("Parsing PDF structure...");
      const pdfJsDoc  = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const totalPages = pdfJsDoc.numPages;

      setProgress(12); setProgressMsg(`Found ${totalPages} page${totalPages > 1 ? "s" : ""} — compressing...`);

      const outPdf = await PDFDocument.create();

      for (let i = 1; i <= totalPages; i++) {
        const pct = Math.round(12 + ((i - 1) / totalPages) * 76);
        setProgress(pct);
        setProgressMsg(`Page ${i} / ${totalPages}...`);

        const pdfPage  = await pdfJsDoc.getPage(i);
        const jpegBlob = await renderPageToJpeg(pdfPage, sel.scale, sel.quality);
        const jpegBuf  = await jpegBlob.arrayBuffer();

        const jpgImg    = await outPdf.embedJpg(jpegBuf);
        const { width, height } = jpgImg.scale(1);
        const page = outPdf.addPage([width, height]);
        page.drawImage(jpgImg, { x: 0, y: 0, width, height });
      }

      setProgress(90); setProgressMsg("Saving output...");
      const compressedBytes = await outPdf.save({ useObjectStreams: true });
      const renderedBlob    = new Blob([compressedBytes], { type: "application/pdf" });

      setProgress(100); setProgressMsg("Done!");

      // ── Smart fallback: never deliver a bigger file ──────────────────────
      let finalBlob  = renderedBlob;
      let fellBack   = false;

      if (renderedBlob.size >= file.size) {
        const origBytes  = await file.arrayBuffer();
        const origPdf    = await PDFDocument.load(origBytes, { ignoreEncryption: true });
        origPdf.setTitle(""); origPdf.setAuthor(""); origPdf.setSubject("");
        origPdf.setKeywords([]); origPdf.setProducer(""); origPdf.setCreator("");
        const strippedBytes = await origPdf.save({ useObjectStreams: true });
        const strippedBlob  = new Blob([strippedBytes], { type: "application/pdf" });

        finalBlob = strippedBlob.size < file.size ? strippedBlob
                    : new Blob([origBytes], { type: "application/pdf" });
        fellBack = true;
      }

      const saving = Math.max(0, Math.round(((file.size - finalBlob.size) / file.size) * 100));
      setUsedFallback(fellBack);
      setCompressedBlob(finalBlob);
      setResult({ originalSize: file.size, compressedSize: finalBlob.size, saving });
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.message?.toLowerCase().includes("password")
          ? "This PDF is password-protected."
          : `Compression failed: ${err.message || "unknown error"}`
      );
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null); setStage("idle"); setProgress(0);
    setResult(null); setErrorMsg(""); setProgressMsg("");
    setCompressedBlob(null); setUsedFallback(false);
  };

  const drivePickLabel = () => {
    if (pickLoading) return "Loading...";
    if (auth.authStatus === "loading") return "Signing in...";
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
        <div className="tool-page-title">PDF Compressor</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · PDF only</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge pdf">📄</div>
            <div className="comp-title">PDF Compressor</div>
          </div>
          <p className="comp-sub">Upload your PDF and reduce its file size instantly.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">📄</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" : "Drag & drop your PDF here"}</p>
              <p className="drop-sub">or choose a source below · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>
                  📁 Browse File
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

          {/* ── File row ── */}
          {(stage === "ready" || stage === "done" || stage === "compressing") && (
            <div className="file-row">
              <div className="file-icon pdf">📄</div>
              <div className="file-info">
                <div className="file-name">{file?.name}</div>
                <div className="file-size">{fmt(file?.size)}</div>
              </div>
              {stage !== "compressing" && (
                <button className="close-btn" onClick={reset}>✕</button>
              )}
            </div>
          )}

          {/* ── Level selector ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="level-wrap">
              <span className="level-label">Compression Level</span>
              <div className="level-grid">
                {LEVELS.map((l) => (
                  <button key={l.id}
                    className={`level-btn${level === l.id ? " active-pdf" : ""}`}
                    onClick={() => setLevel(l.id)}>
                    <span className="level-icon">{l.icon}</span>
                    <span className="level-name">{l.label}</span>
                  </button>
                ))}
              </div>
              <p className="level-hint">{LEVELS.find(l => l.id === level)?.desc}</p>
            </div>
          )}

          {/* ── Compress button ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="action-wrap">
              <button className="btn-compress pdf" onClick={compress}>
                {stage === "done" ? "🔁 Re-compress PDF" : "⚡ Compress PDF"}
              </button>
            </div>
          )}

          {/* ── Progress ── */}
          {stage === "compressing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Compressing your PDF...</span>
                <span className="progress-pct red">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <div className="result-box">
              {usedFallback && (
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", textAlign: "center",
                  marginBottom: 10, padding: "6px 10px",
                  background: "rgba(168,85,247,0.06)", borderRadius: 8,
                  border: "1px solid rgba(168,85,247,0.12)"
                }}>
                  ℹ️ This PDF is already optimised — metadata stripped &amp; returned as-is
                </div>
              )}
              <div className="result-grid">
                <div>
                  <span className="result-label">Original</span>
                  <span className="result-val-orig">{fmt(result.originalSize)}</span>
                </div>
                <div className="result-arrow">→</div>
                <div>
                  <span className="result-label">Compressed</span>
                  <span className="result-val-comp">{fmt(result.compressedSize)}</span>
                </div>
              </div>
              <div className="result-badge">
                <span>
                  {result.saving > 0
                    ? `🎉 ${result.saving}% smaller`
                    : "✅ Already fully optimised"}
                </span>
              </div>
            </div>
          )}

          {/* ── Action Buttons ── */}
          {stage === "done" && compressedBlob && (
            <ActionButtons
              blob={compressedBlob}
              fileName={`compressed_${file?.name}`}
              onReset={reset}
              auth={auth}
            />
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
