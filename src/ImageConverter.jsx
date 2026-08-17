// ImageConverter.jsx
// Convert images between PNG, JPG, WebP, BMP, GIF formats — all in the browser.
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 30;
const MAX_SIZE    = MAX_SIZE_MB * 1024 * 1024;

const FORMATS = [
  { id: "image/png",  ext: "png",  label: "PNG",  desc: "Lossless, best for graphics & transparency" },
  { id: "image/jpeg", ext: "jpg",  label: "JPG",  desc: "Lossy, great for photos, smallest size" },
  { id: "image/webp", ext: "webp", label: "WebP", desc: "Modern format, excellent compression" },
  { id: "image/bmp",  ext: "bmp",  label: "BMP",  desc: "Uncompressed bitmap, maximum compatibility" },
  { id: "image/gif",  ext: "gif",  label: "GIF",  desc: "Good for simple graphics, 256 colors" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif"];
const ACCEPTED_EXTS  = ".jpg,.jpeg,.png,.webp,.bmp,.gif";

const QUALITY_OPTS = [
  { id: "high",   label: "High",   value: 0.95, desc: "Best quality, larger file" },
  { id: "medium", label: "Medium", value: 0.80, desc: "Balanced quality & size"  },
  { id: "low",    label: "Low",    value: 0.60, desc: "Smaller file, some loss"  },
];

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024)        return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function getFormatFromMime(mime) {
  return FORMATS.find(f => f.id === mime);
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

export default function ImageConverter({ auth }) {
  const navigate = useNavigate();
  const [file,           setFile]           = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [dragging,       setDragging]       = useState(false);
  const [targetFormat,   setTargetFormat]   = useState("image/png");
  const [quality,        setQuality]        = useState("high");
  const [stage,          setStage]          = useState("idle");
  const [progress,       setProgress]       = useState(0);
  const [progressMsg,    setProgressMsg]    = useState("");
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [convertedUrl,   setConvertedUrl]   = useState(null);
  const [convertedBlob,  setConvertedBlob]  = useState(null);
  const [pickLoading,    setPickLoading]    = useState(false);
  const inputRef = useRef(null);

  const detectSourceFormat = (file) => {
    return getFormatFromMime(file.type)?.label || file.name.split(".").pop()?.toUpperCase() || "Unknown";
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(jpg|jpeg|png|webp|bmp|gif)$/i)) {
      setErrorMsg("Unsupported format. Please use JPG, PNG, WebP, BMP, or GIF.");
      setStage("error"); return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      setStage("error"); return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    const currentMime = f.type;
    const suggestion = currentMime === "image/jpeg" ? "image/png"
                     : currentMime === "image/png"  ? "image/webp"
                     : currentMime === "image/webp" ? "image/jpeg"
                     : "image/jpeg";
    setTargetFormat(suggestion);
    setStage("ready");
    setResult(null);
    setErrorMsg("");
    setConvertedUrl(null);
    setConvertedBlob(null);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      await auth.pickFromDrive(ACCEPTED_TYPES, (pickedFile) => handleFile(pickedFile));
    } catch {
      setErrorMsg("Could not import from Drive. Try again.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const convert = () => {
    setStage("converting"); setProgress(0);
    const qualObj = QUALITY_OPTS.find(q => q.id === quality);
    const STEPS = [
      [15,  "Loading image data..."],
      [35,  "Decoding source pixels..."],
      [60,  "Rendering to canvas..."],
      [82,  "Encoding to target format..."],
      [100, "Done!"],
    ];
    let i = 0;
    const tick = () => {
      if (i < STEPS.length - 1) {
        setProgress(STEPS[i][0]); setProgressMsg(STEPS[i][1]); i++;
        setTimeout(tick, 180 + Math.random() * 120);
      }
    };
    tick();

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (targetFormat === "image/jpeg" || targetFormat === "image/bmp" || targetFormat === "image/gif") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const exportMime = targetFormat === "image/gif" ? "image/png" : targetFormat;
      const useQuality = (targetFormat === "image/jpeg" || targetFormat === "image/webp")
                         ? qualObj.value : undefined;

      canvas.toBlob((blob) => {
        if (!blob) {
          setStage("error"); setErrorMsg("Conversion failed. Please try again."); return;
        }
        const url = URL.createObjectURL(blob);
        setProgress(100); setProgressMsg("Done!");
        setConvertedBlob(blob);
        setConvertedUrl(url);
        setResult({
          originalSize: file.size,
          convertedSize: blob.size,
          originalFormat: detectSourceFormat(file),
          targetFormat: getFormatFromMime(targetFormat)?.label || "Unknown",
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setStage("done");
      }, exportMime, useQuality);
    };
    img.onerror = () => {
      setStage("error"); setErrorMsg("Could not load image. The file may be corrupted.");
    };
    img.src = preview;
  };

  const reset = () => {
    if (preview)      URL.revokeObjectURL(preview);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    setFile(null); setPreview(null); setStage("idle");
    setProgress(0); setResult(null); setErrorMsg("");
    setProgressMsg(""); setConvertedUrl(null); setConvertedBlob(null);
  };

  const getFileName = () => {
    const ext  = getFormatFromMime(targetFormat)?.ext || "png";
    const base = file?.name.replace(/\.[^.]+$/, "") || "image";
    return `${base}_converted.${ext}`;
  };

  const drivePickLabel = () => {
    if (pickLoading || auth.authStatus === "loading") return "Loading...";
    if (auth.authStatus === "signedin") {
      const name = auth.user?.name?.split(" ")[0] || auth.user?.email?.split("@")[0];
      return `Import from Drive  ·  ${name}`;
    }
    return "Import from Drive";
  };

  const sourceFormat = file ? detectSourceFormat(file) : null;
  const isSameFormat = file && file.type === targetFormat;

  return (
    <div className="compressor-page">

      <style>{`
        .fmt-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 7px;
          margin-bottom: 6px;
        }
        .fmt-btn {
          padding: 10px 4px;
          background: rgba(255,255,255,0.60);
          border: 1.5px solid rgba(14,165,233,0.15);
          border-radius: 11px;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
          font-family: inherit;
          position: relative;
        }
        .fmt-btn:hover:not(:disabled) {
          border-color: #0ea5e9;
          background: rgba(14,165,233,0.06);
        }
        .fmt-btn.active-convert {
          background: rgba(14,165,233,0.10);
          border-color: #38bdf8;
        }
        .fmt-btn.same-format {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .fmt-btn-label {
          font-size: 13px;
          font-weight: 700;
          color: #0369a1;
          display: block;
          margin-bottom: 2px;
        }
        .fmt-btn.active-convert .fmt-btn-label { color: #0284c7; }
        .fmt-btn-ext {
          font-size: 9px;
          font-weight: 500;
          color: #7dd3fc;
          display: block;
        }
        .source-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(14,165,233,0.08);
          border: 1px solid rgba(14,165,233,0.20);
          border-radius: 100px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #0369a1;
          margin-bottom: 8px;
        }
        .convert-arrow-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 12px 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-sub);
        }
        .convert-arrow-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(255,255,255,0.70);
          border: 1.5px solid rgba(14,165,233,0.25);
          border-radius: 8px;
          padding: 5px 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .convert-arrow-badge.source { color: var(--text-sub); border-color: rgba(168,85,247,0.20); }
        .convert-arrow-badge.target { color: #0284c7; border-color: rgba(14,165,233,0.30); background: rgba(14,165,233,0.06); }
        .arrow-icon {
          font-size: 16px;
          color: var(--text-muted);
        }
        .btn-compress.convert {
          background: linear-gradient(135deg, #0ea5e9, #0369a1);
          box-shadow: 0 4px 20px rgba(14,165,233,0.28);
        }
        .btn-compress.convert:hover { opacity: 0.90; transform: translateY(-1px); }
        .btn-compress.convert:disabled {
          opacity: 0.45; cursor: not-allowed; transform: none;
        }
        .progress-pct.blue-sky { color: #0284c7; }
        .progress-bar.sky { background: linear-gradient(90deg, #38bdf8, #0284c7); }
        .result-box-convert {
          margin: 0 20px 16px;
          background: rgba(14,165,233,0.05);
          border: 1px solid rgba(14,165,233,0.18);
          border-radius: 14px;
          padding: 20px;
        }
        .convert-result-formats {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .convert-result-fmt {
          text-align: center;
        }
        .convert-result-fmt-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted);
          margin-bottom: 4px;
          display: block;
        }
        .convert-result-fmt-name {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .convert-result-fmt-name.source { color: var(--text-sub); }
        .convert-result-fmt-name.target { color: #0284c7; }
        .convert-arrow-big { font-size: 20px; color: var(--text-muted); margin-top: 8px; }
        .convert-meta-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .convert-meta-item {
          text-align: center;
        }
        .convert-meta-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted);
          margin-bottom: 2px;
          display: block;
        }
        .convert-meta-val {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .convert-meta-divider {
          width: 1px;
          height: 28px;
          background: rgba(14,165,233,0.15);
        }
        .gif-notice {
          font-size: 11px;
          color: #92400e;
          background: rgba(251,191,36,0.10);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 8px;
          padding: 7px 10px;
          margin-top: 8px;
          text-align: center;
        }
        .comp-icon-badge.convert {
          background: linear-gradient(135deg, #e0f2fe, #bae6fd);
        }

        .quality-grid {
          display: flex;
          gap: 8px;
          margin-bottom: 6px;
        }
        .quality-btn {
          flex: 1;
          padding: 9px 4px;
          background: rgba(255,255,255,0.60);
          border: 1.5px solid rgba(14,165,233,0.12);
          border-radius: 10px;
          cursor: pointer;
          text-align: center;
          font-family: inherit;
          transition: all 0.15s;
        }
        .quality-btn:hover { border-color: #38bdf8; background: rgba(14,165,233,0.05); }
        .quality-btn.active-quality {
          background: rgba(14,165,233,0.10);
          border-color: #38bdf8;
        }
        .quality-name {
          font-size: 12px;
          font-weight: 600;
          color: #0369a1;
        }

        @media (max-width: 600px) {
          .fmt-grid { grid-template-columns: repeat(3, 1fr); }
          .convert-result-formats { gap: 8px; }
          .convert-meta-row { gap: 10px; }
        }
      `}</style>

      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">Image Converter</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · JPG · PNG · WebP · BMP · GIF</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge convert">🔄</div>
            <div className="comp-title">Image Converter</div>
          </div>
          <p className="comp-sub">Convert between PNG, JPG, WebP, BMP and GIF — instantly in your browser.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              style={{ "--dz-accent": "#0ea5e9", "--dz-bg": "rgba(14,165,233,0.04)" }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTS}
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <span className="drop-icon">🔄</span>
              <p className="drop-main">
                {dragging ? "Drop your image here!" : "Drag & drop your image here"}
              </p>
              <p className="drop-sub">JPG, PNG, WebP, BMP, GIF · max {MAX_SIZE_MB} MB</p>

              {stage !== "error" && (
                <div className="drop-btn-row">
                  <button className="drop-btn"
                    style={{ background: "linear-gradient(135deg,#0ea5e9,#0369a1)", boxShadow: "0 3px 12px rgba(14,165,233,0.30)" }}
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

          {/* ── File row + preview ── */}
          {(stage === "ready" || stage === "done") && (
            <>
              {preview && (
                <div style={{
                  margin: "20px 20px 0", borderRadius: "10px", overflow: "hidden",
                  border: "1px solid var(--border)", maxHeight: "180px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "repeating-conic-gradient(rgba(168,85,247,0.06) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px",
                }}>
                  <img
                    src={stage === "done" && convertedUrl ? convertedUrl : preview}
                    alt="Preview"
                    style={{ maxWidth: "100%", maxHeight: "180px", display: "block", objectFit: "contain" }}
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

              {/* Source format badge */}
              {sourceFormat && (
                <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="source-badge">
                    📄 Source: <strong>{sourceFormat}</strong>
                  </span>
                </div>
              )}
            </>
          )}

          {/* ── Format selector ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="level-wrap">
              <span className="level-label">Convert To</span>

              {/* Arrow preview */}
              <div className="convert-arrow-row">
                <span className="convert-arrow-badge source">{sourceFormat}</span>
                <span className="arrow-icon">→</span>
                <span className="convert-arrow-badge target">
                  {getFormatFromMime(targetFormat)?.label}
                </span>
              </div>

              <div className="fmt-grid">
                {FORMATS.map((fmt) => {
                  const isCurrent = file?.type === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      className={`fmt-btn${targetFormat === fmt.id ? " active-convert" : ""}${isCurrent ? " same-format" : ""}`}
                      onClick={() => { if (!isCurrent) setTargetFormat(fmt.id); }}
                      disabled={isCurrent}
                      title={isCurrent ? "This is already the source format" : fmt.desc}
                    >
                      <span className="fmt-btn-label">{fmt.label}</span>
                      <span className="fmt-btn-ext">.{fmt.ext}</span>
                      {isCurrent && (
                        <span style={{ fontSize: 9, color: "#b45309", display: "block", marginTop: 1 }}>current</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="level-hint" style={{ marginTop: 6 }}>
                {getFormatFromMime(targetFormat)?.desc}
              </p>

              {/* GIF notice */}
              {targetFormat === "image/gif" && (
                <div className="gif-notice">
                  ⚠️ GIF export is limited to PNG encoding (browser restriction). For animated GIFs, use a dedicated tool.
                </div>
              )}

              {/* Quality selector — only for JPG / WebP */}
              {(targetFormat === "image/jpeg" || targetFormat === "image/webp") && (
                <div style={{ marginTop: 14 }}>
                  <span className="level-label">Output Quality</span>
                  <div className="quality-grid">
                    {QUALITY_OPTS.map((q) => (
                      <button
                        key={q.id}
                        className={`quality-btn${quality === q.id ? " active-quality" : ""}`}
                        onClick={() => setQuality(q.id)}
                        title={q.desc}
                      >
                        <span className="quality-name">{q.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="level-hint">
                    {QUALITY_OPTS.find(q => q.id === quality)?.desc}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Convert button ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="action-wrap">
              <button
                className="btn-compress convert"
                onClick={convert}
                disabled={isSameFormat}
              >
                {stage === "done" ? "🔁 Convert Again" : "🔄 Convert Image"}
              </button>
            </div>
          )}

          {/* ── Progress ── */}
          {stage === "converting" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Converting your image...</span>
                <span className="progress-pct blue-sky">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar sky" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <div className="result-box-convert">
              <div className="convert-result-formats">
                <div className="convert-result-fmt">
                  <span className="convert-result-fmt-label">From</span>
                  <span className="convert-result-fmt-name source">{result.originalFormat}</span>
                </div>
                <span className="convert-arrow-big">→</span>
                <div className="convert-result-fmt">
                  <span className="convert-result-fmt-label">To</span>
                  <span className="convert-result-fmt-name target">{result.targetFormat}</span>
                </div>
              </div>

              <div className="convert-meta-row">
                <div className="convert-meta-item">
                  <span className="convert-meta-label">Original</span>
                  <span className="convert-meta-val">{fmt(result.originalSize)}</span>
                </div>
                <div className="convert-meta-divider" />
                <div className="convert-meta-item">
                  <span className="convert-meta-label">Converted</span>
                  <span className="convert-meta-val" style={{ color: "#0284c7" }}>{fmt(result.convertedSize)}</span>
                </div>
                <div className="convert-meta-divider" />
                <div className="convert-meta-item">
                  <span className="convert-meta-label">Dimensions</span>
                  <span className="convert-meta-val">{result.width} × {result.height}</span>
                </div>
              </div>

              <div className="result-badge" style={{ marginTop: 14 }}>
                <span style={{
                  background: "rgba(14,165,233,0.08)",
                  border: "1px solid rgba(14,165,233,0.20)",
                  color: "#0284c7",
                }}>
                  ✅ Converted to {result.targetFormat}
                </span>
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          {stage === "done" && convertedBlob && (
            <ActionButtons
              blob={convertedBlob}
              fileName={getFileName()}
              onReset={reset}
              auth={auth}
            />
          )}

          <div className="comp-footer">
            <span>Flash Crush-Files · Convert Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
