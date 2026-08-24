// BulkImageCompressor.jsx — Batch / Bulk Image Compressor with 1-Click ZIP Download & Target KB Mode
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import ActionButtons from "./ActionButtons";

const MAX_TOTAL_MB = 200;
const MAX_FILES = 100;

function fmt(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
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

const PRESETS = [
  { id: "balanced", label: "Balanced", quality: 0.70, maxWidth: 1920, desc: "Best balance of quality & size (~65% smaller)", icon: "⚖️" },
  { id: "max", label: "Max Compression", quality: 0.45, maxWidth: 1400, desc: "Smallest size (~85% smaller)", icon: "🚀" },
  { id: "high", label: "High Quality", quality: 0.85, maxWidth: 2560, desc: "Minimal compression (~45% smaller)", icon: "💎" },
  { id: "target", label: "Target KB Size", quality: 0.75, maxWidth: 1920, desc: "Compress all under target KB (e.g. 100 KB)", icon: "🎯" },
];

export default function BulkImageCompressor({ auth }) {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]); // [{ id, file, thumb, origSize, compBlob, compSize, status: 'pending'|'done'|'error', error }]
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Compression Mode Settings
  const [preset, setPreset] = useState("balanced");
  const [customQuality, setCustomQuality] = useState(70);
  const [outputFormat, setOutputFormat] = useState("original"); // "original" | "image/webp" | "image/jpeg"
  const [targetKb, setTargetKb] = useState(100); // For target KB mode
  const [maxWidthOption, setMaxWidthOption] = useState(1920);

  // Result ZIP
  const [zipBlob, setZipBlob] = useState(null);
  const [zipName, setZipName] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  const inputRef = useRef(null);

  const addFiles = useCallback((newFileList) => {
    if (!newFileList || newFileList.length === 0) return;

    const accepted = Array.from(newFileList).filter(f =>
      f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i.test(f.name)
    );

    if (accepted.length === 0) {
      setErrorMsg("Please select valid image files (JPG, PNG, WebP, etc.).");
      return;
    }

    if (files.length + accepted.length > MAX_FILES) {
      setErrorMsg(`Maximum ${MAX_FILES} images can be processed at once.`);
      return;
    }

    const newItems = accepted.map((f, idx) => ({
      id: `img-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      name: f.name,
      thumb: URL.createObjectURL(f),
      origSize: f.size,
      compBlob: null,
      compSize: null,
      status: "pending",
      error: null,
    }));

    setFiles(prev => [...prev, ...newItems]);
    setErrorMsg("");
    setStage("loaded");
  }, [files]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (id) => {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      if (next.length === 0) {
        setStage("idle");
        setZipBlob(null);
      }
      return next;
    });
  };

  const clearAll = () => {
    files.forEach(f => { try { URL.revokeObjectURL(f.thumb); } catch {} });
    setFiles([]);
    setStage("idle");
    setZipBlob(null);
    setZipName("");
    setProgress(0);
    setErrorMsg("");
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.ensurePickerReady();
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true).setSelectFolderEnabled(false)
        .setMimeTypes("image/png,image/jpeg,image/webp,image/gif");
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId("564511509147").setOAuthToken(token).addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const docs = data[window.google.picker.Response.DOCUMENTS];
            const downloadedFiles = [];
            for (const doc of docs) {
              const fileId = doc[window.google.picker.Document.ID];
              const fileName = doc[window.google.picker.Document.NAME] || "image.jpg";
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  const blob = await res.blob();
                  downloadedFiles.push(new File([blob], fileName, { type: blob.type || "image/jpeg" }));
                }
              } catch (err) {
                console.error("Failed to download from Drive", err);
              }
            }
            if (downloadedFiles.length > 0) addFiles(downloadedFiles);
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed.");
    } finally { setPickLoading(false); }
  };

  // ── Compress Single Image in Canvas with Quality / Target KB Loop ──
  const compressSingleImage = async (item, settings) => {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(item.file);

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        const maxDim = settings.maxWidth;

        if (maxDim && (width > maxDim || height > maxDim)) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Handle transparency background for JPEG
        const targetMime = settings.format === "original"
          ? (item.file.type === "image/png" ? "image/png" : "image/jpeg")
          : settings.format;

        if (targetMime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        if (settings.preset === "target" && settings.targetKb) {
          // Binary search loop to reach target KB size
          const targetBytes = settings.targetKb * 1024;
          let minQ = 0.1, maxQ = 0.95, bestBlob = null, bestDiff = Infinity;

          for (let iter = 0; iter < 5; iter++) {
            const midQ = (minQ + maxQ) / 2;
            const b = await new Promise(r => canvas.toBlob(r, targetMime, midQ));
            if (!b) break;

            const diff = Math.abs(b.size - targetBytes);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestBlob = b;
            }

            if (b.size > targetBytes) {
              maxQ = midQ;
            } else {
              minQ = midQ;
            }
          }

          resolve({ blob: bestBlob || item.file, size: bestBlob ? bestBlob.size : item.file.size });
        } else {
          // Standard quality compression
          const q = settings.quality;
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve({ blob: item.file, size: item.file.size });
            } else {
              resolve({ blob, size: blob.size });
            }
          }, targetMime, q);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ blob: item.file, size: item.file.size, error: "Image decode error" });
      };

      img.src = objectUrl;
    });
  };

  // ── Run Batch Compression ──
  const runBatchCompression = async () => {
    if (files.length === 0) return;

    setStage("processing");
    setProgress(0);
    setErrorMsg("");

    const activeSettings = {
      preset,
      quality: preset === "balanced" ? 0.70 : preset === "max" ? 0.45 : preset === "high" ? 0.85 : customQuality / 100,
      maxWidth: preset === "max" ? 1400 : preset === "balanced" ? 1920 : maxWidthOption,
      format: outputFormat,
      targetKb: preset === "target" ? targetKb : null,
    };

    const zip = new JSZip();
    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      const item = updatedFiles[i];
      setProgress(Math.round(((i + 1) / updatedFiles.length) * 85));
      setProgressMsg(`Compressing ${i + 1} of ${updatedFiles.length}: ${item.name}...`);

      const result = await compressSingleImage(item, activeSettings);

      updatedFiles[i] = {
        ...item,
        compBlob: result.blob,
        compSize: result.size,
        status: result.error ? "error" : "done",
        error: result.error,
      };

      // Add to ZIP
      let ext = item.name.split(".").pop();
      if (activeSettings.format === "image/webp") ext = "webp";
      else if (activeSettings.format === "image/jpeg" && ext.toLowerCase() === "png") ext = "jpg";

      const baseName = item.name.replace(/\.[^.]+$/, "");
      const cleanFileName = `${baseName}_compressed.${ext}`;

      zip.file(cleanFileName, result.blob);
    }

    setFiles(updatedFiles);
    setProgress(90);
    setProgressMsg("Generating .ZIP Archive...");

    const zipOutput = await zip.generateAsync({ type: "blob" });
    const dateStr = new Date().toISOString().slice(0, 10);
    const archiveName = `FlashCrush_Batch_${updatedFiles.length}_Images_${dateStr}.zip`;

    setZipBlob(zipOutput);
    setZipName(archiveName);

    setProgress(100);
    setProgressMsg("All images compressed successfully!");
    setStage("done");
  };

  // Download single image
  const downloadSingle = (item) => {
    if (!item.compBlob) return;
    const url = URL.createObjectURL(item.compBlob);
    const a = document.createElement("a");
    a.href = url;
    let ext = item.name.split(".").pop();
    if (outputFormat === "image/webp") ext = "webp";
    a.download = `${item.name.replace(/\.[^.]+$/, "")}_compressed.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Stats Calculations
  const totalOrigSize = files.reduce((acc, f) => acc + f.origSize, 0);
  const totalCompSize = files.reduce((acc, f) => acc + (f.compSize || f.origSize), 0);
  const totalSavedBytes = Math.max(0, totalOrigSize - totalCompSize);
  const totalSavedPercent = totalOrigSize > 0 ? Math.round((totalSavedBytes / totalOrigSize) * 100) : 0;

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
        <div className="tool-page-title">Bulk Image Compressor</div>
        <div className="tool-page-meta">Batch Compress 20-50+ Photos · 1-Click ZIP</div>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1050px" }}>
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(16, 185, 129, 0.4)", boxShadow: "0 0 20px rgba(16, 185, 129, 0.3)" }}>
              🖼️
            </div>
            <div className="comp-title">Bulk / Batch Image Compressor</div>
          </div>
          <p className="comp-sub">Upload 20–50+ images at once, compress with customizable presets, and download in a single .ZIP file.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          <div
            className={`drop-zone${dragging ? " dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{ marginBottom: files.length > 0 ? "16px" : 0 }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.heic"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <span className="drop-icon">📸</span>
            <p className="drop-main">
              {dragging ? "Drop your photos here!" : "Drag & drop multiple images to compress"}
            </p>
            <p className="drop-sub">
              Upload up to {MAX_FILES} photos (JPG, PNG, WebP, GIF, AVIF) · 100% in-browser privacy
            </p>

            <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
              <button className="drop-btn" onClick={() => inputRef.current?.click()}>
                📁 Browse Images ({files.length} selected)
              </button>
              <button className="drop-btn-drive" onClick={handleDrivePick}
                disabled={pickLoading || auth.authStatus === "loading"}>
                <DriveIconSmall />{drivePickLabel()}
              </button>
            </div>

            {errorMsg && <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>}
          </div>

          {/* ── Compression Settings & Presets ── */}
          {files.length > 0 && (
            <div style={{ padding: "0 20px 16px" }}>

              {/* Presets Grid */}
              <div style={{ marginBottom: "16px" }}>
                <span className="level-label" style={{ marginBottom: "8px", display: "block" }}>1. Compression Preset</span>
                <div className="level-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`level-btn${preset === p.id ? " active" : ""}`}
                      onClick={() => setPreset(p.id)}
                    >
                      <span style={{ fontSize: "1.3rem" }}>{p.icon}</span>
                      <span className="level-name">{p.label}</span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-sub)" }}>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine-Tuning Controls */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px",
                padding: "14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px", marginBottom: "16px"
              }}>
                {/* Target KB Input (If in target mode) */}
                {preset === "target" && (
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#34d399", textTransform: "uppercase", marginBottom: "6px" }}>
                      Target File Size (KB per photo)
                    </label>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="number"
                        min="10"
                        max="2000"
                        value={targetKb}
                        onChange={(e) => setTargetKb(Math.max(10, Number(e.target.value)))}
                        style={{
                          width: "90px", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                          border: "1.5px solid #10b981", borderRadius: "8px", color: "#fff",
                          fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", outline: "none",
                        }}
                      />
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>KB (e.g. 50, 100, 200)</span>
                    </div>
                  </div>
                )}

                {/* Output Format */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>
                    Output Format
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                      border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: "8px",
                      color: "#fff", fontSize: "12px", outline: "none",
                    }}
                  >
                    <option value="original" style={{ background: "#0f172a" }}>Keep Original Format</option>
                    <option value="image/webp" style={{ background: "#0f172a" }}>Convert to WebP (Recommended)</option>
                    <option value="image/jpeg" style={{ background: "#0f172a" }}>Convert to JPG</option>
                  </select>
                </div>

                {/* Max Width Resize */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>
                    Max Resolution Width
                  </label>
                  <select
                    value={maxWidthOption}
                    onChange={(e) => setMaxWidthOption(Number(e.target.value))}
                    style={{
                      width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                      border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: "8px",
                      color: "#fff", fontSize: "12px", outline: "none",
                    }}
                  >
                    <option value={1920} style={{ background: "#0f172a" }}>Full HD (1920px) — Recommended</option>
                    <option value={1280} style={{ background: "#0f172a" }}>HD (1280px) — Compact</option>
                    <option value={2560} style={{ background: "#0f172a" }}>2K (2560px) — Sharp</option>
                    <option value={99999} style={{ background: "#0f172a" }}>Original Dimensions</option>
                  </select>
                </div>
              </div>

              {/* Action Button & Clear */}
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button
                  className="btn-compress"
                  onClick={runBatchCompression}
                  disabled={stage === "processing"}
                  style={{ flex: 1 }}
                >
                  {stage === "done"
                    ? `🔁 Re-Compress All ${files.length} Images`
                    : `⚡ Compress All ${files.length} Images (${fmt(totalOrigSize)})`}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    padding: "14px 18px", background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)",
                    borderRadius: "14px", color: "#f87171", fontWeight: 700, fontSize: "13px", cursor: "pointer",
                  }}
                  title="Clear all uploaded images"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Batch Compressing Images...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #10b981, #06b6d4)" }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Results Summary Banner ── */}
          {stage === "done" && zipBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{
                margin: "10px 0 20px",
                background: "rgba(16,185,129,0.08)",
                borderColor: "rgba(16,185,129,0.3)",
              }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original Total</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.2rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {files.length} Photos · {fmt(totalOrigSize)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Compressed Total</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.2rem", fontWeight: 800, color: "#34d399" }}>
                      {fmt(totalCompSize)} (-{totalSavedPercent}%)
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{
                  background: "rgba(16,185,129,0.18)",
                  borderColor: "#10b981",
                  color: "#34d399",
                }}>
                  🎉 Saved {fmt(totalSavedBytes)} ({totalSavedPercent}% space saved)
                </div>
              </div>

              <ActionButtons
                blob={zipBlob}
                fileName={zipName}
                onReset={clearAll}
                auth={auth}
              />
            </div>
          )}

          {/* ── Interactive File Thumbnails Grid ── */}
          {files.length > 0 && (
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Selected Photos ({files.length} images)
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-sub)" }}>
                  Total: {fmt(totalOrigSize)}
                </span>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))",
                gap: "12px", maxHeight: "420px", overflowY: "auto", padding: "6px",
                borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)"
              }}>
                {files.map((item, idx) => {
                  const isDone = item.status === "done";
                  const savedPct = isDone && item.compSize < item.origSize
                    ? Math.round(((item.origSize - item.compSize) / item.origSize) * 100)
                    : 0;

                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "relative",
                        background: "rgba(255,255,255,0.04)",
                        border: isDone ? "1.5px solid rgba(16,185,129,0.4)" : "1.5px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px", overflow: "hidden", display: "flex", flexDirection: "column",
                      }}
                    >
                      {/* Image Preview */}
                      <div style={{
                        aspectRatio: "4/3", overflow: "hidden", background: "#0a0a0a",
                        display: "flex", alignItems: "center", justifyContent: "center", position: "relative"
                      }}>
                        <img
                          src={item.thumb}
                          alt={item.name}
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }}
                        />
                        {/* Remove Button */}
                        <button
                          onClick={() => removeFile(item.id)}
                          style={{
                            position: "absolute", top: "5px", right: "5px",
                            width: "22px", height: "22px", borderRadius: "50%",
                            background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)",
                            color: "#fff", fontSize: "11px", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          title="Remove this image"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Info & Savings */}
                      <div style={{ padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{
                            fontSize: "11px", fontWeight: 700, color: "#fff",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "4px"
                          }}>
                            {item.name}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#94a3b8" }}>
                            <span>{fmt(item.origSize)}</span>
                            {isDone && (
                              <span style={{ color: "#34d399", fontWeight: 800 }}>
                                → {fmt(item.compSize)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status / Savings Badge */}
                        <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          {isDone ? (
                            <span style={{
                              padding: "2px 6px", borderRadius: "4px",
                              background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                              color: "#34d399", fontSize: "9px", fontWeight: 800
                            }}>
                              -{savedPct}% Saved
                            </span>
                          ) : (
                            <span style={{ fontSize: "9px", color: "var(--text-sub)" }}>Ready</span>
                          )}

                          {isDone && (
                            <button
                              onClick={() => downloadSingle(item)}
                              style={{
                                padding: "2px 6px", background: "none", border: "none",
                                color: "var(--cyan-neon)", fontSize: "11px", cursor: "pointer", fontWeight: 700
                              }}
                              title="Download single photo"
                            >
                              ⬇ Save
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · Bulk Image Compressor Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
