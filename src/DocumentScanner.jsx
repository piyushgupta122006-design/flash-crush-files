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
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
    <div className="compressor-page">
      {/* Top Bar */}
      <div className="tool-page-bar">
        <button type="button" className="back-btn" onClick={() => navigate("/")}>
          ← Back
        </button>
        <div className="comp-title-badge">
          <span>📷 Document Scanner (Cam to PDF)</span>
        </div>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1150px" }}>
        {/* Header */}
        <div className="comp-header">
          <div className="comp-icon-badge">
            <span style={{ fontSize: "1.8rem" }}>📷</span>
          </div>
          <h1 className="comp-title">In-Browser Document Scanner</h1>
          <p className="comp-subtitle">
            Scan notes, documents &amp; receipts with your camera or photos. Magic B&amp;W contrast, multi-page capture &amp; 1-click clean PDF export. Zero server uploads.
          </p>
        </div>

        {/* ── Exported PDF Hero Screen (When PDF is ready) ── */}
        {pdfResult && (
          <div className="vc-workspace-card anim-pop" style={{ marginBottom: "24px" }}>
            <div className="vc-result-header-box">
              <div className="vc-result-title-row">
                <div className="vc-result-icon">🎉</div>
                <div>
                  <h2 className="vc-result-heading">Document PDF Ready!</h2>
                  <div className="vc-result-subtext">{pdfResult.name} · {pdfResult.pageCount} Pages</div>
                </div>
              </div>

              {/* Stats Card */}
              <div className="vc-stats-summary-grid">
                <div className="vc-stat-card">
                  <span className="vc-stat-label">Total Pages</span>
                  <span className="vc-stat-val-new">{pdfResult.pageCount}</span>
                </div>
                <div className="vc-stat-card vc-stat-card-highlight">
                  <span className="vc-stat-label">File Size</span>
                  <span className="vc-stat-val-saved">{formatBytes(pdfResult.size)}</span>
                </div>
                <div className="vc-stat-card">
                  <span className="vc-stat-label">Format</span>
                  <span className="vc-stat-val-new">Standard A4</span>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="vc-result-actions-row">
                <button
                  type="button"
                  className="btn-download-video-large"
                  onClick={downloadPDF}
                >
                  💾 Download Clean PDF ({formatBytes(pdfResult.size)})
                </button>
                <button
                  type="button"
                  className="vc-btn-secondary"
                  onClick={() => setPdfResult(null)}
                >
                  ➕ Add More Pages
                </button>
                <button
                  type="button"
                  className="vc-btn-secondary"
                  onClick={clearAllPages}
                >
                  🔄 Start Fresh Scan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main Scanner Workspace Grid ── */}
        <div className="scanner-workspace-card anim-pop">
          <div className="scanner-grid">
            {/* Left Column: Camera / Live Viewport */}
            <div className="scanner-camera-column">
              <div className="scanner-viewport-box">
                <div
                  className="scanner-video-container"
                  style={{ display: cameraActive ? "block" : "none" }}
                >
                  <video
                    ref={videoRef}
                    className="scanner-live-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Viewfinder Guide Overlay */}
                  <div className="scanner-viewfinder-overlay">
                    <div className="scanner-guide-box">
                      <span className="scanner-corner tl" />
                      <span className="scanner-corner tr" />
                      <span className="scanner-corner bl" />
                      <span className="scanner-corner br" />
                      <div className="scanner-guide-text">Align Document Inside Frame</div>
                    </div>
                  </div>
                </div>

                {!cameraActive && (
                  <div className="scanner-camera-off-box">
                    <div style={{ fontSize: "2.8rem", marginBottom: "12px" }}>📷</div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>Camera is currently inactive</div>
                    {cameraError && <div className="scanner-error-text">{cameraError}</div>}
                    <button
                      type="button"
                      className="scanner-action-btn"
                      style={{ marginTop: "16px" }}
                      onClick={() => startCamera()}
                    >
                      ▶️ Enable Camera
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Controls Bar */}
              <div className="scanner-controls-bar">
                {cameraActive && (
                  <button
                    type="button"
                    className="scanner-shutter-btn"
                    onClick={snapCurrentFrame}
                    title="Capture Document Page"
                  >
                    <span className="scanner-shutter-inner">📸</span>
                    <span className="scanner-shutter-text">Capture Page</span>
                  </button>
                )}

                <div className="scanner-secondary-btns">
                  {cameraActive && hasMultipleCameras && (
                    <button
                      type="button"
                      className="scanner-icon-btn"
                      onClick={toggleCameraFacing}
                      title="Flip Camera (Front/Back)"
                    >
                      🔄 Flip Camera
                    </button>
                  )}

                  <button
                    type="button"
                    className="scanner-icon-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload photos from device"
                  >
                    📁 Upload Photos
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />

                  {cameraActive && (
                    <button
                      type="button"
                      className="scanner-icon-btn"
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
            <div className="scanner-preview-column">
              <div className="scanner-preview-header">
                <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                  {pages.length > 0
                    ? `Page ${activePageIndex + 1} of ${pages.length}`
                    : "Scanned Document Preview"}
                </div>
                {pages.length > 0 && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="scanner-mini-btn"
                      onClick={rotateActivePage}
                      title="Rotate 90° Clockwise"
                    >
                      🔄 Rotate
                    </button>
                    <button
                      type="button"
                      className="scanner-mini-btn scanner-btn-danger"
                      onClick={() => deletePage(activePageIndex)}
                      title="Delete this page"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Active Image Display */}
              <div className="scanner-active-image-wrap">
                {activePage ? (
                  <img
                    src={activePage.previewUrl}
                    alt={`Scanned page ${activePageIndex + 1}`}
                    className="scanner-active-img"
                  />
                ) : (
                  <div className="scanner-empty-preview">
                    <div style={{ fontSize: "2.4rem", marginBottom: "8px" }}>📄</div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-muted)" }}>
                      No pages captured yet.
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Click 📸 Capture Page or 📁 Upload Photos to start building your PDF.
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Selection Chips (CamScanner filters) */}
              {activePage && (
                <div className="scanner-filter-selector">
                  <div className="scanner-filter-title">⚡ Document Filters:</div>
                  <div className="scanner-filter-pills">
                    <button
                      type="button"
                      className={`scanner-filter-pill ${activePage.filter === "magic" ? "active" : ""}`}
                      onClick={() => setPageFilter("magic")}
                    >
                      ✨ Magic B&amp;W
                    </button>
                    <button
                      type="button"
                      className={`scanner-filter-pill ${activePage.filter === "color" ? "active" : ""}`}
                      onClick={() => setPageFilter("color")}
                    >
                      🎨 Vivid Color
                    </button>
                    <button
                      type="button"
                      className={`scanner-filter-pill ${activePage.filter === "grayscale" ? "active" : ""}`}
                      onClick={() => setPageFilter("grayscale")}
                    >
                      🔲 Grayscale
                    </button>
                    <button
                      type="button"
                      className={`scanner-filter-pill ${activePage.filter === "original" ? "active" : ""}`}
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
            <div className="scanner-bottom-section">
              <div className="scanner-strip-header">
                <div style={{ fontWeight: 800, fontSize: "0.9rem" }}>
                  📑 Scanned Pages ({pages.length})
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="scanner-text-link"
                    onClick={clearAllPages}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="scanner-thumbnail-strip">
                {pages.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`scanner-thumb-card ${idx === activePageIndex ? "active" : ""}`}
                    onClick={() => setActivePageIndex(idx)}
                  >
                    <img src={p.previewUrl} alt={`Thumbnail ${idx + 1}`} className="scanner-thumb-img" />
                    <div className="scanner-thumb-badge">{idx + 1}</div>
                    <button
                      type="button"
                      className="scanner-thumb-del"
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
                  className="scanner-thumb-add-tile"
                  onClick={() => {
                    if (cameraActive) snapCurrentFrame();
                    else fileInputRef.current?.click();
                  }}
                  title="Add next page"
                >
                  <span style={{ fontSize: "1.4rem" }}>➕</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800 }}>Next Page</span>
                </div>
              </div>

              {/* Export to PDF Action Bar */}
              <div className="scanner-export-bar">
                <button
                  type="button"
                  className="scanner-btn-export-pdf"
                  disabled={isExporting || pages.length === 0}
                  onClick={exportToPDF}
                >
                  {isExporting ? "⏳ " + exportMsg : `💾 Generate & Download PDF (${pages.length} Pages)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
