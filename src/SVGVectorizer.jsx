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
      const tracer =
        (typeof ImageTracer?.imagedataToSVG === "function" || typeof ImageTracer?.imageDataToSVG === "function" ? ImageTracer : null) ||
        (typeof ImageTracer?.default?.imagedataToSVG === "function" || typeof ImageTracer?.default?.imageDataToSVG === "function" ? ImageTracer.default : null) ||
        (typeof window !== "undefined" && (typeof window.ImageTracer?.imagedataToSVG === "function" || typeof window.ImageTracer?.imageDataToSVG === "function") ? window.ImageTracer : null);

      const traceFn = tracer?.imagedataToSVG || tracer?.imageDataToSVG;
      if (!tracer || typeof traceFn !== "function") {
        throw new Error("ImageTracer vectorizer engine could not be initialized.");
      }

      const rawSvg = traceFn.call(tracer, imgData, options);

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
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top Bar ── */}
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
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">📐</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">SVG Vectorizer Studio</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ── Header ── */}
        {!file && (
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
              📐
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
              SVG Vectorizer &amp; Tracer
            </h1>
            <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-2xl mx-auto leading-relaxed">
              Convert raster PNG, JPG &amp; WebP into clean, infinitely scalable vector SVG paths. 100% client-side on-device processing with zero server uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1">
            <div
              className="border-2 border-dashed border-m3-outline-variant hover:border-m3-primary bg-m3-surface-container/40 hover:bg-m3-surface-container/80 rounded-3xl p-8 sm:p-14 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="w-20 h-20 rounded-full bg-m3-primary/10 text-m3-primary flex items-center justify-center text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                🎨
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-m3-on-surface mb-2">
                Drop Image Here to Vectorize
              </div>
              <div className="text-sm text-m3-on-surface-variant mb-6 max-w-md">
                Logos, sketches, badges, icons · PNG, JPG, WebP (up to {MAX_SIZE_MB}MB)
              </div>
              <button
                type="button"
                className="px-8 py-3.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 hover:bg-m3-primary/90 active:scale-95 transition-all duration-200"
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
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Workspace & Controls ── */}
        {file && !svgBlob && (
          <div className="flex flex-col gap-6">
            
            {/* Image Summary */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 sm:p-6 shadow-m3-elevation-1">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={previewSrc}
                    alt="Original"
                    className="w-16 h-16 rounded-2xl object-cover border border-m3-outline-variant/80 shadow-sm flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-base sm:text-lg text-m3-on-surface truncate max-w-xs sm:max-w-md">
                      {file.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-m3-surface-container text-xs font-mono text-m3-on-surface-variant border border-m3-outline-variant/50">
                        📏 {origDims.w} × {origDims.h} px
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-m3-surface-container text-xs font-mono text-m3-on-surface-variant border border-m3-outline-variant/50">
                        💾 {formatBytes(file.size)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-4 py-2 rounded-full border border-m3-outline-variant/80 hover:bg-m3-error-container hover:text-m3-on-error-container hover:border-m3-error/30 text-sm font-semibold text-m3-on-surface transition-all duration-200 active:scale-95 disabled:opacity-50"
                  onClick={resetAll}
                  disabled={processing}
                >
                  Change Image
                </button>
              </div>
            </div>

            {/* Tracing Options Card */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-m3-outline-variant/40">
                <h3 className="text-lg font-display font-bold text-m3-on-surface flex items-center gap-2">
                  <span>🎯</span> Tracing Presets
                </h3>
                {selectedPreset === "custom" && (
                  <span className="px-2.5 py-0.5 rounded-full bg-m3-secondary-container text-m3-on-secondary-container text-xs font-semibold">
                    Custom Tuning Active
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
                {PRESETS.map((p) => {
                  const isSelected = selectedPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`p-4 rounded-2xl text-left flex flex-col gap-1.5 transition-all duration-200 disabled:opacity-50 ${
                        isSelected
                          ? "border-2 border-m3-primary bg-m3-primary-container text-m3-on-primary-container shadow-sm"
                          : "border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface"
                      }`}
                      onClick={() => handlePresetChange(p.id)}
                      disabled={processing}
                    >
                      <span className="font-display font-bold text-sm sm:text-base leading-snug">
                        {p.label}
                      </span>
                      <span className={`text-xs leading-relaxed ${isSelected ? "text-m3-on-primary-container/85" : "text-m3-on-surface-variant"}`}>
                        {p.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Advanced Controls Toggle */}
              <div className="border-t border-m3-outline-variant/40 pt-4 mt-2">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-display font-bold text-m3-primary hover:text-m3-primary/80 transition-colors py-1 cursor-pointer"
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  <span className="text-xs transition-transform duration-200">{showAdvanced ? "▼" : "▶"}</span>
                  <span>Advanced Curve &amp; Color Tuning</span>
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5 mt-2">
                    <div className="bg-m3-surface-container p-4 rounded-2xl border border-m3-outline-variant/40">
                      <div className="flex justify-between items-center text-xs font-semibold text-m3-on-surface mb-2.5">
                        <span>Color Palette Count:</span>
                        <span className="px-2 py-0.5 rounded-md bg-m3-surface-container-highest text-m3-on-surface font-mono font-bold">
                          {numColors} colors
                        </span>
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
                        className="w-full accent-m3-primary h-2 bg-m3-surface-container-highest rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="bg-m3-surface-container p-4 rounded-2xl border border-m3-outline-variant/40">
                      <div className="flex justify-between items-center text-xs font-semibold text-m3-on-surface mb-2.5">
                        <span>Min Path Area (Omit Specks):</span>
                        <span className="px-2 py-0.5 rounded-md bg-m3-surface-container-highest text-m3-on-surface font-mono font-bold">
                          {pathOmit} px
                        </span>
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
                        className="w-full accent-m3-primary h-2 bg-m3-surface-container-highest rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="bg-m3-surface-container p-4 rounded-2xl border border-m3-outline-variant/40">
                      <div className="flex justify-between items-center text-xs font-semibold text-m3-on-surface mb-2.5">
                        <span>Pre-Blur Smoothing:</span>
                        <span className="px-2 py-0.5 rounded-md bg-m3-surface-container-highest text-m3-on-surface font-mono font-bold">
                          {blurRadius} px
                        </span>
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
                        className="w-full accent-m3-primary h-2 bg-m3-surface-container-highest rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Indicator */}
              {processing && (
                <div className="mt-8 py-4 text-center">
                  <div className="inline-block w-10 h-10 border-4 border-m3-primary border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="font-display font-semibold text-sm text-m3-on-surface animate-pulse">
                    Vectorizing paths &amp; quantizing colors...
                  </p>
                </div>
              )}

              {/* Vectorize Trigger */}
              {!processing && (
                <button
                  type="button"
                  className="w-full mt-6 py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2.5"
                  onClick={runVectorize}
                >
                  <span className="text-xl leading-none">📐</span>
                  <span>Trace &amp; Generate Vector SVG</span>
                </button>
              )}
            </div>

          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/20 font-medium text-sm flex items-center gap-3 shadow-sm">
            <span className="text-lg flex-shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Results Area ── */}
        {svgBlob && svgString && (
          <div className="flex flex-col gap-6">
            
            {/* View Switcher Tabs & Preview/Code Card */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-m3-outline-variant/40 pb-4 mb-6">
                
                {/* Segmented / Tab buttons */}
                <div className="inline-flex p-1 rounded-full bg-m3-surface-container border border-m3-outline-variant/50">
                  <button
                    type="button"
                    className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
                      activeTab === "preview"
                        ? "bg-m3-secondary-container text-m3-on-secondary-container shadow-sm"
                        : "text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                    onClick={() => setActiveTab("preview")}
                  >
                    👁️ Vector Preview
                  </button>

                  <button
                    type="button"
                    className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
                      activeTab === "code"
                        ? "bg-m3-secondary-container text-m3-on-secondary-container shadow-sm"
                        : "text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                    onClick={() => setActiveTab("code")}
                  >
                    💻 Raw SVG Code
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-m3-surface-container text-xs font-mono font-semibold text-m3-on-surface-variant border border-m3-outline-variant/50">
                    SVG Size: {formatBytes(svgBlob.size)}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-m3-tertiary-container text-m3-on-tertiary-container text-xs font-semibold border border-m3-tertiary/20">
                    ∞ Infinite Scalability
                  </span>
                </div>

              </div>

              {/* Preview Mode */}
              {activeTab === "preview" && (
                <div>
                  {/* Zoom controls */}
                  <div className="flex items-center justify-end gap-2 mb-3">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold text-m3-on-surface transition-all active:scale-95"
                      onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                    >
                      - Zoom
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold text-m3-on-surface transition-all active:scale-95"
                      onClick={() => setZoomLevel(1)}
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold text-m3-on-surface transition-all active:scale-95"
                      onClick={() => setZoomLevel((z) => Math.min(3, z + 0.5))}
                    >
                      + Zoom ({Math.round(zoomLevel * 100)}%)
                    </button>
                  </div>

                  <div
                    className="w-full min-h-[340px] max-h-[560px] overflow-auto rounded-2xl border border-m3-outline-variant/60 p-6 flex items-center justify-center bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] dark:bg-[repeating-conic-gradient(#ffffff0a_0%_25%,transparent_0%_50%)] shadow-inner"
                  >
                    <div
                      className="flex items-center justify-center [&_svg]:max-w-full [&_svg]:max-h-[460px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:min-w-[220px]"
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
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <span className="text-xs sm:text-sm text-m3-on-surface-variant font-medium">
                      Copy and paste this raw &lt;svg&gt; XML directly into React, Next.js, or HTML files.
                    </span>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 shadow-sm flex items-center gap-1.5 active:scale-95 ${
                        copiedCode
                          ? "bg-m3-primary text-m3-on-primary"
                          : "bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/80 text-m3-on-surface"
                      }`}
                      onClick={copySvgCode}
                    >
                      <span>{copiedCode ? "✅" : "📋"}</span>
                      <span>{copiedCode ? "Copied!" : "Copy SVG Code"}</span>
                    </button>
                  </div>

                  <textarea
                    readOnly
                    value={svgString}
                    className="w-full h-80 font-mono text-xs p-4 rounded-2xl border border-m3-outline-variant/60 bg-m3-surface-container text-m3-on-surface focus:outline-none focus:ring-2 focus:ring-m3-primary resize-y leading-relaxed"
                  />
                </div>
              )}

            </div>

            {/* Action Buttons */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 max-w-2xl mx-auto w-full text-center shadow-m3-elevation-1">
              <div className="text-4xl sm:text-5xl mb-3">🎉</div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-m3-on-surface mb-2">
                Vector Tracing Complete!
              </h2>
              <p className="text-sm text-m3-on-surface-variant mb-6 leading-relaxed">
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
