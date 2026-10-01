// PDFToPPT.jsx — 100% In-Browser PDF to PowerPoint (PPTX) Converter (Google Material Design 3)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import pptxgen from "pptxgenjs";
import { addHistoryRecord } from "./historyDB";
import ActionButtons from "./ActionButtons";
import { consumePendingFile } from "./clipboardStore";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

const MAX_SIZE_MB = 100;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

// Load PDF.js from CDN dynamically on-demand
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
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

export default function PDFToPPT({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | ready | converting | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  // Settings
  const [slideLayout, setSlideLayout] = useState("widescreen"); // "widescreen" (16:9) | "original" (exact PDF aspect ratio)
  const [quality, setQuality] = useState("high"); // "standard" (1.5x) | "high" (2.0x) | "ultra" (3.0x)

  // Results
  const [pdfMeta, setPdfMeta] = useState(null); // { totalPages, firstPageThumbnail }
  const [resultPptx, setResultPptx] = useState(null); // { blob, url, fileName, size, slideCount }

  const inputRef = useRef(null);

  // Check for pending clipboard file on mount
  useEffect(() => {
    const pending = consumePendingFile();
    if (pending && (pending.type === "application/pdf" || pending.name.toLowerCase().endsWith(".pdf"))) {
      handleFile(pending);
    }
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (resultPptx?.url) URL.revokeObjectURL(resultPptx.url);
      if (pdfMeta?.firstPageThumbnail) URL.revokeObjectURL(pdfMeta.firstPageThumbnail);
    };
  }, [resultPptx, pdfMeta]);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported.");
      setStage("error");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds the ${MAX_SIZE_MB} MB limit.`);
      setStage("error");
      return;
    }

    setFile(f);
    setErrorMsg("");
    setStage("ready");

    // Generate quick preview thumbnail of cover page
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await f.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const firstPage = await pdfDoc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await firstPage.render({ canvasContext: ctx, viewport }).promise;

      setPdfMeta({
        totalPages: pdfDoc.numPages,
        firstPageThumbnail: canvas.toDataURL("image/jpeg", 0.8),
      });
    } catch (e) {
      console.warn("Could not generate first page preview:", e);
      setPdfMeta(null);
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
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf");

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147")
        .setOAuthToken(token)
        .addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "document.pdf";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Google Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: "application/pdf" }));
            } catch (err) {
              setErrorMsg(err.message || "Failed to download from Google Drive.");
              setStage("error");
            }
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Google Drive picker failed.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  // ── Convert PDF to PPTX ──
  const convertToPPT = async () => {
    if (!file) return;
    setStage("converting");
    setProgress(5);
    setProgressMsg("Loading PDF engine...");
    setErrorMsg("");

    try {
      const pdfjs = await loadPdfJs();
      setProgress(15);
      setProgressMsg("Reading PDF document...");

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      // Determine DPI render scale
      const scaleMultiplier = quality === "ultra" ? 3.0 : quality === "high" ? 2.0 : 1.5;

      // Initialize PptxGenJS instance
      const pres = new pptxgen();

      // Read first page to inspect dimensions
      const firstPage = await pdfDoc.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.0 });
      const firstWidthInches = Number((firstViewport.width / 72).toFixed(2));
      const firstHeightInches = Number((firstViewport.height / 72).toFixed(2));

      if (slideLayout === "widescreen") {
        pres.layout = "LAYOUT_16x9"; // 10 x 5.625 inches standard
      } else {
        // Custom layout matching exact PDF dimensions
        pres.defineLayout({
          name: "CUSTOM_PDF",
          width: firstWidthInches > 0 ? firstWidthInches : 10,
          height: firstHeightInches > 0 ? firstHeightInches : 5.625,
        });
        pres.layout = "CUSTOM_PDF";
      }

      // Convert each page to high-res slide
      for (let i = 1; i <= totalPages; i++) {
        const percent = 15 + Math.round((i / totalPages) * 75);
        setProgress(percent);
        setProgressMsg(`Rendering slide ${i} of ${totalPages}...`);

        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: scaleMultiplier });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imgData = canvas.toDataURL("image/jpeg", quality === "ultra" ? 0.95 : 0.9);

        // Add Slide to Presentation
        const slide = pres.addSlide();

        if (slideLayout === "widescreen") {
          // 16:9 slide dimensions are 10" x 5.625"
          const slideW = 10;
          const slideH = 5.625;
          const pageRatio = viewport.width / viewport.height;
          const slideRatio = slideW / slideH;

          let imgW, imgH, imgX, imgY;
          if (pageRatio > slideRatio) {
            imgW = slideW;
            imgH = slideW / pageRatio;
            imgX = 0;
            imgY = (slideH - imgH) / 2;
          } else {
            imgH = slideH;
            imgW = slideH * pageRatio;
            imgX = (slideW - imgW) / 2;
            imgY = 0;
          }

          slide.background = { color: "FFFFFF" };
          slide.addImage({
            data: imgData,
            x: imgX,
            y: imgY,
            w: imgW,
            h: imgH,
          });
        } else {
          // Exact full-bleed
          slide.addImage({
            data: imgData,
            x: 0,
            y: 0,
            w: "100%",
            h: "100%",
          });
        }
      }

      setProgress(94);
      setProgressMsg("Generating PowerPoint file (.pptx)...");

      // Generate binary Blob
      const pptxBlob = await pres.write({ outputType: "blob" });
      const downloadUrl = URL.createObjectURL(pptxBlob);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const outputFileName = `${baseName}_presentation.pptx`;

      // Save to local offline history (IndexedDB)
      try {
        await addHistoryRecord({
          tool: "PDF to PowerPoint",
          fileName: outputFileName,
          originalSize: file.size,
          resultSize: pptxBlob.size,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn("History save warning:", err);
      }

      setResultPptx({
        blob: pptxBlob,
        url: downloadUrl,
        fileName: outputFileName,
        size: pptxBlob.size,
        slideCount: totalPages,
      });

      setProgress(100);
      setStage("done");
    } catch (err) {
      console.error("PDF to PPTX conversion error:", err);
      setErrorMsg(err.message || "Failed to convert PDF to PowerPoint.");
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setPdfMeta(null);
    if (resultPptx?.url) URL.revokeObjectURL(resultPptx.url);
    setResultPptx(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans transition-colors">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-m3-secondary-container text-m3-on-secondary-container border border-m3-primary/20 mb-3 shadow-xs">
          <span>📊</span>
          <span>Document Converter Suite</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-normal text-m3-on-surface tracking-tight leading-tight">
          PDF to <span className="text-m3-primary font-medium">PowerPoint (PPTX)</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
          Convert PDF pages into high-definition 16:9 PowerPoint presentation slides. 100% private, on-device processing.
        </p>
      </div>

      {/* ── Error Banner ── */}
      {stage === "error" && (
        <div className="mb-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/30 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span>⚠️</span>
            <span>{errorMsg || "An error occurred during conversion."}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1 rounded-full bg-m3-error text-m3-on-error text-xs font-medium hover:opacity-90 transition-all cursor-pointer flex-shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Dropzone & Ingestion (Stage: idle) ── */}
      {stage === "idle" && (
        <div
          className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-m3-surface-container-low cursor-pointer ${
            dragging
              ? "border-m3-primary bg-m3-primary-container/20 scale-[0.99]"
              : "border-m3-outline-variant/60 hover:border-m3-primary hover:bg-m3-surface-container"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <div className="w-16 h-16 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center mx-auto mb-4 text-3xl shadow-xs">
            📄
          </div>

          <h3 className="text-lg font-medium text-m3-on-surface mb-1">
            Drop your PDF document here
          </h3>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md mx-auto mb-5">
            or click to browse from device. Supports multi-page PDFs up to {MAX_SIZE_MB} MB.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-6 py-2.5 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <span>📁</span> Choose PDF File
            </button>

            {auth.isSignedIn && (
              <button
                type="button"
                onClick={handleDrivePick}
                disabled={pickLoading}
                className="px-5 py-2.5 rounded-full bg-m3-surface-container-highest text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high active:scale-95 transition-all border border-m3-outline-variant/40 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>☁️</span> {pickLoading ? "Opening Drive…" : "Google Drive"}
              </button>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-m3-on-surface-variant font-medium">
            <span>🔒 100% Client-Side Private</span>
            <span>•</span>
            <span>⚡ Instant Conversion</span>
            <span>•</span>
            <span>🎯 16:9 Widescreen</span>
          </div>
        </div>
      )}

      {/* ── Ready & Conversion Settings (Stage: ready) ── */}
      {stage === "ready" && file && (
        <div className="bg-m3-surface-container rounded-3xl p-6 sm:p-8 shadow-m3-elevation-2 border border-m3-outline-variant/60">
          {/* File summary */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 pb-6 border-b border-m3-outline-variant/40">
            <div className="flex items-center gap-4">
              {pdfMeta?.firstPageThumbnail ? (
                <div className="w-16 h-20 rounded-xl overflow-hidden bg-m3-surface-container-high border border-m3-outline-variant/60 shadow-xs flex-shrink-0">
                  <img src={pdfMeta.firstPageThumbnail} alt="PDF Cover" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-20 rounded-xl bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center text-2xl flex-shrink-0">
                  📑
                </div>
              )}
              <div>
                <h3 className="text-base sm:text-lg font-medium text-m3-on-surface break-all line-clamp-1">
                  {file.name}
                </h3>
                <div className="flex items-center gap-2.5 mt-1 text-xs text-m3-on-surface-variant">
                  <span>{formatBytes(file.size)}</span>
                  {pdfMeta?.totalPages && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-m3-primary">{pdfMeta.totalPages} Pages</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-m3-on-surface-variant hover:text-m3-error hover:bg-m3-error-container/30 transition-colors cursor-pointer"
            >
              ✕ Remove
            </button>
          </div>

          {/* Options & Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-m3-outline-variant/40">
            {/* Slide Layout Option */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Slide Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-m3-surface-container-high rounded-2xl border border-m3-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setSlideLayout("widescreen")}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    slideLayout === "widescreen"
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <span className="font-semibold">16:9 Widescreen</span>
                  <span className="text-[10px] opacity-75">Standard Presentation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlideLayout("original")}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    slideLayout === "original"
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <span className="font-semibold">Exact PDF Ratio</span>
                  <span className="text-[10px] opacity-75">Letter / A4 Custom</span>
                </button>
              </div>
            </div>

            {/* Quality / Resolution */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Slide Crispness & Resolution
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-m3-surface-container-high rounded-2xl border border-m3-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setQuality("standard")}
                  className={`py-2 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-center ${
                    quality === "standard"
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <div>Standard</div>
                  <div className="text-[9px] opacity-75">Fastest</div>
                </button>
                <button
                  type="button"
                  onClick={() => setQuality("high")}
                  className={`py-2 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-center ${
                    quality === "high"
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <div>HD (2x)</div>
                  <div className="text-[9px] opacity-75">Recommended</div>
                </button>
                <button
                  type="button"
                  onClick={() => setQuality("ultra")}
                  className={`py-2 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer text-center ${
                    quality === "ultra"
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <div>Ultra (3x)</div>
                  <div className="text-[9px] opacity-75">300 DPI Sharp</div>
                </button>
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-m3-on-surface-variant text-center sm:text-left">
              <span>Ready to transform {pdfMeta?.totalPages ? `${pdfMeta.totalPages} pages` : "document"} into PowerPoint slides</span>
            </div>
            <button
              type="button"
              onClick={convertToPPT}
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <span>📊</span> Convert to PowerPoint (.pptx)
            </button>
          </div>
        </div>
      )}

      {/* ── Converting Progress Bar (Stage: converting) ── */}
      {stage === "converting" && (
        <div className="bg-m3-surface-container rounded-3xl p-8 sm:p-12 text-center shadow-m3-elevation-2 border border-m3-outline-variant/60">
          <div className="w-16 h-16 rounded-full border-4 border-m3-surface-container-high border-t-m3-primary animate-spin mx-auto mb-5" />

          <h3 className="text-xl font-medium text-m3-on-surface mb-2">
            Converting PDF to PowerPoint Slides
          </h3>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
            {progressMsg || "Processing on-device..."}
          </p>

          <div className="max-w-md mx-auto">
            <div className="w-full bg-m3-surface-container-highest rounded-full h-3 overflow-hidden shadow-inner mb-2">
              <div
                className="bg-m3-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-mono text-m3-on-surface-variant">
              <span>Progress</span>
              <span className="font-semibold text-m3-primary">{progress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Conversion Success & Export (Stage: done) ── */}
      {stage === "done" && resultPptx && (
        <div className="bg-m3-surface-container rounded-3xl p-6 sm:p-10 shadow-m3-elevation-2 border border-m3-outline-variant/60 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center mx-auto mb-4 text-3xl shadow-xs">
            🎉
          </div>

          <h2 className="text-2xl font-normal text-m3-on-surface tracking-tight mb-1">
            PowerPoint Presentation Ready!
          </h2>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md mx-auto mb-6">
            Your PDF has been converted into a standard Microsoft PowerPoint presentation with {resultPptx.slideCount} slides.
          </p>

          {/* Result info card */}
          <div className="bg-m3-surface-container-high rounded-2xl p-4 sm:p-5 max-w-lg mx-auto mb-8 border border-m3-outline-variant/40 flex items-center justify-between gap-4 text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-m3-secondary-container text-m3-on-secondary-container flex items-center justify-center text-xl flex-shrink-0">
                📊
              </div>
              <div>
                <div className="text-sm font-semibold text-m3-on-surface truncate max-w-[200px] sm:max-w-xs">
                  {resultPptx.fileName}
                </div>
                <div className="text-xs text-m3-on-surface-variant mt-0.5 flex items-center gap-2">
                  <span>{formatBytes(resultPptx.size)}</span>
                  <span>•</span>
                  <span>{resultPptx.slideCount} Slides</span>
                  <span>•</span>
                  <span className="uppercase text-[10px] font-bold text-m3-primary">.PPTX</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
            <a
              href={resultPptx.url}
              download={resultPptx.fileName}
              className="w-full sm:flex-1 py-3 px-6 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📥</span> Download (.pptx)
            </a>

            <button
              type="button"
              onClick={reset}
              className="w-full sm:w-auto py-3 px-5 rounded-full bg-m3-surface-container-highest text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high active:scale-95 transition-all border border-m3-outline-variant/40 cursor-pointer"
            >
              Convert Another PDF
            </button>
          </div>

          {/* Google Drive Upload Sync */}
          {auth.isSignedIn && (
            <div className="mt-6 pt-6 border-t border-m3-outline-variant/40 flex justify-center">
              <ActionButtons
                file={new File([resultPptx.blob], resultPptx.fileName, {
                  type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                })}
                auth={auth}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Feature Highlights Footer ── */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">🎯</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">16:9 Widescreen Standard</div>
          <div className="text-[11px] text-m3-on-surface-variant">Compatible with Microsoft PowerPoint, Google Slides, Keynote, & LibreOffice.</div>
        </div>
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">🔒</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">100% Client-Side Privacy</div>
          <div className="text-[11px] text-m3-on-surface-variant">Files never leave your device. All slide rendering happens locally in memory.</div>
        </div>
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">⚡</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">Fast & Unlimited</div>
          <div className="text-[11px] text-m3-on-surface-variant">No subscription, no watermark, and zero daily conversion quotas.</div>
        </div>
      </div>
    </div>
  );
}
