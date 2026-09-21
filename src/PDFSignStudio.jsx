// PDFSignStudio.jsx — 100% Client-Side Digital E-Sign Studio (Material Design 3)
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
      className={`sign-element ${isDragging ? "dragging ring-2 ring-m3-primary shadow-lg" : "hover:ring-1 hover:ring-m3-primary/60"} group transition-shadow`}
      style={{
        position: "absolute",
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        cursor: "move",
        border: isDragging ? "2px dashed var(--md-sys-color-primary, #0b57d0)" : "2px dashed rgba(11,87,208,0.5)",
        boxSizing: "border-box",
        zIndex: 10,
      }}
      onPointerDown={handlePointerDown}
    >
      <img src={el.dataUrl} alt="element" className="w-full h-full object-fill pointer-events-none select-none" />
      
      {/* Delete Button */}
      <div 
        className="sign-element-delete w-6 h-6 rounded-full bg-m3-error text-m3-on-error shadow-m3-elevation-1 flex items-center justify-center cursor-pointer text-xs font-bold hover:scale-110 active:scale-95 transition-transform"
        onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
        title="Delete element"
        style={{
          position: "absolute",
          top: "-12px",
          right: "-12px",
          zIndex: 20
        }}
      >
        ✕
      </div>

      {/* Resize Handle (bottom-right) */}
      <div
        className="resize-handle w-5 h-5 rounded-full bg-m3-primary text-m3-on-primary border-2 border-white shadow-m3-elevation-1 cursor-nwse-resize hover:scale-125 active:scale-110 transition-transform flex items-center justify-center"
        onPointerDown={handleResizeDown}
        title="Resize element"
        style={{
          position: "absolute",
          bottom: "-10px",
          right: "-10px",
          zIndex: 20
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white block pointer-events-none"></span>
      </div>
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
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top App Bar ── */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-display font-semibold text-m3-on-surface-variant hover:text-m3-on-surface bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/50 transition-all duration-200 active:scale-95 shadow-sm"
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">✍️</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF E-Sign Studio</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Draw · Type · Stamp
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!file && (
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
              ✍️
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
              Digital E-Sign Studio
            </h1>
            <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
              Sign PDFs securely in your browser. Draw, type, or upload signatures. Add date and status stamps. Zero server uploads.
            </p>
          </div>
        )}

        {/* ── Initial Drop Zone ── */}
        {!file && !processing && !resultBlob && (
          <div className="max-w-2xl mx-auto bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1 transition-all">
            <div
              className="border-2 border-dashed border-m3-outline-variant/80 hover:border-m3-primary hover:bg-m3-primary/5 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className="w-16 h-16 rounded-2xl bg-m3-primary/10 group-hover:bg-m3-primary/15 text-m3-primary text-3xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                📄
              </div>
              <div className="font-display font-bold text-lg sm:text-xl text-m3-on-surface mb-1">
                Drop PDF Here to Sign
              </div>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6 max-w-sm">
                100% private in-browser client-side signing. Max {MAX_SIZE_MB}MB.
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-semibold text-sm shadow-sm hover:shadow active:scale-95 transition-all"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                <span>Browse Files</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {/* ── Processing State ── */}
        {processing && (
          <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-m3-surface-container-low border border-m3-outline-variant/60 shadow-m3-elevation-1 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-m3-primary/30 border-t-m3-primary animate-spin mx-auto mb-4"></div>
            <p className="text-sm font-display font-semibold text-m3-on-surface animate-pulse">Processing Document...</p>
            <p className="text-xs text-m3-on-surface-variant mt-1">Rendering vector pages & flattening layers</p>
          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className="max-w-2xl mx-auto my-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/30 flex items-center justify-between gap-3 text-sm font-medium">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError("")}
              className="text-xs font-bold px-2 py-1 rounded hover:bg-m3-error/10 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Main Workspace ── */}
        {file && !processing && !resultBlob && (
          <div className="w-full flex flex-col lg:flex-row gap-6 mt-4 items-start">
            
            {/* Left Sidebar: Controls, Stamps & Export */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4">
              
              {/* Card 1: Signatures */}
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1">
                <div className="flex items-center justify-between mb-3 border-b border-m3-outline-variant/40 pb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    Signatures
                  </span>
                  <span className="text-xs font-mono text-m3-on-surface-variant bg-m3-surface-container px-2 py-0.5 rounded-full">
                    {elements.length} placed
                  </span>
                </div>
                <button
                  className="w-full py-3 px-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-semibold text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow active:scale-95 transition-all"
                  onClick={() => setShowSignModal(true)}
                >
                  <span className="text-base">➕</span>
                  <span>Create Signature</span>
                </button>
              </div>

              {/* Card 2: Quick Stamps */}
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1">
                <div className="mb-3 border-b border-m3-outline-variant/40 pb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    Quick Stamps
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full py-2.5 px-3.5 rounded-xl border border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface text-xs sm:text-sm font-medium flex items-center gap-2.5 transition-all active:scale-95 text-left"
                    onClick={addDateStamp}
                  >
                    <span>📅</span>
                    <span>Today's Date</span>
                  </button>
                  <button
                    className="w-full py-2.5 px-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-medium flex items-center gap-2.5 transition-all active:scale-95 text-left"
                    onClick={() => addStatusStamp("APPROVED", "#059669")}
                  >
                    <span>✅</span>
                    <span>Approved Stamp</span>
                  </button>
                  <button
                    className="w-full py-2.5 px-3.5 rounded-xl border border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium flex items-center gap-2.5 transition-all active:scale-95 text-left"
                    onClick={() => addStatusStamp("CONFIDENTIAL", "#B91C1C")}
                  >
                    <span>🔒</span>
                    <span>Confidential Stamp</span>
                  </button>
                  <button
                    className="w-full py-2.5 px-3.5 rounded-xl border border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface text-xs sm:text-sm font-medium flex items-center gap-2.5 transition-all active:scale-95 text-left"
                    onClick={addCustomInitials}
                  >
                    <span>🔤</span>
                    <span>Custom Text / Initials</span>
                  </button>
                </div>
              </div>

              {/* Card 3: Finish & Export Action */}
              <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1 flex flex-col gap-3">
                <button
                  className="w-full py-3 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                  onClick={exportPDF}
                >
                  <span>💾</span>
                  <span>Finish & Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full py-2 px-4 rounded-full text-xs font-display font-medium text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-high transition-colors text-center"
                >
                  Change Document
                </button>
              </div>

            </div>

            {/* Right Side: PDF Viewer & Thumbnail Strip */}
            <div className="flex-1 min-w-0 w-full bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-4 sm:p-6 shadow-m3-elevation-1 flex flex-col gap-4">
              
              {/* Page Strip Header & Thumbnails */}
              <div className="border-b border-m3-outline-variant/40 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant">
                    Page {selectedPage} of {pdfPages.length}
                  </span>
                  <span className="text-xs text-m3-on-surface-variant hidden sm:inline">
                    Click & drag elements to position · Drag bottom-right corner to resize
                  </span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                  {pdfPages.map(p => (
                    <div
                      key={p.pageNum} 
                      onClick={() => setSelectedPage(p.pageNum)}
                      className={`w-16 h-20 shrink-0 cursor-pointer rounded-xl overflow-hidden relative transition-all active:scale-95 ${
                        selectedPage === p.pageNum
                          ? "ring-2 ring-m3-primary shadow-sm border border-m3-primary"
                          : "border border-m3-outline-variant/60 opacity-60 hover:opacity-100 hover:border-m3-outline"
                      }`}
                    >
                      <img src={p.dataUrl} alt={`Page ${p.pageNum}`} className="w-full h-full object-cover pointer-events-none select-none" />
                      <div className="absolute bottom-0 right-0 bg-m3-surface-container-highest/90 text-m3-on-surface text-[10px] font-mono px-1.5 py-0.5 rounded-tl-md font-bold">
                        {p.pageNum}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Page Canvas Area */}
              <div className="flex-1 flex justify-center items-start overflow-auto bg-m3-surface-container-highest/30 dark:bg-m3-surface-container-lowest/70 p-4 sm:p-8 rounded-2xl min-h-[500px]">
                <div className="relative shadow-m3-elevation-2 rounded-lg bg-white overflow-visible self-start">
                  {pdfPages.find(p => p.pageNum === selectedPage) && (
                    <div id={`pdf-page-${selectedPage}`} className="relative w-full max-w-[800px]">
                      <img 
                        src={pdfPages.find(p => p.pageNum === selectedPage).dataUrl} 
                        className="w-full block pointer-events-none select-none rounded-lg"
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
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-m3-surface-container-high border border-m3-outline-variant/60 rounded-3xl p-6 shadow-m3-elevation-3 transition-all animate-fadeIn">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-bold text-m3-on-surface">Create Signature</h2>
                <button
                  onClick={() => setShowSignModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest transition-colors text-base"
                >
                  ✕
                </button>
              </div>

              {/* Segmented Tabs */}
              <div className="flex p-1 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 mb-6 gap-1">
                <button
                  className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-display font-medium text-center transition-all flex items-center justify-center gap-1.5 ${
                    signTab === "draw"
                      ? "bg-m3-surface-container-lowest text-m3-on-surface shadow-sm font-bold"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                  onClick={() => setSignTab("draw")}
                >
                  <span>✍️</span>
                  <span>Draw</span>
                </button>
                <button
                  className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-display font-medium text-center transition-all flex items-center justify-center gap-1.5 ${
                    signTab === "type"
                      ? "bg-m3-surface-container-lowest text-m3-on-surface shadow-sm font-bold"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                  onClick={() => setSignTab("type")}
                >
                  <span>⌨️</span>
                  <span>Type</span>
                </button>
                <button
                  className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-display font-medium text-center transition-all flex items-center justify-center gap-1.5 ${
                    signTab === "upload"
                      ? "bg-m3-surface-container-lowest text-m3-on-surface shadow-sm font-bold"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                  onClick={() => setSignTab("upload")}
                >
                  <span>📷</span>
                  <span>Upload</span>
                </button>
              </div>

              {/* Draw Tab */}
              {signTab === "draw" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-m3-on-surface-variant font-medium">Ink Color:</span>
                      {["#000000", "#1a365d", "#b91c1c"].map(c => (
                        <div
                          key={c}
                          onClick={() => setPenColor(c)}
                          className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                            penColor === c ? "ring-2 ring-m3-primary ring-offset-2 ring-offset-m3-surface-container-high scale-110" : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: c }}
                          title={`Select color ${c}`}
                        />
                      ))}
                    </div>
                    <button
                      className="px-3 py-1 rounded-full text-xs font-display font-medium text-m3-error hover:bg-m3-error/10 border border-m3-error/30 transition-all"
                      onClick={clearDraw}
                    >
                      Clear Pad
                    </button>
                  </div>
                  <canvas 
                    ref={canvasRef} 
                    width={500}
                    height={200} 
                    className="w-full rounded-2xl border border-m3-outline-variant/80 bg-white shadow-inner cursor-crosshair touch-none"
                    onPointerDown={startDraw}
                    onPointerMove={draw}
                    onPointerUp={endDraw}
                    onPointerOut={endDraw}
                  />
                  <p className="text-[11px] text-m3-on-surface-variant text-center mt-2">
                    Draw smoothly using mouse, touchpad, or finger on touchscreens
                  </p>
                </div>
              )}

              {/* Type Tab */}
              {signTab === "type" && (
                <div className="flex flex-col gap-4">
                  <input
                    type="text"
                    value={typeText}
                    onChange={e => setTypeText(e.target.value)}
                    placeholder="Type your name here..."
                    className="w-full px-4 py-3 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/70 text-m3-on-surface placeholder:text-m3-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-m3-primary text-base font-medium transition-all"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-m3-on-surface-variant font-medium">Font Color:</span>
                    {["#000000", "#1a365d", "#b91c1c"].map(c => (
                      <div
                        key={c}
                        onClick={() => setPenColor(c)}
                        className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                          penColor === c ? "ring-2 ring-m3-primary ring-offset-2 ring-offset-m3-surface-container-high scale-110" : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: "Caveat", val: "40px 'Caveat', cursive" },
                      { label: "Dancing Script", val: "40px 'Dancing Script', cursive" },
                      { label: "Pacifico", val: "30px 'Pacifico', cursive" },
                      { label: "Serif", val: "italic bold 40px 'Georgia', serif" }
                    ].map(f => (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => setTypeFont(f.val)}
                        className={`p-4 rounded-2xl border text-center transition-all cursor-pointer bg-white dark:bg-white/95 ${
                          typeFont === f.val
                            ? "border-2 border-m3-primary ring-1 ring-m3-primary shadow-sm"
                            : "border-m3-outline-variant/60 hover:border-m3-outline"
                        }`}
                        style={{
                          fontSize: "1.4rem",
                          fontFamily: f.val.split("px ")[1] || "inherit",
                          color: penColor
                        }}
                      >
                        {typeText || "Signature"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Tab */}
              {signTab === "upload" && (
                <div className="p-6 rounded-2xl border-2 border-dashed border-m3-outline-variant/80 text-center bg-m3-surface-container/30">
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={e => {
                      const f = e.target.files[0];
                      if (f) setUploadImg(URL.createObjectURL(f));
                    }}
                    className="block w-full text-xs text-m3-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-m3-primary file:text-m3-on-primary hover:file:bg-m3-primary/90 cursor-pointer"
                  />
                  {uploadImg && (
                    <div className="mt-4 flex flex-col items-center">
                      <div className="p-2 rounded-xl bg-white shadow-sm border border-m3-outline-variant/50 max-w-[240px]">
                        <img src={uploadImg} alt="uploaded signature" className="max-h-24 object-contain rounded" />
                      </div>
                      <label className="inline-flex items-center gap-2 mt-3 cursor-pointer text-xs font-display font-medium text-m3-on-surface">
                        <input
                          type="checkbox"
                          checked={removeBg}
                          onChange={e => setRemoveBg(e.target.checked)}
                          className="rounded text-m3-primary focus:ring-m3-primary"
                        />
                        <span>Remove White Background (Auto-transparent)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <button
                className="w-full mt-6 py-3.5 px-6 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-semibold text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                onClick={confirmSignature}
              >
                <span>Use Signature</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Results Output ── */}
        {resultBlob && (
          <div className="max-w-2xl mx-auto bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-8 sm:p-10 shadow-m3-elevation-2 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 text-3xl flex items-center justify-center mx-auto mb-4">
              🎉
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-m3-on-surface mb-2">
              Signed Successfully!
            </h2>
            <p className="text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
              Your document has been cryptographically flattened with your signatures and stamps.
            </p>
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
