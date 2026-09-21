// PDFImageOCR.jsx — 100% Client-Side PDF & Image OCR Text Extractor (Material Design 3)
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createWorker } from "tesseract.js";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";

const MAX_SIZE_MB = 30;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED_IMG = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff", "image/gif"];
const ACCEPTED_PDF = ["application/pdf"];
const ALL_ACCEPTED = [...ACCEPTED_IMG, ...ACCEPTED_PDF];

const LANGUAGES = [
  { code: "eng", label: "English", flag: "🇬🇧" },
  { code: "hin", label: "Hindi", flag: "🇮🇳" },
  { code: "spa", label: "Spanish", flag: "🇪🇸" },
  { code: "fra", label: "French", flag: "🇫🇷" },
  { code: "deu", label: "German", flag: "🇩🇪" },
  { code: "chi_sim", label: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "jpn", label: "Japanese", flag: "🇯🇵" },
  { code: "ara", label: "Arabic", flag: "🇸🇦" },
  { code: "rus", label: "Russian", flag: "🇷🇺" },
  { code: "por", label: "Portuguese", flag: "🇧🇷" },
  { code: "kor", label: "Korean", flag: "🇰🇷" },
  { code: "ita", label: "Italian", flag: "🇮🇹" },
];

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

// Render a PDF page to a canvas and return the canvas as an image data URL
async function pdfPageToImage(pdfDoc, pageNum, scale = 2.0) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}

export default function PDFImageOCR({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const workerRef = useRef(null);

  // File state
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null); // "image" or "pdf"
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  // PDF multi-page state
  const [pdfPages, setPdfPages] = useState([]);      // Array of { pageNum, dataUrl }
  const [selectedPage, setSelectedPage] = useState(0);

  // OCR settings
  const [lang, setLang] = useState("eng");
  const [showLangPicker, setShowLangPicker] = useState(false);

  // OCR processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Results
  const [ocrText, setOcrText] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [ocrDone, setOcrDone] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state fully
  const resetAll = useCallback(() => {
    setFile(null);
    setFileType(null);
    setPreviewUrl(null);
    setError("");
    setPdfPages([]);
    setSelectedPage(0);
    setOcrText("");
    setConfidence(0);
    setOcrDone(false);
    setProcessing(false);
    setProgress(0);
    setProgressMsg("");
    setCopied(false);
    if (workerRef.current) {
      workerRef.current.terminate().catch(() => {});
      workerRef.current = null;
    }
  }, []);

  // Handle file selection (from input or drop)
  const handleFile = useCallback(async (selectedFile) => {
    resetAll();
    if (!selectedFile) return;
    if (selectedFile.size > MAX_SIZE) {
      setError(`File too large. Maximum is ${MAX_SIZE_MB} MB.`);
      return;
    }
    if (!ALL_ACCEPTED.includes(selectedFile.type)) {
      setError("Unsupported format. Please use PDF, JPG, PNG, WebP, BMP, TIFF, or GIF.");
      return;
    }

    setFile(selectedFile);

    if (ACCEPTED_PDF.includes(selectedFile.type)) {
      // PDF file: render pages to images
      setFileType("pdf");
      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        const totalPages = pdfDoc.numPages;
        const pages = [];
        for (let i = 1; i <= Math.min(totalPages, 50); i++) {
          const dataUrl = await pdfPageToImage(pdfDoc, i, 2.0);
          pages.push({ pageNum: i, dataUrl });
        }
        setPdfPages(pages);
        setSelectedPage(0);
        if (pages.length > 0) setPreviewUrl(pages[0].dataUrl);
      } catch (err) {
        setError("Failed to load PDF: " + (err.message || "Unknown error"));
      }
    } else {
      // Image file
      setFileType("image");
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    }
  }, [resetAll]);

  // Drop zone handlers
  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  // Page selector for PDFs
  const handlePageSelect = (idx) => {
    setSelectedPage(idx);
    if (pdfPages[idx]) setPreviewUrl(pdfPages[idx].dataUrl);
    // Clear previous OCR results when switching pages
    setOcrText("");
    setOcrDone(false);
    setConfidence(0);
  };

  // ── Run OCR ──
  const runOCR = useCallback(async () => {
    if (!file && pdfPages.length === 0) return;
    setProcessing(true);
    setProgress(0);
    setProgressMsg("Initializing OCR engine…");
    setOcrText("");
    setOcrDone(false);
    setConfidence(0);
    setCopied(false);

    try {
      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
            setProgressMsg("Recognizing text…");
          } else if (m.status === "loading traineddata") {
            setProgress(Math.round(m.progress * 100));
            setProgressMsg(`Loading ${LANGUAGES.find(l => l.code === lang)?.label || lang} language model…`);
          } else {
            setProgressMsg(m.status || "Processing…");
          }
        },
      });
      workerRef.current = worker;

      let imageSource;
      if (fileType === "pdf") {
        imageSource = pdfPages[selectedPage]?.dataUrl;
      } else {
        imageSource = previewUrl;
      }

      if (!imageSource) {
        setError("No image source available for OCR.");
        setProcessing(false);
        return;
      }

      setProgressMsg("Recognizing text…");
      const { data } = await worker.recognize(imageSource);
      setOcrText(data.text || "");
      setConfidence(Math.round(data.confidence || 0));
      setOcrDone(true);

      // Save to local history
      try {
        const textBlob = new Blob([data.text || ""], { type: "text/plain" });
        await addHistoryRecord({
          tool: "OCR Text Extractor",
          fileName: file?.name || "ocr-result.txt",
          origSize: file?.size || 0,
          newSize: textBlob.size,
          blob: textBlob,
          mimeType: "text/plain",
        });
        window.dispatchEvent(new Event("flashcrush:history-updated"));
      } catch (e) { /* ignore history errors */ }

      await worker.terminate();
      workerRef.current = null;
    } catch (err) {
      setError("OCR failed: " + (err.message || "Unknown error"));
    } finally {
      setProcessing(false);
      setProgress(100);
      setProgressMsg("");
    }
  }, [file, fileType, pdfPages, selectedPage, previewUrl, lang]);

  // ── OCR All Pages (PDF batch) ──
  const runOCRAllPages = useCallback(async () => {
    if (pdfPages.length === 0) return;
    setProcessing(true);
    setProgress(0);
    setOcrText("");
    setOcrDone(false);
    setConfidence(0);
    setCopied(false);

    try {
      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgressMsg("Recognizing text…");
          } else if (m.status === "loading traineddata") {
            setProgressMsg(`Loading ${LANGUAGES.find(l => l.code === lang)?.label || lang} language model…`);
          }
        },
      });
      workerRef.current = worker;

      let allText = "";
      let totalConfidence = 0;

      for (let i = 0; i < pdfPages.length; i++) {
        setProgressMsg(`Processing page ${i + 1} of ${pdfPages.length}…`);
        setProgress(Math.round(((i) / pdfPages.length) * 100));

        const { data } = await worker.recognize(pdfPages[i].dataUrl);
        allText += `\n── Page ${i + 1} ──\n${data.text || ""}\n`;
        totalConfidence += (data.confidence || 0);
      }

      setOcrText(allText.trim());
      setConfidence(Math.round(totalConfidence / pdfPages.length));
      setOcrDone(true);
      setProgress(100);

      // Save to history
      try {
        const textBlob = new Blob([allText], { type: "text/plain" });
        await addHistoryRecord({
          tool: "OCR Text Extractor (All Pages)",
          fileName: file?.name || "ocr-all-pages.txt",
          origSize: file?.size || 0,
          newSize: textBlob.size,
          blob: textBlob,
          mimeType: "text/plain",
        });
        window.dispatchEvent(new Event("flashcrush:history-updated"));
      } catch (e) { /* ignore */ }

      await worker.terminate();
      workerRef.current = null;
    } catch (err) {
      setError("OCR failed: " + (err.message || "Unknown error"));
    } finally {
      setProcessing(false);
      setProgressMsg("");
    }
  }, [pdfPages, lang, file]);

  // ── Export functions ──
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(ocrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = ocrText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([ocrText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name?.replace(/\.[^.]+$/, "") || "ocr-result") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDoc = () => {
    // Create a simple .doc compatible HTML file (MS Word can open this)
    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>OCR Result</title>
      <style>body { font-family: 'Calibri', sans-serif; font-size: 12pt; line-height: 1.6; }</style>
      </head><body>${ocrText.replace(/\n/g, "<br/>")}</body></html>`;
    const blob = new Blob([htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name?.replace(/\.[^.]+$/, "") || "ocr-result") + ".doc";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    const jsonData = {
      source: file?.name || "unknown",
      language: lang,
      confidence: confidence,
      pages: fileType === "pdf" ? pdfPages.length : 1,
      extractedText: ocrText,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (file?.name?.replace(/\.[^.]+$/, "") || "ocr-result") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = ocrText.trim() ? ocrText.trim().split(/\s+/).length : 0;
  const charCount = ocrText.length;
  const selectedLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top App Bar ── */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-display font-semibold text-m3-on-surface-variant hover:text-m3-on-surface bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/50 transition-all duration-200 active:scale-95 shadow-sm"
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🔍</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF & Image OCR</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          {file ? `${fmt(file.size)} · ${fileType === "pdf" ? `${pdfPages.length} Pages` : "Image"}` : "WebAssembly Tesseract"}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!file && (
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
              🔍
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
              PDF & Image OCR
            </h1>
            <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
              Extract editable text from scanned PDFs, photos, and documents — 100% in your browser, zero uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && (
          <div className="max-w-2xl mx-auto bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1 transition-all">
            <div
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center group ${
                dragging
                  ? "border-m3-primary bg-m3-primary/10 scale-[1.01]"
                  : "border-m3-outline-variant/80 hover:border-m3-primary hover:bg-m3-primary/5"
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-2xl bg-m3-primary/10 group-hover:bg-m3-primary/15 text-m3-primary text-3xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                🔍
              </div>
              <div className="font-display font-bold text-lg sm:text-xl text-m3-on-surface mb-1">
                Drop PDF or Image Here
              </div>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6 max-w-sm">
                Supports PDF, JPG, PNG, WebP, BMP, TIFF, GIF — up to {MAX_SIZE_MB} MB
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-semibold text-sm shadow-sm hover:shadow active:scale-95 transition-all"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <span>Browse Files</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.gif"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto my-4 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/30 flex items-center justify-between gap-3 text-sm font-medium">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError("")}
              className="text-xs font-bold px-2 py-1 rounded hover:bg-m3-error/10 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Main OCR Workspace ── */}
        {file && (
          <div className="max-w-6xl mx-auto flex flex-col gap-6 mt-4">

            {/* Language Selector & Controls Bar */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-4 sm:p-5 shadow-m3-elevation-1 flex flex-wrap items-center justify-between gap-4 relative">
              
              {/* Language Selector Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface text-sm font-medium transition-all cursor-pointer shadow-sm active:scale-95"
                  onClick={() => setShowLangPicker(!showLangPicker)}
                >
                  <span className="text-lg">{selectedLang.flag}</span>
                  <span className="font-display font-semibold">{selectedLang.label}</span>
                  <span className="text-xs text-m3-on-surface-variant ml-1">{showLangPicker ? "▲" : "▼"}</span>
                </button>

                {showLangPicker && (
                  <div className="absolute top-full left-0 mt-2 w-64 max-h-72 overflow-y-auto bg-m3-surface-container-high border border-m3-outline-variant/60 rounded-2xl p-1.5 shadow-m3-elevation-3 z-50 scrollbar-thin animate-fadeIn">
                    {LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        type="button"
                        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs sm:text-sm text-left transition-colors ${
                          l.code === lang
                            ? "bg-m3-primary/15 text-m3-primary font-bold"
                            : "text-m3-on-surface hover:bg-m3-surface-container-highest"
                        }`}
                        onClick={() => { setLang(l.code); setShowLangPicker(false); }}
                      >
                        <span className="text-base">{l.flag}</span>
                        <span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 disabled:opacity-50 text-m3-on-primary font-display font-semibold text-sm shadow-sm hover:shadow active:scale-95 transition-all"
                  onClick={runOCR}
                  disabled={processing}
                >
                  <span>{processing ? "⏳" : "🔍"}</span>
                  <span>{processing ? "Extracting…" : "Extract Text"}</span>
                </button>

                {fileType === "pdf" && pdfPages.length > 1 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-m3-secondary-container hover:bg-m3-secondary-container/80 disabled:opacity-50 text-m3-on-secondary-container font-display font-semibold text-sm shadow-sm active:scale-95 transition-all"
                    onClick={runOCRAllPages}
                    disabled={processing}
                  >
                    <span>📄</span>
                    <span>{processing ? "Processing…" : `OCR All ${pdfPages.length} Pages`}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-display font-medium text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-high transition-colors"
                  onClick={resetAll}
                >
                  <span>✕</span>
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {processing && (
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1 animate-pulse">
                <div className="flex items-center justify-between mb-2 text-xs font-display font-medium text-m3-on-surface">
                  <span>{progressMsg}</span>
                  <span className="font-mono font-bold text-m3-primary text-sm">{progress}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-m3-surface-container-highest overflow-hidden">
                  <div
                    className="h-full rounded-full bg-m3-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* PDF Page Strip */}
            {fileType === "pdf" && pdfPages.length > 1 && (
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-4 sm:p-5 shadow-m3-elevation-1 flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    Pages ({pdfPages.length})
                  </span>
                  <span className="text-xs text-m3-on-surface-variant">
                    Click a page to preview and extract
                  </span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                  {pdfPages.map((p, idx) => (
                    <div
                      key={idx}
                      className={`w-16 h-20 shrink-0 cursor-pointer rounded-xl overflow-hidden relative transition-all active:scale-95 ${
                        idx === selectedPage
                          ? "ring-2 ring-m3-primary border border-m3-primary shadow-sm"
                          : "border border-m3-outline-variant/60 opacity-60 hover:opacity-100 hover:border-m3-outline"
                      }`}
                      onClick={() => handlePageSelect(idx)}
                    >
                      <img src={p.dataUrl} alt={`Page ${p.pageNum}`} className="w-full h-full object-cover pointer-events-none select-none" />
                      <div className="absolute bottom-0 right-0 bg-m3-surface-container-highest/90 text-m3-on-surface text-[10px] font-mono px-1.5 py-0.5 rounded-tl-md font-bold">
                        {p.pageNum}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Split Layout: Document Preview + Extracted Text */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* Left Column: Document Preview */}
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1 flex flex-col">
                <div className="flex items-center justify-between mb-3 border-b border-m3-outline-variant/40 pb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    📄 Document Preview
                  </span>
                  <span className="text-xs font-mono text-m3-on-surface-variant bg-m3-surface-container px-2 py-0.5 rounded-full">
                    {fileType === "pdf" ? `Page ${selectedPage + 1} / ${pdfPages.length}` : file?.name}
                  </span>
                </div>
                <div className="flex-1 min-h-[380px] max-h-[580px] rounded-2xl bg-m3-surface-container-highest/30 dark:bg-m3-surface-container-lowest/70 p-4 flex items-center justify-center overflow-auto border border-m3-outline-variant/30">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-w-full max-h-[520px] object-contain rounded-lg shadow-m3-elevation-1"
                    />
                  )}
                </div>
              </div>

              {/* Right Column: Extracted Text */}
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1 flex flex-col">
                <div className="flex items-center justify-between mb-3 border-b border-m3-outline-variant/40 pb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    📝 Extracted Text
                  </span>
                  {ocrDone && (
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                        confidence >= 80
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                          : confidence >= 50
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                      }`}
                    >
                      {confidence}% Confidence
                    </span>
                  )}
                </div>
                <textarea
                  className="w-full flex-1 min-h-[340px] p-4 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/70 text-m3-on-surface font-mono text-xs sm:text-sm leading-relaxed placeholder:text-m3-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-m3-primary resize-y transition-all"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  placeholder={ocrDone ? "(No text detected)" : "Extracted text will appear here after OCR processing…"}
                  readOnly={!ocrDone}
                />
                {ocrDone && (
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-m3-outline-variant/40 text-xs text-m3-on-surface-variant font-medium flex-wrap">
                    <span>📊 {wordCount.toLocaleString()} words</span>
                    <span>🔤 {charCount.toLocaleString()} chars</span>
                    <span>🌐 {selectedLang.label}</span>
                  </div>
                )}
              </div>

            </div>

            {/* Export Actions */}
            {ocrDone && ocrText.trim() && (
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-4 sm:p-5 shadow-m3-elevation-1 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-display font-semibold transition-all active:scale-95 shadow-sm ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary"
                    }`}
                    onClick={copyToClipboard}
                  >
                    <span>{copied ? "✅" : "📋"}</span>
                    <span>{copied ? "Copied!" : "Copy Text"}</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-display font-semibold border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface transition-all active:scale-95 shadow-sm"
                    onClick={downloadTxt}
                  >
                    <span>📄</span>
                    <span>Download .TXT</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-display font-semibold border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface transition-all active:scale-95 shadow-sm"
                    onClick={downloadDoc}
                  >
                    <span>📝</span>
                    <span>Download .DOC</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-display font-semibold border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface transition-all active:scale-95 shadow-sm"
                    onClick={downloadJson}
                  >
                    <span>🗂️</span>
                    <span>Download .JSON</span>
                  </button>
                </div>

                {auth?.authStatus === "signedin" && auth?.uploadToDrive && (
                  <ActionButtons
                    auth={auth}
                    resultBlob={new Blob([ocrText], { type: "text/plain" })}
                    outputFileName={(file?.name?.replace(/\.[^.]+$/, "") || "ocr-result") + ".txt"}
                    resultMime="text/plain"
                  />
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
