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
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top Bar with Back Navigation ── */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 flex items-center justify-between transition-colors">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container-low hover:bg-m3-surface-container text-m3-on-surface text-sm font-semibold transition-all duration-200 shadow-sm active:scale-95"
          onClick={() => navigate("/")}
        >
          <span className="text-base leading-none">←</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">📄</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF Compressor</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Max {MAX_SIZE_MB} MB · PDF only
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            📄
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            PDF Compressor
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Upload your PDF and reduce its file size instantly with high-fidelity on-device compression. 100% private, zero uploads.
          </p>
        </div>

        {/* ── Main Google Keep / Drive Style Container Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1 transition-colors">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center transition-all duration-300 cursor-pointer group ${
                dragging
                  ? "border-m3-primary bg-m3-primary-container/30"
                  : "border-m3-outline-variant hover:border-m3-primary bg-m3-surface-container/40 hover:bg-m3-surface-container/80"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              
              <div className="w-20 h-20 rounded-full bg-m3-primary/10 text-m3-primary text-4xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                📄
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-m3-on-surface mb-2">
                {dragging ? "Drop your PDF here!" : "Drag & drop your PDF here"}
              </div>
              <div className="text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
                or choose a source below · Max {MAX_SIZE_MB} MB
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="px-8 py-3.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 hover:bg-m3-primary/90 active:scale-95 transition-all duration-200 flex items-center gap-2"
                  onClick={() => inputRef.current?.click()}
                >
                  <span>📁</span>
                  <span>Browse File</span>
                </button>
                <button
                  type="button"
                  className="rounded-full px-5 py-3 text-sm font-semibold bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/80 text-m3-on-surface shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />
                  <span>{drivePickLabel()}</span>
                </button>
              </div>

              {stage === "error" && (
                <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/20 font-medium text-sm flex items-center justify-center gap-2 shadow-sm max-w-md mx-auto">
                  <span>⚠</span>
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* ── File row ── */}
          {(stage === "ready" || stage === "done" || stage === "compressing") && (
            <div className="bg-m3-surface-container rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 mb-6 border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-m3-primary/10 text-m3-primary text-2xl flex items-center justify-center flex-shrink-0">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm sm:text-base text-m3-on-surface truncate">
                    {file?.name}
                  </div>
                  <div className="text-xs font-mono text-m3-on-surface-variant mt-0.5">
                    {fmt(file?.size)}
                  </div>
                </div>
              </div>
              {stage !== "compressing" && (
                <button
                  type="button"
                  className="p-2.5 rounded-full hover:bg-m3-error-container hover:text-m3-on-error-container text-m3-on-surface-variant transition-all text-sm active:scale-95"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── Compression Level selector (M3 Cards) ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="my-6">
              <span className="block text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider mb-3">
                Compression Level
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {LEVELS.map((l) => {
                  const isSelected = level === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`rounded-2xl p-4 text-left sm:text-center flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
                        isSelected
                          ? "border-2 border-m3-primary bg-m3-primary-container text-m3-on-primary-container shadow-sm"
                          : "border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface"
                      }`}
                      onClick={() => setLevel(l.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{l.icon}</span>
                        <span className="font-display font-bold text-sm sm:text-base">{l.label}</span>
                      </div>
                      <span className={`text-xs ${isSelected ? "text-m3-on-primary-container/80" : "text-m3-on-surface-variant"}`}>
                        {l.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Compress button (M3 Primary Pill) ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="my-6">
              <button
                type="button"
                className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2"
                onClick={compress}
              >
                <span>{stage === "done" ? "🔁 Re-compress PDF" : "⚡ Compress PDF"}</span>
              </button>
            </div>
          )}

          {/* ── Progress (M3 Linear Indicator) ── */}
          {stage === "compressing" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-m3-on-surface mb-2.5">
                <span>Compressing your PDF...</span>
                <span className="font-mono text-m3-primary font-bold text-sm">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-m3-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full bg-m3-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs font-medium text-m3-on-surface-variant mt-2.5 text-center animate-pulse">
                {progressMsg}
              </p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
              {usedFallback && (
                <div className="rounded-xl p-3 text-xs font-medium text-m3-on-secondary-container bg-m3-secondary-container text-center mb-4 border border-m3-outline-variant/40">
                  ℹ️ This PDF is already optimised — metadata stripped &amp; returned as-is
                </div>
              )}
              <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                <div className="text-center">
                  <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Original</div>
                  <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">{fmt(result.originalSize)}</div>
                </div>
                <div className="text-xl text-m3-outline font-bold">→</div>
                <div className="text-center">
                  <div className="text-xs font-semibold text-m3-primary mb-1">Compressed</div>
                  <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">{fmt(result.compressedSize)}</div>
                </div>
              </div>
              <div className="text-center mt-3">
                <span className="rounded-full px-4 py-1.5 text-xs font-mono font-bold bg-m3-tertiary-container text-m3-on-tertiary-container inline-block border border-m3-tertiary/20 shadow-xs">
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
              toolName="PDF Compressor"
            />
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · PDF Tool</span>
            <span>100% Client-Side · Zero Server Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
