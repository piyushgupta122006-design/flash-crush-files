// PDFWatermark.jsx — Add Custom Text Watermark & Page Numbers to PDF with live preview
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r: isNaN(r) ? 0.5 : r, g: isNaN(g) ? 0.5 : g, b: isNaN(b) ? 0.5 : b };
}

const PRESET_WATERMARKS = [
  "CONFIDENTIAL",
  "DO NOT COPY",
  "DRAFT",
  "SAMPLE",
  "TOP SECRET",
  "ORIGINAL",
];

const PRESET_COLORS = [
  { label: "Crimson", hex: "#ef4444" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Slate", hex: "#64748b" },
  { label: "Black", hex: "#000000" },
];

export default function PDFWatermark({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [pageThumbUrl, setPageThumbUrl] = useState(null);

  // Active Tool Tabs: "watermark" | "pagenumber" | "both"
  const [toolTab, setToolTab] = useState("both");

  // Watermark Settings
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmSize, setWmSize] = useState(48);
  const [wmRotation, setWmRotation] = useState(45);
  const [wmOpacity, setWmOpacity] = useState(30);
  const [wmColor, setWmColor] = useState("#ef4444");

  // Page Number Settings
  const [enablePageNum, setEnablePageNum] = useState(true);
  const [numFormat, setNumFormat] = useState("Page {n} of {total}"); // "Page {n} of {total}" | "{n} / {total}" | "Page {n}" | "- {n} -"
  const [numPosition, setNumPosition] = useState("bottom-center"); // bottom-center | bottom-right | bottom-left | top-center | top-right
  const [numSize, setNumSize] = useState(11);
  const [numColor, setNumColor] = useState("#64748b");
  const [skipFirstPage, setSkipFirstPage] = useState(false);

  // Results
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  const inputRef = useRef(null);
  const pdfBytesRef = useRef(null);
  const previewCanvasRef = useRef(null);

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

    try {
      const arrayBuffer = await f.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(arrayBuffer);

      const pdfjs = await loadPdfJs();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      setTotalPages(pdfDoc.numPages);
      setPreviewPage(1);

      // Render base page 1
      renderPageBase(pdfDoc, 1);
    } catch (err) {
      setErrorMsg("Failed to load PDF: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const renderPageBase = async (pdfDoc, pageNum) => {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      setPageThumbUrl(canvas.toDataURL("image/jpeg", 0.85));
    } catch (e) {
      console.error(e);
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
              setErrorMsg(err.message); setStage("error");
            }
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed."); setStage("error");
    } finally { setPickLoading(false); }
  };

  // Draw Live Preview onto canvas
  useEffect(() => {
    if (!pageThumbUrl) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw Watermark Overlay
      if (enableWatermark && wmText.trim()) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((wmRotation * Math.PI) / 180);
        ctx.font = `bold ${Math.round(wmSize * (canvas.width / 595))}px sans-serif`;
        ctx.fillStyle = wmColor;
        ctx.globalAlpha = wmOpacity / 100;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(wmText, 0, 0);
        ctx.restore();
      }

      // Draw Page Number Overlay
      if (enablePageNum && (!skipFirstPage || previewPage > 1)) {
        ctx.save();
        const str = numFormat
          .replace("{n}", previewPage)
          .replace("{total}", totalPages || 1);

        const scaledNumSize = Math.max(10, Math.round(numSize * (canvas.width / 595)));
        ctx.font = `${scaledNumSize}px sans-serif`;
        ctx.fillStyle = numColor;
        ctx.globalAlpha = 0.9;
        ctx.textBaseline = "middle";

        const margin = 28 * (canvas.width / 595);

        let x = canvas.width / 2;
        let y = canvas.height - margin;
        let align = "center";

        if (numPosition === "bottom-center") {
          x = canvas.width / 2; y = canvas.height - margin; align = "center";
        } else if (numPosition === "bottom-right") {
          x = canvas.width - margin; y = canvas.height - margin; align = "right";
        } else if (numPosition === "bottom-left") {
          x = margin; y = canvas.height - margin; align = "left";
        } else if (numPosition === "top-center") {
          x = canvas.width / 2; y = margin; align = "center";
        } else if (numPosition === "top-right") {
          x = canvas.width - margin; y = margin; align = "right";
        }

        ctx.textAlign = align;
        ctx.fillText(str, x, y);
        ctx.restore();
      }
    };
    img.src = pageThumbUrl;
  }, [
    pageThumbUrl,
    enableWatermark,
    wmText,
    wmSize,
    wmRotation,
    wmOpacity,
    wmColor,
    enablePageNum,
    numFormat,
    numPosition,
    numSize,
    numColor,
    skipFirstPage,
    previewPage,
    totalPages,
  ]);

  // Execute processing with pdf-lib
  const applyWatermarkAndPageNumbers = async () => {
    if (!pdfBytesRef.current) return;
    if (!enableWatermark && !enablePageNum) {
      setErrorMsg("Please enable Watermark or Page Numbering.");
      return;
    }

    setStage("processing");
    setProgress(10);
    setProgressMsg("Loading PDF document...");
    setErrorMsg("");

    try {
      const pdfDoc = await PDFDocument.load(pdfBytesRef.current);
      const pages = pdfDoc.getPages();
      const count = pages.length;

      // Embed fonts
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const wmRgb = hexToRgb(wmColor);
      const numRgb = hexToRgb(numColor);

      for (let i = 0; i < count; i++) {
        setProgress(Math.round(15 + (i / count) * 75));
        setProgressMsg(`Stamping page ${i + 1} of ${count}...`);

        const page = pages[i];
        const { width, height } = page.getSize();

        // 1. Stamp Watermark
        if (enableWatermark && wmText.trim()) {
          const textWidth = boldFont.widthOfTextAtSize(wmText, wmSize);
          const textHeight = boldFont.heightAtSize(wmSize);

          // Calculate center coordinates
          const centerX = width / 2;
          const centerY = height / 2;

          page.drawText(wmText, {
            x: centerX - (textWidth / 2) * Math.cos((wmRotation * Math.PI) / 180),
            y: centerY - (textWidth / 2) * Math.sin((wmRotation * Math.PI) / 180),
            size: wmSize,
            font: boldFont,
            color: rgb(wmRgb.r, wmRgb.g, wmRgb.b),
            opacity: wmOpacity / 100,
            rotate: degrees(wmRotation),
          });
        }

        // 2. Stamp Page Numbers
        if (enablePageNum && (!skipFirstPage || i > 0)) {
          const pageNumStr = numFormat
            .replace("{n}", i + 1)
            .replace("{total}", count);

          const strWidth = regularFont.widthOfTextAtSize(pageNumStr, numSize);
          const margin = 20;

          let numX = width / 2 - strWidth / 2;
          let numY = margin;

          if (numPosition === "bottom-center") {
            numX = width / 2 - strWidth / 2;
            numY = margin;
          } else if (numPosition === "bottom-right") {
            numX = width - margin - strWidth;
            numY = margin;
          } else if (numPosition === "bottom-left") {
            numX = margin;
            numY = margin;
          } else if (numPosition === "top-center") {
            numX = width / 2 - strWidth / 2;
            numY = height - margin - numSize;
          } else if (numPosition === "top-right") {
            numX = width - margin - strWidth;
            numY = height - margin - numSize;
          }

          page.drawText(pageNumStr, {
            x: numX,
            y: numY,
            size: numSize,
            font: regularFont,
            color: rgb(numRgb.r, numRgb.g, numRgb.b),
            opacity: 0.95,
          });
        }
      }

      setProgress(95);
      setProgressMsg("Building stamped PDF...");
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      const baseName = file.name.replace(/\.[^.]+$/, "");

      setResultBlob(blob);
      setResultName(`${baseName}_stamped.pdf`);
      setResultInfo(`${count} pages · ${fmt(blob.size)} · Watermark & Page Numbers applied`);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to apply watermark: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setTotalPages(0);
    setPageThumbUrl(null);
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
        <div className="tool-page-title">Watermark & Page Numbers</div>
        <div className="tool-page-meta">Stamp Text · Page Numbers · Live Preview</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(236, 72, 153, 0.4)", boxShadow: "0 0 20px rgba(236, 72, 153, 0.3)" }}>
              🏷️
            </div>
            <div className="comp-title">PDF Watermark & Page Numbers</div>
          </div>
          <p className="comp-sub">Stamp custom text watermarks & elegant page numbering onto every page with live preview.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">🏷️</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" : "Drag & drop your PDF to stamp"}</p>
              <p className="drop-sub">Add custom watermarks & page numbering · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>📁 Browse PDF</button>
                <button className="drop-btn-drive" onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>}
            </div>
          )}

          {/* ── File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "processing" || (stage === "error" && file)) && (
            <div className="file-row">
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)} · {totalPages} pages</div>
              </div>
              {stage !== "processing" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── Error Box inside loaded state ── */}
          {stage === "error" && file && errorMsg && (
            <div style={{ padding: "0 20px 10px" }}>
              <div className="error-box">⚠ {errorMsg}</div>
            </div>
          )}

          {/* ── Feature Tabs & Settings Grid ── */}
          {(stage === "loaded" || stage === "done") && (
            <div style={{ padding: "0 20px 16px" }}>

              {/* Mode Toggles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => { setToolTab("both"); setEnableWatermark(true); setEnablePageNum(true); }}
                  className={`level-btn${toolTab === "both" ? " active" : ""}`}
                >
                  <span style={{ fontSize: "1.2rem" }}>✨</span>
                  <span className="level-name">Watermark + Numbers</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setToolTab("watermark"); setEnableWatermark(true); setEnablePageNum(false); }}
                  className={`level-btn${toolTab === "watermark" ? " active" : ""}`}
                >
                  <span style={{ fontSize: "1.2rem" }}>🏷️</span>
                  <span className="level-name">Watermark Only</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setToolTab("pagenumber"); setEnableWatermark(false); setEnablePageNum(true); }}
                  className={`level-btn${toolTab === "pagenumber" ? " active" : ""}`}
                >
                  <span style={{ fontSize: "1.2rem" }}>🔢</span>
                  <span className="level-name">Page Numbers Only</span>
                </button>
              </div>

              {/* Two Column Layout: Settings on Left, Live Preview on Right */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

                {/* Left Column: Settings Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* 1. Watermark Settings */}
                  {enableWatermark && (
                    <div style={{
                      padding: "14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#f472b6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🏷️</span> Watermark Text
                      </div>

                      {/* Text Input */}
                      <input
                        type="text"
                        value={wmText}
                        onChange={(e) => setWmText(e.target.value)}
                        placeholder="CONFIDENTIAL"
                        style={{
                          width: "100%", padding: "10px 14px", boxSizing: "border-box",
                          background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px", fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "13px", color: "#fff", outline: "none", marginBottom: "10px",
                        }}
                      />

                      {/* Quick Presets */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px" }}>
                        {PRESET_WATERMARKS.map(txt => (
                          <button
                            key={txt}
                            type="button"
                            onClick={() => setWmText(txt)}
                            style={{
                              padding: "3px 8px", background: wmText === txt ? "rgba(236,72,153,0.3)" : "rgba(255,255,255,0.05)",
                              border: wmText === txt ? "1px solid #ec4899" : "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "6px", color: wmText === txt ? "#f472b6" : "#94a3b8",
                              fontSize: "10px", fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {txt}
                          </button>
                        ))}
                      </div>

                      {/* Slider Controls */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {/* Font Size */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Size</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmSize}px</span>
                          </div>
                          <input type="range" min="16" max="96" value={wmSize} onChange={(e) => setWmSize(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        {/* Rotation Angle */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Rotation Angle</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmRotation}°</span>
                          </div>
                          <input type="range" min="-90" max="90" value={wmRotation} onChange={(e) => setWmRotation(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        {/* Opacity */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Opacity</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmOpacity}%</span>
                          </div>
                          <input type="range" min="5" max="100" value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        {/* Color Selector */}
                        <div>
                          <span style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>Color</span>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setWmColor(c.hex)}
                                style={{
                                  width: "22px", height: "22px", borderRadius: "50%",
                                  background: c.hex, border: wmColor === c.hex ? "2px solid #fff" : "2px solid transparent",
                                  cursor: "pointer", transform: wmColor === c.hex ? "scale(1.15)" : "scale(1)",
                                }}
                                title={c.label}
                              />
                            ))}
                            <input
                              type="color"
                              value={wmColor}
                              onChange={(e) => setWmColor(e.target.value)}
                              style={{ width: "24px", height: "24px", padding: 0, border: "none", background: "none", cursor: "pointer", marginLeft: "4px" }}
                              title="Custom Color"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Page Number Settings */}
                  {enablePageNum && (
                    <div style={{
                      padding: "14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🔢</span> Page Numbering
                      </div>

                      {/* Format Selector */}
                      <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Format</label>
                      <select
                        value={numFormat}
                        onChange={(e) => setNumFormat(e.target.value)}
                        style={{
                          width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                          border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: "10px",
                          color: "#fff", fontSize: "12px", outline: "none", marginBottom: "10px",
                        }}
                      >
                        <option value="Page {n} of {total}" style={{ background: "#0f172a" }}>Page 1 of {totalPages || 10}</option>
                        <option value="{n} / {total}" style={{ background: "#0f172a" }}>1 / {totalPages || 10}</option>
                        <option value="Page {n}" style={{ background: "#0f172a" }}>Page 1</option>
                        <option value="- {n} -" style={{ background: "#0f172a" }}>- 1 -</option>
                        <option value="{n}" style={{ background: "#0f172a" }}>1 (Number only)</option>
                      </select>

                      {/* Position Selector */}
                      <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Position</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", marginBottom: "10px" }}>
                        {[
                          { id: "bottom-left", label: "Bottom Left" },
                          { id: "bottom-center", label: "Bottom Center" },
                          { id: "bottom-right", label: "Bottom Right" },
                          { id: "top-center", label: "Top Center" },
                          { id: "top-right", label: "Top Right" },
                        ].map(pos => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setNumPosition(pos.id)}
                            style={{
                              padding: "6px", background: numPosition === pos.id ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                              border: numPosition === pos.id ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                              borderRadius: "6px", color: numPosition === pos.id ? "#38bdf8" : "#94a3b8",
                              fontSize: "10px", fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      {/* Skip First Page Toggle */}
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#cbd5e1", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={skipFirstPage}
                          onChange={(e) => setSkipFirstPage(e.target.checked)}
                          style={{ accentColor: "#38bdf8" }}
                        />
                        Skip first page (Cover / Title page)
                      </label>
                    </div>
                  )}
                </div>

                {/* Right Column: Live Visual Preview */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Live Preview (Page {previewPage} of {totalPages})
                    </span>
                    {totalPages > 1 && (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const p = Math.max(1, previewPage - 1);
                            setPreviewPage(p);
                          }}
                          disabled={previewPage <= 1}
                          style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", fontSize: "10px", cursor: previewPage <= 1 ? "not-allowed" : "pointer" }}
                        >
                          ◀ Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const p = Math.min(totalPages, previewPage + 1);
                            setPreviewPage(p);
                          }}
                          disabled={previewPage >= totalPages}
                          style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", fontSize: "10px", cursor: previewPage >= totalPages ? "not-allowed" : "pointer" }}
                        >
                          Next ▶
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Canvas Container */}
                  <div style={{
                    width: "100%", maxHeight: "380px", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#0a0a0a", borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    padding: "8px", boxSizing: "border-box"
                  }}>
                    <canvas
                      ref={previewCanvasRef}
                      style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain", borderRadius: "6px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Apply Button */}
              <div className="action-wrap" style={{ marginTop: "20px" }}>
                <button className="btn-compress" onClick={applyWatermarkAndPageNumbers}>
                  {stage === "done" ? "🔁 Re-Apply Watermark & Numbers" : `⚡ Apply to All ${totalPages} Pages`}
                </button>
              </div>
            </div>
          )}

          {/* ── Processing Bar ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Applying Watermark & Numbers...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result Box ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{ margin: "10px 0 20px", background: "rgba(236, 72, 153, 0.08)", borderColor: "rgba(236, 72, 153, 0.3)" }}>
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
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "#f472b6" }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{ background: "rgba(236, 72, 153, 0.18)", borderColor: "#ec4899", color: "#f472b6" }}>
                  🏷️ Watermark & Numbers Applied Successfully
                </div>
              </div>

              <ActionButtons blob={resultBlob} fileName={resultName} onReset={reset} auth={auth} />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF Watermark & Page Numbering Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
