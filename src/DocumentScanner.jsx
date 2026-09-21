// DocumentScanner.jsx — 100% In-Browser Live Camera Document Scanner (CamScanner to PDF)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, PageSizes } from "pdf-lib";
import { addHistoryRecord } from "./historyDB";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// Canvas-based image filter algorithms
function applyFilterToCanvas(srcImg, filterType, rotationDeg = 0) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Handle rotation
  const rad = (rotationDeg * Math.PI) / 180;
  const isPerpendicular = rotationDeg % 180 !== 0;
  const width = isPerpendicular ? srcImg.naturalHeight || srcImg.height : srcImg.naturalWidth || srcImg.width;
  const height = isPerpendicular ? srcImg.naturalWidth || srcImg.width : srcImg.naturalHeight || srcImg.height;

  canvas.width = width;
  canvas.height = height;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(
    srcImg,
    -(srcImg.naturalWidth || srcImg.width) / 2,
    -(srcImg.naturalHeight || srcImg.height) / 2
  );
  ctx.rotate(-rad);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  if (filterType === "original") {
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  if (filterType === "magic") {
    // CamScanner-style Magic B&W filter: high-contrast document thresholding
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Stretch contrast: shadows & creases go to pure white, text gets deepened
      let val;
      if (lum > 140) {
        val = 255; // White background
      } else if (lum < 75) {
        val = 0; // Black text
      } else {
        // Smooth gradient for mid-tones
        val = Math.floor(((lum - 75) / (140 - 75)) * 255);
      }

      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  } else if (filterType === "color") {
    // Vivid Document Color: enhance contrast & saturation for colored pens, stamps, signatures
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Boost contrast
      const contrast = 1.35;
      r = Math.min(255, Math.max(0, Math.floor((r - 128) * contrast + 128 + 15)));
      g = Math.min(255, Math.max(0, Math.floor((g - 128) * contrast + 128 + 15)));
      b = Math.min(255, Math.max(0, Math.floor((b - 128) * contrast + 128 + 15)));

      // Slight paper brightening
      const avg = (r + g + b) / 3;
      if (avg > 185) {
        r = Math.min(255, r + 25);
        g = Math.min(255, g + 25);
        b = Math.min(255, b + 25);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  } else if (filterType === "grayscale") {
    // Clean monochrome photocopy
    for (let i = 0; i < len; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Slight contrast stretch
      const v = Math.min(255, Math.max(0, Math.floor((lum - 128) * 1.25 + 128)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function DocumentScanner({ auth }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  // Camera & view states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("environment"); // "environment" | "user"
  const [cameraError, setCameraError] = useState("");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Captured pages
  // Array of { id, originalDataUrl, filter: "magic", rotation: 0, previewUrl }
  const [pages, setPages] = useState([]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [pdfResult, setPdfResult] = useState(null); // { blob, url, size, name }
  const [exportMsg, setExportMsg] = useState("");

  // Check device cameras
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoInputs.length > 1);
      }).catch(() => {});
    }
  }, []);

  // Start Camera Stream
  const startCamera = async (facing = cameraFacing) => {
    setCameraError("");
    stopCamera();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is not supported in this browser. You can upload photos instead.");
      }

      const constraints = {
        video: {
          facingMode: facing ? { ideal: facing } : { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Mobile portrait fallback: if rigid 1080p landscape constraint is rejected
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing || "environment" } },
          audio: false
        });
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch((e) => console.warn("Video play error:", e));
        };
      }
      setCameraActive(true);
    } catch (err) {
      console.warn("Camera access failed:", err);
      setCameraActive(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission was denied. Please enable camera permission in your browser or upload photos from device.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera found on this device. You can upload document photos from your device.");
      } else {
        setCameraError(err.message || "Could not access camera. Please upload document photos instead.");
      }
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Switch between front & back cameras
  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    if (cameraActive) {
      startCamera(nextFacing);
    }
  };

  // Sync camera stream to video element whenever cameraActive toggles
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  // Start camera on mount & cleanup on unmount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Capture current frame from live video
  const snapCurrentFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const fullW = video.videoWidth || 1280;
    const fullH = video.videoHeight || 720;
    // Crop to match the guide box (88% width, 86% height, centered)
    const cropW = Math.round(fullW * 0.88);
    const cropH = Math.round(fullH * 0.86);
    const cropX = Math.round((fullW - cropW) / 2);
    const cropY = Math.round((fullH - cropH) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const originalDataUrl = canvas.toDataURL("image/jpeg", 0.95);
    addPageFromDataUrl(originalDataUrl);
  };

  // Upload document photo fallback
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        addPageFromDataUrl(loadEvt.target.result);
      };
      reader.readAsDataURL(file);
    });
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Helper: add page and apply default 'magic' filter
  const addPageFromDataUrl = (originalDataUrl) => {
    const img = new Image();
    img.onload = () => {
      const filteredUrl = applyFilterToCanvas(img, "magic", 0);
      const newPage = {
        id: "page_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        originalDataUrl,
        filter: "magic",
        rotation: 0,
        previewUrl: filteredUrl
      };

      setPages((prev) => {
        const updated = [...prev, newPage];
        setActivePageIndex(updated.length - 1);
        return updated;
      });
      // Reset PDF result when pages change
      setPdfResult(null);
    };
    img.src = originalDataUrl;
  };

  // Change active page filter
  const setPageFilter = (filterType) => {
    if (!pages[activePageIndex]) return;
    const cur = pages[activePageIndex];
    const img = new Image();
    img.onload = () => {
      const filteredUrl = applyFilterToCanvas(img, filterType, cur.rotation);
      setPages((prev) =>
        prev.map((p, i) =>
          i === activePageIndex ? { ...p, filter: filterType, previewUrl: filteredUrl } : p
        )
      );
      setPdfResult(null);
    };
    img.src = cur.originalDataUrl;
  };

  // Rotate active page 90 degrees clockwise
  const rotateActivePage = () => {
    if (!pages[activePageIndex]) return;
    const cur = pages[activePageIndex];
    const nextRot = (cur.rotation + 90) % 360;
    const img = new Image();
    img.onload = () => {
      const filteredUrl = applyFilterToCanvas(img, cur.filter, nextRot);
      setPages((prev) =>
        prev.map((p, i) =>
          i === activePageIndex ? { ...p, rotation: nextRot, previewUrl: filteredUrl } : p
        )
      );
      setPdfResult(null);
    };
    img.src = cur.originalDataUrl;
  };

  // Delete page
  const deletePage = (indexToDelete) => {
    setPages((prev) => {
      const updated = prev.filter((_, i) => i !== indexToDelete);
      if (activePageIndex >= updated.length) {
        setActivePageIndex(Math.max(0, updated.length - 1));
      }
      return updated;
    });
    setPdfResult(null);
  };

  // Clear all pages
  const clearAllPages = () => {
    if (window.confirm("Are you sure you want to clear all scanned pages?")) {
      setPages([]);
      setActivePageIndex(0);
      setPdfResult(null);
    }
  };

  // Export All Pages as Single PDF via pdf-lib
  const exportToPDF = async () => {
    if (!pages.length) return;
    setIsExporting(true);
    setExportMsg("Compiling scanned pages into clean PDF...");

    try {
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < pages.length; i++) {
        const pageItem = pages[i];
        setExportMsg(`Processing page ${i + 1} of ${pages.length}...`);

        // Convert page previewUrl to Uint8Array
        const resp = await fetch(pageItem.previewUrl);
        const imgBuffer = await resp.arrayBuffer();
        const embeddedImg = await pdfDoc.embedJpg(imgBuffer);

        // Standard A4 dimensions (595.28 x 841.89 points)
        const [a4W, a4H] = PageSizes.A4;
        const pdfPage = pdfDoc.addPage([a4W, a4H]);

        const imgWidth = embeddedImg.width;
        const imgHeight = embeddedImg.height;

        // Fit within 90% of A4 page with margins
        const maxDrawW = a4W * 0.92;
        const maxDrawH = a4H * 0.92;
        const scale = Math.min(maxDrawW / imgWidth, maxDrawH / imgHeight, 1);

        const drawW = imgWidth * scale;
        const drawH = imgHeight * scale;

        // Center on page
        const xPos = (a4W - drawW) / 2;
        const yPos = (a4H - drawH) / 2;

        pdfPage.drawImage(embeddedImg, {
          x: xPos,
          y: yPos,
          width: drawW,
          height: drawH
        });
      }

      setExportMsg("Finalizing PDF document...");
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(pdfBlob);

      const fileName = `Scanned_Doc_${new Date().toISOString().slice(0, 10)}.pdf`;
      const resultObj = {
        blob: pdfBlob,
        url: pdfUrl,
        size: pdfBlob.size,
        name: fileName,
        pageCount: pages.length
      };

      setPdfResult(resultObj);
      setIsExporting(false);
      setExportMsg("");

      // Save to offline IndexedDB history
      addHistoryRecord({
        tool: "Document Scanner",
        name: fileName,
        size: pdfBlob.size,
        origSize: pdfBlob.size,
        type: "application/pdf",
        details: `${pages.length} Pages · Clean PDF`
      });

      // Smooth scroll to top of export result
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("PDF export error:", err);
      setIsExporting(false);
      setExportMsg("");
      alert("Failed to export PDF: " + err.message);
    }
  };

  // Download PDF
  const downloadPDF = () => {
    if (!pdfResult) return;
    const a = document.createElement("a");
    a.href = pdfResult.url;
    a.download = pdfResult.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activePage = pages[activePageIndex];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-m3-surface text-m3-on-surface transition-colors duration-200">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 transition-colors">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button 
            type="button"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98] shadow-m3-elevation-1"
            onClick={() => navigate("/")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Tools
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-xl">📷</span>
            <span className="font-semibold text-base sm:text-lg tracking-tight text-m3-on-surface">
              Document Scanner
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-m3-secondary-container text-m3-on-secondary-container border border-m3-outline-variant/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CamScanner to PDF
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col">
        {/* Header Hero */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-m3-primary/10 text-m3-primary border border-m3-primary/20 text-3xl mb-3 shadow-m3-elevation-1">
            📷
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-m3-on-surface">
            In-Browser Document Scanner
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto mt-2 leading-relaxed">
            Scan notes, documents &amp; receipts with your camera or photos. Magic B&amp;W contrast, multi-page capture &amp; 1-click clean PDF export. Zero server uploads.
          </p>
        </div>

        {/* ── Exported PDF Hero Screen (When PDF is ready) ── */}
        {pdfResult && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-8 shadow-m3-elevation-2 mb-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-m3-outline-variant/40">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-2xl flex items-center justify-center shadow-m3-elevation-1">
                  🎉
                </div>
                <div>
                  <h2 className="text-xl font-bold text-m3-on-surface">Document PDF Ready!</h2>
                  <div className="text-xs sm:text-sm text-m3-on-surface-variant font-mono mt-0.5">
                    {pdfResult.name} · {pdfResult.pageCount} Pages
                  </div>
                </div>
              </div>

              {/* Stats Summary Grid */}
              <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">
                <div className="bg-m3-surface-container-high px-4 py-2.5 rounded-2xl border border-m3-outline-variant/50 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-m3-on-surface-variant">Pages</span>
                  <span className="text-sm font-bold text-m3-on-surface">{pdfResult.pageCount}</span>
                </div>
                <div className="bg-emerald-500/10 dark:bg-emerald-500/20 px-4 py-2.5 rounded-2xl border border-emerald-500/30 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-700 dark:text-emerald-300">File Size</span>
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">{formatBytes(pdfResult.size)}</span>
                </div>
                <div className="bg-m3-surface-container-high px-4 py-2.5 rounded-2xl border border-m3-outline-variant/50 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-m3-on-surface-variant">Format</span>
                  <span className="text-sm font-bold text-m3-on-surface">A4 PDF</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-6">
              <button
                type="button"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary transition-all shadow-m3-elevation-1 active:scale-[0.98]"
                onClick={downloadPDF}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                💾 Download Clean PDF ({formatBytes(pdfResult.size)})
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                onClick={() => setPdfResult(null)}
              >
                ➕ Add More Pages
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-error border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                onClick={clearAllPages}
              >
                🔄 Start Fresh Scan
              </button>
            </div>
          </div>
        )}

        {/* ── Main Scanner Workspace Card ── */}
        <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-8 shadow-m3-elevation-1 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left Column: Camera / Live Viewport */}
            <div className="flex flex-col min-w-0 w-full">
              <div className="relative w-full aspect-[4/3] bg-black/95 rounded-2xl overflow-hidden border border-m3-outline-variant/50 shadow-inner flex items-center justify-center">
                <div
                  className="w-full h-full relative"
                  style={{ display: cameraActive ? "block" : "none" }}
                >
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Viewfinder Guide Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
                    <div className="w-[88%] h-[86%] rounded-2xl border-2 border-dashed border-white/70 relative flex items-end justify-center pb-3">
                      {/* 4 Corner Markers */}
                      <span className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-3 border-l-3 border-m3-primary rounded-tl-md" />
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-3 border-r-3 border-m3-primary rounded-tr-md" />
                      <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-3 border-l-3 border-m3-primary rounded-bl-md" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-3 border-r-3 border-m3-primary rounded-br-md" />
                      <div className="bg-black/75 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full border border-white/20 shadow-sm">
                        Align Document Inside Frame
                      </div>
                    </div>
                  </div>
                </div>

                {!cameraActive && (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-white/90">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 text-3xl flex items-center justify-center mb-3 shadow-sm">
                      📷
                    </div>
                    <div className="font-semibold text-base text-white">Camera is currently inactive</div>
                    {cameraError && (
                      <div className="mt-2 text-xs bg-m3-error-container text-m3-on-error-container px-3 py-1.5 rounded-xl border border-m3-error/30 max-w-xs">
                        {cameraError}
                      </div>
                    )}
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary transition-all shadow-m3-elevation-1 active:scale-[0.98]"
                      onClick={() => startCamera()}
                    >
                      ▶️ Enable Camera
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Controls Bar */}
              <div className="flex flex-col items-center gap-3 mt-4">
                {cameraActive && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2.5 px-8 py-3 rounded-full text-base font-semibold bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-2 transition-all active:scale-[0.98]"
                    onClick={snapCurrentFrame}
                    title="Capture Document Page"
                  >
                    <span className="text-lg">📸</span>
                    <span>Capture Page</span>
                  </button>
                )}

                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {cameraActive && hasMultipleCameras && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                      onClick={toggleCameraFacing}
                      title="Flip Camera (Front/Back)"
                    >
                      🔄 Flip Camera
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload photos from device"
                  >
                    📁 Upload Photos
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  {cameraActive && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                      onClick={stopCamera}
                      title="Pause Camera"
                    >
                      ⏸️ Pause Cam
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Active Page Preview & Filters */}
            <div className="flex flex-col min-w-0 w-full">
              <div className="flex items-center justify-between mb-2.5">
                <div className="font-semibold text-sm text-m3-on-surface">
                  {pages.length > 0
                    ? `Page ${activePageIndex + 1} of ${pages.length}`
                    : "Scanned Document Preview"}
                </div>
                {pages.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98]"
                      onClick={rotateActivePage}
                      title="Rotate 90° Clockwise"
                    >
                      🔄 Rotate
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-m3-error-container hover:bg-m3-error-container/80 text-m3-on-error-container border border-m3-error/30 transition-all active:scale-[0.98]"
                      onClick={() => deletePage(activePageIndex)}
                      title="Delete this page"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Active Image Display */}
              <div className="w-full aspect-[4/3] bg-m3-surface-container-low rounded-2xl border border-m3-outline-variant/50 overflow-hidden flex items-center justify-center p-3 shadow-inner">
                {activePage ? (
                  <img
                    src={activePage.previewUrl}
                    alt={`Scanned page ${activePageIndex + 1}`}
                    className="max-w-full max-h-full object-contain rounded-xl shadow-sm"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6">
                    <div className="text-4xl mb-2">📄</div>
                    <div className="font-semibold text-sm text-m3-on-surface">
                      No pages captured yet.
                    </div>
                    <div className="text-xs text-m3-on-surface-variant mt-1 max-w-xs">
                      Click 📸 Capture Page or 📁 Upload Photos to start building your PDF.
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Selection Chips */}
              {activePage && (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                    ⚡ Document Filters:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border active:scale-[0.98] ${
                        activePage.filter === "magic"
                          ? "bg-m3-secondary-container text-m3-on-secondary-container border-m3-primary font-semibold"
                          : "bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface-variant border-m3-outline-variant/50"
                      }`}
                      onClick={() => setPageFilter("magic")}
                    >
                      ✨ Magic B&amp;W
                    </button>
                    <button
                      type="button"
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border active:scale-[0.98] ${
                        activePage.filter === "color"
                          ? "bg-m3-secondary-container text-m3-on-secondary-container border-m3-primary font-semibold"
                          : "bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface-variant border-m3-outline-variant/50"
                      }`}
                      onClick={() => setPageFilter("color")}
                    >
                      🎨 Vivid Color
                    </button>
                    <button
                      type="button"
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border active:scale-[0.98] ${
                        activePage.filter === "grayscale"
                          ? "bg-m3-secondary-container text-m3-on-secondary-container border-m3-primary font-semibold"
                          : "bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface-variant border-m3-outline-variant/50"
                      }`}
                      onClick={() => setPageFilter("grayscale")}
                    >
                      🔲 Grayscale
                    </button>
                    <button
                      type="button"
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border active:scale-[0.98] ${
                        activePage.filter === "original"
                          ? "bg-m3-secondary-container text-m3-on-secondary-container border-m3-primary font-semibold"
                          : "bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface-variant border-m3-outline-variant/50"
                      }`}
                      onClick={() => setPageFilter("original")}
                    >
                      📷 Original
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Multi-Page Thumbnail Strip at Bottom ── */}
          {pages.length > 0 && (
            <div className="w-full mt-6 pt-5 border-t border-m3-outline-variant/40">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm text-m3-on-surface">
                  📑 Scanned Pages ({pages.length})
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-m3-error hover:underline"
                  onClick={clearAllPages}
                >
                  Clear All
                </button>
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-3">
                {pages.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`relative flex-shrink-0 w-20 h-28 rounded-xl overflow-hidden cursor-pointer border-2 transition-all shadow-sm ${
                      idx === activePageIndex
                        ? "border-m3-primary ring-2 ring-m3-primary/30 scale-105 shadow-m3-elevation-1"
                        : "border-m3-outline-variant/50 hover:border-m3-outline opacity-80 hover:opacity-100"
                    }`}
                    onClick={() => setActivePageIndex(idx)}
                  >
                    <img src={p.previewUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {idx + 1}
                    </div>
                    <button
                      type="button"
                      className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePage(idx);
                      }}
                      title="Remove page"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add Next Page Quick Tile */}
                <div
                  className="flex-shrink-0 w-20 h-28 rounded-xl border-2 border-dashed border-m3-outline-variant/60 hover:border-m3-primary bg-m3-surface-container-high/40 hover:bg-m3-surface-container-high flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-m3-on-surface-variant hover:text-m3-primary"
                  onClick={() => {
                    if (cameraActive) snapCurrentFrame();
                    else fileInputRef.current?.click();
                  }}
                  title="Add next page"
                >
                  <span className="text-xl">➕</span>
                  <span className="text-[11px] font-medium">Next Page</span>
                </div>
              </div>

              {/* Export to PDF Action Bar */}
              <div className="mt-5">
                <button
                  type="button"
                  className="w-full py-3.5 rounded-full text-sm sm:text-base font-semibold transition-all shadow-m3-elevation-1 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary"
                  disabled={isExporting || pages.length === 0}
                  onClick={exportToPDF}
                >
                  {isExporting ? "⏳ " + exportMsg : `💾 Generate & Download PDF (${pages.length} Pages)`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security / Privacy Notice */}
        <div className="mt-2 mb-8 text-center text-xs text-m3-on-surface-variant/80 flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          All document scanning, image filtering, and PDF assembly are performed 100% locally in your browser. Zero server uploads.
        </div>
      </main>
    </div>
  );
}
