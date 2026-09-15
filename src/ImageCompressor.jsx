// ImageCompressor.jsx — Google Material 3 (Material Web Components)
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

// Import Google Official Material Web Components
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/progress/linear-progress.js";
import "@material/web/iconbutton/icon-button.js";

// Helper: Binary Search for Exact Size (Unchanged & 100% Intact)
async function compressToTargetSize(imgElement, mimeType, targetSizeKB) {
  const targetBytes = targetSizeKB * 1024;
  const effectiveMime = mimeType === "image/png" ? "image/webp" : mimeType;
  let minQ = 0.05;
  let maxQ = 0.98;
  let bestBlob = null;
  let attempts = 0;
  const maxAttempts = 8;

  const canvas = document.createElement("canvas");
  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;
  const ctx = canvas.getContext("2d");
  
  if (effectiveMime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(imgElement, 0, 0);

  while (attempts < maxAttempts) {
    const currentQ = (minQ + maxQ) / 2;
    
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, effectiveMime, currentQ);
    });

    if (!blob) break;
    bestBlob = blob;

    if (blob.size > targetBytes) {
      maxQ = currentQ;
    } else {
      minQ = currentQ;
    }
    attempts++;
  }
  
  return bestBlob;
}

const MAX_SIZE_MB = 30;
const MAX_SIZE    = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED    = ["image/jpeg", "image/png", "image/webp"];

const LEVELS = [
  { id: "low",    label: "Low",    desc: "Light compression, ~35–50% smaller", quality: 0.80, icon: "🟢" },
  { id: "medium", label: "Medium", desc: "Balanced quality, ~55–75% smaller", quality: 0.60, icon: "🟡" },
  { id: "high",   label: "High",   desc: "Maximum compression, ~80–95% smaller", quality: 0.32, icon: "🔴" },
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

export default function ImageCompressor({ auth }) {
  const navigate = useNavigate();
  const [file,           setFile]           = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [dragging,       setDragging]       = useState(false);
  const [level,          setLevel]          = useState("medium");
  const [stage,          setStage]          = useState("idle");
  const [progress,       setProgress]       = useState(0);
  const [progressMsg,    setProgressMsg]    = useState("");
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [compressedUrl,  setCompressedUrl]  = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [pickLoading,    setPickLoading]    = useState(false);
  const [targetSize,     setTargetSize]     = useState("");
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(jpe?g|png|webp)$/i)) {
      setErrorMsg("Only JPG, PNG, and WebP images are supported.");
      setStage("error"); return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      setStage("error"); return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStage("ready"); setResult(null);
    setErrorMsg(""); setCompressedUrl(null); setCompressedBlob(null);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.pickFromDrive(["image/jpeg", "image/png", "image/webp"], (pickedFile) => {
        handleFile(pickedFile);
      }, token);
    } catch (err) {
      setErrorMsg(err.message || "Could not import from Drive. Try again.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const compress = () => {
    setStage("compressing"); setProgress(0);
    
    const isCustomSize = level === "custom";
    const sel = LEVELS.find((l) => l.id === level);
    
    const STEPS = [
      [10, "Loading image data..."],
      [30, isCustomSize ? "Calculating best quality for target size..." : "Applying compression quality..."],
      [70, "Optimizing and re-encoding..."],
      [100, "Done!"],
    ];
    
    let i = 0;
    const tickProgress = () => {
      if (i < STEPS.length - 1) {
        setProgress(STEPS[i][0]); setProgressMsg(STEPS[i][1]); i++;
        setTimeout(tickProgress, 180 + Math.random() * 120);
      }
    };
    tickProgress();

    const img = new Image();
    img.onload = async () => {
      let outMime = "image/jpeg";
      if (file.type === "image/png" || file.name.match(/\.png$/i)) {
        outMime = "image/webp";
      } else if (file.type === "image/webp" || file.name.match(/\.webp$/i)) {
        outMime = "image/webp";
      } else {
        outMime = "image/jpeg";
      }

      try {
        let finalBlob;
        
        if (isCustomSize && targetSize) {
          finalBlob = await compressToTargetSize(img, outMime, Number(targetSize));
        } else {
          const q = sel ? sel.quality : 0.65;
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (outMime === "image/jpeg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);
          
          finalBlob = await new Promise(resolve => 
            canvas.toBlob(resolve, outMime, q)
          );

          if (finalBlob && finalBlob.size >= file.size) {
            const fallbackBlob = await new Promise(resolve => 
              canvas.toBlob(resolve, "image/webp", Math.max(0.2, q - 0.2))
            );
            if (fallbackBlob && fallbackBlob.size < finalBlob.size) {
              finalBlob = fallbackBlob;
            }
          }
        }

        if (!finalBlob) throw new Error("Blob creation failed");

        const url = URL.createObjectURL(finalBlob);
        const saving = Math.max(1, Math.round(((file.size - finalBlob.size) / file.size) * 100));
        
        setProgress(100); setProgressMsg("Done!");
        setCompressedBlob(finalBlob); setCompressedUrl(url);
        setResult({ originalSize: file.size, compressedSize: finalBlob.size, saving });
        setStage("done");
        
      } catch {
        setStage("error"); setErrorMsg("Compression failed. Try again.");
      }
    };
    img.onerror = () => {
      setStage("error"); setErrorMsg("Failed to load image.");
    };
    img.src = preview;
  };

  const reset = () => {
    if (preview)       URL.revokeObjectURL(preview);
    if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    setFile(null); setPreview(null); setStage("idle"); setProgress(0);
    setResult(null); setErrorMsg(""); setProgressMsg("");
    setCompressedUrl(null); setCompressedBlob(null);
  };

  const getFileName = () => {
    let ext = "jpg";
    if (compressedBlob?.type === "image/webp") ext = "webp";
    else if (compressedBlob?.type === "image/png") ext = "png";
    else ext = "jpg";
    const base = file?.name.replace(/\.[^.]+$/, "") || "image";
    return `compressed_${base}.${ext}`;
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
    <div className="min-h-screen flex flex-col font-sans bg-m3-surface text-m3-on-surface transition-colors">
      {/* Top Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high transition-all shadow-m3-elevation-1 font-sans"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-m3-on-surface font-display tracking-tight">Image Compressor</div>
        <div className="text-xs text-m3-on-surface-variant hidden sm:block font-medium font-sans">Max {MAX_SIZE_MB} MB · JPG · PNG · WebP</div>
      </div>

      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-m3-secondary-container text-2xl text-m3-on-secondary-container shadow-m3-elevation-1">
              🖼️
            </div>
            <h1 className="text-2xl sm:text-headline-sm font-normal text-m3-on-surface font-display tracking-tight">
              Image Compressor
            </h1>
          </div>
          <p className="text-sm text-m3-on-surface-variant max-w-md mx-auto font-sans">
            Compress JPG, PNG, and WebP images instantly with maximum quality in your browser.
          </p>
        </div>

        {/* Main Card Surface */}
        <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 sm:p-8 overflow-hidden transition-colors">

          {/* Drop Zone */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`border-2 border-dashed border-m3-outline-variant rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                dragging 
                  ? "bg-m3-primary/10 border-m3-primary" 
                  : "bg-m3-surface-container-low/50 dark:bg-m3-surface-container-low/30 hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input 
                ref={inputRef} 
                type="file" 
                accept="image/jpeg,image/png,image/webp" 
                hidden
                onChange={(e) => handleFile(e.target.files[0])} 
              />
              <span className="text-4xl mb-3 block">🖼️</span>
              <p className="text-lg font-medium text-m3-on-surface font-display mb-1">
                {dragging ? "Drop your image here!" : "Drag & drop your image here"}
              </p>
              <p className="text-xs text-m3-on-surface-variant font-sans mb-6">
                JPG, PNG, WebP · max {MAX_SIZE_MB} MB · 100% Client-Side Privacy
              </p>

              {stage !== "error" && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {/* Google Material Web Filled Button */}
                  <md-filled-button onClick={() => inputRef.current?.click()}>
                    📁 Browse File
                  </md-filled-button>

                  {/* Google Material Web Outlined Button */}
                  <md-outlined-button 
                    onClick={handleDrivePick}
                    disabled={pickLoading || auth.authStatus === "loading" ? true : undefined}
                  >
                    <DriveIconSmall slot="icon" />
                    {drivePickLabel()}
                  </md-outlined-button>
                </div>
              )}

              {stage === "error" && (
                <div className="mt-4 px-4 py-2.5 rounded-2xl bg-m3-error-container text-m3-on-error-container text-sm font-medium border border-m3-outline-variant inline-block font-sans">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Image preview + file row */}
          {(stage === "ready" || stage === "done") && (
            <div className="space-y-4">
              {preview && (
                <div className="rounded-2xl border border-m3-outline-variant overflow-hidden max-h-[260px] flex items-center justify-center bg-m3-surface-container-low dark:bg-m3-surface-container-lowest p-2">
                  <img
                    src={stage === "done" && compressedUrl ? compressedUrl : preview}
                    alt="Preview"
                    className="max-w-full max-h-[240px] object-contain rounded-xl"
                  />
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-m3-secondary-container text-xl flex items-center justify-center text-m3-on-secondary-container flex-shrink-0">
                    🖼️
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-m3-on-surface truncate font-sans">{file?.name}</div>
                    <div className="text-xs text-m3-on-surface-variant font-mono">{fmt(file?.size)}</div>
                  </div>
                </div>
                {/* Google Material Web Icon Button */}
                <md-icon-button onClick={reset} title="Remove image">
                  ✕
                </md-icon-button>
              </div>
            </div>
          )}

          {/* Level selector */}
          {(stage === "ready" || stage === "done") && (
            <div className="mt-6">
              <label className="text-xs font-medium text-m3-on-surface-variant block mb-2 uppercase tracking-wide font-sans">
                Compression Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LEVELS.map((l) => (
                  <button 
                    key={l.id}
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${
                      level === l.id 
                        ? "bg-m3-secondary-container text-m3-on-secondary-container font-medium shadow-m3-elevation-1" 
                        : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant hover:bg-m3-surface-container-highest"
                    }`}
                    onClick={() => setLevel(l.id)}
                  >
                    <span className="text-lg mb-1">{l.icon}</span>
                    <span className="text-sm font-medium font-sans">{l.label}</span>
                  </button>
                ))}
                
                {/* Custom Button */}
                <button 
                  type="button"
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${
                    level === "custom" 
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-medium shadow-m3-elevation-1" 
                      : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant hover:bg-m3-surface-container-highest"
                  }`}
                  onClick={() => setLevel("custom")}
                >
                  <span className="text-lg mb-1">🎯</span>
                  <span className="text-sm font-medium font-sans">Custom</span>
                </button>
              </div>

              <p className="text-xs text-m3-on-surface-variant mt-2 font-sans">
                {level === "custom" ? "Target an exact file size in KB" : LEVELS.find(l => l.id === level)?.desc}
              </p>
              
              {/* Custom size input */}
              {level === "custom" && (
                <div className="mt-4 p-4 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant">
                  <label className="text-xs font-medium text-m3-on-surface block mb-1.5 font-sans">
                    Target Size (KB)
                  </label>
                  <input 
                    type="number" 
                    value={targetSize} 
                    onChange={(e) => setTargetSize(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-4 py-2.5 rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface font-mono text-sm outline-none focus:border-m3-primary transition-colors"
                  />
                  <p className="text-[11px] text-m3-on-surface-variant mt-1.5 font-sans">
                    Note: We will optimize quality to get as close to this target size as possible.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Compress button (Google Material Web Filled Button) ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="mt-6">
              <md-filled-button 
                onClick={compress} 
                style={{ width: "100%", height: "48px" }}
              >
                {stage === "done" ? "🔁 Re-compress Image" : "⚡ Compress Image"}
              </md-filled-button>
            </div>
          )}

          {/* Progress Section (Google Material Web Linear Progress) */}
          {stage === "compressing" && (
            <div className="mt-6 p-6 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-m3-on-surface font-sans">Compressing your image...</span>
                <span className="text-sm font-bold text-m3-primary font-mono">{progress}%</span>
              </div>
              
              {/* Google Material Web Linear Progress Component */}
              <md-linear-progress value={progress / 100} style={{ width: "100%" }}></md-linear-progress>
              
              <p className="text-xs text-m3-on-surface-variant mt-3 font-medium font-sans">{progressMsg}</p>
            </div>
          )}

          {/* Result Box */}
          {stage === "done" && result && (
            <div className="mt-6 space-y-4">
              <div className="p-5 rounded-2xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant">
                <div className="flex items-center justify-around text-center mb-4">
                  <div>
                    <span className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Original Size</span>
                    <span className="text-base font-medium text-m3-on-surface font-mono">{fmt(result.originalSize)}</span>
                  </div>
                  <div className="text-xl text-m3-primary font-mono">→</div>
                  <div>
                    <span className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Compressed</span>
                    <span className="text-base font-bold text-m3-primary font-mono">{fmt(result.compressedSize)}</span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-m3-secondary-container text-m3-on-secondary-container border border-m3-outline-variant shadow-m3-elevation-1 font-sans">
                    🎉 {result.saving}% smaller
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={compressedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
              />
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-m3-outline-variant/40 flex justify-between text-label-sm text-m3-on-surface-variant font-sans">
            <span>FlashCrush · Image Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
