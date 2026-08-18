// ImageCompressor.jsx
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

// Helper: Binary Search for Exact Size
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
      // Get token directly in user-click context to avoid popup blocking
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
      // Browser canvas ignores quality parameter for PNG (PNG is lossless in Canvas API).
      // WebP format preserves full transparency and achieves true quality compression.
      let outMime = "image/jpeg";
      if (file.type === "image/png" || file.name.match(/\.png$/i)) {
        outMime = "image/webp"; // WebP compresses PNGs with alpha channel beautifully
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

          // Smart Never-Larger Guard: If result is ever >= original size, downscale slightly with webp
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
    <div className="compressor-page">

      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">Image Compressor</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · JPG · PNG · WebP</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge img">🖼️</div>
            <div className="comp-title">Image Compressor</div>
          </div>
          <p className="comp-sub">Compress JPG, PNG, and WebP images instantly in your browser.</p>
        </div>

        <div className="comp-card">

          {/* Drop Zone */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">🖼️</span>
              <p className="drop-main">
                {dragging ? "Drop your image here!" : "Drag & drop your image here"}
              </p>
              <p className="drop-sub">JPG, PNG, WebP · max {MAX_SIZE_MB} MB</p>

              {stage !== "error" && (
                <div className="drop-btn-row">
                  <button className="drop-btn"
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                    📁 Browse File
                  </button>
                  <button className="drop-btn-drive"
                    onClick={(e) => { e.stopPropagation(); handleDrivePick(); }}
                    disabled={pickLoading || auth.authStatus === "loading"}>
                    <DriveIconSmall />
                    {drivePickLabel()}
                  </button>
                </div>
              )}

              {stage === "error" && (
                <div className="error-box">⚠ {errorMsg}</div>
              )}
            </div>
          )}

          {/* Image preview + file row */}
          {(stage === "ready" || stage === "done") && (
            <>
              {preview && (
                <div style={{
                  margin: "20px 20px 0", borderRadius: "8px", overflow: "hidden",
                  border: "1px solid var(--border)", maxHeight: "220px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--p50)",
                }}>
                  <img
                    src={stage === "done" && compressedUrl ? compressedUrl : preview}
                    alt="Preview"
                    style={{ maxWidth: "100%", maxHeight: "220px", display: "block", objectFit: "contain" }}
                  />
                </div>
              )}
              <div className="file-row" style={{ marginTop: "12px" }}>
                <div className="file-icon img">🖼️</div>
                <div className="file-info">
                  <div className="file-name">{file?.name}</div>
                  <div className="file-size">{fmt(file?.size)}</div>
                </div>
                <button className="close-btn" onClick={reset}>✕</button>
              </div>
            </>
          )}

          {/* Level selector */}
          {(stage === "ready" || stage === "done") && (
            <div className="level-wrap">
              <span className="level-label">Compression Level</span>
              <div className="level-grid">
                {LEVELS.map((l) => (
                  <button key={l.id}
                    className={`level-btn${level === l.id ? " active-img" : ""}`}
                    onClick={() => setLevel(l.id)}>
                    <span className="level-icon">{l.icon}</span>
                    <span className="level-name">{l.label}</span>
                  </button>
                ))}
                
                {/* Custom Button */}
                <button 
                  className={`level-btn${level === "custom" ? " active-img" : ""}`}
                  onClick={() => setLevel("custom")}>
                  <span className="level-icon">🎯</span>
                  <span className="level-name">Custom</span>
                </button>
              </div>
              <p className="level-hint">{level === "custom" ? "Target an exact file size in KB" : LEVELS.find(l => l.id === level)?.desc}</p>
              
              {/* Custom size input */}
              {level === "custom" && (
                <div style={{ marginTop: "16px", background: "var(--p50)", padding: "12px", borderRadius: "10px", border: "1px dashed var(--p400)" }}>
                  <label style={{ fontSize: "12px", color: "var(--text)", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                    Target Size (KB)
                  </label>
                  <input 
                    type="number" 
                    value={targetSize} 
                    onChange={(e) => setTargetSize(e.target.value)}
                    placeholder="e.g. 50"
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: "6px", 
                      border: "1px solid var(--border2)", outline: "none",
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "#fff"
                    }}
                  />
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                    Note: We will optimize quality to get as close to this target size as possible.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Compress button ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="action-wrap">
              <button className="btn-compress img" onClick={compress}>
                {stage === "done" ? "🔁 Re-compress Image" : "⚡ Compress Image"}
              </button>
            </div>
          )}

          {stage === "compressing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Compressing your image...</span>
                <span className="progress-pct blue">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar blue" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {stage === "done" && result && (
            <>
              <div className="result-box">
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original Size</span>
                    <span className="result-val-orig">{fmt(result.originalSize)}</span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Compressed</span>
                    <span className="result-val-comp">{fmt(result.compressedSize)}</span>
                  </div>
                </div>
                <div className="result-badge">
                  <span>🎉 {result.saving}% smaller</span>
                </div>
              </div>
              <ActionButtons
                blob={compressedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
              />
            </>
          )}

          <div className="comp-footer">
            <span>FlashCrush · Image Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
