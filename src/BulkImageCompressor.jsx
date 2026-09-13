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
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [preset, setPreset] = useState("balanced");
  const [customQuality, setCustomQuality] = useState(70);
  const [outputFormat, setOutputFormat] = useState("original"); // "original" | "image/webp" | "image/jpeg"
  const [targetKb, setTargetKb] = useState(100);
  const [maxWidthOption, setMaxWidthOption] = useState(1920);

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

        const targetMime = settings.format === "original"
          ? (item.file.type === "image/png" ? "image/png" : "image/jpeg")
          : settings.format;

        if (targetMime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        if (settings.preset === "target" && settings.targetKb) {
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
    <div className="min-h-screen flex flex-col font-sans bg-[#f8fafd] dark:bg-[#131314]">
      {/* Top Bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a] transition-all shadow-sm"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">Bulk Image Compressor</div>
        <div className="text-xs text-[#444746] dark:text-[#c4c7c5] hidden sm:block font-medium">Batch 20-50+ Photos</div>
      </div>

      <div className="w-full max-w-[1050px] mx-auto px-4 sm:px-6 pb-12 flex-1">
        {/* Header Text */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#f0f4f9] dark:bg-[#28292a] text-xl">🖼️</div>
            <h1 className="text-2xl sm:text-3xl font-normal text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">Bulk / Batch Image Compressor</h1>
          </div>
          <p className="text-sm text-[#444746] dark:text-[#c4c7c5] max-w-xl mx-auto">
            Upload 20–50+ images at once, compress with customizable presets, and download in a single .ZIP file.
          </p>
        </div>

        {/* Main Card Surface */}
        <div className="w-full bg-[#ffffff] dark:bg-[#1e1f20] rounded-3xl border border-[#c7c7c7] dark:border-[#444746] shadow-sm overflow-hidden">
          
          {/* Drop Zone */}
          <div
            className={`flex flex-col items-center justify-center p-8 sm:p-12 mx-6 mt-6 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${
              dragging 
                ? "border-[#0b57d0] dark:border-[#a8c7fa] bg-[#c2e7ff]/20 dark:bg-[#004a77]/20" 
                : "border-[#c7c7c7] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#131314] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
            }`}
            style={{ marginBottom: files.length > 0 ? "16px" : "24px" }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.heic"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <span className="text-4xl mb-4">📸</span>
            <p className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">
              {dragging ? "Drop your photos here!" : "Drag & drop multiple images to compress"}
            </p>
            <p className="text-sm text-[#444746] dark:text-[#c4c7c5] mb-6">
              Upload up to {MAX_FILES} photos (JPG, PNG, WebP) · 100% in-browser privacy
            </p>

            <div className="flex flex-col sm:flex-row gap-3" onClick={(e) => e.stopPropagation()}>
              <button className="px-6 py-3 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm" onClick={() => inputRef.current?.click()}>
                📁 Browse Images {files.length > 0 ? `(${files.length} selected)` : ""}
              </button>
              <button 
                className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a] transition-all disabled:opacity-50 shadow-sm" 
                onClick={handleDrivePick}
                disabled={pickLoading || auth.authStatus === "loading"}
              >
                <DriveIconSmall />{drivePickLabel()}
              </button>
            </div>
            {errorMsg && <div className="mt-4 px-4 py-2 rounded-xl bg-[#ffdad6] dark:bg-[#93000a] text-[#ba1a1a] dark:text-[#ffb4ab] text-sm font-medium border border-[#ffdad6] dark:border-[#93000a]">⚠ {errorMsg}</div>}
          </div>

          {/* Settings & Controls */}
          {files.length > 0 && (
            <div className="px-6 pb-6">
              
              {/* Presets Map */}
              <div className="mb-6">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-3">1. Compression Preset</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                        preset === p.id
                          ? "bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff] border-[#0b57d0] dark:border-[#a8c7fa] border-solid"
                          : "bg-[#ffffff] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] border-[#c7c7c7] dark:border-[#444746] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
                      }`}
                      onClick={() => setPreset(p.id)}
                    >
                      <span className="text-2xl mb-1">{p.icon}</span>
                      <span className="text-sm font-medium mb-1">{p.label}</span>
                      <span className="text-[10px] text-center opacity-80">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine-Tuning Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] rounded-2xl mb-6">
                
                {preset === "target" && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-2">
                      Target File Size (KB)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="2000"
                        value={targetKb}
                        onChange={(e) => setTargetKb(Math.max(10, Number(e.target.value)))}
                        className="w-24 px-3 py-2 bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-xl text-sm text-[#1f1f1f] dark:text-[#e3e3e3] outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] font-mono"
                      />
                      <span className="text-xs text-[#444746] dark:text-[#c4c7c5]">KB</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-2">
                    Output Format
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-xl text-sm text-[#1f1f1f] dark:text-[#e3e3e3] outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa]"
                  >
                    <option value="original">Keep Original Format</option>
                    <option value="image/webp">Convert to WebP (Recommended)</option>
                    <option value="image/jpeg">Convert to JPG</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-2">
                    Max Resolution Width
                  </label>
                  <select
                    value={maxWidthOption}
                    onChange={(e) => setMaxWidthOption(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-xl text-sm text-[#1f1f1f] dark:text-[#e3e3e3] outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa]"
                  >
                    <option value={1920}>Full HD (1920px) — Recommended</option>
                    <option value={1280}>HD (1280px) — Compact</option>
                    <option value={2560}>2K (2560px) — Sharp</option>
                    <option value={99999}>Original Dimensions</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex gap-3 items-center">
                <button
                  className="flex-1 rounded-full py-3.5 px-4 text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] shadow-sm transition-all"
                  onClick={runBatchCompression}
                  disabled={stage === "processing"}
                >
                  {stage === "done"
                    ? `🔁 Re-Compress All ${files.length} Images`
                    : `⚡ Compress All ${files.length} Images (${fmt(totalOrigSize)})`}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-full px-6 py-3.5 text-sm font-medium text-[#ba1a1a] dark:text-[#ffb4ab] bg-[#ffdad6]/50 hover:bg-[#ffdad6] dark:bg-[#93000a]/50 dark:hover:bg-[#93000a] border border-[#ffdad6] dark:border-[#93000a] transition-all"
                  title="Clear all uploaded images"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "processing" && (
            <div className="px-6 pb-8 text-center">
              <div className="flex justify-between text-sm font-medium mb-2 text-[#1f1f1f] dark:text-[#e3e3e3]">
                <span>Batch Compressing...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] overflow-hidden">
                <div className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-3">{progressMsg}</p>
            </div>
          )}

          {/* ── Results Banner ── */}
          {stage === "done" && zipBlob && (
            <div className="px-6 pb-6">
              <div className="mt-2 mb-6 p-4 bg-[#c4eed0]/30 dark:bg-[#0f5223]/30 border border-[#c4eed0] dark:border-[#0f5223] rounded-2xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                  <div>
                    <span className="block text-xs text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1">Original Total</span>
                    <span className="font-mono text-lg font-bold text-[#444746] dark:text-[#c4c7c5]">{files.length} Photos · {fmt(totalOrigSize)}</span>
                  </div>
                  <div className="text-xl text-[#c7c7c7] dark:text-[#444746] hidden sm:block">→</div>
                  <div>
                    <span className="block text-xs text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1">Compressed Total</span>
                    <span className="font-mono text-lg font-bold text-[#0f5223] dark:text-[#c4eed0]">{fmt(totalCompSize)} (-{totalSavedPercent}%)</span>
                  </div>
                </div>
                <div className="mt-3 text-center text-xs font-medium text-[#0f5223] dark:text-[#c4eed0] bg-[#c4eed0] dark:bg-[#0f5223] py-1.5 rounded-full px-3 inline-block w-full">
                  🎉 Saved {fmt(totalSavedBytes)} ({totalSavedPercent}% space saved)
                </div>
              </div>

              <div className="max-w-md mx-auto">
                <ActionButtons blob={zipBlob} fileName={zipName} onReset={clearAll} auth={auth} />
              </div>
            </div>
          )}

          {/* ── Files Grid ── */}
          {files.length > 0 && (
            <div className="px-6 pb-6">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
                  Selected Photos ({files.length})
                </span>
                <span className="text-xs text-[#444746] dark:text-[#c4c7c5]">
                  Total: {fmt(totalOrigSize)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[420px] overflow-y-auto p-2 bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] rounded-2xl">
                {files.map((item) => {
                  const isDone = item.status === "done";
                  const savedPct = isDone && item.compSize < item.origSize
                    ? Math.round(((item.origSize - item.compSize) / item.origSize) * 100)
                    : 0;

                  return (
                    <div
                      key={item.id}
                      className={`relative flex flex-col overflow-hidden rounded-xl bg-[#ffffff] dark:bg-[#1e1f20] transition-colors ${
                        isDone ? "border border-[#c4eed0] dark:border-[#0f5223]" : "border border-[#c7c7c7] dark:border-[#444746]"
                      }`}
                    >
                      <div className="aspect-[4/3] bg-[#f8fafd] dark:bg-[#131314] flex items-center justify-center relative overflow-hidden">
                        <img src={item.thumb} alt={item.name} className="max-w-full max-h-full object-cover w-full h-full" />
                        <button
                          onClick={() => removeFile(item.id)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#1f1f1f]/60 text-white flex items-center justify-center text-xs border border-white/20 hover:bg-[#1f1f1f]"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="p-2 flex flex-col flex-1 justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate mb-1">
                            {item.name}
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-[#444746] dark:text-[#c4c7c5]">
                            <span>{fmt(item.origSize)}</span>
                            {isDone && (
                              <span className="text-[#0f5223] dark:text-[#c4eed0] font-bold">
                                → {fmt(item.compSize)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex justify-between items-center">
                          {isDone ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#c4eed0] dark:bg-[#0f5223] text-[#0f5223] dark:text-[#c4eed0] text-[8px] font-bold">
                              -{savedPct}% Saved
                            </span>
                          ) : (
                            <span className="text-[8px] text-[#444746] dark:text-[#c4c7c5]">Ready</span>
                          )}

                          {isDone && (
                            <button
                              onClick={() => downloadSingle(item)}
                              className="text-[9px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline"
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

          <div className="p-4 text-center text-xs text-[#444746] dark:text-[#c4c7c5] border-t border-[#c7c7c7] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#131314]">
            FlashCrush · Bulk Batch Compressor · 100% in-browser processing
          </div>
        </div>
      </div>
    </div>
  );
}
