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
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">✂️</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">Split & Extract PDF</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Max {MAX_SIZE_MB} MB · Visual Preview
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            ✂️
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            Split & Extract PDF Pages
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Extract specific pages, split all pages into individual PDFs, or chunk into groups. 100% private and on-device.
          </p>
        </div>

        {/* ── Main Container Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1 transition-colors">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && !file && (
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
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <div className="w-20 h-20 rounded-full bg-m3-primary/10 text-m3-primary text-4xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                ✂️
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-m3-on-surface mb-2">
                {dragging ? "Drop your PDF here!" : "Drag & drop your PDF to split"}
              </div>
              <div className="text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
                Select PDF to split or extract pages · Max {MAX_SIZE_MB} MB
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="px-8 py-3.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 hover:bg-m3-primary/90 active:scale-95 transition-all duration-200 flex items-center gap-2"
                  onClick={() => inputRef.current?.click()}
                >
                  <span>📁</span>
                  <span>Browse PDF</span>
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

          {/* ── Selected File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "processing" || stage === "error") && (
            <div className="bg-m3-surface-container rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 mb-6 border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-m3-primary/10 text-m3-primary text-2xl flex items-center justify-center flex-shrink-0">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm sm:text-base text-m3-on-surface truncate">
                    {file.name}
                  </div>
                  <div className="text-xs font-mono text-m3-on-surface-variant mt-0.5">
                    {fmt(file.size)} · {totalPages} pages
                  </div>
                </div>
              </div>
              {stage !== "processing" && (
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

          {/* ── Error Message ── */}
          {stage === "error" && file && errorMsg && (
            <div className="mb-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/20 font-medium text-sm flex items-center justify-center gap-2 shadow-sm">
              <span>⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── Split Mode Selector (M3 Cards) ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="my-6">
              <span className="block text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider mb-3">
                1. Choose Split Mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SPLIT_MODES.map((m) => {
                  const isSelected = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`rounded-2xl p-4 text-left sm:text-center flex flex-col items-center justify-center gap-1.5 transition-all duration-200 ${
                        isSelected
                          ? "border-2 border-m3-primary bg-m3-primary-container text-m3-on-primary-container shadow-sm"
                          : "border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface"
                      }`}
                      onClick={() => setMode(m.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{m.icon}</span>
                        <span className="font-display font-bold text-sm sm:text-base">{m.label}</span>
                      </div>
                      <span className={`text-xs ${isSelected ? "text-m3-on-primary-container/80" : "text-m3-on-surface-variant"}`}>
                        {m.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Mode-specific Controls ── */}
          {(stage === "loaded" || stage === "done") && mode === "extract" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50 shadow-xs">
              <label className="block text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2.5">
                2. Enter Page Range (e.g. 1-3, 5, 8-10)
              </label>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder={`1-${totalPages}`}
                className="w-full px-5 py-3.5 rounded-full font-mono text-sm bg-m3-surface border border-m3-outline-variant focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 text-m3-on-surface outline-none transition-all"
              />
              <div className="text-xs text-m3-on-surface-variant mt-2.5 flex items-center gap-1.5">
                <span>Total pages:</span>
                <strong className="text-m3-on-surface font-mono">{totalPages}</strong>
                <span>· Separate ranges with commas</span>
              </div>
            </div>
          )}

          {(stage === "loaded" || stage === "done") && mode === "split-every" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50 shadow-xs">
              <label className="block text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2.5">
                2. Pages per chunk
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={splitN}
                  onChange={(e) => setSplitN(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-4 py-3 rounded-full text-center font-mono text-base font-bold bg-m3-surface border border-m3-outline-variant focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 text-m3-on-surface outline-none transition-all"
                />
                <span className="text-sm font-medium text-m3-on-surface-variant">
                  → <strong className="font-mono text-m3-primary">{Math.ceil(totalPages / Math.max(1, splitN))}</strong> output PDFs
                </span>
              </div>
            </div>
          )}

          {/* ── Visual Page Thumbnails (for Extract mode) ── */}
          {(stage === "loaded" || stage === "done") && mode === "extract" && thumbnails.length > 0 && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <span className="text-xs font-bold text-m3-on-surface-variant uppercase tracking-wider">
                  Visual Page Selector ({selectedPages.size}/{totalPages} selected)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="px-3.5 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface text-xs font-semibold shadow-xs transition-all active:scale-95"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="px-3.5 py-1.5 rounded-full border border-m3-error/30 bg-m3-error-container/30 hover:bg-m3-error-container text-m3-on-error-container text-xs font-semibold shadow-xs transition-all active:scale-95"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-80 overflow-y-auto p-2 rounded-xl bg-m3-surface-container-low border border-m3-outline-variant/40">
                {thumbnails.map((t) => {
                  const isSelected = selectedPages.has(t.pageNum);
                  return (
                    <div
                      key={t.pageNum}
                      onClick={() => togglePage(t.pageNum)}
                      className={`relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200 ${
                        isSelected
                          ? "border-2 border-m3-primary ring-2 ring-m3-primary/25 shadow-sm opacity-100 scale-[1.02]"
                          : "border-2 border-transparent opacity-40 hover:opacity-75"
                      }`}
                    >
                      <img src={t.url} alt={`Page ${t.pageNum}`} className="w-full block bg-white" />
                      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-m3-surface/90 text-m3-on-surface text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-m3-outline-variant/40 shadow-xs">
                        {t.pageNum}
                      </span>
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-m3-primary text-m3-on-primary flex items-center justify-center text-xs font-bold shadow-xs">
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Split / Extract Button ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="my-6">
              <button
                type="button"
                className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2"
                onClick={executeSplit}
              >
                <span>
                  {mode === "extract"
                    ? "⚡ Extract Selected Pages"
                    : mode === "split-all"
                    ? "⚡ Split All Pages to ZIP"
                    : `⚡ Split into ${Math.ceil(totalPages / Math.max(1, splitN))} Chunks`}
                </span>
              </button>
            </div>
          )}

          {/* ── Progress Bar (M3 Linear Indicator) ── */}
          {stage === "processing" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-m3-on-surface mb-2.5">
                <span>Processing PDF...</span>
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

          {/* ── Results ── */}
          {stage === "done" && resultBlob && (
            <>
              <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
                <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Original</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">
                      {totalPages} Pages · {fmt(file.size)}
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">Output</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {resultInfo}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span className="rounded-full px-4 py-1.5 text-xs font-mono font-bold bg-m3-tertiary-container text-m3-on-tertiary-container inline-block border border-m3-tertiary/20 shadow-xs">
                    ✂️ Split Complete
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={resultBlob}
                fileName={resultName}
                onReset={reset}
                auth={auth}
                toolName="Split PDF"
              />
            </>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · Split & Extract PDF Tool</span>
            <span>100% Client-Side · Zero Server Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
