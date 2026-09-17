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
    <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 sm:p-8 mt-6 transition-colors">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-medium text-m3-on-surface font-display flex items-center gap-2">
          <span>🔍</span> Interactive Before / After Comparison
        </h3>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1.5 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant border border-m3-outline-variant">
            Original: {origDims.w}×{origDims.h}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-m3-primary text-m3-on-primary shadow-m3-elevation-1 font-bold">
            Upscaled: {newDims.w}×{newDims.h}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full max-h-[520px] min-h-[260px] overflow-hidden rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 cursor-col-resize select-none bg-m3-surface-container-low dark:bg-m3-surface-container-lowest flex items-center justify-center"
        onPointerDown={onPointerDown}
      >
        {/* Upscaled Background (Full) */}
        <img
          src={upscaledSrc}
          alt="Upscaled result"
          className="w-full h-full object-contain block pointer-events-none"
          style={{ imageRendering: "auto" }}
        />

        {/* Original Clipped Layer */}
        <div
          className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none"
          style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
        >
          <img
            src={originalSrc}
            alt="Original"
            className="w-full h-full object-contain block pointer-events-none"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Labels */}
        <div className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-black/75 backdrop-blur-sm text-white font-mono text-xs font-bold tracking-wider pointer-events-none">
          ORIGINAL
        </div>

        <div className="absolute top-3.5 right-3.5 px-3 py-1 rounded-full bg-m3-primary text-m3-on-primary font-mono text-xs font-bold tracking-wider pointer-events-none shadow-m3-elevation-1">
          ✨ AI UPSCALED
        </div>

        {/* Draggable Divider Line */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none z-10 -translate-x-1/2"
          style={{ left: `${sliderPos}%` }}
        >
          {/* Handle Badge */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-m3-primary text-m3-on-primary border-2 border-white shadow-m3-elevation-2 flex items-center justify-center text-sm font-bold pointer-events-none">
            ↔
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-m3-on-surface-variant mt-3 font-sans font-medium">
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
    <div className="min-h-screen flex flex-col font-sans bg-m3-surface text-m3-on-surface transition-colors">
      {/* ── Tool Navigation Bar ── */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high transition-all shadow-m3-elevation-1 font-sans"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-m3-on-surface font-display tracking-tight">AI Image Upscaler</div>
        <div className="text-xs text-m3-on-surface-variant hidden sm:block font-medium font-sans">2x & 4x Neural Super-Resolution</div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        
        {/* ── Header ── */}
        {!file && (
          <div className="mb-6 sm:mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-m3-secondary-container text-2xl text-m3-on-secondary-container shadow-m3-elevation-1">
                ✨
              </div>
              <h1 className="text-2xl sm:text-headline-sm font-normal text-m3-on-surface font-display tracking-tight">
                AI Image Upscaler
              </h1>
            </div>
            <p className="text-sm text-m3-on-surface-variant max-w-xl mx-auto font-sans">
              2x &amp; 4x AI Super-Resolution directly in your browser. Sharpen blurry photos, illustrations, and textures with zero server uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 sm:p-8 overflow-hidden transition-colors">
            <div
              className="border-2 border-dashed border-m3-outline-variant rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-m3-surface-container-low/50 dark:bg-m3-surface-container-low/30 hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <span className="text-4xl mb-3 block">🖼️</span>
              <p className="text-lg font-medium text-m3-on-surface font-display mb-1">Drop Low-Res Image Here</p>
              <p className="text-xs text-m3-on-surface-variant font-sans mb-6">
                JPG, PNG, WebP · max {MAX_IMAGE_SIZE_MB} MB · 100% on-device neural enhancement
              </p>
              <button 
                type="button" 
                className="px-5 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 transition-all font-sans active:scale-[0.99]" 
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                📁 Browse Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Configuration & Workspace ── */}
        {file && !resultBlob && (
          <div className="flex flex-col gap-6">
            
            {/* Input Details Card */}
            <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 transition-colors">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={previewSrc}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded-2xl border border-m3-outline-variant flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-base font-medium text-m3-on-surface truncate font-sans">{file.name}</div>
                    <div className="text-xs text-m3-on-surface-variant font-mono flex items-center gap-3 mt-1">
                      <span>📏 {origDims.w} × {origDims.h} px</span>
                      <span>💾 {formatBytes(file.size)}</span>
                    </div>
                  </div>
                </div>

                <button 
                  className="px-4 py-2 text-xs font-medium rounded-full bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-highest transition-all font-sans disabled:opacity-50" 
                  onClick={resetAll} 
                  disabled={processing}
                >
                  Change Image
                </button>
              </div>

              {isOversized && (
                <div className="mt-4 p-3.5 rounded-2xl bg-m3-tertiary-container/30 text-m3-on-tertiary-container border border-m3-outline-variant text-xs font-sans">
                  ⚠️ Large input resolution ({origDims.w}×{origDims.h}px). Tiling (patch size 64) is enabled to ensure smooth in-browser WebGL processing without GPU memory overflow.
                </div>
              )}
            </div>

            {/* Upscale Settings */}
            <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 sm:p-8 transition-colors">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-6 pb-3 border-b border-m3-outline-variant font-sans">
                ⚙️ Super-Resolution Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Scale Factor */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-m3-primary mb-3 font-sans">
                    Upscale Multiplier:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className={`py-3 px-3 text-xs font-medium rounded-2xl border transition-all font-sans ${
                        scaleFactor === 2
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => setScaleFactor(2)}
                      disabled={processing}
                    >
                      <div className="text-sm mb-0.5">🚀 2x HD</div>
                      <div className="text-[11px] font-mono opacity-80">{origDims.w * 2}×{origDims.h * 2} px</div>
                    </button>

                    <button
                      type="button"
                      className={`py-3 px-3 text-xs font-medium rounded-2xl border transition-all font-sans ${
                        scaleFactor === 4
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => setScaleFactor(4)}
                      disabled={processing}
                    >
                      <div className="text-sm mb-0.5">🔥 4x Ultra</div>
                      <div className="text-[11px] font-mono opacity-80">{origDims.w * 4}×{origDims.h * 4} px</div>
                    </button>
                  </div>
                </div>

                {/* Patch Size / Tiling */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-m3-secondary mb-3 font-sans">
                    Neural Patch Tiling:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className={`py-3 px-3 text-xs font-medium rounded-2xl border transition-all font-sans ${
                        patchSize === 64
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => setPatchSize(64)}
                      disabled={processing}
                    >
                      <div className="text-sm mb-0.5">🛡️ Safe (64px)</div>
                      <div className="text-[11px] opacity-80 font-sans">Low VRAM</div>
                    </button>

                    <button
                      type="button"
                      className={`py-3 px-3 text-xs font-medium rounded-2xl border transition-all font-sans ${
                        patchSize === 128
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => setPatchSize(128)}
                      disabled={processing}
                    >
                      <div className="text-sm mb-0.5">⚡ Fast (128px)</div>
                      <div className="text-[11px] opacity-80 font-sans">High Performance</div>
                    </button>
                  </div>
                </div>

              </div>

              {/* Progress Bar & Status */}
              {processing && (
                <div className="my-8 max-w-md mx-auto">
                  <div className="flex justify-between text-sm font-medium mb-2 text-m3-on-surface font-sans">
                    <span>{statusMsg}</span>
                    <span className="font-mono text-m3-primary font-bold">{progress}%</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-m3-surface-container-high border border-m3-outline-variant overflow-hidden">
                    <div
                      className="h-full bg-m3-primary transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-m3-on-surface-variant font-sans mt-3 text-center">
                    Processing locally on your GPU/WASM pipeline. Please keep this tab active.
                  </p>
                </div>
              )}

              {/* Action Button */}
              {!processing && (
                <div className="mt-8 flex justify-center">
                  <button
                    className="w-full max-w-md rounded-full py-3.5 px-6 text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-sans"
                    onClick={runUpscale}
                  >
                    <span>✨</span> Upscale Image ({scaleFactor}x Resolution)
                  </button>
                </div>
              )}

            </div>

          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-outline-variant text-sm font-medium font-sans">
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

            <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 max-w-2xl mx-auto p-8 text-center mt-6 transition-colors">
              <div className="w-16 h-16 rounded-full bg-m3-secondary-container text-3xl flex items-center justify-center text-m3-on-secondary-container shadow-m3-elevation-1 mx-auto mb-4">
                🎉
              </div>
              <h2 className="text-xl sm:text-2xl font-normal text-m3-on-surface font-display tracking-tight mb-2">
                Super-Resolution Complete!
              </h2>
              <p className="text-sm text-m3-on-surface-variant mb-6 font-sans">
                Enhanced from {origDims.w}×{origDims.h} to <strong className="text-m3-primary font-mono">{newDims.w}×{newDims.h} ({scaleFactor}x)</strong> with crisp neural detail.
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
