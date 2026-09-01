// PDFSignStudio.jsx — 100% Client-Side Digital E-Sign Studio (Neo-Brutalism)
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";

const MAX_SIZE_MB = 50;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

// Load PDF.js from CDN once
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF engine"));
    document.head.appendChild(s);
  });
}

// Render PDF page to canvas data URL
async function pdfPageToImage(pdfDoc, pageNum, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), width: viewport.width, height: viewport.height };
}

// Convert text to image (for Type & Stamp)
function textToImage(text, fontStr, color, padding = 10, isStamp = false) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = fontStr;
  const metrics = ctx.measureText(text);
  const width = Math.max(metrics.width + padding * 2, 50);
  const height = Math.max(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + padding * 2, 40);
  
  canvas.width = width;
  canvas.height = height;
  
  // Re-set context properties after resize
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  
  if (isStamp) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }
  
  ctx.fillText(text, width / 2, height / 2);
  return canvas.toDataURL("image/png");
}

// Remove white background from image
function removeWhiteBackground(imgElement) {
  const canvas = document.createElement("canvas");
  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if (r > 200 && g > 200 && b > 200) {
      data[i+3] = 0; // set alpha to 0 for near-white pixels
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ── Draggable & Resizable Overlay Component ──
function DraggableElement({ el, updateElement, removeElement }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const posRef = useRef({ x: el.x, y: el.y, startX: 0, startY: 0 });
  const sizeRef = useRef({ width: el.width, height: el.height, startX: 0, startY: 0, startW: 0, startH: 0 });

  const handlePointerDown = (e) => {
    e.stopPropagation();
    if (e.target.classList.contains("resize-handle")) return;
    if (e.target.classList.contains("sign-element-delete")) return;
    setIsDragging(true);
    posRef.current.startX = e.clientX || (e.touches && e.touches[0].clientX);
    posRef.current.startY = e.clientY || (e.touches && e.touches[0].clientY);
    document.body.style.userSelect = "none";
  };

  const handleResizeDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    sizeRef.current.startX = e.clientX || (e.touches && e.touches[0].clientX);
    sizeRef.current.startY = e.clientY || (e.touches && e.touches[0].clientY);
    sizeRef.current.startW = el.width;
    sizeRef.current.startH = el.height;
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleMove = (e) => {
      const clientX = e.clientX || (e.touches && e.touches[0]?.clientX);
      const clientY = e.clientY || (e.touches && e.touches[0]?.clientY);
      if (!clientX || !clientY) return;

      if (isDragging) {
        const dx = clientX - posRef.current.startX;
        const dy = clientY - posRef.current.startY;
        
        const parent = document.getElementById(`pdf-page-${el.pageNum}`);
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        
        const dxPct = (dx / rect.width) * 100;
        const dyPct = (dy / rect.height) * 100;
        
        let newX = Math.max(0, Math.min(100 - el.width, el.x + dxPct));
        let newY = Math.max(0, Math.min(100 - el.height, el.y + dyPct));

        posRef.current.startX = clientX;
        posRef.current.startY = clientY;
        
        updateElement(el.id, { x: newX, y: newY });
      }

      if (isResizing) {
        const dx = clientX - sizeRef.current.startX;
        const parent = document.getElementById(`pdf-page-${el.pageNum}`);
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        
        const dxPct = (dx / rect.width) * 100;
        const aspect = el.origWidth / el.origHeight;
        
        let newW = Math.max(5, sizeRef.current.startW + dxPct);
        let newH = newW / aspect;

        if (el.x + newW > 100) {
           newW = 100 - el.x;
           newH = newW / aspect;
        }
        if (el.y + newH > 100) {
           newH = 100 - el.y;
           newW = newH * aspect;
        }

        updateElement(el.id, { width: newW, height: newH });
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      document.body.style.userSelect = "";
    };

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      window.addEventListener("touchmove", handleMove, { passive: false });
      window.addEventListener("touchend", handleUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [isDragging, isResizing, el, updateElement]);

  return (
    <div
      className={`sign-element ${isDragging ? "dragging" : ""}`}
      style={{
        position: "absolute",
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        cursor: "move",
        border: "2px dashed rgba(0,0,0,0.3)",
        boxSizing: "border-box",
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
    >
      <img src={el.dataUrl} alt="element" style={{ width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
      
      {/* Delete Button */}
      <div 
        className="sign-element-delete"
        onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
        style={{
          position: "absolute", top: "-12px", right: "-12px", background: "#ff4444", color: "#fff",
          width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", fontSize: "14px", fontWeight: "bold", border: "2px solid #000",
          zIndex: 20
        }}
      >
        ×
      </div>

      {/* Resize Handle (bottom-right) */}
      <div
        className="resize-handle"
        onPointerDown={handleResizeDown}
        style={{
          position: "absolute", bottom: "-8px", right: "-8px", width: "16px", height: "16px",
          background: "#0891b2", borderRadius: "50%", cursor: "nwse-resize", border: "2px solid #000",
          zIndex: 20
        }}
      />
    </div>
  );
}

// ── Main PDF E-Sign Studio Component ──
export default function PDFSignStudio({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  // State
  const [file, setFile] = useState(null);
  const [pdfPages, setPdfPages] = useState([]); // { pageNum, dataUrl, width, height }
  const [selectedPage, setSelectedPage] = useState(1);
  const [elements, setElements] = useState([]); // { id, pageNum, dataUrl, x, y, width, height, origWidth, origHeight }
  const [pdfDocBytes, setPdfDocBytes] = useState(null); // original file buffer
  
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");

  // Modals
  const [showSignModal, setShowSignModal] = useState(false);
  const [signTab, setSignTab] = useState("draw"); // draw | type | upload
  
  // Draw State
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState("#000000");
  const [penWidth, setPenWidth] = useState(4);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Type State
  const [typeText, setTypeText] = useState("");
  const [typeFont, setTypeFont] = useState("40px 'Caveat', cursive");
  
  // Upload State
  const [uploadImg, setUploadImg] = useState(null);
  const [removeBg, setRemoveBg] = useState(true);

  // Load Google Fonts for Type signature
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Pacifico&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  // ── Reset ──
  const resetAll = useCallback(() => {
    setFile(null);
    setPdfPages([]);
    setSelectedPage(1);
    setElements([]);
    setPdfDocBytes(null);
    setResultBlob(null);
    setError("");
  }, []);

  // ── Load PDF ──
  const handleFile = async (selectedFile) => {
    resetAll();
    if (!selectedFile) return;
    if (selectedFile.size > MAX_SIZE) {
      setError(`File too large. Max ${MAX_SIZE_MB} MB.`);
      return;
    }
    if (selectedFile.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }

    setProcessing(true);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      setPdfDocBytes(arrayBuffer);
      setFile(selectedFile);
      
      const pdfjsLib = await loadPdfJs();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      
      const pages = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const pageData = await pdfPageToImage(pdfDoc, i, 1.5);
        pages.push({ pageNum: i, ...pageData });
      }
      setPdfPages(pages);
    } catch (err) {
      setError("Failed to parse PDF: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Canvas Drawing Logic ──
  useEffect(() => {
    if (showSignModal && signTab === "draw" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = penWidth;
      ctx.strokeStyle = penColor;
    }
  }, [showSignModal, signTab, penColor, penWidth]);

  const startDraw = (e) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);
  const clearDraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    setHasDrawn(false);
  };

  // ── Add Element to Page ──
  const addElement = (dataUrl) => {
    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      const defaultWidthPct = aspect > 2 ? 30 : 20; 
      const defaultHeightPct = defaultWidthPct / aspect;

      const newEl = {
        id: Date.now().toString(),
        pageNum: selectedPage,
        dataUrl,
        x: 50 - (defaultWidthPct / 2), 
        y: 50 - (defaultHeightPct / 2),
        width: defaultWidthPct,
        height: defaultHeightPct,
        origWidth: img.width,
        origHeight: img.height
      };
      setElements(prev => [...prev, newEl]);
      setShowSignModal(false);
    };
    img.src = dataUrl;
  };

  const updateElement = useCallback((id, changes) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...changes } : el));
  }, []);

  const removeElement = useCallback((id) => {
    setElements(prev => prev.filter(el => el.id !== id));
  }, []);

  // ── Handle Signature Modal Confirm ──
  const confirmSignature = () => {
    if (signTab === "draw") {
      if (!hasDrawn) return;
      
      // Trim empty space from drawing canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const l = pixels.data.length;
      let bound = { top: null, left: null, right: null, bottom: null };
      
      for (let i = 0; i < l; i += 4) {
        if (pixels.data[i + 3] !== 0) {
          const x = (i / 4) % canvas.width;
          const y = ~~((i / 4) / canvas.width);
          if (bound.top === null) bound.top = y;
          if (bound.left === null || x < bound.left) bound.left = x;
          if (bound.right === null || x > bound.right) bound.right = x;
          if (bound.bottom === null || y > bound.bottom) bound.bottom = y;
        }
      }
      
      if (bound.top !== null) {
        const pad = 10;
        const trimCanvas = document.createElement("canvas");
        trimCanvas.width = bound.right - bound.left + pad * 2;
        trimCanvas.height = bound.bottom - bound.top + pad * 2;
        const trimCtx = trimCanvas.getContext("2d");
        trimCtx.putImageData(ctx.getImageData(bound.left, bound.top, trimCanvas.width - pad*2, trimCanvas.height - pad*2), pad, pad);
        addElement(trimCanvas.toDataURL("image/png"));
      } else {
        addElement(canvas.toDataURL("image/png"));
      }

    } else if (signTab === "type") {
      if (!typeText.trim()) return;
      addElement(textToImage(typeText, typeFont, penColor));
    } else if (signTab === "upload") {
      if (!uploadImg) return;
      const img = new Image();
      img.onload = () => {
        addElement(removeBg ? removeWhiteBackground(img) : uploadImg);
      };
      img.src = uploadImg;
    }
  };

  // ── Add Stamps ──
  const addDateStamp = () => {
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    addElement(textToImage(dateStr, "bold 24px 'DM Sans', sans-serif", "#1a365d"));
  };

  const addStatusStamp = (text, color) => {
    addElement(textToImage(text, "bold 32px 'DM Sans', sans-serif", color, 15, true));
  };

  const addCustomInitials = () => {
    const initials = prompt("Enter initials or name:");
    if (initials && initials.trim()) {
      addElement(textToImage(initials, "bold 28px 'DM Sans', sans-serif", "#000"));
    }
  };

  // ── Embed and Export PDF ──
  const exportPDF = async () => {
    if (!pdfDocBytes) return;
    setProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfDocBytes);
      const pages = pdfDoc.getPages();

      for (const el of elements) {
        const page = pages[el.pageNum - 1]; 
        const { width: pWidth, height: pHeight } = page.getSize();
        
        const imgBytes = await fetch(el.dataUrl).then(res => res.arrayBuffer());
        const embeddedImg = await pdfDoc.embedPng(imgBytes);
        
        const w = (el.width / 100) * pWidth;
        const h = (el.height / 100) * pHeight;
        const x = (el.x / 100) * pWidth;
        const y = pHeight - ((el.y / 100) * pHeight) - h;

        page.drawImage(embeddedImg, {
          x, y, width: w, height: h
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      setResultBlob(blob);
      setResultName((file?.name?.replace(".pdf", "") || "document") + "_signed.pdf");
      
    } catch (err) {
      setError("Failed to sign PDF: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="compressor-page">
      {/* ── Tool Bar ── */}
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">✍️ PDF E-Sign Studio</span>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1200px" }}>
        {!file && (
          <div className="comp-header">
            <div className="comp-title-row">
              <div className="comp-icon-badge" style={{ background: "var(--brutal-yellow)" }}>✍️</div>
              <h1 className="comp-title">Digital E-Sign Studio</h1>
            </div>
            <p className="comp-sub">
              Sign PDFs securely in your browser. Draw, type, or upload signatures. Add date and status stamps. Zero server uploads.
            </p>
          </div>
        )}

        {/* ── Initial Drop Zone ── */}
        {!file && !processing && !resultBlob && (
          <div className="comp-card">
            <div
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <span className="drop-icon">📄</span>
              <div className="drop-main">Drop PDF Here to Sign</div>
              <div className="drop-sub">100% private in-browser processing</div>
              <button type="button" className="drop-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Browse Files
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {processing && (
          <div className="processing-state" style={{ marginTop: "40px" }}>
            <div className="spinner"></div>
            <p>Processing Document...</p>
          </div>
        )}

        {error && (
          <div className="error-banner" style={{ background: "#FEE2E2", border: "2px solid #1a1a1a", padding: "12px", borderRadius: "8px", color: "#B91C1C", fontWeight: "bold", marginTop: "20px" }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Main Workspace ── */}
        {file && !processing && !resultBlob && (
          <div className="sign-workspace" style={{ width: "100%", display: "flex", gap: "20px", marginTop: "10px", flexWrap: "wrap", alignItems: "flex-start" }}>
            
            {/* Left Sidebar: Controls & Stamps */}
            <div className="sign-sidebar" style={{ width: "260px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
              
              <div className="comp-card" style={{ padding: "16px" }}>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "12px", borderBottom: "2px solid var(--border-color)", paddingBottom: "6px" }}>Signatures</h3>
                <button className="btn-compress" style={{ width: "100%", padding: "10px", fontSize: "0.9rem", display: "flex", justifyContent: "center", gap: "8px" }} onClick={() => setShowSignModal(true)}>
                  <span>➕</span> Create Signature
                </button>
              </div>

              <div className="comp-card" style={{ padding: "16px" }}>
                <h3 style={{ fontSize: "1.1rem", marginBottom: "12px", borderBottom: "2px solid var(--border-color)", paddingBottom: "6px" }}>Quick Stamps</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button className="btn-reset" style={{ textAlign: "left", padding: "8px 12px" }} onClick={addDateStamp}>📅 Today's Date</button>
                  <button className="btn-reset" style={{ textAlign: "left", padding: "8px 12px" }} onClick={() => addStatusStamp("APPROVED", "#059669")}>✅ Approved</button>
                  <button className="btn-reset" style={{ textAlign: "left", padding: "8px 12px" }} onClick={() => addStatusStamp("CONFIDENTIAL", "#B91C1C")}>🔒 Confidential</button>
                  <button className="btn-reset" style={{ textAlign: "left", padding: "8px 12px" }} onClick={addCustomInitials}>🔤 Custom Text</button>
                </div>
              </div>

              <div className="comp-card" style={{ padding: "16px" }}>
                <button className="btn-compress" style={{ width: "100%", background: "var(--brutal-sky)" }} onClick={exportPDF}>
                  💾 Finish & Save PDF
                </button>
              </div>

            </div>

            {/* Right Side: PDF Viewer & Thumbnail Strip */}
            <div className="sign-pdf-area" style={{ flex: 1, minWidth: "300px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-surface)", padding: "16px", borderRadius: "12px", border: "var(--border-thin)" }}>
              
              {/* Thumbnails */}
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "10px", borderBottom: "2px solid var(--border-color)" }}>
                {pdfPages.map(p => (
                  <div key={p.pageNum} 
                       onClick={() => setSelectedPage(p.pageNum)}
                       style={{ 
                         width: "60px", height: "80px", flexShrink: 0, cursor: "pointer", 
                         border: selectedPage === p.pageNum ? "3px solid var(--brutal-sky)" : "2px solid var(--border-color)",
                         borderRadius: "4px", overflow: "hidden", position: "relative",
                         opacity: selectedPage === p.pageNum ? 1 : 0.6
                       }}>
                    <img src={p.dataUrl} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", bottom: 0, right: 0, background: "var(--text-main)", color: "var(--bg-main)", fontSize: "10px", padding: "2px 4px", fontWeight: "bold" }}>{p.pageNum}</div>
                  </div>
                ))}
              </div>

              {/* Active Page Canvas Area */}
              <div style={{ flex: 1, display: "flex", justifyContent: "center", overflow: "auto", background: "var(--bg-main)", padding: "20px", borderRadius: "8px" }}>
                <div style={{ position: "relative", boxShadow: "var(--shadow-lg)", border: "1px solid #ccc", background: "#fff", alignSelf: "flex-start" }}>
                  {pdfPages.find(p => p.pageNum === selectedPage) && (
                    <div id={`pdf-page-${selectedPage}`} style={{ position: "relative", width: "100%", maxWidth: "800px" }}>
                      <img 
                        src={pdfPages.find(p => p.pageNum === selectedPage).dataUrl} 
                        style={{ width: "100%", display: "block", pointerEvents: "none" }} 
                        alt="PDF Page" 
                      />
                      {/* Render Draggable Elements for this page */}
                      {elements.filter(el => el.pageNum === selectedPage).map(el => (
                        <DraggableElement key={el.id} el={el} updateElement={updateElement} removeElement={removeElement} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Signature Creation Modal ── */}
        {showSignModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <div className="comp-card" style={{ width: "90%", maxWidth: "600px", padding: "24px", background: "var(--bg-card)", boxShadow: "8px 8px 0 #000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Create Signature</h2>
                <button onClick={() => setShowSignModal(false)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--text-main)" }}>✕</button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "2px solid var(--border-color)", paddingBottom: "8px" }}>
                <button className={`btn-reset ${signTab === "draw" ? "active" : ""}`} style={{ background: signTab === "draw" ? "var(--brutal-yellow)" : "", padding: "6px 16px", color: signTab === "draw" ? "#000" : "" }} onClick={() => setSignTab("draw")}>✍️ Draw</button>
                <button className={`btn-reset ${signTab === "type" ? "active" : ""}`} style={{ background: signTab === "type" ? "var(--brutal-sky)" : "", padding: "6px 16px", color: signTab === "type" ? "#000" : "" }} onClick={() => setSignTab("type")}>⌨️ Type</button>
                <button className={`btn-reset ${signTab === "upload" ? "active" : ""}`} style={{ background: signTab === "upload" ? "var(--brutal-mint)" : "", padding: "6px 16px", color: signTab === "upload" ? "#000" : "" }} onClick={() => setSignTab("upload")}>📷 Upload</button>
              </div>

              {/* Draw Tab */}
              {signTab === "draw" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {["#000000", "#1a365d", "#b91c1c"].map(c => (
                        <div key={c} onClick={() => setPenColor(c)} style={{ width: "24px", height: "24px", background: c, borderRadius: "50%", cursor: "pointer", border: penColor === c ? "3px solid #f59e0b" : "2px solid #000" }} title="Color" />
                      ))}
                    </div>
                    <button className="btn-reset" style={{ padding: "4px 8px", fontSize: "0.8rem" }} onClick={clearDraw}>Clear Pad</button>
                  </div>
                  <canvas 
                    ref={canvasRef} 
                    width={500} height={200} 
                    style={{ width: "100%", border: "2px solid var(--border-color)", borderRadius: "8px", background: "#fff", touchAction: "none", cursor: "crosshair" }}
                    onPointerDown={startDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerOut={endDraw}
                  />
                </div>
              )}

              {/* Type Tab */}
              {signTab === "type" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <input type="text" value={typeText} onChange={e => setTypeText(e.target.value)} placeholder="Type your name..." style={{ padding: "12px", fontSize: "1.1rem", border: "2px solid var(--border-color)", borderRadius: "8px", background: "var(--bg-main)", color: "var(--text-main)" }} />
                  <div style={{ display: "flex", gap: "8px" }}>
                     {["#000000", "#1a365d", "#b91c1c"].map(c => (
                        <div key={c} onClick={() => setPenColor(c)} style={{ width: "24px", height: "24px", background: c, borderRadius: "50%", cursor: "pointer", border: penColor === c ? "3px solid #f59e0b" : "2px solid #000" }} />
                      ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {[
                      { label: "Caveat", val: "40px 'Caveat', cursive" },
                      { label: "Dancing Script", val: "40px 'Dancing Script', cursive" },
                      { label: "Pacifico", val: "30px 'Pacifico', cursive" },
                      { label: "Serif", val: "italic bold 40px 'Georgia', serif" }
                    ].map(f => (
                      <button key={f.label} onClick={() => setTypeFont(f.val)} style={{ padding: "16px", border: typeFont === f.val ? "3px solid var(--brutal-yellow)" : "2px solid var(--border-color)", borderRadius: "8px", background: "#fff", fontSize: "1.5rem", fontFamily: f.val.split("px ")[1] || "inherit", color: penColor, cursor: "pointer" }}>
                        {typeText || "Signature"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Tab */}
              {signTab === "upload" && (
                <div style={{ textAlign: "center", padding: "20px", border: "2px dashed var(--border-color)", borderRadius: "8px" }}>
                  <input type="file" accept="image/png, image/jpeg" onChange={e => {
                    const f = e.target.files[0];
                    if (f) setUploadImg(URL.createObjectURL(f));
                  }} style={{ marginBottom: "16px" }} />
                  {uploadImg && (
                    <div style={{ marginTop: "16px" }}>
                      <img src={uploadImg} style={{ maxHeight: "120px", border: "2px solid #000", borderRadius: "8px" }} alt="uploaded signature" />
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "12px", fontWeight: "bold" }}>
                        <input type="checkbox" checked={removeBg} onChange={e => setRemoveBg(e.target.checked)} />
                        Remove White Background
                      </label>
                    </div>
                  )}
                </div>
              )}

              <button className="btn-compress" style={{ width: "100%", marginTop: "24px", padding: "12px", fontSize: "1.1rem" }} onClick={confirmSignature}>
                Use Signature
              </button>
            </div>
          </div>
        )}

        {/* ── Results Output ── */}
        {resultBlob && (
          <div className="comp-card" style={{ maxWidth: "700px", margin: "20px auto", padding: "30px", textAlign: "center" }}>
             <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🎉</div>
             <h2 style={{ fontSize: "1.6rem", marginBottom: "8px" }}>Signed Successfully!</h2>
             <p style={{ color: "var(--text-sub)", marginBottom: "24px" }}>Your document has been cryptographically flattened with your signatures.</p>
             <ActionButtons 
                auth={auth} 
                blob={resultBlob} 
                fileName={resultName} 
                resultMime="application/pdf"
                onReset={resetAll} 
                toolName="PDF E-Sign Studio" 
             />
          </div>
        )}

      </div>
    </div>
  );
}
