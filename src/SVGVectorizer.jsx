// SVGVectorizer.jsx — 100% Client-Side Raster to SVG Vectorizer (Neo-Brutalism)
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ImageTracer from "imagetracerjs";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";

const MAX_SIZE_MB = 20;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const PRESETS = [
  {
    id: "monochrome",
    label: "🖊️ Monochrome Logo",
    desc: "Strict 2-color black & white crisp outline for icons & logos",
    options: {
      numberofcolors: 2,
      colorsampling: 2,
      colorquantcycles: 3,
      pathomit: 4,
      ltres: 1,
      qtres: 1,
      blurradius: 0,
      strokewidth: 0,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    },
  },
  {
    id: "poster",
    label: "🎨 Posterized Art",
    desc: "Flat, stylized color blocks (8 colors) for illustrations",
    options: {
      numberofcolors: 8,
      colorsampling: 2,
      colorquantcycles: 5,
      pathomit: 8,
      ltres: 1,
      qtres: 1,
      blurradius: 1,
      strokewidth: 0,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    },
  },
  {
    id: "vibrant",
    label: "🌈 Vibrant Colors",
    desc: "Balanced 16-color vectorization for graphics & badges",
    options: {
      numberofcolors: 16,
      colorsampling: 2,
      colorquantcycles: 4,
      pathomit: 4,
      ltres: 0.8,
      qtres: 0.8,
      blurradius: 0,
      strokewidth: 0,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    },
  },
  {
    id: "highdetail",
    label: "📸 High Detail",
    desc: "32 colors with fine path resolution for intricate photos",
    options: {
      numberofcolors: 32,
      colorsampling: 2,
      colorquantcycles: 5,
      pathomit: 2,
      ltres: 0.5,
      qtres: 0.5,
      blurradius: 0,
      strokewidth: 0,
      roundcoords: 1,
      viewbox: true,
      desc: false,
    },
  },
];

export default function SVGVectorizer({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // States
  const [file, setFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 });

  // Vectorizer Settings
  const [selectedPreset, setSelectedPreset] = useState("vibrant");
  const [numColors, setNumColors] = useState(16);
  const [pathOmit, setPathOmit] = useState(4);
  const [blurRadius, setBlurRadius] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Processing & Results
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [svgString, setSvgString] = useState("");
  const [svgBlob, setSvgBlob] = useState(null);
  const [resultFileName, setResultFileName] = useState("");
  const [activeTab, setActiveTab] = useState("preview"); // "preview" | "code"
  const [copiedCode, setCopiedCode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const resetAll = useCallback(() => {
    setFile(null);
    setPreviewSrc(null);
    setOrigDims({ w: 0, h: 0 });
    setProcessing(false);
    setError("");
    setSvgString("");
    setSvgBlob(null);
    setResultFileName("");
    setCopiedCode(false);
    setZoomLevel(1);
  }, []);

  const handleFile = (selectedFile) => {
    resetAll();
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, WebP, etc.).");
      return;
    }

    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image exceeds maximum allowed size of ${MAX_SIZE_MB} MB.`);
      return;
    }

    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewSrc(objectUrl);

    const img = new Image();
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = objectUrl;
  };

  // Apply Preset
  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId);
    const p = PRESETS.find((pr) => pr.id === presetId);
    if (p) {
      setNumColors(p.options.numberofcolors);
      setPathOmit(p.options.pathomit);
      setBlurRadius(p.options.blurradius);
    }
  };

  // Execute Vectorization
  const runVectorize = async () => {
    if (!file || !previewSrc) return;

    setProcessing(true);
    setError("");
    setSvgString("");
    setSvgBlob(null);

    try {
      // Build options
      const options = {
        numberofcolors: Number(numColors),
        colorsampling: 2,
        colorquantcycles: 4,
        pathomit: Number(pathOmit),
        ltres: 1,
        qtres: 1,
        blurradius: Number(blurRadius),
        strokewidth: 0,
        roundcoords: 1,
        viewbox: true,
        desc: false,
      };

      // Load image into HTMLCanvas to ensure reliable pixel reading
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for vectorization."));
        img.src = previewSrc;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Run ImageTracer
      const tracer = ImageTracer.imageDataToSVG
        ? ImageTracer
        : new ImageTracer.constructor();

      const rawSvg = tracer.imageDataToSVG(imgData, options);

      if (!rawSvg || !rawSvg.startsWith("<svg")) {
        throw new Error("Invalid SVG generated by vectorizer.");
      }

      setSvgString(rawSvg);

      const blob = new Blob([rawSvg], { type: "image/svg+xml;charset=utf-8" });
      setSvgBlob(blob);

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const outName = `${baseName}_vector.svg`;
      setResultFileName(outName);

      // Save to IndexedDB local history
      await addHistoryRecord({
        toolName: "SVG Vectorizer",
        fileName: outName,
        originalSize: file.size,
        resultSize: blob.size,
        mimeType: "image/svg+xml",
        timestamp: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));
    } catch (err) {
      console.error("Vectorization error:", err);
      setError(`Vectorization failed: ${err.message || "Unknown error"}`);
    } finally {
      setProcessing(false);
    }
  };

  const copySvgCode = async () => {
    if (!svgString) return;
    try {
      await navigator.clipboard.writeText(svgString);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  };

  return (
    <div className="compressor-page">
      {/* ── Top Bar ── */}
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">📐 SVG Vectorizer Studio</span>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1100px" }}>
        
        {/* ── Header ── */}
        {!file && (
          <div className="comp-header">
            <div className="comp-title-row">
              <div className="comp-icon-badge" style={{ background: "var(--brutal-yellow)" }}>📐</div>
              <h1 className="comp-title">SVG Vectorizer &amp; Tracer</h1>
            </div>
            <p className="comp-sub">
              Convert raster PNG, JPG &amp; WebP into clean, infinitely scalable vector SVG paths. 100% on-device processing with zero server uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="comp-card">
            <div
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <span className="drop-icon">🎨</span>
              <div className="drop-main">Drop Image Here to Vectorize</div>
              <div className="drop-sub">Logos, sketches, badges, icons · PNG, JPG, WebP</div>
              <button
                type="button"
                className="drop-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Workspace & Controls ── */}
        {file && !svgBlob && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Image Summary */}
            <div className="comp-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <img
                    src={previewSrc}
                    alt="Original"
                    style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "2px solid #000" }}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{file.name}</div>
                    <div style={{ color: "var(--text-sub)", fontSize: "0.88rem", fontWeight: 600, display: "flex", gap: "10px", marginTop: "4px" }}>
                      <span>📏 {origDims.w} × {origDims.h} px</span>
                      <span>💾 {formatBytes(file.size)}</span>
                    </div>
                  </div>
                </div>

                <button className="btn-reset" onClick={resetAll} disabled={processing}>
                  Change Image
                </button>
              </div>
            </div>

            {/* Tracing Options Card */}
            <div className="comp-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "1.15rem", marginBottom: "16px", borderBottom: "2px solid var(--border-color)", paddingBottom: "8px" }}>
                🎯 Tracing Presets
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`btn-reset ${selectedPreset === p.id ? "active" : ""}`}
                    style={{
                      padding: "14px",
                      textAlign: "left",
                      background: selectedPreset === p.id ? "var(--brutal-yellow)" : "var(--bg-main)",
                      color: selectedPreset === p.id ? "#000" : "inherit",
                      border: selectedPreset === p.id ? "3px solid #000" : "2px solid var(--border-color)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                    onClick={() => handlePresetChange(p.id)}
                    disabled={processing}
                  >
                    <span style={{ fontWeight: 800, fontSize: "0.95rem" }}>{p.label}</span>
                    <span style={{ fontSize: "0.78rem", opacity: 0.85, lineHeight: 1.3 }}>{p.desc}</span>
                  </button>
                ))}
              </div>

              {/* Advanced Controls Toggle */}
              <div style={{ borderTop: "2px dashed var(--border-color)", paddingTop: "14px", marginTop: "14px" }}>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    color: "var(--text-main)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  <span>{showAdvanced ? "▼" : "▶"}</span>
                  <span>Advanced Curve &amp; Color Tuning</span>
                </button>

                {showAdvanced && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginTop: "16px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 700, marginBottom: "6px" }}>
                        <span>Color Palette Count:</span>
                        <span>{numColors} colors</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="64"
                        value={numColors}
                        onChange={(e) => {
                          setNumColors(e.target.value);
                          setSelectedPreset("custom");
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 700, marginBottom: "6px" }}>
                        <span>Min Path Area (Omit Specks):</span>
                        <span>{pathOmit} px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="32"
                        value={pathOmit}
                        onChange={(e) => {
                          setPathOmit(e.target.value);
                          setSelectedPreset("custom");
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 700, marginBottom: "6px" }}>
                        <span>Pre-Blur Smoothing:</span>
                        <span>{blurRadius} px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        value={blurRadius}
                        onChange={(e) => {
                          setBlurRadius(e.target.value);
                          setSelectedPreset("custom");
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Indicator */}
              {processing && (
                <div style={{ marginTop: "24px", textAlign: "center" }}>
                  <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
                  <p style={{ fontWeight: 800 }}>Vectorizing paths &amp; quantizing colors...</p>
                </div>
              )}

              {/* Vectorize Trigger */}
              {!processing && (
                <button
                  className="btn-compress"
                  style={{
                    width: "100%",
                    marginTop: "24px",
                    padding: "16px",
                    fontSize: "1.15rem",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "10px",
                    background: "var(--brutal-yellow)",
                    color: "#000",
                  }}
                  onClick={runVectorize}
                >
                  <span>📐</span> Trace &amp; Generate Vector SVG
                </button>
              )}
            </div>

          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div
            className="error-banner"
            style={{
              background: "#FEE2E2",
              border: "3px solid #1a1a1a",
              padding: "14px",
              borderRadius: "10px",
              color: "#B91C1C",
              fontWeight: "bold",
              marginTop: "20px",
              boxShadow: "4px 4px 0 #000",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* ── Results Area ── */}
        {svgBlob && svgString && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* View Switcher Tabs */}
            <div className="comp-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "2px solid var(--border-color)", paddingBottom: "14px", marginBottom: "16px" }}>
                
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`btn-reset ${activeTab === "preview" ? "active" : ""}`}
                    style={{
                      padding: "8px 16px",
                      background: activeTab === "preview" ? "var(--brutal-yellow)" : "",
                      color: activeTab === "preview" ? "#000" : "",
                      fontWeight: 800,
                    }}
                    onClick={() => setActiveTab("preview")}
                  >
                    👁️ Vector Preview
                  </button>

                  <button
                    type="button"
                    className={`btn-reset ${activeTab === "code" ? "active" : ""}`}
                    style={{
                      padding: "8px 16px",
                      background: activeTab === "code" ? "var(--brutal-sky)" : "",
                      color: activeTab === "code" ? "#000" : "",
                      fontWeight: 800,
                    }}
                    onClick={() => setActiveTab("code")}
                  >
                    💻 Raw SVG Code
                  </button>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, background: "var(--brutal-mint)", padding: "4px 8px", borderRadius: "6px", border: "2px solid #000" }}>
                    SVG Size: {formatBytes(svgBlob.size)}
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, background: "var(--brutal-pink)", color: "#fff", padding: "4px 8px", borderRadius: "6px", border: "2px solid #000" }}>
                    ∞ Infinite Scalability
                  </span>
                </div>

              </div>

              {/* Preview Mode */}
              {activeTab === "preview" && (
                <div>
                  {/* Zoom controls */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "10px" }}>
                    <button className="btn-reset" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}>- Zoom</button>
                    <button className="btn-reset" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setZoomLevel(1)}>100%</button>
                    <button className="btn-reset" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}>+ Zoom ({Math.round(zoomLevel * 100)}%)</button>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      minHeight: "340px",
                      maxHeight: "560px",
                      overflow: "auto",
                      background: "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 20px 20px",
                      border: "3px solid #1a1a1a",
                      borderRadius: "10px",
                      padding: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "inset 0 0 10px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: "center center",
                        transition: "transform 0.15s ease",
                        maxWidth: "100%",
                      }}
                      dangerouslySetInnerHTML={{ __html: svgString }}
                    />
                  </div>
                </div>
              )}

              {/* Code Mode */}
              {activeTab === "code" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-sub)", fontWeight: 600 }}>
                      Copy and paste this raw &lt;svg&gt; XML directly into React, Next.js, or HTML files.
                    </span>
                    <button
                      className="btn-reset"
                      style={{
                        padding: "6px 14px",
                        background: copiedCode ? "var(--brutal-mint)" : "var(--brutal-yellow)",
                        color: "#000",
                        fontWeight: 800,
                        border: "2px solid #000",
                      }}
                      onClick={copySvgCode}
                    >
                      {copiedCode ? "✅ Copied!" : "📋 Copy SVG Code"}
                    </button>
                  </div>

                  <textarea
                    readOnly
                    value={svgString}
                    style={{
                      width: "100%",
                      height: "300px",
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                      padding: "14px",
                      borderRadius: "8px",
                      border: "2px solid var(--border-color)",
                      background: "var(--bg-main)",
                      color: "var(--text-main)",
                      resize: "vertical",
                    }}
                  />
                </div>
              )}

            </div>

            {/* Action Buttons */}
            <div className="comp-card" style={{ maxWidth: "720px", margin: "0 auto", padding: "28px", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "8px" }}>🎉</div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: "6px" }}>
                Vector Tracing Complete!
              </h2>
              <p style={{ color: "var(--text-sub)", marginBottom: "20px", fontWeight: 600 }}>
                Your image is now a pure mathematical vector that stays crystal clear at any zoom level or billboard size.
              </p>

              <ActionButtons
                auth={auth}
                blob={svgBlob}
                fileName={resultFileName}
                resultMime="image/svg+xml"
                onReset={resetAll}
                toolName="SVG Vectorizer"
              />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
