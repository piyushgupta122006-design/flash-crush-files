// BackgroundRemover.jsx — 100% In-Browser AI Background Remover & Studio Compositor
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { removeBackground } from "@imgly/background-removal";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 25;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

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

const BG_PRESETS = [
  { id: "transparent", label: "Transparent", type: "transparent", icon: "🏁" },
  { id: "white", label: "Pure White", type: "color", val: "#ffffff", icon: "⚪" },
  { id: "black", label: "Dark Luxury", type: "color", val: "#131314", icon: "⚫" },
  { id: "studio-gray", label: "Studio Light", type: "color", val: "#f0f4f9", icon: "🌫️" },
  { id: "passport-blue", label: "Passport Blue", type: "color", val: "#0b57d0", icon: "🔵" },
  { id: "emerald", label: "Emerald Green", type: "color", val: "#0f5223", icon: "🟢" },
];

export default function BackgroundRemover({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [origUrl, setOrigUrl] = useState(null);
  const [cutoutBlob, setCutoutBlob] = useState(null);
  const [cutoutImg, setCutoutImg] = useState(null);

  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Background Customization Settings
  const [bgChoice, setBgChoice] = useState("transparent");
  const [customBgColor, setCustomBgColor] = useState("#ffffff");
  const [customBgImg, setCustomBgImg] = useState(null);
  const [addShadow, setAddShadow] = useState(true);

  // Final Export
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [exportFormat, setExportFormat] = useState("image/png");
  const [pickLoading, setPickLoading] = useState(false);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const customBgInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !/\.(jpe?g|png|webp|avif|bmp|heic)$/i.test(f.name)) {
      setErrorMsg("Please upload a valid image file (JPG, PNG, WebP).");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`Image exceeds ${MAX_SIZE_MB} MB limit.`);
      return;
    }

    setFile(f);
    setErrorMsg("");
    setCutoutBlob(null);
    setCutoutImg(null);
    setResultBlob(null);

    const url = URL.createObjectURL(f);
    setOrigUrl(url);
    setStage("loaded");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.ensurePickerReady();
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true).setSelectFolderEnabled(false)
        .setMimeTypes("image/png,image/jpeg,image/webp");
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147").setOAuthToken(token).addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "image.jpg";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                const blob = await res.blob();
                handleFile(new File([blob], fileName, { type: blob.type || "image/jpeg" }));
              }
            } catch (err) {
              setErrorMsg(err.message);
            }
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed.");
    } finally { setPickLoading(false); }
  };

  // ── Run 100% In-Browser AI Background Removal ──
  const runBackgroundRemoval = async () => {
    if (!file) return;

    setStage("processing");
    setProgress(15);
    setProgressMsg("Loading on-device neural vision model...");
    setErrorMsg("");

    try {
      const config = {
        progress: (key, current, total) => {
          if (key.includes("fetch")) {
            setProgress(Math.round(20 + (current / total) * 35));
            setProgressMsg(`Downloading AI model weights... (${Math.round((current / total) * 100)}%)`);
          } else if (key.includes("compute")) {
            setProgress(Math.round(55 + (current / total) * 40));
            setProgressMsg("Extracting subject and refining fine edges...");
          }
        },
        model: "medium", 
        output: { format: "image/png", quality: 0.95 },
      };

      const blob = await removeBackground(file, config);

      setProgress(95);
      setProgressMsg("Compositing transparent cut-out...");

      const img = new Image();
      const cutUrl = URL.createObjectURL(blob);
      img.onload = () => {
        setCutoutImg(img);
        setCutoutBlob(blob);
        setProgress(100);
        setProgressMsg("Background removed successfully!");
        setStage("done");
      };
      img.src = cutUrl;

    } catch (err) {
      console.error("AI Background Removal Error:", err);
      setErrorMsg("AI processing error: " + (err.message || "Please ensure hardware acceleration is enabled in your browser."));
      setStage("error");
    }
  };

  const handleCustomBgUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      setCustomBgImg(img);
      setBgChoice("custom-img");
    };
    img.src = url;
  };

  const renderCompositedCanvas = useCallback(() => {
    if (!cutoutImg) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const w = cutoutImg.width;
    const h = cutoutImg.height;
    canvas.width = w;
    canvas.height = h;

    const selectedPreset = BG_PRESETS.find(p => p.id === bgChoice);

    if (bgChoice === "transparent") {
      ctx.clearRect(0, 0, w, h);
    } else if (selectedPreset?.type === "color") {
      ctx.fillStyle = selectedPreset.val;
      ctx.fillRect(0, 0, w, h);
    } else if (bgChoice === "custom-color") {
      ctx.fillStyle = customBgColor;
      ctx.fillRect(0, 0, w, h);
    } else if (bgChoice === "custom-img" && customBgImg) {
      const bgAspect = customBgImg.width / customBgImg.height;
      const cAspect = w / h;
      let drawW, drawH;
      if (bgAspect > cAspect) {
        drawH = h; drawW = h * bgAspect;
      } else {
        drawW = w; drawH = w / bgAspect;
      }
      ctx.drawImage(customBgImg, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
    }

    if (addShadow && bgChoice !== "transparent") {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = Math.max(15, Math.round(w / 40));
      ctx.shadowOffsetY = Math.max(8, Math.round(h / 60));
      ctx.drawImage(cutoutImg, 0, 0, w, h);
      ctx.restore();
    }

    ctx.drawImage(cutoutImg, 0, 0, w, h);

  }, [cutoutImg, bgChoice, customBgColor, customBgImg, addShadow]);

  useEffect(() => {
    if (stage === "done" && cutoutImg) {
      renderCompositedCanvas();
    }
  }, [stage, cutoutImg, renderCompositedCanvas]);

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chosenMime = bgChoice === "transparent" ? "image/png" : exportFormat;
    const blob = await new Promise(r => canvas.toBlob(r, chosenMime, 0.95));

    let ext = "png";
    if (chosenMime === "image/webp") ext = "webp";
    else if (chosenMime === "image/jpeg") ext = "jpg";

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const outName = `${baseName}_nobg.${ext}`;

    setResultBlob(blob);
    setResultName(outName);
    setResultInfo(`${canvas.width}×${canvas.height} px · ${fmt(blob.size)} · ${ext.toUpperCase()}`);
  };

  const reset = () => {
    setFile(null);
    setOrigUrl(null);
    setCutoutBlob(null);
    setCutoutImg(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
  };

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
        <div className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">AI Background Remover</div>
        <div className="text-xs text-[#444746] dark:text-[#c4c7c5] hidden sm:block font-medium">100% In-Browser ML</div>
      </div>

      <div className="w-full max-w-[1100px] mx-auto px-4 sm:px-6 pb-12 flex-1">
        {/* Header Text */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#f0f4f9] dark:bg-[#28292a] text-xl">🤖</div>
            <h1 className="text-2xl sm:text-3xl font-normal text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">AI Background Remover Studio</h1>
          </div>
          <p className="text-sm text-[#444746] dark:text-[#c4c7c5] max-w-xl mx-auto">
            Erase backgrounds instantly using on-device machine learning. Replace with studio colors or custom backdrops.
          </p>
        </div>

        {/* Main Card Surface */}
        <div className="w-full bg-[#ffffff] dark:bg-[#1e1f20] rounded-3xl border border-[#c7c7c7] dark:border-[#444746] shadow-sm overflow-hidden">
          
          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`flex flex-col items-center justify-center p-8 sm:p-12 m-6 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${
                dragging 
                  ? "border-[#0b57d0] dark:border-[#a8c7fa] bg-[#c2e7ff]/20 dark:bg-[#004a77]/20" 
                  : "border-[#c7c7c7] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#131314] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.avif" hidden onChange={(e) => handleFile(e.target.files[0])} />
              <span className="text-4xl mb-4">🤖</span>
              <p className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">{dragging ? "Drop your photo here!" : "Drag & drop photo to remove background"}</p>
              <p className="text-sm text-[#444746] dark:text-[#c4c7c5] mb-6">100% private in-browser AI · max {MAX_SIZE_MB} MB</p>

              <div className="flex flex-col sm:flex-row gap-3" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="px-6 py-3 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm"
                  onClick={() => inputRef.current?.click()}
                >
                  📁 Browse Photo
                </button>
                <button 
                  className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a] transition-all disabled:opacity-50 shadow-sm"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && <div className="mt-4 px-4 py-2 rounded-xl bg-[#ffdad6] dark:bg-[#93000a] text-[#ba1a1a] dark:text-[#ffb4ab] text-sm font-medium border border-[#ffdad6] dark:border-[#93000a]">⚠ {errorMsg}</div>}
            </div>
          )}

          {/* ── File Row ── */}
          {file && stage !== "idle" && !(stage === "error" && !file) && (
            <div className="flex items-center gap-4 mx-6 my-6 p-4 rounded-2xl border border-[#c7c7c7] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#28292a]">
              <div className="text-2xl">📸</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3] truncate">{file.name}</div>
                <div className="text-xs text-[#444746] dark:text-[#c4c7c5]">{fmt(file.size)} · Original Photo</div>
              </div>
              {stage !== "processing" && (
                <button className="p-2 rounded-full text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#333537] transition-all" onClick={reset}>✕</button>
              )}
            </div>
          )}

          {/* ── Loaded State ── */}
          {stage === "loaded" && (
            <div className="flex flex-col items-center px-6 pb-6">
              <div className="w-full max-w-md max-h-[340px] overflow-hidden rounded-2xl border border-[#c7c7c7] dark:border-[#444746] mb-5 shadow-sm bg-[#f8fafd] dark:bg-[#131314]">
                <img src={origUrl} alt="" className="w-full max-h-[320px] object-contain block mx-auto" />
              </div>
              <button 
                className="w-full max-w-[420px] rounded-full py-3.5 px-4 text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] shadow-sm transition-all"
                onClick={runBackgroundRemoval}
              >
                ✨ Remove Background with On-Device AI
              </button>
            </div>
          )}

          {/* ── Processing State ── */}
          {stage === "processing" && (
            <div className="flex flex-col items-center justify-center p-12">
              <div className="w-full max-w-md">
                <div className="flex justify-between text-sm font-medium mb-2 text-[#1f1f1f] dark:text-[#e3e3e3]">
                  <span>Running AI Vision Model...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] overflow-hidden">
                  <div className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-3 text-center">{progressMsg}</p>
              </div>
            </div>
          )}

          {/* ── DONE STATE (Studio) ── */}
          {stage === "done" && cutoutImg && (
            <div className="p-6">
              {/* Background Options Grid */}
              <div className="mb-6">
                <span className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-3">1. Replace Background</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2">
                  {BG_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-all ${
                        bgChoice === p.id
                          ? "bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff] border-[#0b57d0] dark:border-[#a8c7fa] border-solid"
                          : "bg-[#ffffff] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] border-[#c7c7c7] dark:border-[#444746] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
                      }`}
                      onClick={() => setBgChoice(p.id)}
                    >
                      <span className="text-xl mb-1">{p.icon}</span>
                      <span className="text-[10px] font-medium text-center leading-tight">{p.label}</span>
                    </button>
                  ))}
                  
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-all ${
                      bgChoice === "custom-color"
                        ? "bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff] border-[#0b57d0] dark:border-[#a8c7fa] border-solid"
                        : "bg-[#ffffff] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] border-[#c7c7c7] dark:border-[#444746] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
                    }`}
                    onClick={() => setBgChoice("custom-color")}
                  >
                    <span className="text-xl mb-1">🎨</span>
                    <span className="text-[10px] font-medium text-center leading-tight">Custom Hex</span>
                  </button>

                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-all ${
                      bgChoice === "custom-img"
                        ? "bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff] border-[#0b57d0] dark:border-[#a8c7fa] border-solid"
                        : "bg-[#ffffff] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] border-[#c7c7c7] dark:border-[#444746] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a]"
                    }`}
                    onClick={() => customBgInputRef.current?.click()}
                  >
                    <input ref={customBgInputRef} type="file" accept="image/*" hidden onChange={handleCustomBgUpload} />
                    <span className="text-xl mb-1">🖼️</span>
                    <span className="text-[10px] font-medium text-center leading-tight">Upload BG</span>
                  </button>
                </div>
              </div>

              {/* Layout: Controls (Left), Canvas (Right) */}
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                
                {/* Controls */}
                <div className="flex flex-col gap-4">
                  
                  {bgChoice === "custom-color" && (
                    <div className="p-4 bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] rounded-2xl">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-2">Pick Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={customBgColor}
                          onChange={(e) => setCustomBgColor(e.target.value)}
                          className="w-10 h-10 p-0 border-0 bg-transparent cursor-pointer rounded-lg overflow-hidden"
                        />
                        <input
                          type="text"
                          value={customBgColor}
                          onChange={(e) => setCustomBgColor(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-xl text-sm text-[#1f1f1f] dark:text-[#e3e3e3] font-mono outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] rounded-2xl">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] mb-3">Lighting & Export</div>
                    
                    <label className="flex items-center gap-3 text-sm text-[#1f1f1f] dark:text-[#e3e3e3] cursor-pointer mb-4">
                      <input 
                        type="checkbox" 
                        checked={addShadow} 
                        onChange={(e) => setAddShadow(e.target.checked)} 
                        className="w-4 h-4 accent-[#0b57d0] dark:accent-[#a8c7fa]" 
                      />
                      Add Soft Studio Shadow
                    </label>

                    {bgChoice !== "transparent" && (
                      <div>
                        <label className="block text-xs text-[#444746] dark:text-[#c4c7c5] mb-1.5">Export Format</label>
                        <select
                          value={exportFormat}
                          onChange={(e) => setExportFormat(e.target.value)}
                          className="w-full px-3 py-2 bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-xl text-sm text-[#1f1f1f] dark:text-[#e3e3e3] outline-none focus:border-[#0b57d0] dark:focus:border-[#a8c7fa]"
                        >
                          <option value="image/png">PNG (High Quality)</option>
                          <option value="image/webp">WebP (Compact)</option>
                          <option value="image/jpeg">JPG (Standard)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Canvas */}
                <div className="flex flex-col items-center">
                  <div className={`w-full min-h-[380px] overflow-hidden flex items-center justify-center rounded-3xl border border-[#c7c7c7] dark:border-[#444746] shadow-sm p-4 ${
                    bgChoice === "transparent" 
                      ? "bg-[repeating-conic-gradient(#e5e7eb_0%_25%,_#f3f4f6_0%_50%)] dark:bg-[repeating-conic-gradient(#1e293b_0%_25%,_#0f172a_0%_50%)] bg-[length:20px_20px]" 
                      : "bg-[#f0f4f9] dark:bg-[#131314]"
                  }`}>
                    <canvas ref={canvasRef} className="max-w-full max-h-[400px] object-contain rounded-2xl" />
                  </div>
                </div>
              </div>

              {/* Process Button */}
              <div className="mt-6">
                <button 
                  className="w-full max-w-md mx-auto rounded-full py-3.5 px-4 text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] shadow-sm transition-all flex items-center justify-center gap-2 block"
                  onClick={exportImage}
                >
                  {resultBlob ? "🔁 Re-Export Image" : "⚡ Prepare Download & Save"}
                </button>
              </div>
            </div>
          )}

          {/* ── Results Box ── */}
          {stage === "done" && resultBlob && (
            <div className="px-6 pb-6">
              <div className="mt-4 mb-6 p-4 bg-[#c2e7ff]/30 dark:bg-[#004a77]/30 border border-[#c2e7ff] dark:border-[#004a77] rounded-2xl">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                  <div>
                    <span className="block text-xs text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1">Original Photo</span>
                    <span className="font-mono text-lg font-bold text-[#444746] dark:text-[#c4c7c5]">{fmt(file?.size)}</span>
                  </div>
                  <div className="text-xl text-[#c7c7c7] dark:text-[#444746] hidden sm:block">→</div>
                  <div>
                    <span className="block text-xs text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1">Composited Output</span>
                    <span className="font-mono text-lg font-bold text-[#001d35] dark:text-[#c2e7ff]">{resultInfo}</span>
                  </div>
                </div>
                <div className="mt-3 text-center text-xs font-medium text-[#001d35] dark:text-[#c2e7ff] bg-[#c2e7ff] dark:bg-[#004a77] py-1.5 rounded-full px-3 inline-block w-full">
                  🤖 Background Removed & Composited Successfully
                </div>
              </div>

              <div className="max-w-md mx-auto">
                <ActionButtons blob={resultBlob} fileName={resultName} onReset={reset} auth={auth} />
              </div>
            </div>
          )}

          <div className="p-4 text-center text-xs text-[#444746] dark:text-[#c4c7c5] border-t border-[#c7c7c7] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#131314]">
            FlashCrush · 100% in-browser processing · Zero server uploads
          </div>
        </div>
      </div>
    </div>
  );
}
