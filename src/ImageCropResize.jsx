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
    <div className="min-h-screen flex flex-col font-sans bg-m3-surface text-m3-on-surface transition-colors">
      {/* Top Bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-low dark:hover:bg-m3-surface-container-high transition-all shadow-m3-elevation-1 font-sans"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-m3-on-surface font-display tracking-tight">Image Crop & Resize Studio</div>
        <div className="text-xs text-m3-on-surface-variant hidden sm:block font-medium font-sans">Aspect Ratios · Exact Dimensions · Rotate</div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-m3-secondary-container text-2xl text-m3-on-secondary-container shadow-m3-elevation-1">
              📐
            </div>
            <h1 className="text-2xl sm:text-headline-sm font-normal text-m3-on-surface font-display tracking-tight">
              Image Crop, Resize & Aspect Ratio Studio
            </h1>
          </div>
          <p className="text-sm text-m3-on-surface-variant max-w-xl mx-auto font-sans">
            Crop to social media ratios (1:1, 9:16, 16:9), resize to exact pixels, rotate & flip with live studio canvas.
          </p>
        </div>

        {/* Main Card Surface */}
        <div className="bg-m3-surface-container-lowest dark:bg-m3-surface-container rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-6 sm:p-8 overflow-hidden transition-colors">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
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
              <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.bmp" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="text-4xl mb-3 block">📐</span>
              <p className="text-lg font-medium text-m3-on-surface font-display mb-1">
                {dragging ? "Drop your image here!" : "Drag & drop image to crop & resize"}
              </p>
              <p className="text-xs text-m3-on-surface-variant font-sans mb-6">
                Crop, scale dimensions, change aspect ratios · max {MAX_SIZE_MB} MB · 100% Client-Side Privacy
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button 
                  type="button"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 transition-all font-sans active:scale-[0.99]"
                  onClick={() => inputRef.current?.click()}
                >
                  📁 Browse Image
                </button>
                <button 
                  type="button"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-highest transition-all font-sans disabled:opacity-50"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && (
                <div className="mt-4 px-4 py-2.5 rounded-2xl bg-m3-error-container text-m3-on-error-container text-sm font-medium border border-m3-outline-variant inline-block font-sans">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ── File Row ── */}
          {file && stage !== "idle" && !(stage === "error" && !file) && (
            <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low dark:bg-m3-surface-container-high">
              <div className="w-10 h-10 rounded-full bg-m3-secondary-container text-xl flex items-center justify-center text-m3-on-secondary-container flex-shrink-0">
                📐
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-m3-on-surface truncate font-sans">{file.name}</div>
                <div className="text-xs text-m3-on-surface-variant font-mono">
                  {imgObj ? `${imgObj.width} × ${imgObj.height} px · ` : ""}{fmt(file.size)}
                </div>
              </div>
              {stage !== "processing" && (
                <button 
                  className="p-2 rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-highest transition-all"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── MAIN STUDIO INTERFACE ── */}
          {(stage === "loaded" || stage === "done") && imgObj && (
            <div>

              {/* 1. Aspect Ratio Presets Grid */}
              <div className="mb-6">
                <span className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-3 font-sans">
                  1. Aspect Ratio Presets
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                  {ASPECT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl border transition-all font-sans ${
                        selectedRatio === p.id
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => applyRatioPreset(p.id)}
                    >
                      <span className="text-xl mb-1">{p.icon}</span>
                      <span className="text-xs font-medium text-center leading-tight">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Two Column Layout: Tools Sidebar (Left) vs Interactive Crop Canvas (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

                {/* Left Sidebar: Resize & Transform Controls */}
                <div className="flex flex-col gap-4">

                  {/* Dimension Resizer Box */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-m3-primary mb-3">
                      <span>Exact Dimensions (Pixels)</span>
                      <span
                        onClick={() => setLockAspect(!lockAspect)}
                        className="cursor-pointer text-xs font-medium text-m3-primary hover:underline"
                        title="Lock / Unlock Aspect Ratio"
                      >
                        {lockAspect ? "🔒 Linked" : "🔓 Unlinked"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Width (px)</label>
                        <input
                          type="number"
                          value={outWidth}
                          onChange={(e) => handleWidthChange(e.target.value)}
                          className="w-full px-3 py-2 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-sm text-m3-on-surface font-mono outline-none focus:border-m3-primary transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Height (px)</label>
                        <input
                          type="number"
                          value={outHeight}
                          onChange={(e) => handleHeightChange(e.target.value)}
                          className="w-full px-3 py-2 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-sm text-m3-on-surface font-mono outline-none focus:border-m3-primary transition-colors"
                        />
                      </div>
                    </div>

                    {/* Scale Percentage Chips */}
                    <div className="flex gap-1.5 mt-2">
                      {[25, 50, 75, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleScalePercent(pct)}
                          className={`flex-1 py-1.5 px-1 text-xs font-semibold rounded-xl transition-all ${
                            scalePercent === pct
                              ? "bg-m3-primary text-m3-on-primary border border-m3-primary shadow-m3-elevation-1"
                              : "bg-m3-surface-container-lowest dark:bg-m3-surface-container text-m3-on-surface border border-m3-outline-variant hover:bg-m3-surface-container-highest"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rotate & Flip Box */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <div className="text-xs font-semibold uppercase tracking-wider text-m3-secondary mb-3">
                      Rotate & Flip
                    </div>

                    <div className="flex gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                        className="flex-1 py-2 px-1 text-xs font-medium rounded-xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-highest transition-all"
                      >
                        ↺ -90°
                      </button>
                      <button
                        type="button"
                        onClick={() => setRotation(r => (r + 90) % 360)}
                        className="flex-1 py-2 px-1 text-xs font-medium rounded-xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-highest transition-all"
                      >
                        ↻ +90°
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipH(!flipH)}
                        className={`flex-1 py-2 px-1 text-xs font-medium rounded-xl border transition-all ${
                          flipH
                            ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                            : "bg-m3-surface-container-lowest dark:bg-m3-surface-container text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                        }`}
                        title="Flip Horizontal (Mirror)"
                      >
                        🪞 Flip H
                      </button>
                      <button
                        type="button"
                        onClick={() => setFlipV(!flipV)}
                        className={`flex-1 py-2 px-1 text-xs font-medium rounded-xl border transition-all ${
                          flipV
                            ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                            : "bg-m3-surface-container-lowest dark:bg-m3-surface-container text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                        }`}
                        title="Flip Vertical"
                      >
                        ↕ Flip V
                      </button>
                    </div>

                    {/* Fine Angle Straightening */}
                    <div>
                      <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1 font-sans">
                        <span>Fine Angle Straighten</span>
                        <span className="font-mono text-m3-primary font-bold">{fineAngle}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="-45" 
                        max="45" 
                        value={fineAngle} 
                        onChange={(e) => setFineAngle(Number(e.target.value))} 
                        className="w-full accent-m3-primary cursor-pointer" 
                      />
                    </div>
                  </div>

                  {/* Output Format & Quality */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <div className="text-xs font-semibold uppercase tracking-wider text-m3-tertiary mb-3">
                      Output Format & Quality
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Format</label>
                        <select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          className="w-full px-3 py-2 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface outline-none focus:border-m3-primary font-sans transition-colors"
                        >
                          <option value="image/webp">WebP (Best)</option>
                          <option value="image/png">PNG (Lossless)</option>
                          <option value="image/jpeg">JPG (Standard)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-m3-on-surface-variant block mb-1 font-sans">Quality: {quality}%</label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={quality}
                          onChange={(e) => setQuality(Number(e.target.value))}
                          className="w-full accent-m3-primary cursor-pointer mt-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Interactive Studio Canvas */}
                <div className="flex flex-col items-center">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-m3-on-surface-variant uppercase tracking-wider font-sans">
                      Drag Box to Move · Drag 4 Corner Handles to Resize Crop
                    </span>
                  </div>

                  {/* Canvas Container */}
                  <div className="w-full min-h-[380px] overflow-hidden flex items-center justify-center rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-lowest transition-colors">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handleCanvasMouseDown}
                      onPointerMove={handleCanvasMouseMove}
                      onPointerUp={handleCanvasMouseUp}
                      onPointerLeave={handleCanvasMouseUp}
                      className="max-w-full max-h-[440px] object-contain rounded-2xl shadow-m3-elevation-2"
                      style={{ touchAction: "none" }}
                    />
                  </div>

                  <div className="mt-3 text-xs text-m3-on-surface-variant text-center font-sans">
                    📐 Output Resolution: <strong className="text-m3-primary font-mono">{outWidth || Math.round(cropBox.w * (imgObj?.width || 0))} × {outHeight || Math.round(cropBox.h * (imgObj?.height || 0))} px</strong>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 flex justify-center">
                <button 
                  className="w-full max-w-md rounded-full py-3.5 px-6 text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-sans"
                  onClick={executeExport}
                >
                  {stage === "done" ? "🔁 Re-Export Cropped Image" : "⚡ Crop & Download Image"}
                </button>
              </div>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "processing" && (
            <div className="my-8 max-w-md mx-auto">
              <div className="flex justify-between text-sm font-medium mb-2 text-m3-on-surface font-sans">
                <span>Exporting cropped image...</span>
                <span className="font-mono text-m3-primary font-bold">{progress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-m3-surface-container-high border border-m3-outline-variant overflow-hidden">
                <div className="h-full bg-m3-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-m3-on-surface-variant font-sans mt-3 text-center">{progressMsg}</p>
            </div>
          )}

          {/* ── Results Box ── */}
          {stage === "done" && resultBlob && (
            <div className="mt-8">
              <div className="mb-6 p-6 rounded-3xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant shadow-m3-elevation-1">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-1 font-sans">Original Image</span>
                    <span className="font-mono text-base font-bold text-m3-on-surface">
                      {imgObj?.width}×{imgObj?.height} px · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="text-xl text-m3-primary">→</div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-m3-primary mb-1 font-sans">Cropped & Resized</span>
                    <span className="font-mono text-base font-bold text-m3-primary">
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-m3-secondary-container text-m3-on-secondary-container text-xs font-medium shadow-m3-elevation-1 font-sans">
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

          <div className="mt-8 pt-4 border-t border-m3-outline-variant flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-m3-on-surface-variant font-sans">
            <span>FlashCrush · Image Crop & Resize Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
