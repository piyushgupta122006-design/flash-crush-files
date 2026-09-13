// ImageConverter.jsx — Google Material 3 (Material Web Components)
// Convert images between PNG, JPG, WebP, BMP, GIF formats — all in the browser.
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

// Import Google Official Material Web Components
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/progress/linear-progress.js";
import "@material/web/iconbutton/icon-button.js";

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
      const token = await auth.getToken();
      await auth.pickFromDrive(ACCEPTED_TYPES, (pickedFile) => handleFile(pickedFile), token);
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
    <div className="min-h-screen flex flex-col font-sans bg-[#f8fafd] dark:bg-[#131314]">
      {/* Top Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a] transition-all shadow-sm"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">Image Converter</div>
        <div className="text-xs text-[#444746] dark:text-[#c4c7c5] hidden sm:block font-medium">Max {MAX_SIZE_MB} MB · JPG · PNG · WebP · BMP · GIF</div>
      </div>

      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#c2e7ff] dark:bg-[#004a77] text-2xl text-[#001d35] dark:text-[#c2e7ff]">
              🔄
            </div>
            <h1 className="text-2xl sm:text-3xl font-normal text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Image Converter
            </h1>
          </div>
          <p className="text-sm text-[#444746] dark:text-[#c4c7c5] max-w-md mx-auto">
            Convert between PNG, JPG, WebP, BMP and GIF — instantly in your browser.
          </p>
        </div>

        {/* Main Card Surface */}
        <div className="bg-[#ffffff] dark:bg-[#1e1f20] rounded-3xl border border-[#c7c7c7] dark:border-[#444746] shadow-sm p-6 sm:p-8 overflow-hidden">

          {/* Drop Zone */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`border-2 border-dashed border-[#c7c7c7] dark:border-[#444746] rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                dragging 
                  ? "bg-[#c2e7ff]/20 dark:bg-[#004a77]/20 border-[#0b57d0] dark:border-[#a8c7fa]" 
                  : "bg-[#f8fafd] dark:bg-[#131314] hover:bg-[#f0f4f9] dark:hover:bg-[#1e1f20]"
              }`}
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
              <span className="text-4xl mb-3 block">🔄</span>
              <p className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                {dragging ? "Drop your image here!" : "Drag & drop your image here"}
              </p>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mb-6">
                JPG, PNG, WebP, BMP, GIF · max {MAX_SIZE_MB} MB · 100% Client-Side Privacy
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
                <div className="mt-4 px-4 py-2.5 rounded-2xl bg-[#ffdad6] dark:bg-[#93000a]/30 text-[#ba1a1a] dark:text-[#ffb4ab] text-sm font-medium border border-[#ffdad6] dark:border-[#93000a]/50 inline-block">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Image preview + file row */}
          {(stage === "ready" || stage === "done") && (
            <div className="space-y-4">
              {preview && (
                <div className="rounded-2xl border border-[#c7c7c7] dark:border-[#444746] overflow-hidden max-h-[260px] flex items-center justify-center bg-[#f0f4f9] dark:bg-[#131314] p-2">
                  <img
                    src={stage === "done" && convertedUrl ? convertedUrl : preview}
                    alt="Preview"
                    className="max-w-full max-h-[240px] object-contain rounded-xl"
                  />
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#c2e7ff] dark:bg-[#004a77] text-xl flex items-center justify-center text-[#001d35] dark:text-[#c2e7ff] flex-shrink-0">
                    🖼️
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3] truncate">{file?.name}</div>
                    <div className="text-xs text-[#444746] dark:text-[#c4c7c5] font-mono">{fmt(file?.size)}</div>
                  </div>
                </div>
                {/* Google Material Web Icon Button */}
                <md-icon-button onClick={reset} title="Remove image">
                  ✕
                </md-icon-button>
              </div>

              {/* Source format badge */}
              {sourceFormat && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#e8def8] dark:bg-[#4a4458] text-[#1d192b] dark:text-[#e8def8] border border-[#cac4d0] dark:border-[#49454f]">
                    📄 Source Format: <strong>{sourceFormat}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Format selector */}
          {(stage === "ready" || stage === "done") && (
            <div className="mt-6">
              <label className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] block mb-2 uppercase tracking-wide">
                Convert To
              </label>

              {/* Arrow preview */}
              <div className="flex items-center justify-center gap-3 mb-4 text-sm font-medium">
                <span className="px-3 py-1 rounded-full bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5]">
                  {sourceFormat}
                </span>
                <span className="text-[#0b57d0] dark:text-[#a8c7fa] font-bold">→</span>
                <span className="px-3 py-1 rounded-full bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff] font-semibold border border-[#0b57d0]/30 dark:border-[#a8c7fa]/30">
                  {getFormatFromMime(targetFormat)?.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FORMATS.map((fmt) => {
                  const isCurrent = file?.type === fmt.id;
                  const isSelected = targetFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${
                        isSelected 
                          ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff] font-semibold border-2 border-[#0b57d0] dark:border-[#a8c7fa] shadow-xs" 
                          : isCurrent
                          ? "opacity-40 cursor-not-allowed bg-[#f0f4f9] dark:bg-[#28292a] text-[#444746] dark:text-[#c4c7c5] border border-dashed border-[#c7c7c7] dark:border-[#444746]"
                          : "bg-[#f0f4f9] dark:bg-[#28292a] text-[#444746] dark:text-[#c4c7c5] border border-[#c7c7c7] dark:border-[#444746] hover:bg-[#e4ebf7] dark:hover:bg-[#333537]"
                      }`}
                      onClick={() => { if (!isCurrent) setTargetFormat(fmt.id); }}
                      disabled={isCurrent}
                      title={isCurrent ? "This is already the source format" : fmt.desc}
                    >
                      <span className="text-base font-bold">{fmt.label}</span>
                      <span className="text-[11px] font-mono opacity-80">.{fmt.ext}</span>
                      {isCurrent && (
                        <span className="text-[9px] uppercase font-bold text-[#b45309] dark:text-[#fde68a] mt-0.5">Current</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-2">
                {getFormatFromMime(targetFormat)?.desc}
              </p>

              {/* GIF notice */}
              {targetFormat === "image/gif" && (
                <div className="mt-3 px-3 py-2 rounded-xl bg-[#fff8e1] dark:bg-[#4a3b00]/30 border border-[#ffe082] dark:border-[#ffe082]/30 text-[#855700] dark:text-[#ffe082] text-xs">
                  ⚠️ GIF export is limited to PNG encoding (browser restriction). For animated GIFs, use a dedicated tool.
                </div>
              )}

              {/* Quality selector — only for JPG / WebP */}
              {(targetFormat === "image/jpeg" || targetFormat === "image/webp") && (
                <div className="mt-4">
                  <label className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] block mb-2 uppercase tracking-wide">
                    Output Quality
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITY_OPTS.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        className={`py-2.5 px-3 rounded-xl text-center text-sm font-medium transition-all ${
                          quality === q.id
                            ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff] font-semibold border-2 border-[#0b57d0] dark:border-[#a8c7fa]"
                            : "bg-[#f0f4f9] dark:bg-[#28292a] text-[#444746] dark:text-[#c4c7c5] border border-[#c7c7c7] dark:border-[#444746] hover:bg-[#e4ebf7] dark:hover:bg-[#333537]"
                        }`}
                        onClick={() => setQuality(q.id)}
                        title={q.desc}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1.5">
                    {QUALITY_OPTS.find(q => q.id === quality)?.desc}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Convert button (Google Material Web Filled Button) */}
          {(stage === "ready" || stage === "done") && (
            <div className="mt-6">
              <md-filled-button 
                onClick={convert} 
                disabled={isSameFormat ? true : undefined}
                style={{ width: "100%", height: "48px" }}
              >
                {stage === "done" ? "🔁 Convert Again" : "🔄 Convert Image"}
              </md-filled-button>
            </div>
          )}

          {/* Progress Section (Google Material Web Linear Progress) */}
          {stage === "converting" && (
            <div className="mt-6 p-6 rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">Converting your image...</span>
                <span className="text-sm font-bold text-[#0b57d0] dark:text-[#a8c7fa] font-mono">{progress}%</span>
              </div>
              
              {/* Google Material Web Linear Progress Component */}
              <md-linear-progress value={progress / 100} style={{ width: "100%" }}></md-linear-progress>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-2 text-center">{progressMsg}</p>
            </div>
          )}

          {/* Result Card */}
          {stage === "done" && result && (
            <div className="mt-6 p-6 rounded-2xl bg-[#c2e7ff]/20 dark:bg-[#004a77]/20 border border-[#0b57d0]/30 dark:border-[#a8c7fa]/30 text-center">
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] block">From</span>
                  <span className="text-xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{result.originalFormat}</span>
                </div>
                <span className="text-xl text-[#0b57d0] dark:text-[#a8c7fa]">→</span>
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa] block">To</span>
                  <span className="text-xl font-bold text-[#0b57d0] dark:text-[#a8c7fa]">{result.targetFormat}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 flex-wrap py-3 border-y border-[#0b57d0]/10 dark:border-[#a8c7fa]/10">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] block">Original</span>
                  <span className="text-sm font-semibold font-mono text-[#1f1f1f] dark:text-[#e3e3e3]">{fmt(result.originalSize)}</span>
                </div>
                <div className="w-[1px] h-6 bg-[#c7c7c7] dark:bg-[#444746]" />
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] block">Converted</span>
                  <span className="text-sm font-semibold font-mono text-[#0b57d0] dark:text-[#a8c7fa]">{fmt(result.convertedSize)}</span>
                </div>
                <div className="w-[1px] h-6 bg-[#c7c7c7] dark:bg-[#444746]" />
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] block">Dimensions</span>
                  <span className="text-sm font-semibold font-mono text-[#1f1f1f] dark:text-[#e3e3e3]">{result.width} × {result.height}</span>
                </div>
              </div>

              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]">
                  ✅ Successfully converted to {result.targetFormat}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {stage === "done" && convertedBlob && (
            <div className="mt-6">
              <ActionButtons
                blob={convertedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
              />
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-[#c7c7c7] dark:border-[#444746] flex items-center justify-between text-xs text-[#444746] dark:text-[#c4c7c5]">
            <span>Flash Crush-Files · Convert Tool</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
