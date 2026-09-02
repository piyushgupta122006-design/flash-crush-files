// ImageUpscaler.jsx — 100% Client-Side AI Image Upscaler & Super-Resolution (Neo-Brutalism)
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Upscaler from "upscaler";
import defaultModel from "@upscalerjs/default-model";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";

const MAX_IMAGE_SIZE_MB = 25;
const MAX_DIMENSION_WARN = 1200;

// Format file size
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Interactive Before / After Split Slider Component
function BeforeAfterSlider({ originalSrc, upscaledSrc, origDims, newDims }) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  const handlePointerMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.round((x / rect.width) * 100);
    setSliderPos(percent);
  }, []);

  const onPointerDown = (e) => {
    isDragging.current = true;
    handlePointerMove(e.clientX || (e.touches && e.touches[0].clientX));
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDragging.current) return;
      const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
      if (clientX !== undefined) handlePointerMove(clientX);
    };
    const handleUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [handlePointerMove]);

  return (
    <div className="comp-card" style={{ padding: "20px", marginTop: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <h3 style={{ fontSize: "1.2rem", margin: 0, fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🔍</span> Interactive Before / After Comparison
        </h3>
        <div style={{ display: "flex", gap: "10px", fontSize: "0.85rem", fontWeight: 700 }}>
          <span style={{ background: "var(--brutal-yellow)", padding: "4px 8px", borderRadius: "6px", border: "2px solid #000" }}>
            Original: {origDims.w}×{origDims.h}
          </span>
          <span style={{ background: "var(--brutal-mint)", padding: "4px 8px", borderRadius: "6px", border: "2px solid #000" }}>
            Upscaled: {newDims.w}×{newDims.h}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="before-after-container"
        style={{
          position: "relative",
          width: "100%",
          maxHeight: "520px",
          minHeight: "260px",
          overflow: "hidden",
          borderRadius: "12px",
          border: "3px solid #1a1a1a",
          boxShadow: "6px 6px 0px #1a1a1a",
          cursor: "col-resize",
          userSelect: "none",
          background: "#111",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}
        onPointerDown={onPointerDown}
      >
        {/* Upscaled Background (Full) */}
        <img
          src={upscaledSrc}
          alt="Upscaled result"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
            imageRendering: "auto"
          }}
        />

        {/* Original Clipped Layer */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)`,
            pointerEvents: "none"
          }}
        >
          <img
            src={originalSrc}
            alt="Original"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              imageRendering: "pixelated"
            }}
          />
        </div>

        {/* Labels */}
        <div style={{
          position: "absolute",
          top: "14px",
          left: "14px",
          background: "rgba(0,0,0,0.85)",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.05em",
          border: "2px solid #fff",
          pointerEvents: "none"
        }}>
          ORIGINAL
        </div>

        <div style={{
          position: "absolute",
          top: "14px",
          right: "14px",
          background: "var(--brutal-yellow)",
          color: "#000",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.05em",
          border: "2px solid #000",
          pointerEvents: "none"
        }}>
          ✨ AI UPSCALED
        </div>

        {/* Draggable Divider Line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sliderPos}%`,
            width: "4px",
            background: "#fff",
            boxShadow: "0 0 8px rgba(0,0,0,0.8)",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 10
          }}
        >
          {/* Handle Badge */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              background: "var(--brutal-pink)",
              border: "3px solid #1a1a1a",
              boxShadow: "2px 2px 0px #000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 900
            }}
          >
            ↔
          </div>
        </div>
      </div>
      <p style={{ textAlign: "center", color: "var(--text-sub)", fontSize: "0.85rem", marginTop: "10px", fontWeight: 600 }}>
        👈 Drag the slider left &amp; right to compare edge clarity and pixel super-resolution 👉
      </p>
    </div>
  );
}

export default function ImageUpscaler({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const upscalerRef = useRef(null);

  // States
  const [file, setFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 });
  
  const [scaleFactor, setScaleFactor] = useState(2); // 2 | 4
  const [modelType, setModelType] = useState("photo"); // photo | fast
  const [patchSize, setPatchSize] = useState(64); // 64 | 128 (for chunking)

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  const [resultSrc, setResultSrc] = useState(null);
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [newDims, setNewDims] = useState({ w: 0, h: 0 });

  // Initialize Upscaler Instance
  useEffect(() => {
    try {
      upscalerRef.current = new Upscaler({
        model: defaultModel,
      });
    } catch (err) {
      console.error("Upscaler initialization failed", err);
    }
  }, []);

  const resetAll = useCallback(() => {
    setFile(null);
    setPreviewSrc(null);
    setOrigDims({ w: 0, h: 0 });
    setProcessing(false);
    setProgress(0);
    setStatusMsg("");
    setError("");
    setResultSrc(null);
    setResultBlob(null);
    setResultName("");
    setNewDims({ w: 0, h: 0 });
  }, []);

  // Handle File Input
  const handleFile = (selectedFile) => {
    resetAll();
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, WebP, etc.).");
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`Image size exceeds ${MAX_IMAGE_SIZE_MB} MB limit.`);
      return;
    }

    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewSrc(objectUrl);

    // Read Dimensions
    const img = new Image();
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = objectUrl;
  };

  // Run AI Super-Resolution Upscaling
  const runUpscale = async () => {
    if (!file || !previewSrc) return;

    setProcessing(true);
    setProgress(0);
    setStatusMsg("Initializing WebGL Neural Network...");
    setError("");

    try {
      if (!upscalerRef.current) {
        upscalerRef.current = new Upscaler({
          model: defaultModel,
        });
      }

      const upscaler = upscalerRef.current;
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load source image into neural processor."));
        img.src = previewSrc;
      });

      setStatusMsg("Enhancing pixels & sharpening textures...");

      // If scaleFactor is 4x, we can run 2 passes or process recursively
      const firstPassDataUrl = await upscaler.upscale(img, {
        patchSize: patchSize,
        padding: 4,
        progress: (pct) => {
          const scaledPct = scaleFactor === 4 ? Math.round(pct * 50) : Math.round(pct * 100);
          setProgress(scaledPct);
          setStatusMsg(`Super-resolving tiles: ${scaledPct}%`);
        },
      });

      let finalDataUrl = firstPassDataUrl;

      if (scaleFactor === 4) {
        setStatusMsg("Executing 4x Super-Resolution second pass...");
        const pass2Img = new Image();
        await new Promise((resolve) => {
          pass2Img.onload = resolve;
          pass2Img.src = firstPassDataUrl;
        });

        finalDataUrl = await upscaler.upscale(pass2Img, {
          patchSize: patchSize,
          padding: 4,
          progress: (pct) => {
            const scaledPct = 50 + Math.round(pct * 50);
            setProgress(scaledPct);
            setStatusMsg(`4x Super-resolving tiles: ${scaledPct}%`);
          },
        });
      }

      setResultSrc(finalDataUrl);

      // Measure final dimensions
      const finalImg = new Image();
      finalImg.onload = () => {
        setNewDims({ w: finalImg.naturalWidth, h: finalImg.naturalHeight });
      };
      finalImg.src = finalDataUrl;

      // Convert Data URL to Blob
      const res = await fetch(finalDataUrl);
      const blob = await res.blob();
      setResultBlob(blob);

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const outputName = `${baseName}_upscaled_${scaleFactor}x.png`;
      setResultName(outputName);

      // Record to IndexedDB
      await addHistoryRecord({
        toolName: "AI Image Upscaler",
        fileName: outputName,
        originalSize: file.size,
        resultSize: blob.size,
        mimeType: "image/png",
        timestamp: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));

    } catch (err) {
      console.error("Super resolution error:", err);
      setError(`Upscaling error: ${err.message || "WebGL shader timeout or memory limit. Try smaller tile size."}`);
    } finally {
      setProcessing(false);
      setProgress(100);
    }
  };

  const isOversized = origDims.w > MAX_DIMENSION_WARN || origDims.h > MAX_DIMENSION_WARN;

  return (
    <div className="compressor-page">
      {/* ── Tool Navigation Bar ── */}
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">✨ AI Image Upscaler</span>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1080px" }}>
        
        {/* ── Header ── */}
        {!file && (
          <div className="comp-header">
            <div className="comp-title-row">
              <div className="comp-icon-badge" style={{ background: "var(--brutal-yellow)" }}>✨</div>
              <h1 className="comp-title">AI Image Upscaler</h1>
            </div>
            <p className="comp-sub">
              2x &amp; 4x AI Super-Resolution directly in your browser. Sharpen blurry photos, illustrations, and textures with zero server uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="comp-card">
            <div
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <span className="drop-icon">🖼️</span>
              <div className="drop-main">Drop Low-Res Image Here</div>
              <div className="drop-sub">JPG, PNG, WebP · 100% on-device neural enhancement</div>
              <button type="button" className="drop-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
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

        {/* ── Configuration & Workspace ── */}
        {file && !resultBlob && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Input Details Card */}
            <div className="comp-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <img
                    src={previewSrc}
                    alt="Preview"
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

              {isOversized && (
                <div style={{ marginTop: "14px", padding: "10px 14px", background: "var(--brutal-yellow)", border: "2px solid #000", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 700 }}>
                  ⚠️ Large input resolution ({origDims.w}×{origDims.h}px). Tiling (patch size 64) is enabled to ensure smooth in-browser WebGL processing without GPU memory overflow.
                </div>
              )}
            </div>

            {/* Upscale Settings */}
            <div className="comp-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "1.15rem", marginBottom: "18px", borderBottom: "2px solid var(--border-color)", paddingBottom: "8px" }}>
                ⚙️ Super-Resolution Settings
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
                
                {/* Scale Factor */}
                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "8px", fontSize: "0.95rem" }}>
                    Upscale Multiplier:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button
                      type="button"
                      className={`btn-reset ${scaleFactor === 2 ? "active" : ""}`}
                      style={{
                        padding: "12px",
                        background: scaleFactor === 2 ? "var(--brutal-sky)" : "var(--bg-main)",
                        fontWeight: 800,
                        border: "2px solid #000"
                      }}
                      onClick={() => setScaleFactor(2)}
                      disabled={processing}
                    >
                      🚀 2x HD ({origDims.w * 2}×{origDims.h * 2})
                    </button>

                    <button
                      type="button"
                      className={`btn-reset ${scaleFactor === 4 ? "active" : ""}`}
                      style={{
                        padding: "12px",
                        background: scaleFactor === 4 ? "var(--brutal-pink)" : "var(--bg-main)",
                        color: scaleFactor === 4 ? "#fff" : "inherit",
                        fontWeight: 800,
                        border: "2px solid #000"
                      }}
                      onClick={() => setScaleFactor(4)}
                      disabled={processing}
                    >
                      🔥 4x Ultra ({origDims.w * 4}×{origDims.h * 4})
                    </button>
                  </div>
                </div>

                {/* Patch Size / Tiling */}
                <div>
                  <label style={{ display: "block", fontWeight: 800, marginBottom: "8px", fontSize: "0.95rem" }}>
                    Neural Patch Tiling:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button
                      type="button"
                      className={`btn-reset ${patchSize === 64 ? "active" : ""}`}
                      style={{
                        padding: "12px",
                        background: patchSize === 64 ? "var(--brutal-mint)" : "var(--bg-main)",
                        fontWeight: 800,
                        border: "2px solid #000"
                      }}
                      onClick={() => setPatchSize(64)}
                      disabled={processing}
                    >
                      🛡️ Safe (64px)
                    </button>

                    <button
                      type="button"
                      className={`btn-reset ${patchSize === 128 ? "active" : ""}`}
                      style={{
                        padding: "12px",
                        background: patchSize === 128 ? "var(--brutal-yellow)" : "var(--bg-main)",
                        fontWeight: 800,
                        border: "2px solid #000"
                      }}
                      onClick={() => setPatchSize(128)}
                      disabled={processing}
                    >
                      ⚡ Fast (128px)
                    </button>
                  </div>
                </div>

              </div>

              {/* Progress Bar & Status */}
              {processing && (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontWeight: 800, fontSize: "0.9rem" }}>
                    <span>{statusMsg}</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "16px", background: "#e5e7eb", borderRadius: "8px", border: "2px solid #000", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "var(--brutal-pink)",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-sub)", marginTop: "6px", textAlign: "center" }}>
                    Processing locally on your GPU/WASM pipeline. Please keep this tab active.
                  </p>
                </div>
              )}

              {/* Action Button */}
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
                    gap: "10px"
                  }}
                  onClick={runUpscale}
                >
                  <span>✨</span> Upscale Image ({scaleFactor}x Resolution)
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
              boxShadow: "4px 4px 0 #000"
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* ── Results View ── */}
        {resultBlob && resultSrc && (
          <div>
            <BeforeAfterSlider
              originalSrc={previewSrc}
              upscaledSrc={resultSrc}
              origDims={origDims}
              newDims={newDims}
            />

            <div className="comp-card" style={{ maxWidth: "720px", margin: "24px auto", padding: "28px", textAlign: "center" }}>
              <div style={{ fontSize: "3.5rem", marginBottom: "12px" }}>🎉</div>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 900, marginBottom: "8px" }}>
                Super-Resolution Complete!
              </h2>
              <p style={{ color: "var(--text-sub)", marginBottom: "20px", fontWeight: 600 }}>
                Enhanced from {origDims.w}×{origDims.h} to <strong>{newDims.w}×{newDims.h} ({scaleFactor}x)</strong> with crisp neural detail.
              </p>

              <ActionButtons
                auth={auth}
                blob={resultBlob}
                fileName={resultName}
                resultMime="image/png"
                onReset={resetAll}
                toolName="AI Image Upscaler"
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
