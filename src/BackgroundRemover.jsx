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
  { id: "black", label: "Dark Luxury", type: "color", val: "#0d1117", icon: "⚫" },
  { id: "studio-gray", label: "Studio Light", type: "color", val: "#f1f5f9", icon: "🌫️" },
  { id: "passport-blue", label: "Passport Blue", type: "color", val: "#0284c7", icon: "🔵" },
  { id: "emerald", label: "Emerald Green", type: "color", val: "#059669", icon: "🟢" },
  { id: "grad-cyber", label: "Cyber Glow", type: "gradient", val: "linear-gradient(135deg, #8b5cf6, #06b6d4)", icon: "✨" },
  { id: "grad-sunset", label: "Sunset Glow", type: "gradient", val: "linear-gradient(135deg, #f43f5e, #fbbf24)", icon: "🌅" },
  { id: "grad-neon", label: "Midnight Neon", type: "gradient", val: "linear-gradient(135deg, #1e1b4b, #312e81)", icon: "🌌" },
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
  const [feather, setFeather] = useState(1);

  // Before / After Split Slider
  const [sliderPos, setSliderPos] = useState(50); // 0 to 100%
  const [viewMode, setViewMode] = useState("split"); // "split" | "cutout" | "original"

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
      // Configuration with progress callback
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
        model: "medium", // balanced quality and fast load
        output: {
          format: "image/png",
          quality: 0.95,
        },
      };

      // Execute on-device segmentation
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
      // If WebGL/WebGPU fails, provide informative message
      setErrorMsg("AI processing error: " + (err.message || "Please ensure hardware acceleration is enabled in your browser."));
      setStage("error");
    }
  };

  // Custom Background Image Upload
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

  // ── Render Live Composited Preview on Canvas ──
  const renderCompositedCanvas = useCallback(() => {
    if (!cutoutImg) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const w = cutoutImg.width;
    const h = cutoutImg.height;

    canvas.width = w;
    canvas.height = h;

    // 1. Draw Background
    const selectedPreset = BG_PRESETS.find(p => p.id === bgChoice);

    if (bgChoice === "transparent") {
      // Checkerboard transparent pattern
      ctx.clearRect(0, 0, w, h);
    } else if (selectedPreset?.type === "color") {
      ctx.fillStyle = selectedPreset.val;
      ctx.fillRect(0, 0, w, h);
    } else if (selectedPreset?.type === "gradient") {
      // Gradient
      const grad = ctx.createLinearGradient(0, 0, w, h);
      if (bgChoice === "grad-cyber") {
        grad.addColorStop(0, "#8b5cf6"); grad.addColorStop(1, "#06b6d4");
      } else if (bgChoice === "grad-sunset") {
        grad.addColorStop(0, "#f43f5e"); grad.addColorStop(1, "#fbbf24");
      } else if (bgChoice === "grad-neon") {
        grad.addColorStop(0, "#1e1b4b"); grad.addColorStop(1, "#312e81");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (bgChoice === "custom-color") {
      ctx.fillStyle = customBgColor;
      ctx.fillRect(0, 0, w, h);
    } else if (bgChoice === "custom-img" && customBgImg) {
      // Fit user uploaded background image to cover canvas
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

    // 2. Draw Soft Drop Shadow (if enabled)
    if (addShadow && bgChoice !== "transparent") {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = Math.max(15, Math.round(w / 40));
      ctx.shadowOffsetY = Math.max(8, Math.round(h / 60));
      ctx.drawImage(cutoutImg, 0, 0, w, h);
      ctx.restore();
    }

    // 3. Draw Cutout Subject
    ctx.drawImage(cutoutImg, 0, 0, w, h);

  }, [cutoutImg, bgChoice, customBgColor, customBgImg, addShadow]);

  useEffect(() => {
    if (stage === "done" && cutoutImg) {
      renderCompositedCanvas();
    }
  }, [stage, cutoutImg, renderCompositedCanvas]);

  // ── Export Final Image ──
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
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">AI Background Remover</div>
        <div className="tool-page-meta">100% In-Browser ML · Zero Uploads</div>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1100px" }}>
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(168, 85, 247, 0.4)", boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)" }}>
              🤖
            </div>
            <div className="comp-title">AI Background Remover Studio</div>
          </div>
          <p className="comp-sub">Erase backgrounds instantly using on-device machine learning. Replace with studio colors, gradients or custom backdrops.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.avif" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">🤖</span>
              <p className="drop-main">{dragging ? "Drop your photo here!" : "Drag & drop photo to remove background"}</p>
              <p className="drop-sub">100% private in-browser AI · Portraits, products, vehicles, animals · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>📁 Browse Photo</button>
                <button className="drop-btn-drive" onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>}
            </div>
          )}

          {/* ── File Row ── */}
          {file && stage !== "idle" && !(stage === "error" && !file) && (
            <div className="file-row">
              <div className="file-icon">📸</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)} · Original Photo</div>
              </div>
              {stage !== "processing" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── Loaded State: Trigger AI Removal ── */}
          {stage === "loaded" && (
            <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                maxHeight: "340px", overflow: "hidden", borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.1)", marginBottom: "18px", boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
              }}>
                <img src={origUrl} alt="" style={{ maxWidth: "100%", maxHeight: "320px", objectFit: "contain", display: "block" }} />
              </div>

              <button className="btn-compress" onClick={runBackgroundRemoval} style={{ maxWidth: "420px" }}>
                ✨ Remove Background with On-Device AI
              </button>
            </div>
          )}

          {/* ── Processing State ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Running On-Device Neural Vision Model...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #a855f7, #38bdf8)" }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── STUDIO POST-PROCESSING (DONE STATE) ── */}
          {stage === "done" && cutoutImg && (
            <div style={{ padding: "0 20px 20px" }}>

              {/* Top: Background Options Grid */}
              <div style={{ marginBottom: "18px" }}>
                <span className="level-label" style={{ marginBottom: "8px", display: "block" }}>1. Replace Background</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "6px" }}>
                  {BG_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`level-btn${bgChoice === p.id ? " active" : ""}`}
                      onClick={() => setBgChoice(p.id)}
                      style={{ padding: "8px 4px" }}
                    >
                      <span style={{ fontSize: "1.1rem" }}>{p.icon}</span>
                      <span className="level-name" style={{ fontSize: "0.78rem" }}>{p.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`level-btn${bgChoice === "custom-color" ? " active" : ""}`}
                    onClick={() => setBgChoice("custom-color")}
                    style={{ padding: "8px 4px" }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>🎨</span>
                    <span className="level-name" style={{ fontSize: "0.78rem" }}>Custom Hex</span>
                  </button>
                  <button
                    type="button"
                    className={`level-btn${bgChoice === "custom-img" ? " active" : ""}`}
                    onClick={() => customBgInputRef.current?.click()}
                    style={{ padding: "8px 4px" }}
                  >
                    <input ref={customBgInputRef} type="file" accept="image/*" hidden onChange={handleCustomBgUpload} />
                    <span style={{ fontSize: "1.1rem" }}>🖼️</span>
                    <span className="level-name" style={{ fontSize: "0.78rem" }}>Upload BG</span>
                  </button>
                </div>
              </div>

              {/* Studio Grid: Controls Left, Live Composited Canvas Right */}
              <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px", alignItems: "start" }}>

                {/* Left Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                  {/* Custom Hex Color Picker (If selected) */}
                  {bgChoice === "custom-color" && (
                    <div style={{
                      padding: "12px", background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px"
                    }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                        Pick Backdrop Color
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="color"
                          value={customBgColor}
                          onChange={(e) => setCustomBgColor(e.target.value)}
                          style={{ width: "36px", height: "36px", padding: 0, border: "none", background: "none", cursor: "pointer" }}
                        />
                        <input
                          type="text"
                          value={customBgColor}
                          onChange={(e) => setCustomBgColor(e.target.value)}
                          style={{
                            flex: 1, padding: "6px 10px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "6px", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", outline: "none"
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Studio Effects */}
                  <div style={{
                    padding: "14px", background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#a855f7", textTransform: "uppercase", marginBottom: "10px" }}>
                      Studio Lighting & Shadow
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#cbd5e1", cursor: "pointer", marginBottom: "8px" }}>
                      <input type="checkbox" checked={addShadow} onChange={(e) => setAddShadow(e.target.checked)} style={{ accentColor: "#a855f7" }} />
                      Add Soft Studio Drop Shadow
                    </label>

                    {bgChoice !== "transparent" && (
                      <div>
                        <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Export Format</label>
                        <select
                          value={exportFormat}
                          onChange={(e) => setExportFormat(e.target.value)}
                          style={{ width: "100%", padding: "6px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", fontSize: "11px", outline: "none" }}
                        >
                          <option value="image/png">PNG (High Quality)</option>
                          <option value="image/webp">WebP (Compact)</option>
                          <option value="image/jpeg">JPG (Standard)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Live Interactive Canvas */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: "100%", minHeight: "380px", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "14px", border: "1.5px solid rgba(168, 85, 247, 0.35)",
                    boxShadow: "0 15px 35px rgba(0,0,0,0.6)", padding: "16px", boxSizing: "border-box",
                    background: bgChoice === "transparent"
                      ? "repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 20px 20px"
                      : "#080c16"
                  }}>
                    <canvas
                      ref={canvasRef}
                      style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: "6px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="action-wrap" style={{ marginTop: "22px" }}>
                <button className="btn-compress" onClick={exportImage}>
                  {resultBlob ? "🔁 Re-Export Image" : "⚡ Prepare Download & Save"}
                </button>
              </div>
            </div>
          )}

          {/* ── Results Box ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{
                margin: "10px 0 20px",
                background: "rgba(168,85,247,0.08)",
                borderColor: "rgba(168,85,247,0.3)",
              }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original Photo</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {fmt(file?.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Cut-Out Output</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "#c084fc" }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{
                  background: "rgba(168,85,247,0.18)",
                  borderColor: "#a855f7",
                  color: "#c084fc",
                }}>
                  🤖 Background Removed & Composited Successfully
                </div>
              </div>

              <ActionButtons
                blob={resultBlob}
                fileName={resultName}
                onReset={reset}
                auth={auth}
              />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · AI Background Remover Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
