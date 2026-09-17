// PassportResizer.jsx — Passport, Visa & Govt Exam Photo/Signature Resizer with Face Guide & Printable Grid Sheets
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 30;
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

const OFFICIAL_PRESETS = [
  {
    id: "india-passport",
    name: "Indian Passport / PAN",
    flag: "🇮🇳",
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    minKb: 20,
    maxKb: 50,
    desc: "35 × 45 mm (3.5 × 4.5 cm) · 20-50 KB",
  },
  {
    id: "us-visa",
    name: "US Visa / Green Card",
    flag: "🇺🇸",
    widthMm: 51,
    heightMm: 51,
    dpi: 300,
    minKb: 60,
    maxKb: 240,
    desc: "2 × 2 inches (51 × 51 mm) · Square 600×600 px",
  },
  {
    id: "schengen-visa",
    name: "Schengen / EU Visa",
    flag: "🇪🇺",
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    minKb: 30,
    maxKb: 100,
    desc: "35 × 45 mm · 300 DPI Light Grey/White BG",
  },
  {
    id: "govt-exam-photo",
    name: "UPSC / SSC / Govt Exam",
    flag: "📝",
    widthMm: 35,
    heightMm: 45,
    dpi: 200,
    minKb: 20,
    maxKb: 50,
    desc: "3.5 × 4.5 cm · 20-50 KB (SSC, UPSC, IBPS, NEET)",
  },
  {
    id: "govt-exam-signature",
    name: "Govt Exam Signature",
    flag: "✍️",
    widthMm: 35,
    heightMm: 15,
    dpi: 200,
    minKb: 10,
    maxKb: 20,
    desc: "3.5 × 1.5 cm · 10-20 KB (Strict Exam Format)",
  },
  {
    id: "uk-canada-passport",
    name: "UK / Canada Passport",
    flag: "🇬🇧",
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    minKb: 40,
    maxKb: 120,
    desc: "35 × 45 mm · 300 DPI Official Specs",
  },
  {
    id: "custom",
    name: "Custom Size & DPI",
    flag: "⚙️",
    widthMm: 35,
    heightMm: 45,
    dpi: 300,
    minKb: 20,
    maxKb: 100,
    desc: "Custom Dimensions, Units (cm/mm/inch/px) & KB",
  },
];

export default function PassportResizer({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [imgObj, setImgObj] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Preset & Dimensions
  const [selectedPreset, setSelectedPreset] = useState("india-passport");
  const [unit, setUnit] = useState("cm"); // "cm" | "mm" | "inch" | "px"
  const [customWidth, setCustomWidth] = useState(3.5);
  const [customHeight, setCustomHeight] = useState(4.5);
  const [dpi, setDpi] = useState(300);
  const [targetMaxKb, setTargetMaxKb] = useState(50);
  const [targetMinKb, setTargetMinKb] = useState(20);

  // Interactive Adjustments
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [showFaceGuide, setShowFaceGuide] = useState(true);
  const [lightenBg, setLightenBg] = useState(false);

  // Name & Date on Photo (Mandatory for SSC/Govt exams)
  const [addNameDate, setAddNameDate] = useState(false);
  const [applicantName, setApplicantName] = useState("");
  const [photoDate, setPhotoDate] = useState(new Date().toISOString().slice(0, 10));

  // Output Mode: "single" | "sheet-4x6" | "sheet-a4"
  const [exportMode, setExportMode] = useState("single");

  // Results
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const isDraggingImg = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Calculate target pixel dimensions based on mm / cm / inch / px & DPI
  const getTargetPx = useCallback(() => {
    const cur = OFFICIAL_PRESETS.find(p => p.id === selectedPreset) || OFFICIAL_PRESETS[0];

    if (selectedPreset !== "custom") {
      const widthInches = cur.widthMm / 25.4;
      const heightInches = cur.heightMm / 25.4;
      const w = Math.round(widthInches * cur.dpi);
      const h = Math.round(heightInches * cur.dpi);
      return { w: Math.max(50, w), h: Math.max(50, h), aspect: w / h };
    }

    // Custom
    let wMm = customWidth;
    let hMm = customHeight;
    if (unit === "cm") { wMm *= 10; hMm *= 10; }
    else if (unit === "inch") { wMm *= 25.4; hMm *= 25.4; }
    else if (unit === "px") { return { w: Math.max(50, Math.round(customWidth)), h: Math.max(50, Math.round(customHeight)), aspect: customWidth / customHeight }; }

    const widthInches = wMm / 25.4;
    const heightInches = hMm / 25.4;
    const w = Math.round(widthInches * dpi);
    const h = Math.round(heightInches * dpi);
    return { w: Math.max(50, w), h: Math.max(50, h), aspect: w / h };
  }, [selectedPreset, unit, customWidth, customHeight, dpi]);

  // Handle Preset Change
  const handlePresetSelect = (presetId) => {
    setSelectedPreset(presetId);
    const p = OFFICIAL_PRESETS.find(x => x.id === presetId);
    if (p && presetId !== "custom") {
      setCustomWidth(p.widthMm / 10);
      setCustomHeight(p.heightMm / 10);
      setUnit("cm");
      setDpi(p.dpi);
      setTargetMinKb(p.minKb);
      setTargetMaxKb(p.maxKb);
    }
  };

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
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setRotation(0);

    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      setImgObj(img);
      setStage("loaded");
    };
    img.onerror = () => {
      setErrorMsg("Failed to load image. Try another file.");
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
            const fileName = doc[window.google.picker.Document.NAME] || "photo.jpg";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: blob.type || "image/jpeg" }));
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

  // Render Interactive Cropping Canvas
  const renderInteractiveCanvas = useCallback(() => {
    if (!imgObj) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const { w, h, aspect } = getTargetPx();

    // Canvas size constrained to preview area (max ~380px)
    const maxPreviewDim = 360;
    let previewW, previewH;
    if (aspect >= 1) {
      previewW = maxPreviewDim;
      previewH = Math.round(maxPreviewDim / aspect);
    } else {
      previewH = maxPreviewDim;
      previewW = Math.round(maxPreviewDim * aspect);
    }

    canvas.width = previewW;
    canvas.height = previewH;

    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, previewW, previewH);

    // Save context for transform
    ctx.save();
    ctx.translate(previewW / 2 + panX, previewH / 2 + panY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Calculate base draw dimensions to cover canvas
    const imgAspect = imgObj.width / imgObj.height;
    let drawW, drawH;
    if (imgAspect > aspect) {
      drawH = previewH;
      drawW = previewH * imgAspect;
    } else {
      drawW = previewW;
      drawH = previewW / imgAspect;
    }

    // Draw Image
    ctx.drawImage(imgObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Lighten Background Filter (if enabled)
    if (lightenBg) {
      const imgData = ctx.getImageData(0, 0, previewW, previewH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 185) {
          // Whiten background
          d[i] = Math.min(255, d[i] + 45);
          d[i + 1] = Math.min(255, d[i + 1] + 45);
          d[i + 2] = Math.min(255, d[i + 2] + 45);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Name & Date on Photo strip (SSC / Govt Exam requirement)
    if (addNameDate && (applicantName.trim() || photoDate)) {
      const stripH = Math.round(previewH * 0.16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, previewH - stripH, previewW, stripH);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, previewH - stripH, previewW, stripH);

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const fontSize = Math.max(9, Math.round(stripH * 0.34));
      ctx.font = `bold ${fontSize}px sans-serif`;

      if (applicantName.trim() && photoDate) {
        ctx.fillText(applicantName.toUpperCase(), previewW / 2, previewH - stripH + stripH * 0.32);
        ctx.font = `${Math.round(fontSize * 0.85)}px sans-serif`;
        ctx.fillText(`DOB/DOP: ${photoDate}`, previewW / 2, previewH - stripH + stripH * 0.72);
      } else {
        ctx.fillText(applicantName.toUpperCase() || photoDate, previewW / 2, previewH - stripH / 2);
      }
    }

    // Overlay Face / Head Guide Oval
    if (showFaceGuide && selectedPreset !== "govt-exam-signature") {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);

      // Oval for head zone (70-80% height)
      const centerX = previewW / 2;
      const centerY = previewH * 0.44;
      const radiusX = previewW * 0.28;
      const radiusY = previewH * 0.32;

      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();

      // Eye line guide
      ctx.beginPath();
      ctx.moveTo(centerX - radiusX * 0.7, centerY - radiusY * 0.1);
      ctx.lineTo(centerX + radiusX * 0.7, centerY - radiusY * 0.1);
      ctx.stroke();

      // Guide label
      ctx.fillStyle = "rgba(56, 189, 248, 0.9)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Face Area (70-80%)", centerX, centerY - radiusY - 4);
      ctx.restore();
    }
  }, [imgObj, getTargetPx, zoom, panX, panY, rotation, showFaceGuide, lightenBg, addNameDate, applicantName, photoDate, selectedPreset]);

  useEffect(() => {
    renderInteractiveCanvas();
  }, [renderInteractiveCanvas]);

  // Mouse Drag to Pan
  const handleMouseDown = (e) => {
    isDraggingImg.current = true;
    dragStart.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingImg.current) return;
    setPanX(e.clientX - dragStart.current.x);
    setPanY(e.clientY - dragStart.current.y);
  };

  const handleMouseUp = () => {
    isDraggingImg.current = false;
  };

  // Touch Support for mobile pan
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      isDraggingImg.current = true;
      dragStart.current = { x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY };
    }
  };

  const handleTouchMove = (e) => {
    if (!isDraggingImg.current || e.touches.length !== 1) return;
    setPanX(e.touches[0].clientX - dragStart.current.x);
    setPanY(e.touches[0].clientY - dragStart.current.y);
  };

  // ── Render High-Resolution Single Photo ──
  const generateSinglePhoto = async () => {
    const { w, h, aspect } = getTargetPx();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + (panX * (w / (canvasRef.current?.width || 360))), h / 2 + (panY * (h / (canvasRef.current?.height || 360))));
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const imgAspect = imgObj.width / imgObj.height;
    let drawW, drawH;
    if (imgAspect > aspect) {
      drawH = h;
      drawW = h * imgAspect;
    } else {
      drawW = w;
      drawH = w / imgAspect;
    }

    ctx.drawImage(imgObj, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (lightenBg) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 185) {
          d[i] = Math.min(255, d[i] + 45);
          d[i + 1] = Math.min(255, d[i + 1] + 45);
          d[i + 2] = Math.min(255, d[i + 2] + 45);
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Name & Date Strip
    if (addNameDate && (applicantName.trim() || photoDate)) {
      const stripH = Math.round(h * 0.16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, h - stripH, w, stripH);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(1, Math.round(w / 400));
      ctx.strokeRect(0, h - stripH, w, stripH);

      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const fontSize = Math.max(14, Math.round(stripH * 0.35));
      ctx.font = `bold ${fontSize}px sans-serif`;

      if (applicantName.trim() && photoDate) {
        ctx.fillText(applicantName.toUpperCase(), w / 2, h - stripH + stripH * 0.32);
        ctx.font = `${Math.round(fontSize * 0.85)}px sans-serif`;
        ctx.fillText(`DOB/DOP: ${photoDate}`, w / 2, h - stripH + stripH * 0.72);
      } else {
        ctx.fillText(applicantName.toUpperCase() || photoDate, w / 2, h - stripH / 2);
      }
    }

    // Target KB Compression Loop
    const targetBytes = targetMaxKb * 1024;
    let minQ = 0.1, maxQ = 0.95, bestBlob = null;

    for (let iter = 0; iter < 6; iter++) {
      const midQ = (minQ + maxQ) / 2;
      const b = await new Promise(r => canvas.toBlob(r, "image/jpeg", midQ));
      if (!b) break;
      bestBlob = b;
      if (b.size > targetBytes) maxQ = midQ;
      else minQ = midQ;
    }

    return { blob: bestBlob, canvas, width: w, height: h };
  };

  // ── Render 4x6 or A4 Printable Sheet ──
  const generatePrintableSheet = async (singleCanvas, sheetType) => {
    // 4x6 inch = 1200 x 1800 px at 300 DPI
    // A4 = 2480 x 3508 px at 300 DPI
    const sheetW = sheetType === "sheet-4x6" ? 1800 : 2480;
    const sheetH = sheetType === "sheet-4x6" ? 1200 : 3508;

    const sheetCanvas = document.createElement("canvas");
    sheetCanvas.width = sheetW;
    sheetCanvas.height = sheetH;
    const sCtx = sheetCanvas.getContext("2d");

    // White paper
    sCtx.fillStyle = "#ffffff";
    sCtx.fillRect(0, 0, sheetW, sheetH);

    // Target photo size on sheet
    const photoW = singleCanvas.width;
    const photoH = singleCanvas.height;

    // Calculate grid
    const margin = 60;
    const gap = 30;
    const cols = Math.floor((sheetW - margin * 2 + gap) / (photoW + gap));
    const rows = Math.floor((sheetH - margin * 2 + gap) / (photoH + gap));

    const actualCols = Math.max(1, cols);
    const actualRows = Math.max(1, rows);

    for (let r = 0; r < actualRows; r++) {
      for (let c = 0; c < actualCols; c++) {
        const x = margin + c * (photoW + gap);
        const y = margin + r * (photoH + gap);

        // Draw photo
        sCtx.drawImage(singleCanvas, x, y, photoW, photoH);

        // Thin cut border
        sCtx.strokeStyle = "#e2e8f0";
        sCtx.lineWidth = 1;
        sCtx.strokeRect(x, y, photoW, photoH);
      }
    }

    return new Promise(r => sheetCanvas.toBlob(r, "image/jpeg", 0.95));
  };

  // ── Run Export ──
  const exportPassportPhoto = async () => {
    if (!imgObj) return;

    setStage("processing");
    setProgress(20);
    setProgressMsg("Rendering high-resolution photo...");
    setErrorMsg("");

    try {
      const single = await generateSinglePhoto();
      setProgress(60);

      const baseName = file.name.replace(/\.[^.]+$/, "");
      const curPreset = OFFICIAL_PRESETS.find(p => p.id === selectedPreset);

      if (exportMode === "single") {
        setResultBlob(single.blob);
        setResultName(`${baseName}_${selectedPreset}_photo.jpg`);
        setResultInfo(`${single.width}×${single.height} px · ${fmt(single.blob.size)} · ${curPreset?.name || "Passport Photo"}`);
      } else {
        setProgressMsg(`Arranging on printable ${exportMode === "sheet-4x6" ? "4×6 inch" : "A4"} sheet...`);
        const sheetBlob = await generatePrintableSheet(single.canvas, exportMode);
        setResultBlob(sheetBlob);
        setResultName(`${baseName}_passport_sheet_${exportMode === "sheet-4x6" ? "4x6" : "A4"}.jpg`);
        setResultInfo(`Printable Sheet (${exportMode === "sheet-4x6" ? "4×6 in" : "A4"}) · ${fmt(sheetBlob.size)}`);
      }

      setProgress(100);
      setProgressMsg("Ready!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg("Export failed: " + (err.message || "Unknown error"));
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
        <div className="text-lg font-medium text-m3-on-surface font-display tracking-tight">Passport & Exam Photo Resizer</div>
        <div className="text-xs text-m3-on-surface-variant hidden sm:block font-medium font-sans">Govt Exams · Visas · 4×6 Print Sheet</div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-m3-secondary-container text-2xl text-m3-on-secondary-container shadow-m3-elevation-1">
              🛂
            </div>
            <h1 className="text-2xl sm:text-headline-sm font-normal text-m3-on-surface font-display tracking-tight">
              Passport & Govt Exam Photo Resizer
            </h1>
          </div>
          <p className="text-sm text-m3-on-surface-variant max-w-xl mx-auto font-sans">
            Crop, align face with official oval guide, compress to exact KB, and generate 4×6 printable studio sheets.
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
              <input ref={inputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.avif" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="text-4xl mb-3 block">🛂</span>
              <p className="text-lg font-medium text-m3-on-surface font-display mb-1">
                {dragging ? "Drop your photo here!" : "Drag & drop your photo or signature"}
              </p>
              <p className="text-xs text-m3-on-surface-variant font-sans mb-6">
                Upload portrait photo or signature to resize for Passport, Visa or Govt Exams · max {MAX_SIZE_MB} MB
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button 
                  type="button"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 transition-all font-sans active:scale-[0.99]"
                  onClick={() => inputRef.current?.click()}
                >
                  📁 Browse Photo
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
                📸
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-m3-on-surface truncate font-sans">{file.name}</div>
                <div className="text-xs text-m3-on-surface-variant font-mono">{fmt(file.size)} · Original Photo</div>
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

          {/* ── MAIN RESIZER CONTROLS & INTERACTIVE CANVAS ── */}
          {(stage === "loaded" || stage === "done") && (
            <div>

              {/* 1. Official Presets Selector */}
              <div className="mb-6">
                <span className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-3 font-sans">
                  1. Select Official Passport / Exam Format
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {OFFICIAL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`p-3.5 text-left rounded-2xl border transition-all font-sans ${
                        selectedPreset === p.id
                          ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold border-2 border-m3-primary shadow-m3-elevation-1"
                          : "bg-m3-surface-container-low dark:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant hover:bg-m3-surface-container-highest"
                      }`}
                      onClick={() => handlePresetSelect(p.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{p.flag}</span>
                        <span className="text-xs font-bold leading-tight">{p.name}</span>
                      </div>
                      <span className="text-[11px] text-m3-on-surface-variant block leading-tight opacity-90">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Two Column Layout: Editor Controls (Left) vs Interactive Alignment Canvas (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">

                {/* Left Column: Fine Tuning Controls */}
                <div className="flex flex-col gap-4">

                  {/* Custom Dimensions (If custom selected) */}
                  {selectedPreset === "custom" && (
                    <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                      <div className="text-xs font-semibold uppercase tracking-wider text-m3-primary mb-2">
                        Custom Dimensions & Units
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-m3-on-surface-variant block mb-1">Width</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={customWidth} 
                            onChange={(e) => setCustomWidth(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-mono outline-none focus:border-m3-primary" 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-m3-on-surface-variant block mb-1">Height</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={customHeight} 
                            onChange={(e) => setCustomHeight(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-mono outline-none focus:border-m3-primary" 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-m3-on-surface-variant block mb-1">Unit</label>
                          <select 
                            value={unit} 
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full px-2 py-1.5 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-sans outline-none focus:border-m3-primary"
                          >
                            <option value="cm">cm</option>
                            <option value="mm">mm</option>
                            <option value="inch">inch</option>
                            <option value="px">px</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Positioning & Zoom Controls */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <div className="text-xs font-semibold uppercase tracking-wider text-m3-primary mb-3">
                      Photo Alignment & Sizing
                    </div>

                    {/* Zoom Slider */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1 font-sans">
                        <span>Zoom</span>
                        <span className="font-mono text-m3-primary font-bold">{zoom.toFixed(2)}×</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2.5" 
                        step="0.05" 
                        value={zoom} 
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full accent-m3-primary cursor-pointer" 
                      />
                    </div>

                    {/* Rotation Slider */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1 font-sans">
                        <span>Rotate / Straighten</span>
                        <span className="font-mono text-m3-primary font-bold">{rotation}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="-45" 
                        max="45" 
                        value={rotation} 
                        onChange={(e) => setRotation(Number(e.target.value))}
                        className="w-full accent-m3-primary cursor-pointer" 
                      />
                    </div>

                    {/* Toggle Checks */}
                    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-m3-outline-variant">
                      <label className="flex items-center gap-2.5 text-xs text-m3-on-surface cursor-pointer font-sans">
                        <input 
                          type="checkbox" 
                          checked={showFaceGuide} 
                          onChange={(e) => setShowFaceGuide(e.target.checked)} 
                          className="w-4 h-4 accent-m3-primary" 
                        />
                        Show 70-80% Face Alignment Oval Guide
                      </label>
                      <label className="flex items-center gap-2.5 text-xs text-m3-on-surface cursor-pointer font-sans">
                        <input 
                          type="checkbox" 
                          checked={lightenBg} 
                          onChange={(e) => setLightenBg(e.target.checked)} 
                          className="w-4 h-4 accent-m3-primary" 
                        />
                        Whiten / Lighten Background (For Passport Rules)
                      </label>
                    </div>
                  </div>

                  {/* Name & Date on Photo (SSC / UPSC / State PSC) */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <label className={`flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-m3-secondary cursor-pointer ${addNameDate ? "mb-3" : ""}`}>
                      <input 
                        type="checkbox" 
                        checked={addNameDate} 
                        onChange={(e) => setAddNameDate(e.target.checked)} 
                        className="w-4 h-4 accent-m3-secondary" 
                      />
                      Add Name & Date Strip (Govt Exam Rule)
                    </label>

                    {addNameDate && (
                      <div className="flex flex-col gap-2.5">
                        <input
                          type="text"
                          placeholder="APPLICANT NAME"
                          value={applicantName}
                          onChange={(e) => setApplicantName(e.target.value)}
                          className="w-full px-3 py-2 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-sans uppercase outline-none focus:border-m3-primary"
                        />
                        <input
                          type="date"
                          value={photoDate}
                          onChange={(e) => setPhotoDate(e.target.value)}
                          className="w-full px-3 py-2 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-sans outline-none focus:border-m3-primary"
                        />
                      </div>
                    )}
                  </div>

                  {/* Target KB Size & Export Mode */}
                  <div className="p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant rounded-2xl font-sans">
                    <div className="text-xs font-semibold uppercase tracking-wider text-m3-tertiary mb-3">
                      Target File Size & Export Format
                    </div>

                    <div className="flex gap-2.5 items-center mb-3">
                      <span className="text-xs text-m3-on-surface-variant font-sans">Target Size:</span>
                      <input
                        type="number"
                        min="10"
                        max="500"
                        value={targetMaxKb}
                        onChange={(e) => setTargetMaxKb(Number(e.target.value))}
                        className="w-20 px-2.5 py-1.5 bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant rounded-xl text-xs text-m3-on-surface font-mono text-center outline-none focus:border-m3-primary"
                      />
                      <span className="text-xs font-bold text-m3-primary font-sans">KB (Max Limit)</span>
                    </div>

                    <label className="text-xs text-m3-on-surface-variant block mb-1.5 font-sans">Export Format</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "single", label: "Single Photo" },
                        { id: "sheet-4x6", label: "4×6 in Sheet" },
                        { id: "sheet-a4", label: "A4 Grid Sheet" },
                      ].map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setExportMode(m.id)}
                          className={`py-2 px-1 text-xs font-medium rounded-xl border transition-all font-sans ${
                            exportMode === m.id
                              ? "bg-m3-primary text-m3-on-primary border-m3-primary shadow-m3-elevation-1"
                              : "bg-m3-surface-container-lowest dark:bg-m3-surface-container text-m3-on-surface border-m3-outline-variant hover:bg-m3-surface-container-highest"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Cropping & Positioning Canvas */}
                <div className="flex flex-col items-center">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-m3-on-surface-variant uppercase tracking-wider font-sans">
                      Drag to Position Photo · Scroll/Slider to Zoom
                    </span>
                  </div>

                  {/* Interactive Canvas */}
                  <div className="w-full min-h-[360px] overflow-hidden flex items-center justify-center rounded-3xl border border-m3-outline-variant shadow-m3-elevation-1 p-4 bg-m3-surface-container-low dark:bg-m3-surface-container-lowest transition-colors cursor-grab active:cursor-grabbing">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleMouseUp}
                      className="max-w-full max-h-[380px] object-contain rounded-2xl shadow-m3-elevation-2"
                    />
                  </div>

                  <div className="mt-3 text-xs text-m3-on-surface-variant text-center font-sans">
                    💡 Tip: Align eyes with horizontal dashed line and face inside the blue oval.
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8 flex justify-center">
                <button 
                  className="w-full max-w-md rounded-full py-3.5 px-6 text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 font-sans"
                  onClick={exportPassportPhoto}
                >
                  {stage === "done"
                    ? "🔁 Re-Export Passport Photo"
                    : `⚡ Generate ${exportMode === "single" ? "Passport Photo" : exportMode === "sheet-4x6" ? "4×6 Studio Sheet" : "A4 Grid Sheet"}`}
                </button>
              </div>
            </div>
          )}

          {/* ── Processing Bar ── */}
          {stage === "processing" && (
            <div className="my-8 max-w-md mx-auto">
              <div className="flex justify-between text-sm font-medium mb-2 text-m3-on-surface font-sans">
                <span>{progressMsg}</span>
                <span className="font-mono text-m3-primary font-bold">{progress}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-m3-surface-container-high border border-m3-outline-variant overflow-hidden">
                <div 
                  className="h-full bg-m3-primary transition-all duration-200" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            </div>
          )}

          {/* ── Results Box ── */}
          {stage === "done" && resultBlob && (
            <div className="mt-8">
              <div className="mb-6 p-6 rounded-3xl bg-m3-surface-container-low dark:bg-m3-surface-container-high border border-m3-outline-variant shadow-m3-elevation-1">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-1 font-sans">Original Photo</span>
                    <span className="font-mono text-base font-bold text-m3-on-surface">
                      {fmt(file.size)}
                    </span>
                  </div>
                  <div className="text-xl text-m3-primary">→</div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-m3-primary mb-1 font-sans">Passport Output</span>
                    <span className="font-mono text-base font-bold text-m3-primary">
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-m3-secondary-container text-m3-on-secondary-container text-xs font-medium shadow-m3-elevation-1 font-sans">
                  🛂 Official Passport / Exam Sized Photo Ready
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
            <span>FlashCrush · Passport & Exam Photo Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
