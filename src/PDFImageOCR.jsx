// PDFImageOCR.jsx — 100% Client-Side PDF & Image OCR Text Extractor (tesseract.js WebAssembly)
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
    <div className="compressor-page">
      {/* ── Tool Bar ── */}
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">🔍 OCR Text Extractor</span>
        <span className="tool-page-meta">{file ? fmt(file.size) : "No file"}</span>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ background: "var(--brutal-sky)" }}>🔍</div>
            <h1 className="comp-title">PDF & Image OCR</h1>
          </div>
          <p className="comp-sub">
            Extract editable text from scanned PDFs, photos, and documents — 100% in your browser, zero uploads.
          </p>
        </div>

        {/* ── Drop Zone ── */}
        {!file && (
          <div className="comp-card">
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="drop-icon">🔍</span>
              <div className="drop-main">Drop PDF or Image Here</div>
              <div className="drop-sub">Supports PDF, JPG, PNG, WebP, BMP, TIFF, GIF — up to {MAX_SIZE_MB} MB</div>
              <div className="drop-btn-row">
                <button type="button" className="drop-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Browse Files
                </button>
              </div>
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
          <div style={{ background: "#FEE2E2", border: "2px solid #1a1a1a", borderRadius: "10px", padding: "12px 18px", marginTop: "16px", color: "#B91C1C", fontWeight: 700, maxWidth: "680px", width: "100%", boxShadow: "3px 3px 0px #1a1a1a" }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Main OCR Workspace ── */}
        {file && (
          <div className="ocr-workspace" style={{ maxWidth: "900px", width: "100%", marginTop: "16px" }}>

            {/* Language Selector */}
            <div className="ocr-controls-bar">
              <div className="ocr-lang-selector" onClick={() => setShowLangPicker(!showLangPicker)}>
                <span style={{ fontSize: "1.1rem" }}>{selectedLang.flag}</span>
                <span style={{ fontWeight: 700 }}>{selectedLang.label}</span>
                <span className="nav-chevron">{showLangPicker ? "▲" : "▼"}</span>
              </div>

              {showLangPicker && (
                <div className="ocr-lang-dropdown">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      className={`ocr-lang-option${l.code === lang ? " active" : ""}`}
                      onClick={() => { setLang(l.code); setShowLangPicker(false); }}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-compress"
                  style={{ width: "auto", padding: "10px 24px", fontSize: "0.88rem" }}
                  onClick={runOCR}
                  disabled={processing}
                >
                  {processing ? "⏳ Extracting…" : "🔍 Extract Text"}
                </button>

                {fileType === "pdf" && pdfPages.length > 1 && (
                  <button
                    type="button"
                    className="btn-compress"
                    style={{ width: "auto", padding: "10px 24px", fontSize: "0.88rem", background: "var(--brutal-lavender)", color: "#1a1a1a" }}
                    onClick={runOCRAllPages}
                    disabled={processing}
                  >
                    {processing ? "⏳ Processing…" : `📄 OCR All ${pdfPages.length} Pages`}
                  </button>
                )}

                <button
                  type="button"
                  className="back-btn"
                  style={{ marginLeft: "auto" }}
                  onClick={resetAll}
                >
                  ✕ Reset
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {processing && (
              <div className="ocr-progress-wrap">
                <div className="ocr-progress-bar">
                  <div className="ocr-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="ocr-progress-label">
                  <span>{progressMsg}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{progress}%</span>
                </div>
              </div>
            )}

            {/* PDF Page Thumbnails */}
            {fileType === "pdf" && pdfPages.length > 1 && (
              <div className="ocr-page-strip">
                <div className="ocr-page-strip-label">Pages ({pdfPages.length})</div>
                <div className="ocr-page-strip-scroll">
                  {pdfPages.map((p, idx) => (
                    <div
                      key={idx}
                      className={`ocr-page-thumb${idx === selectedPage ? " active" : ""}`}
                      onClick={() => handlePageSelect(idx)}
                    >
                      <img src={p.dataUrl} alt={`Page ${p.pageNum}`} />
                      <span className="ocr-page-num">{p.pageNum}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Split Layout: Preview + Text */}
            <div className="ocr-split-layout">
              {/* Left: Document Preview */}
              <div className="ocr-preview-pane">
                <div className="ocr-preview-header">
                  <span>📄 Document Preview</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", color: "var(--text-sub)" }}>
                    {fileType === "pdf" ? `Page ${selectedPage + 1} / ${pdfPages.length}` : file?.name}
                  </span>
                </div>
                <div className="ocr-preview-img-wrap">
                  {previewUrl && <img src={previewUrl} alt="Preview" className="ocr-preview-img" />}
                </div>
              </div>

              {/* Right: Extracted Text */}
              <div className="ocr-text-pane">
                <div className="ocr-text-header">
                  <span>📝 Extracted Text</span>
                  {ocrDone && (
                    <span className="ocr-confidence-badge" style={{ background: confidence >= 80 ? "var(--brutal-mint)" : confidence >= 50 ? "var(--brutal-yellow)" : "var(--brutal-coral)" }}>
                      {confidence}% Confidence
                    </span>
                  )}
                </div>
                <textarea
                  className="ocr-textarea"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  placeholder={ocrDone ? "(No text detected)" : "Extracted text will appear here after OCR processing…"}
                  readOnly={!ocrDone}
                />
                {ocrDone && (
                  <div className="ocr-stats-bar">
                    <span>📊 {wordCount.toLocaleString()} words</span>
                    <span>🔤 {charCount.toLocaleString()} chars</span>
                    <span>🌐 {selectedLang.label}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Export Actions ── */}
            {ocrDone && ocrText.trim() && (
              <div className="ocr-export-bar">
                <button type="button" className="ocr-export-btn" onClick={copyToClipboard} style={{ background: copied ? "var(--brutal-mint)" : "var(--bg-surface)" }}>
                  {copied ? "✅ Copied!" : "📋 Copy Text"}
                </button>
                <button type="button" className="ocr-export-btn" onClick={downloadTxt}>
                  📄 Download .TXT
                </button>
                <button type="button" className="ocr-export-btn" onClick={downloadDoc}>
                  📝 Download .DOC
                </button>
                <button type="button" className="ocr-export-btn" onClick={downloadJson}>
                  🗂️ Download .JSON
                </button>

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
