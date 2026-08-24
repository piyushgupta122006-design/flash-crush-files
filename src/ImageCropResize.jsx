// ImageCropResize.jsx — Advanced Image Crop, Resize & Aspect Ratio Studio
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 40;
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

const ASPECT_PRESETS = [
  { id: "free", label: "Freeform", ratio: null, icon: "✂️" },
  { id: "1:1", label: "1:1 Square", ratio: 1, desc: "Instagram / Profile", icon: "⏹️" },
  { id: "4:5", label: "4:5 Portrait", ratio: 4 / 5, desc: "Instagram Feed", icon: "📱" },
  { id: "9:16", label: "9:16 Story", ratio: 9 / 16, desc: "Reels / TikTok", icon: "📲" },
  { id: "16:9", label: "16:9 Landscape", ratio: 16 / 9, desc: "YouTube / Header", icon: "🖥️" },
  { id: "4:3", label: "4:3 Classic", ratio: 4 / 3, desc: "Standard Photo", icon: "📷" },
  { id: "3:2", label: "3:2 DSLR", ratio: 3 / 2, desc: "Print Photo", icon: "🖼️" },
  { id: "circle", label: "Circle Avatar", ratio: 1, desc: "Round Cutout", icon: "⭕" },
];

export default function ImageCropResize({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [imgObj, setImgObj] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Mode: "crop" | "resize" | "both"
  const [activeTab, setActiveTab] = useState("crop");

  // Aspect Ratio & Crop Coordinates (in normalized 0..1 scale relative to image)
  const [selectedRatio, setSelectedRatio] = useState("free");
  const [cropBox, setCropBox] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); // normalized (0 to 1)

  // Resizing Controls
  const [outWidth, setOutWidth] = useState(0);
  const [outHeight, setOutHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [scalePercent, setScalePercent] = useState(100);

  // Rotation & Flip
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [fineAngle, setFineAngle] = useState(0); // -45 to +45
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Export Format & Quality
  const [format, setFormat] = useState("image/webp");
  const [quality, setQuality] = useState(88);

  // Results
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const isDraggingHandle = useRef(null); // 'box' | 'tl' | 'tr' | 'bl' | 'br' | null
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !/\.(jpe?g|png|webp|avif|bmp|heic|gif)$/i.test(f.name)) {
      setErrorMsg("Please upload a valid image file (JPG, PNG, WebP, etc.).");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`Image exceeds ${MAX_SIZE_MB} MB limit.`);
      return;
    }

    setFile(f);
    setErrorMsg("");
    setRotation(0);
    setFineAngle(0);
    setFlipH(false);
    setFlipV(false);
    setScalePercent(100);

    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      setImgObj(img);
      setOutWidth(img.width);
      setOutHeight(img.height);
      setCropBox({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
      setStage("loaded");
    };
    img.onerror = () => {
      setErrorMsg("Failed to load image.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
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

  // Adjust crop box when aspect ratio preset changes
  const applyRatioPreset = (ratioId) => {
    setSelectedRatio(ratioId);
    if (!imgObj) return;

    const preset = ASPECT_PRESETS.find(p => p.id === ratioId);
    if (!preset || preset.ratio === null) return;

    const targetRatio = preset.ratio;
    const imgAspect = imgObj.width / imgObj.height;

    let newW, newH;
    if (targetRatio > imgAspect) {
      newW = 0.9;
      newH = (0.9 * imgAspect) / targetRatio;
    } else {
      newH = 0.9;
      newW = (0.9 * targetRatio) / imgAspect;
    }

    setCropBox({
      x: (1 - newW) / 2,
      y: (1 - newH) / 2,
      w: newW,
      h: newH,
    });
  };

  // Render Interactive Cropping Canvas
  const renderCanvas = useCallback(() => {
    if (!imgObj) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const maxDim = 460;
    const imgAspect = imgObj.width / imgObj.height;
    let canvasW, canvasH;

    if (imgAspect >= 1) {
      canvasW = maxDim;
      canvasH = Math.round(maxDim / imgAspect);
    } else {
      canvasH = maxDim;
      canvasW = Math.round(maxDim * imgAspect);
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Draw Image with Flip & Rotation
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate(((rotation + fineAngle) * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(imgObj, -canvasW / 2, -canvasH / 2, canvasW, canvasH);
    ctx.restore();

    // If in Crop mode: Draw Dark Overlay & Crop Box with Handles
    const cx = cropBox.x * canvasW;
    const cy = cropBox.y * canvasH;
    const cw = cropBox.w * canvasW;
    const ch = cropBox.h * canvasH;

    // Dark dimmed overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, canvasW, cy); // top
    ctx.fillRect(0, cy + ch, canvasW, canvasH - (cy + ch)); // bottom
    ctx.fillRect(0, cy, cx, ch); // left
    ctx.fillRect(cx + cw, cy, canvasW - (cx + cw), ch); // right

    // Crop Border (Glow purple/cyan)
    ctx.strokeStyle = "#8b5cf6";
    ctx.lineWidth = 2;
    if (selectedRatio === "circle") {
      ctx.beginPath();
      ctx.ellipse(cx + cw / 2, cy + ch / 2, cw / 2, ch / 2, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(cx, cy, cw, ch);

      // Rule of Thirds Grid Lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + cw / 3, cy); ctx.lineTo(cx + cw / 3, cy + ch);
      ctx.moveTo(cx + (cw * 2) / 3, cy); ctx.lineTo(cx + (cw * 2) / 3, cy + ch);
      ctx.moveTo(cx, cy + ch / 3); ctx.lineTo(cx + cw, cy + ch / 3);
      ctx.moveTo(cx, cy + (ch * 2) / 3); ctx.lineTo(cx + cw, cy + (ch * 2) / 3);
      ctx.stroke();
    }

    // 4 Corner Resize Handles
    const handleSize = 9;
    ctx.fillStyle = "#38bdf8";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;

    const corners = [
      { x: cx, y: cy },
      { x: cx + cw, y: cy },
      { x: cx, y: cy + ch },
      { x: cx + cw, y: cy + ch },
    ];

    corners.forEach(c => {
      ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
    });

  }, [imgObj, cropBox, selectedRatio, rotation, fineAngle, flipH, flipV]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle Dragging Crop Box & Handles
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasW = canvas.width;
    const canvasH = canvas.height;

    const cx = cropBox.x * canvasW;
    const cy = cropBox.y * canvasH;
    const cw = cropBox.w * canvasW;
    const ch = cropBox.h * canvasH;

    const tol = 16;

    // Check corners
    if (Math.hypot(mouseX - cx, mouseY - cy) < tol) isDraggingHandle.current = "tl";
    else if (Math.hypot(mouseX - (cx + cw), mouseY - cy) < tol) isDraggingHandle.current = "tr";
    else if (Math.hypot(mouseX - cx, mouseY - (cy + ch)) < tol) isDraggingHandle.current = "bl";
    else if (Math.hypot(mouseX - (cx + cw), mouseY - (cy + ch)) < tol) isDraggingHandle.current = "br";
    else if (mouseX >= cx && mouseX <= cx + cw && mouseY >= cy && mouseY <= cy + ch) {
      isDraggingHandle.current = "box";
    }

    dragStartPos.current = { x: mouseX, y: mouseY, initialBox: { ...cropBox } };
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDraggingHandle.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = (mouseX - dragStartPos.current.x) / canvas.width;
    const dy = (mouseY - dragStartPos.current.y) / canvas.height;
    const init = dragStartPos.current.initialBox;

    setCropBox(prev => {
      let next = { ...prev };
      if (isDraggingHandle.current === "box") {
        next.x = Math.max(0, Math.min(1 - init.w, init.x + dx));
        next.y = Math.max(0, Math.min(1 - init.h, init.y + dy));
      } else if (isDraggingHandle.current === "br") {
        next.w = Math.max(0.1, Math.min(1 - init.x, init.w + dx));
        next.h = Math.max(0.1, Math.min(1 - init.y, init.h + dy));
      } else if (isDraggingHandle.current === "tl") {
        const newX = Math.max(0, Math.min(init.x + init.w - 0.1, init.x + dx));
        const newY = Math.max(0, Math.min(init.y + init.h - 0.1, init.y + dy));
        next.w = init.w + (init.x - newX);
        next.h = init.h + (init.y - newY);
        next.x = newX;
        next.y = newY;
      }
      return next;
    });
  };

  const handleCanvasMouseUp = () => {
    isDraggingHandle.current = null;
  };

  // ── Dimension Resize Handlers ──
  const handleWidthChange = (val) => {
    const w = Math.max(10, Math.round(Number(val)));
    setOutWidth(w);
    if (lockAspect && imgObj) {
      setOutHeight(Math.round((w / imgObj.width) * imgObj.height));
    }
  };

  const handleHeightChange = (val) => {
    const h = Math.max(10, Math.round(Number(val)));
    setOutHeight(h);
    if (lockAspect && imgObj) {
      setOutWidth(Math.round((h / imgObj.height) * imgObj.width));
    }
  };

  const handleScalePercent = (pct) => {
    setScalePercent(pct);
    if (!imgObj) return;
    setOutWidth(Math.round((imgObj.width * pct) / 100));
    setOutHeight(Math.round((imgObj.height * pct) / 100));
  };

  // ── Execute High-Quality Crop & Resize ──
  const executeExport = async () => {
    if (!imgObj) return;

    setStage("processing");
    setProgress(20);
    setProgressMsg("Rendering cropped image in full resolution...");
    setErrorMsg("");

    try {
      // 1. Calculate Crop Pixel Coordinates on Original Image
      const origW = imgObj.width;
      const origH = imgObj.height;

      const cropPixelX = Math.round(cropBox.x * origW);
      const cropPixelY = Math.round(cropBox.y * origH);
      const cropPixelW = Math.round(cropBox.w * origW);
      const cropPixelH = Math.round(cropBox.h * origH);

      // Target Export Dimensions
      const finalW = outWidth || cropPixelW;
      const finalH = outHeight || cropPixelH;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = finalW;
      exportCanvas.height = finalH;
      const eCtx = exportCanvas.getContext("2d");

      // Fill background (white for JPEG, transparent for PNG/WebP)
      if (format === "image/jpeg") {
        eCtx.fillStyle = "#ffffff";
        eCtx.fillRect(0, 0, finalW, finalH);
      }

      // If Circular Crop, apply clip path
      if (selectedRatio === "circle") {
        eCtx.save();
        eCtx.beginPath();
        eCtx.ellipse(finalW / 2, finalH / 2, finalW / 2, finalH / 2, 0, 0, 2 * Math.PI);
        eCtx.clip();
      }

      // Apply transformations (Rotate & Flip)
      eCtx.save();
      eCtx.translate(finalW / 2, finalH / 2);
      eCtx.rotate(((rotation + fineAngle) * Math.PI) / 180);
      eCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

      // Draw cropped section scaled to target dimensions
      eCtx.drawImage(
        imgObj,
        cropPixelX, cropPixelY, cropPixelW, cropPixelH,
        -finalW / 2, -finalH / 2, finalW, finalH
      );
      eCtx.restore();

      if (selectedRatio === "circle") {
        eCtx.restore();
      }

      setProgress(75);
      setProgressMsg("Compressing to chosen format...");

      const blob = await new Promise(r => exportCanvas.toBlob(r, format, quality / 100));

      let ext = "webp";
      if (format === "image/png") ext = "png";
      else if (format === "image/jpeg") ext = "jpg";

      const baseName = file.name.replace(/\.[^.]+$/, "");
      const outputName = `${baseName}_crop_${finalW}x${finalH}.${ext}`;

      setResultBlob(blob);
      setResultName(outputName);
      setResultInfo(`${finalW}×${finalH} px · ${fmt(blob.size)} · ${ext.toUpperCase()}`);

      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg("Processing failed: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setImgObj(null);
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
        <div className="tool-page-title">Image Crop & Resize Studio</div>
        <div className="tool-page-meta">Aspect Ratios · Exact Dimensions · Rotate</div>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1100px" }}>
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(244, 63, 94, 0.4)", boxShadow: "0 0 20px rgba(244, 63, 94, 0.3)" }}>
              📐
            </div>
            <div className="comp-title">Image Crop, Resize & Aspect Ratio Studio</div>
          </div>
          <p className="comp-sub">Crop to social media ratios (1:1, 9:16, 16:9), resize to exact pixels, rotate & flip with live studio canvas.</p>
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
              <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.bmp" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">📐</span>
              <p className="drop-main">{dragging ? "Drop your image here!" : "Drag & drop image to crop & resize"}</p>
              <p className="drop-sub">Crop, scale dimensions, change aspect ratios · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>📁 Browse Image</button>
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
              <div className="file-icon">🖼️</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">
                  {imgObj ? `${imgObj.width} × ${imgObj.height} px · ` : ""}{fmt(file.size)}
                </div>
              </div>
              {stage !== "processing" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── MAIN STUDIO INTERFACE ── */}
          {(stage === "loaded" || stage === "done") && imgObj && (
            <div style={{ padding: "0 20px 20px" }}>

              {/* 1. Aspect Ratio Presets Grid */}
              <div style={{ marginBottom: "16px" }}>
                <span className="level-label" style={{ marginBottom: "8px", display: "block" }}>1. Aspect Ratio Presets</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px" }}>
                  {ASPECT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`level-btn${selectedRatio === p.id ? " active" : ""}`}
                      onClick={() => applyRatioPreset(p.id)}
                      style={{ padding: "8px 6px" }}
                    >
                      <span style={{ fontSize: "1.1rem" }}>{p.icon}</span>
                      <span className="level-name" style={{ fontSize: "0.8rem" }}>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Two Column Layout: Tools Sidebar (Left) vs Interactive Crop Canvas (Right) */}
              <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "20px", alignItems: "start" }}>

                {/* Left Sidebar: Resize & Transform Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  {/* Dimension Resizer Box */}
                  <div style={{
                    padding: "14px", background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                      <span>Exact Dimensions (Pixels)</span>
                      <span
                        onClick={() => setLockAspect(!lockAspect)}
                        style={{ cursor: "pointer", color: lockAspect ? "#38bdf8" : "#94a3b8" }}
                        title="Lock / Unlock Aspect Ratio"
                      >
                        {lockAspect ? "🔒 Linked" : "🔓 Unlinked"}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      <div>
                        <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Width (px)</label>
                        <input
                          type="number"
                          value={outWidth}
                          onChange={(e) => handleWidthChange(e.target.value)}
                          style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Height (px)</label>
                        <input
                          type="number"
                          value={outHeight}
                          onChange={(e) => handleHeightChange(e.target.value)}
                          style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    {/* Scale Percentage Chips */}
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleScalePercent(pct)}
                          style={{
                            flex: 1, padding: "4px", fontSize: "10px", fontWeight: 700,
                            background: scalePercent === pct ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                            border: scalePercent === pct ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "6px", color: scalePercent === pct ? "#38bdf8" : "#94a3b8",
                            cursor: "pointer",
                          }}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rotate & Flip Box */}
                  <div style={{
                    padding: "14px", background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#f472b6", textTransform: "uppercase", marginBottom: "10px" }}>
                      Rotate & Flip
                    </div>

                    <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                        style={{ flex: 1, padding: "6px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "11px", cursor: "pointer" }}
                      >
                        ↺ -90°
                      </button>
                      <button
                        type="button"
                        onClick={() => setRotation(r => (r + 90) % 360)}
                        style={{ flex: 1, padding: "6px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "11px", cursor: "pointer" }}
                      >
                        ↻ +90°
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipH(!flipH)}
                        style={{ flex: 1, padding: "6px", background: flipH ? "rgba(236,72,153,0.3)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: flipH ? "#f472b6" : "#fff", fontSize: "11px", cursor: "pointer" }}
                        title="Flip Horizontal (Mirror)"
                      >
                        🪞 Flip H
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipV(!flipV)}
                        style={{ flex: 1, padding: "6px", background: flipV ? "rgba(236,72,153,0.3)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: flipV ? "#f472b6" : "#fff", fontSize: "11px", cursor: "pointer" }}
                        title="Flip Vertical"
                      >
                        ↕ Flip V
                      </button>
                    </div>

                    {/* Fine Angle Straightening */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8", marginBottom: "4px" }}>
                        <span>Fine Angle Straighten</span>
                        <span style={{ color: "#fff", fontWeight: 700 }}>{fineAngle}°</span>
                      </div>
                      <input type="range" min="-45" max="45" value={fineAngle} onChange={(e) => setFineAngle(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                    </div>
                  </div>

                  {/* Output Format & Quality */}
                  <div style={{
                    padding: "14px", background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#10b981", textTransform: "uppercase", marginBottom: "10px" }}>
                      Output Format & Quality
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                      <div>
                        <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Format</label>
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          style={{ width: "100%", padding: "6px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", fontSize: "11px", outline: "none" }}
                        >
                          <option value="image/webp">WebP (Best)</option>
                          <option value="image/png">PNG (Lossless)</option>
                          <option value="image/jpeg">JPG (Standard)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Quality: {quality}%</label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={quality}
                          onChange={(e) => setQuality(Number(e.target.value))}
                          style={{ width: "100%", accentColor: "#10b981", marginTop: "6px" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Interactive Studio Canvas */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Drag Box to Move · Drag 4 Blue Handles to Resize Crop
                    </span>
                  </div>

                  {/* Canvas Container */}
                  <div style={{
                    width: "100%", minHeight: "380px", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#080c16", borderRadius: "14px",
                    border: "1.5px solid rgba(139, 92, 246, 0.3)", boxShadow: "0 15px 35px rgba(0,0,0,0.6)",
                    padding: "16px", boxSizing: "border-box", cursor: isDraggingHandle.current ? "crosshair" : "default"
                  }}>
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      style={{ maxWidth: "100%", maxHeight: "420px", objectFit: "contain", borderRadius: "4px", boxShadow: "0 5px 25px rgba(0,0,0,0.8)" }}
                    />
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--text-sub)", marginTop: "8px", textAlign: "center" }}>
                    📐 Output Resolution: <strong style={{ color: "#38bdf8" }}>{outWidth || Math.round(cropBox.w * (imgObj?.width || 0))} × {outHeight || Math.round(cropBox.h * (imgObj?.height || 0))} px</strong>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="action-wrap" style={{ marginTop: "22px" }}>
                <button className="btn-compress" onClick={executeExport}>
                  {stage === "done" ? "🔁 Re-Export Cropped Image" : "⚡ Crop & Download Image"}
                </button>
              </div>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Exporting cropped image...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #f43f5e, #8b5cf6)" }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Results Box ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{
                margin: "10px 0 20px",
                background: "rgba(244,63,94,0.08)",
                borderColor: "rgba(244,63,94,0.3)",
              }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original Image</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {imgObj?.width}×{imgObj?.height} px · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Cropped & Resized</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "#fb7185" }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{
                  background: "rgba(244,63,94,0.18)",
                  borderColor: "#f43f5e",
                  color: "#fb7185",
                }}>
                  📐 Image Cropped & Resized Successfully
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
            <span>FlashCrush · Image Crop & Resize Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
