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
    <div className="min-h-screen bg-[#f8fafd] dark:bg-[#131314] text-gray-800 dark:text-gray-100 font-sans p-3 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full transition-colors">
      {/* ── Top Bar with Back Navigation ── */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200/60 dark:border-gray-800">
        <button
          className="rounded-full px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 border border-gray-300/70 dark:border-gray-700 transition-colors flex items-center gap-1.5"
          onClick={() => navigate("/")}
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="text-base sm:text-lg font-normal text-gray-800 dark:text-gray-100 font-sans">
          PDF Compressor
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          Max {MAX_SIZE_MB} MB · PDF only
        </div>
      </div>

      <div className="w-full">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-xl shadow-xs">
              📄
            </div>
            <h1 className="text-2xl font-normal text-gray-800 dark:text-gray-100 font-sans tracking-tight">
              PDF Compressor
            </h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 ml-13">
            Upload your PDF and reduce its file size instantly.
          </p>
        </div>

        {/* ── Main Google Keep / Drive Style Container Card ── */}
        <div className="rounded-3xl bg-white dark:bg-[#1e1f20] p-6 sm:p-8 shadow-sm border border-gray-200/60 dark:border-gray-800 transition-colors">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center transition-all cursor-pointer ${
                dragging
                  ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
                  : "border-gray-300 dark:border-gray-700 bg-[#f8fafd] dark:bg-[#181a1b] hover:bg-[#f0f4f9] dark:hover:bg-[#202224] hover:border-gray-400"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              
              <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1e1f20] text-rose-600 text-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
                📄
              </div>
              <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
                {dragging ? "Drop your PDF here!" : "Drag & drop your PDF here"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                or choose a source below · max {MAX_SIZE_MB} MB
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  className="rounded-full px-6 py-2.5 text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs transition-colors flex items-center gap-2"
                  onClick={() => inputRef.current?.click()}
                >
                  <span>📁</span>
                  <span>Browse File</span>
                </button>
                <button
                  className="rounded-full px-5 py-2.5 text-sm font-medium bg-white dark:bg-[#28292a] border border-gray-300/80 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-xs flex items-center gap-2 transition-colors disabled:opacity-60"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />
                  <span>{drivePickLabel()}</span>
                </button>
              </div>

              {stage === "error" && (
                <div className="rounded-full px-4 py-1.5 text-xs font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 inline-block mt-4 border border-rose-200 dark:border-rose-900/50">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ── File row ── */}
          {(stage === "ready" || stage === "done" || stage === "compressing") && (
            <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] p-4 flex items-center justify-between gap-3 mb-6 border border-transparent shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#1e1f20] text-rose-600 text-xl flex items-center justify-center flex-shrink-0 shadow-xs">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{file?.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{fmt(file?.size)}</div>
                </div>
              </div>
              {stage !== "compressing" && (
                <button
                  className="rounded-full p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-colors text-sm"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── Compression Level selector (M3 Chips) ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="my-6">
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2.5">
                Compression Level
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    className={`rounded-full py-2.5 px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      level === l.id
                        ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                        : "bg-[#f0f4f9] dark:bg-[#28292a] text-gray-700 dark:text-gray-300 hover:bg-[#e9eef6] dark:hover:bg-[#333537]"
                    }`}
                    onClick={() => setLevel(l.id)}
                  >
                    <span>{l.icon}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                {LEVELS.find(l => l.id === level)?.desc}
              </p>
            </div>
          )}

          {/* ── Compress button (M3 Primary Pill) ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="my-6">
              <button
                className="w-full rounded-full py-3 px-6 text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs transition-colors flex items-center justify-center gap-2"
                onClick={compress}
              >
                <span>{stage === "done" ? "🔁 Re-compress PDF" : "⚡ Compress PDF"}</span>
              </button>
            </div>
          )}

          {/* ── Progress (M3 Linear Indicator) ── */}
          {stage === "compressing" && (
            <div className="my-6 p-4 rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a]">
              <div className="flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                <span>Compressing your PDF...</span>
                <span className="text-blue-600 font-bold">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0b57d0] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] p-5 my-6 border border-gray-200/60 dark:border-gray-800">
              {usedFallback && (
                <div className="rounded-xl p-2.5 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 text-center mb-4 border border-amber-200 dark:border-amber-900/50">
                  ℹ️ This PDF is already optimised — metadata stripped &amp; returned as-is
                </div>
              )}
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Original</div>
                  <div className="text-base font-semibold text-gray-800 dark:text-gray-100">{fmt(result.originalSize)}</div>
                </div>
                <div className="text-lg text-gray-400 font-bold">→</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Compressed</div>
                  <div className="text-base font-semibold text-blue-600 dark:text-blue-400">{fmt(result.compressedSize)}</div>
                </div>
              </div>
              <div className="text-center mt-3">
                <span className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 inline-block">
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

          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-6 mt-6 border-t border-gray-100 dark:border-gray-800/80">
            <span>FlashCrush · PDF Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
