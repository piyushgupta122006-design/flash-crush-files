// PDFEditor.jsx — Unified In-Browser PDF Editor, Sign Studio & Page Organizer
// Features: 
// - 100% Client-Side Vector Export via pdf-lib (Zero Canvas Rasterization)
// - Immutable pageId Binding (Anti-Desync across reorders, rotations & deletions)
// - Mode Switcher: [ ✏️ Edit & Annotate ] | [ ✍️ Sign & Stamp ] | [ 📑 Organize Pages ]
// - Smart Whiteout Text Editing with High-DPI Canvas Sampling & Black Patch Guard
// - Virtualized IntersectionObserver Viewport with Zoom Controls
// - Full Signature Suite (Draw Bezier, Type Cursive, Upload PNG with BG Remover) & Date/Status Stamps
// - Multi-Doc Architecture (Append / Merge Secondary PDFs without ArrayBuffer detachment)
// - WinAnsi Encoding Sanitizer for Crash-Free StandardFonts text rendering

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";
import { consumePendingFile } from "./clipboardStore";

const MAX_SIZE_MB = 80;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

// ── PDF.js CDN Loader ────────────────────────────────────────────────────────
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
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

// ── WinAnsi Character Sanitizer (Prevents pdf-lib StandardFonts crash) ─────────
function sanitizeToWinAnsi(str) {
  if (!str) return "";
  return str
    // Curly single quotes & apostrophes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Curly double quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Dashes & hyphens
    .replace(/[\u2013\u2014\u2015]/g, "-")
    // Bullets & list dots
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "*")
    // Ellipsis
    .replace(/\u2026/g, "...")
    // Trademarks & copyrights
    .replace(/\u2122/g, "(TM)")
    .replace(/\u00A9/g, "(C)")
    .replace(/\u00AE/g, "(R)")
    // Non-breaking & unicode spaces
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    // Strip emojis & unsupported Unicode codepoints > 0xFF
    .replace(/[^\x00-\xFF]/g, "");
}

// ── Color Utilities ───────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const clean = (hex || "#000000").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
  };
}

// ── Rotated Page Visual -> Intrinsic PDF Coordinate Mapping Helpers ──────────
function getPdfRectCoords(vx, vy, vw, vh, W, H, rot) {
  switch (rot) {
    case 90:
      return { x: vy, y: vx, width: vh, height: vw };
    case 180:
      return { x: W - vx - vw, y: vy, width: vw, height: vh };
    case 270:
      return { x: W - vy - vh, y: H - vx - vw, width: vh, height: vw };
    case 0:
    default:
      return { x: vx, y: H - vy - vh, width: vw, height: vh };
  }
}

function getPdfTextCoords(vx, vy, fontSize, W, H, rot) {
  const baselineOffset = fontSize * 0.82;
  const baseY = vy + baselineOffset;
  switch (rot) {
    case 90:
      return { x: baseY, y: vx, rotateAngle: 90 };
    case 180:
      return { x: W - vx, y: baseY, rotateAngle: 180 };
    case 270:
      return { x: W - baseY, y: H - vx, rotateAngle: 270 };
    case 0:
    default:
      return { x: vx, y: H - baseY, rotateAngle: 0 };
  }
}

function getPdfImageCoords(vx, vy, vw, vh, W, H, rot) {
  switch (rot) {
    case 90:
      return { x: vy + vh, y: vx, width: vw, height: vh, rotateAngle: 90 };
    case 180:
      return { x: W - vx, y: vy + vh, width: vw, height: vh, rotateAngle: 180 };
    case 270:
      return { x: W - vy - vh, y: H - vx, width: vw, height: vh, rotateAngle: 270 };
    case 0:
    default:
      return { x: vx, y: H - vy - vh, width: vw, height: vh, rotateAngle: 0 };
  }
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ── Text Width Pt Measurement Helper ──────────────────────────────────────────
function measureTextWidthPt(text, fontSize, cssFontStack, bold, italic) {
  if (!text) return 0;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontStyle = italic ? "italic " : "";
    const fontWeight = bold ? "bold " : "";
    ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${cssFontStack || "Helvetica, Arial, sans-serif"}`;
    return ctx.measureText(text).width;
  } catch {
    return text.length * fontSize * 0.6;
  }
}

// ── Soft-Wrap Word-Breaking Helper for Vector Export ──────────────────────────
function wrapTextToLines(text, maxWidthPt, fontObj, fontSize) {
  if (!text) return [];
  const paragraphs = text.split("\n");
  const resultLines = [];

  const getWidth = (str) => {
    try {
      if (fontObj && typeof fontObj.widthOfTextAtSize === "function") {
        return fontObj.widthOfTextAtSize(str, fontSize);
      }
    } catch {}
    return measureTextWidthPt(str, fontSize, "Helvetica, Arial, sans-serif", false, false);
  };

  for (const para of paragraphs) {
    if (!para.trim()) {
      resultLines.push("");
      continue;
    }
    const words = para.split(" ");
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + " " + word;
      if (getWidth(testLine) <= maxWidthPt) {
        currentLine = testLine;
      } else {
        resultLines.push(currentLine);
        currentLine = word;
      }
    }
    resultLines.push(currentLine);
  }

  return resultLines;
}

// ── Dynamic PDF Font & Metadata Introspection Engine ──────────────────────────
function introspectPdfFont(pdfPage, pdfDoc, item, stylesDict) {
  const tx = item.transform || [12, 0, 0, 12, 0, 0];
  // 1. Exact Euclidean font size from transform matrix [a, b, c, d, e, f]
  const rawSize = Math.hypot(tx[0], tx[1]) || Math.hypot(tx[2], tx[3]) || item.height || 12;
  const fontSize = Math.max(6, Math.min(72, Math.round(rawSize * 2) / 2));

  // 2. Extract real embedded font name from commonObjs (stripping ABCDEF+ subset tag)
  let rawFontName = "";
  let fontObj = null;
  try {
    if (pdfPage?.commonObjs && pdfPage.commonObjs.has(item.fontName)) {
      fontObj = pdfPage.commonObjs.get(item.fontName);
      rawFontName = fontObj?.name || "";
    } else if (pdfDoc?.commonObjs && pdfDoc.commonObjs.has(item.fontName)) {
      fontObj = pdfDoc.commonObjs.get(item.fontName);
      rawFontName = fontObj?.name || "";
    }
  } catch (_) {}

  const styleEntry = stylesDict?.[item.fontName] || {};
  const cleanName = rawFontName.replace(/^[A-Z]{6}\+/, "");
  const combinedDescriptor = `${cleanName} ${styleEntry.fontFamily || ""} ${item.fontName || ""}`.toLowerCase();

  // 3. Detect Bold & Italic from PostScript/TrueType tags, fontObj flags, and matrix shear
  const isBold = Boolean(
    fontObj?.bold ||
    fontObj?.black ||
    /bold|black|heavy|demi|semibold|extrabold|-bd|ps-bold/i.test(combinedDescriptor)
  );
  const shearRatio = Math.abs(tx[3]) > 0.01 ? Math.abs(tx[2] / tx[3]) : 0;
  const isItalic = Boolean(
    fontObj?.italic ||
    /italic|oblique|slanted|-it|ps-italic/i.test(combinedDescriptor) ||
    shearRatio > 0.16
  );

  // 4. Map to canonical PDF family & exact CSS rendering stack
  let fontFamily = "Helvetica";
  let cssFontStack = "Helvetica, Arial, sans-serif";
  const serifRegex = /times|georgia|garamond|cambria|palatino|minion|bookman|roman|serif/i;
  const monoRegex = /courier|consolas|menlo|monaco|monospace|mono|fira|jetbrains/i;

  if (serifRegex.test(cleanName)) {
    fontFamily = "Times-Roman";
    cssFontStack = "'Times New Roman', Times, Georgia, serif";
  } else if (monoRegex.test(cleanName)) {
    fontFamily = "Courier";
    cssFontStack = "'Courier New', Courier, monospace";
  } else if (serifRegex.test(combinedDescriptor) && !/sans/i.test(combinedDescriptor)) {
    fontFamily = "Times-Roman";
    cssFontStack = "'Times New Roman', Times, Georgia, serif";
  } else if (monoRegex.test(combinedDescriptor)) {
    fontFamily = "Courier";
    cssFontStack = "'Courier New', Courier, monospace";
  }

  return {
    fontSize,
    fontFamily,
    cssFontStack,
    bold: isBold,
    italic: isItalic,
    detectedFontLabel: cleanName || fontFamily,
  };
}

// ── High-DPI Canvas Sampling with Black Patch Guard ───────────────────────────
function sampleBackgroundColor(canvas, bbox) {
  if (!canvas) return "#FFFFFF";
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#FFFFFF";

    const scaleX = canvas.width / (canvas.clientWidth || canvas.width);
    const scaleY = canvas.height / (canvas.clientHeight || canvas.height);

    // Sample points 2px outside the perimeter to prevent hitting text glyph edges
    const points = [
      { x: (bbox.left - 2) * scaleX, y: (bbox.top - 2) * scaleY },
      { x: (bbox.left - 2) * scaleX, y: (bbox.bottom + 2) * scaleY },
      { x: (bbox.right + 2) * scaleX, y: (bbox.top - 2) * scaleY },
      { x: (bbox.right + 2) * scaleX, y: (bbox.bottom + 2) * scaleY },
    ];

    for (const pt of points) {
      const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(pt.x)));
      const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(pt.y)));
      const pixel = ctx.getImageData(sx, sy, 1, 1).data;
      const [r, g, b, a] = pixel;

      // Guard: Must be opaque and not dark (r, g, b >= 180).
      // Dark/transparent indicates text glyph edge or shadow.
      if (a >= 200 && (r >= 180 || g >= 180 || b >= 180)) {
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      }
    }
    return "#FFFFFF";
  } catch (err) {
    return "#FFFFFF";
  }
}

// ── White Background Remover for Signature Uploads ───────────────────────────
function removeWhiteBackground(imgElement) {
  const canvas = document.createElement("canvas");
  canvas.width = imgElement.naturalWidth || imgElement.width;
  canvas.height = imgElement.naturalHeight || imgElement.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imgElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 200 && g > 200 && b > 200) {
      data[i + 3] = 0; // Alpha 0
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ── Type Signature / Stamp to PNG Generator ──────────────────────────────────
function textToImage(text, fontStr, color, padding = 12, isStamp = false) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = fontStr;
  const metrics = ctx.measureText(text);
  const width = Math.max(metrics.width + padding * 2, 60);
  const height = Math.max(
    (metrics.actualBoundingBoxAscent || 24) + (metrics.actualBoundingBoxDescent || 8) + padding * 2,
    45
  );

  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);

  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  if (isStamp) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  }

  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

// ── Main PDFEditor Component ─────────────────────────────────────────────────
export default function PDFEditor({ auth }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode: "edit" | "sign" | "organize"
  const urlMode = searchParams.get("mode");
  const [mode, setMode] = useState(urlMode === "sign" || urlMode === "organize" ? urlMode : "edit");

  // Keep search params in sync when user switches tabs
  const handleModeChange = (newMode) => {
    setMode(newMode);
    setSearchParams({ mode: newMode });
  };

  // State Machine
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState("idle"); // idle | loading | ready | exporting | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);

  // Multi-Doc Architecture: Keeps Uint8Array intact from WebWorker detachment
  const sourceDocsRef = useRef([]); // [{ docId, bytes: Uint8Array, pdfJsDoc, name }]

  // Immutable pageId descriptors
  const [pages, setPages] = useState([]); // [{ pageId, sourceDocIndex, originalPageIndex, rotation, baseRotation, isBlank, width, height, thumbUrl }]
  const [selectedPageId, setSelectedPageId] = useState(null);

  // Annotations & History (Locked to pageId)
  const [annotations, setAnnotations] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  // Viewport & Zoom
  const [zoom, setZoom] = useState(1.0); // 0.75, 1.0, 1.25, 1.5
  const [visiblePageIds, setVisiblePageIds] = useState(new Set());

  // Edit Mode Active Tool
  const [activeTool, setActiveTool] = useState("select"); // select | text | whiteout | highlight | shape
  const [textStyle, setTextStyle] = useState({
    fontSize: 14,
    fontFamily: "Helvetica",
    color: "#0f172a",
    bold: false,
    italic: false,
  });
  const [highlightColor, setHighlightColor] = useState("#fef08a"); // Light yellow
  const [shapeFill, setShapeFill] = useState("#3b82f6");

  // Sign & Stamp Modal State
  const [showSignModal, setShowSignModal] = useState(false);
  const [signTab, setSignTab] = useState("draw"); // draw | type | upload
  const [penColor, setPenColor] = useState("#0f172a");
  const [penWidth, setPenWidth] = useState(3.5);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typeText, setTypeText] = useState("");
  const [typeFont, setTypeFont] = useState("40px 'Caveat', cursive");
  const [uploadImg, setUploadImg] = useState(null);
  const [removeBg, setRemoveBg] = useState(true);

  // Canvas Refs & Append Ref
  const drawCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const drawLastPtRef = useRef(null);
  const drawLastMidRef = useRef(null);
  const fileInputRef = useRef(null);
  const appendInputRef = useRef(null);

  // Export Results
  const [exportBlob, setExportBlob] = useState(null);
  const [exportFileName, setExportFileName] = useState("");

  // Load cursive fonts for signature typing tab
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Dancing+Script:wght@700&family=Great+Vibes&family=Sacramento&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  // Check for pending clipboard file on mount
  useEffect(() => {
    const pending = consumePendingFile();
    if (pending && (pending.type === "application/pdf" || pending.name?.endsWith(".pdf"))) {
      handleInitialFile(pending);
    }
  }, []);

  // ── Undo / Redo Management ─────────────────────────────────────────────────
  const pushHistoryState = useCallback((newAnnotations) => {
    setUndoStack((prev) => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(newAnnotations);
  }, [annotations]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, annotations]);
    setAnnotations(prev);
    setSelectedAnnotationId(null);
  }, [undoStack, annotations]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, annotations]);
    setAnnotations(next);
    setSelectedAnnotationId(null);
  }, [redoStack, annotations]);

  // Keyboard shortcut listener (Ctrl+Z, Ctrl+Y, Delete)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotationId) {
          e.preventDefault();
          pushHistoryState(annotations.filter((a) => a.id !== selectedAnnotationId));
          setSelectedAnnotationId(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo, selectedAnnotationId, annotations, pushHistoryState]);

  // ── Document Loading (Dropzone First) ──────────────────────────────────────
  const handleInitialFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name?.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Please upload a valid PDF file.");
      setStage("error");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB}MB limit.`);
      setStage("error");
      return;
    }

    setFile(f);
    setErrorMsg("");
    setStage("loading");
    setProgressMsg("Parsing document structure...");

    try {
      const buffer = await f.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const pdfjsLib = await loadPdfJs();
      // Detached ArrayBuffer Prevention: Pass a slice/copy to pdf.js WebWorker
      const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;

      sourceDocsRef.current = [
        {
          docId: 0,
          bytes, // Preserved untouched for pdf-lib export
          pdfJsDoc,
          name: f.name,
        },
      ];

      const pageDescriptors = [];
      const numPages = pdfJsDoc.numPages;

      for (let i = 1; i <= numPages; i++) {
        setProgressMsg(`Generating thumbnail ${i} of ${numPages}...`);
        const p = await pdfJsDoc.getPage(i);
        const unrotatedVp = p.getViewport({ scale: 1.0, rotation: 0 });
        const thumbVp = p.getViewport({ scale: 0.35 });

        // Generate thumbnail
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = Math.floor(thumbVp.width);
        thumbCanvas.height = Math.floor(thumbVp.height);
        const ctx = thumbCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        await p.render({ canvasContext: ctx, viewport: thumbVp }).promise;

        pageDescriptors.push({
          pageId: crypto.randomUUID(),
          sourceDocIndex: 0,
          originalPageIndex: i - 1,
          rotation: 0,
          baseRotation: p.rotate || 0,
          isBlank: false,
          width: unrotatedVp.width,
          height: unrotatedVp.height,
          thumbUrl: thumbCanvas.toDataURL("image/jpeg", 0.7),
        });
      }

      setPages(pageDescriptors);
      setSelectedPageId(pageDescriptors[0]?.pageId || null);
      setAnnotations([]);
      setUndoStack([]);
      setRedoStack([]);
      setStage("ready");
      setProgressMsg("");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load PDF: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  // ── Append / Merge Another PDF ─────────────────────────────────────────────
  const handleAppendFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name?.toLowerCase().endsWith(".pdf")) {
      alert("Only PDF files can be appended.");
      return;
    }

    try {
      const buffer = await f.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const pdfjsLib = await loadPdfJs();
      const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;

      const newDocId = sourceDocsRef.current.length;
      sourceDocsRef.current.push({
        docId: newDocId,
        bytes,
        pdfJsDoc,
        name: f.name,
      });

      const appendedPages = [];
      for (let i = 1; i <= pdfJsDoc.numPages; i++) {
        const p = await pdfJsDoc.getPage(i);
        const unrotatedVp = p.getViewport({ scale: 1.0, rotation: 0 });
        const thumbVp = p.getViewport({ scale: 0.35 });

        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = Math.floor(thumbVp.width);
        thumbCanvas.height = Math.floor(thumbVp.height);
        const ctx = thumbCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        await p.render({ canvasContext: ctx, viewport: thumbVp }).promise;

        appendedPages.push({
          pageId: crypto.randomUUID(),
          sourceDocIndex: newDocId,
          originalPageIndex: i - 1,
          rotation: 0,
          baseRotation: p.rotate || 0,
          isBlank: false,
          width: unrotatedVp.width,
          height: unrotatedVp.height,
          thumbUrl: thumbCanvas.toDataURL("image/jpeg", 0.7),
        });
      }

      setPages((prev) => [...prev, ...appendedPages]);
    } catch (err) {
      alert("Failed to append PDF: " + err.message);
    }
    e.target.value = "";
  };

  // ── Insert Blank A4 Page ───────────────────────────────────────────────────
  const handleInsertBlankPage = (afterIndex) => {
    const blankPage = {
      pageId: crypto.randomUUID(),
      sourceDocIndex: -1,
      originalPageIndex: -1,
      rotation: 0,
      baseRotation: 0,
      isBlank: true,
      width: 595.28, // A4 unrotated pt
      height: 841.89,
      thumbUrl: "",
    };

    setPages((prev) => {
      const copy = [...prev];
      const insertAt = afterIndex !== undefined && afterIndex >= 0 ? afterIndex + 1 : copy.length;
      copy.splice(insertAt, 0, blankPage);
      return copy;
    });
  };

  // ── Page Actions in Organize Mode ──────────────────────────────────────────
  const handleRotatePage = (pageId, deltaDeg) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.pageId === pageId) {
          const newRot = (p.rotation + deltaDeg + 360) % 360;
          return { ...p, rotation: newRot };
        }
        return p;
      })
    );
  };

  const handleRotateAll = (deltaDeg) => {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        rotation: (p.rotation + deltaDeg + 360) % 360,
      }))
    );
  };

  const handleDeletePage = (pageId) => {
    if (pages.length <= 1) {
      alert("A document must retain at least one page.");
      return;
    }
    setPages((prev) => prev.filter((p) => p.pageId !== pageId));
    // Remove annotations for deleted page
    setAnnotations((prev) => prev.filter((a) => a.pageId !== pageId));
    if (selectedPageId === pageId) {
      const remaining = pages.filter((p) => p.pageId !== pageId);
      setSelectedPageId(remaining[0]?.pageId || null);
    }
  };

  const handleDuplicatePage = (pageId) => {
    const idx = pages.findIndex((p) => p.pageId === pageId);
    if (idx === -1) return;
    const target = pages[idx];
    const newId = crypto.randomUUID();

    const clone = {
      ...target,
      pageId: newId,
    };

    // Duplicate annotations on that page with new IDs
    const clonedAnnotations = annotations
      .filter((a) => a.pageId === pageId)
      .map((a) => ({
        ...a,
        id: crypto.randomUUID(),
        pageId: newId,
      }));

    setPages((prev) => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, clone);
      return copy;
    });

    if (clonedAnnotations.length > 0) {
      pushHistoryState([...annotations, ...clonedAnnotations]);
    }
  };

  // ── Drag & Drop Page Reordering ───────────────────────────────────────────
  const [draggedPageIdx, setDraggedPageIdx] = useState(null);

  const handlePageDragStart = (e, index) => {
    setDraggedPageIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handlePageDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handlePageDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedPageIdx === null || draggedPageIdx === targetIdx) return;
    setPages((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(draggedPageIdx, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
    setDraggedPageIdx(null);
  };

  // ── Add Annotation Helper ─────────────────────────────────────────────────
  const addAnnotation = useCallback(
    (annData) => {
      const newAnn = {
        id: crypto.randomUUID(),
        pageId: selectedPageId || pages[0]?.pageId,
        ...annData,
      };
      pushHistoryState([...annotations, newAnn]);
      setSelectedAnnotationId(newAnn.id);
    },
    [annotations, selectedPageId, pages, pushHistoryState]
  );

  const updateAnnotation = useCallback(
    (id, changes) => {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...changes } : a))
      );
    },
    []
  );

  const deleteAnnotation = useCallback(
    (id) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      setSelectedAnnotationId((curr) => (curr === id ? null : curr));
    },
    []
  );

  // ── Signature Creation Modal Confirm ──────────────────────────────────────
  const handleConfirmSignature = () => {
    if (signTab === "draw") {
      if (!hasDrawn || !drawCanvasRef.current) return;
      const canvas = drawCanvasRef.current;
      const ctx = canvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const l = pixels.data.length;
      let bound = { top: null, left: null, right: null, bottom: null };

      for (let i = 0; i < l; i += 4) {
        if (pixels.data[i + 3] !== 0) {
          const x = (i / 4) % canvas.width;
          const y = Math.floor(i / 4 / canvas.width);
          if (bound.top === null) bound.top = y;
          if (bound.left === null || x < bound.left) bound.left = x;
          if (bound.right === null || x > bound.right) bound.right = x;
          if (bound.bottom === null || y > bound.bottom) bound.bottom = y;
        }
      }

      let dataUrl = "";
      if (bound.top !== null) {
        const pad = 10;
        const trimCanvas = document.createElement("canvas");
        trimCanvas.width = bound.right - bound.left + pad * 2;
        trimCanvas.height = bound.bottom - bound.top + pad * 2;
        const trimCtx = trimCanvas.getContext("2d");
        trimCtx.putImageData(
          ctx.getImageData(bound.left, bound.top, trimCanvas.width - pad * 2, trimCanvas.height - pad * 2),
          pad,
          pad
        );
        dataUrl = trimCanvas.toDataURL("image/png");
      } else {
        dataUrl = canvas.toDataURL("image/png");
      }

      addAnnotation({
        type: "sign",
        dataUrl,
        x: 60,
        y: 80,
        width: 140,
        height: 60,
      });
      setShowSignModal(false);
      setHasDrawn(false);
    } else if (signTab === "type") {
      if (!typeText.trim()) return;
      const dataUrl = textToImage(typeText, typeFont, penColor);
      addAnnotation({
        type: "sign",
        dataUrl,
        x: 60,
        y: 80,
        width: 160,
        height: 60,
      });
      setShowSignModal(false);
      setTypeText("");
    } else if (signTab === "upload") {
      if (!uploadImg) return;
      const img = new Image();
      img.onload = () => {
        const finalUrl = removeBg ? removeWhiteBackground(img) : uploadImg;
        addAnnotation({
          type: "sign",
          dataUrl: finalUrl,
          x: 60,
          y: 80,
          width: 150,
          height: (150 / img.width) * img.height || 60,
        });
        setShowSignModal(false);
        setUploadImg(null);
      };
      img.src = uploadImg;
    }
  };

  // ── Quick Stamps ──────────────────────────────────────────────────────────
  const handleAddStamp = (text, color) => {
    const dataUrl = textToImage(text, "bold 28px 'Roboto', sans-serif", color, 14, true);
    addAnnotation({
      type: "stamp",
      dataUrl,
      x: 70,
      y: 90,
      width: 150,
      height: 50,
    });
  };

  const handleAddDateStamp = () => {
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const dataUrl = textToImage(dateStr, "bold 22px 'Roboto', sans-serif", "#1e3a8a", 10, true);
    addAnnotation({
      type: "stamp",
      dataUrl,
      x: 70,
      y: 90,
      width: 140,
      height: 40,
    });
  };

  // ── Single-Pass pdf-lib Vector Export Pipeline ─────────────────────────────
  const exportPDF = async () => {
    if (pages.length === 0 || sourceDocsRef.current.length === 0) return;

    setStage("exporting");
    setProgressMsg("Compiling 100% Vector PDF with native text & annotations...");

    try {
      const newDoc = await PDFDocument.create();

      // Load all source documents into pdf-lib cleanly (prevent detached array buffer)
      const loadedPdfDocs = await Promise.all(
        sourceDocsRef.current.map((doc) => PDFDocument.load(doc.bytes.slice(0)))
      );

      // Embed all 12 Standard Fonts variants for text annotations
      const [
        fontHelvetica,
        fontHelveticaBold,
        fontHelveticaOblique,
        fontHelveticaBoldOblique,
        fontTimesRoman,
        fontTimesRomanBold,
        fontTimesRomanItalic,
        fontTimesRomanBoldItalic,
        fontCourier,
        fontCourierBold,
        fontCourierOblique,
        fontCourierBoldOblique,
      ] = await Promise.all([
        newDoc.embedFont(StandardFonts.Helvetica),
        newDoc.embedFont(StandardFonts.HelveticaBold),
        newDoc.embedFont(StandardFonts.HelveticaOblique),
        newDoc.embedFont(StandardFonts.HelveticaBoldOblique),
        newDoc.embedFont(StandardFonts.TimesRoman),
        newDoc.embedFont(StandardFonts.TimesRomanBold),
        newDoc.embedFont(StandardFonts.TimesRomanItalic),
        newDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
        newDoc.embedFont(StandardFonts.Courier),
        newDoc.embedFont(StandardFonts.CourierBold),
        newDoc.embedFont(StandardFonts.CourierOblique),
        newDoc.embedFont(StandardFonts.CourierBoldOblique),
      ]);

      const getExportFont = (fontFamily, bold, italic) => {
        const fam = (fontFamily || "").toLowerCase();
        if (fam.includes("times")) {
          if (bold && italic) return fontTimesRomanBoldItalic;
          if (bold) return fontTimesRomanBold;
          if (italic) return fontTimesRomanItalic;
          return fontTimesRoman;
        } else if (fam.includes("courier")) {
          if (bold && italic) return fontCourierBoldOblique;
          if (bold) return fontCourierBold;
          if (italic) return fontCourierOblique;
          return fontCourier;
        } else {
          // Default: Helvetica
          if (bold && italic) return fontHelveticaBoldOblique;
          if (bold) return fontHelveticaBold;
          if (italic) return fontHelveticaOblique;
          return fontHelvetica;
        }
      };

      for (let i = 0; i < pages.length; i++) {
        setProgressMsg(`Writing vector page ${i + 1} of ${pages.length}...`);
        const pageDesc = pages[i];
        let newPage = null;

        if (pageDesc.isBlank) {
          newPage = newDoc.addPage([pageDesc.width, pageDesc.height]);
        } else {
          const srcDoc = loadedPdfDocs[pageDesc.sourceDocIndex];
          const [copied] = await newDoc.copyPages(srcDoc, [pageDesc.originalPageIndex]);
          newPage = newDoc.addPage(copied);
        }

        const totalRotation = (pageDesc.baseRotation + pageDesc.rotation + 360) % 360;
        if (totalRotation !== 0) {
          newPage.setRotation(degrees(totalRotation));
        }

        const pageW = pageDesc.width;
        const pageH = pageDesc.height;
        const pageAnnotations = annotations.filter((a) => a.pageId === pageDesc.pageId);

        // 1. Draw Whiteout Patches, Base Drift-Guards & Text Backgrounds First
        for (const ann of pageAnnotations) {
          // 1a. Base whiteout mask at original position (prevents reveal on drag)
          if (ann.origX !== undefined && ann.origY !== undefined && ann.origWidth && ann.origHeight) {
            const rgbColor = hexToRgb(ann.fillColor || "#ffffff");
            const baseCoords = getPdfRectCoords(ann.origX, ann.origY, ann.origWidth, ann.origHeight, pageW, pageH, totalRotation);
            newPage.drawRectangle({
              x: baseCoords.x,
              y: baseCoords.y,
              width: baseCoords.width,
              height: baseCoords.height,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              opacity: 1,
            });
          }

          // 1b. Patch or unified text background mask at current position
          if (
            ann.type === "patch" ||
            ann.type === "whiteout" ||
            (ann.type === "text" && ann.fillColor)
          ) {
            const effectiveW = ann.origWidth ? Math.max(ann.origWidth, ann.width || 0) : (ann.width || 0);
            const effectiveH = ann.origHeight ? Math.max(ann.origHeight, ann.height || 0) : (ann.height || 0);
            const rgbColor = hexToRgb(ann.fillColor || "#ffffff");
            const coords = getPdfRectCoords(ann.x, ann.y, effectiveW, effectiveH, pageW, pageH, totalRotation);
            newPage.drawRectangle({
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              opacity: 1,
            });
          }
        }

        // 2. Draw Highlights & Shapes
        for (const ann of pageAnnotations) {
          if (ann.type === "highlight") {
            const rgbColor = hexToRgb(ann.fillColor || "#fef08a");
            const coords = getPdfRectCoords(ann.x, ann.y, ann.width, ann.height, pageW, pageH, totalRotation);
            newPage.drawRectangle({
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              opacity: ann.opacity !== undefined ? ann.opacity : 0.35,
            });
          } else if (ann.type === "shape") {
            const rgbColor = hexToRgb(ann.fillColor || "#3b82f6");
            const strokeColor = hexToRgb(ann.strokeColor || "#1d4ed8");
            const coords = getPdfRectCoords(ann.x, ann.y, ann.width, ann.height, pageW, pageH, totalRotation);
            newPage.drawRectangle({
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height,
              color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
              borderColor: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              borderWidth: ann.strokeWidth || 1.5,
              opacity: ann.opacity || 1,
            });
          }
        }

        // 3. Draw Vector Text (with WinAnsi Sanitizer, Multi-Line Wrap & Rotation mapping)
        for (const ann of pageAnnotations) {
          if (ann.type === "text" && ann.text) {
            const safeText = sanitizeToWinAnsi(ann.text);
            const chosenFont = getExportFont(ann.fontFamily, ann.bold, ann.italic);
            const rgbColor = hexToRgb(ann.color || "#0f172a");
            const fontSize = ann.fontSize || 14;
            const textX = ann.fillColor ? ann.x + 3 : ann.x;
            const textY = ann.fillColor ? ann.y + 2 : ann.y;

            const effectiveW = ann.origWidth ? Math.max(ann.origWidth, ann.width || 0) : (ann.width || 0);
            const maxWidthPt = Math.max(30, effectiveW - 6);
            const lines = wrapTextToLines(safeText, maxWidthPt, chosenFont, fontSize);
            const lineSpacing = fontSize * 1.25;

            lines.forEach((lineStr, lineIdx) => {
              if (!lineStr || !lineStr.trim()) return;
              const lineX = textX;
              const lineY = textY + (lineIdx * lineSpacing);
              const textCoords = getPdfTextCoords(lineX, lineY, fontSize, pageW, pageH, totalRotation);

              newPage.drawText(lineStr, {
                x: textCoords.x,
                y: textCoords.y,
                size: fontSize,
                font: chosenFont,
                color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
                rotate: degrees(textCoords.rotateAngle),
              });
            });
          }
        }

        // 4. Draw Embedded Signatures & Stamps
        for (const ann of pageAnnotations) {
          if ((ann.type === "sign" || ann.type === "stamp") && ann.dataUrl) {
            try {
              const imgBytes = await fetch(ann.dataUrl).then((r) => r.arrayBuffer());
              const embedded = await newDoc.embedPng(imgBytes);
              const imgCoords = getPdfImageCoords(ann.x, ann.y, ann.width, ann.height, pageW, pageH, totalRotation);
              newPage.drawImage(embedded, {
                x: imgCoords.x,
                y: imgCoords.y,
                width: imgCoords.width,
                height: imgCoords.height,
                rotate: degrees(imgCoords.rotateAngle),
              });
            } catch (embedErr) {
              console.warn("Failed to embed signature/stamp:", embedErr);
            }
          }
        }
      }

      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const outName = (file?.name?.replace(/\.[^.]+$/, "") || "document") + "_edited.pdf";

      setExportBlob(blob);
      setExportFileName(outName);

      // Save to local IndexedDB History
      try {
        await addHistoryRecord({
          tool: "PDF Studio",
          fileName: outName,
          origSize: file?.size || 0,
          newSize: blob.size,
          blob,
          mimeType: "application/pdf",
        });
      } catch (histErr) {
        console.warn("Could not save to historyDB:", histErr);
      }

      setStage("done");
      setProgressMsg("");
    } catch (err) {
      console.error("Export failed:", err);
      setErrorMsg("Export failed: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const handleReset = () => {
    setFile(null);
    setPages([]);
    setAnnotations([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedPageId(null);
    setSelectedAnnotationId(null);
    setExportBlob(null);
    setExportFileName("");
    setStage("idle");
    setProgressMsg("");
    setErrorMsg("");
    sourceDocsRef.current = [];
  };

  // ── Render Helpers ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface flex flex-col font-sans select-none">
      {/* ── Top App Bar ── */}
      <header className="sticky top-0 z-40 bg-m3-surface/90 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/40 transition active:scale-95"
            title="Return Home"
          >
            <span>←</span>
            <span>Home</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <span className="font-display font-bold text-base hidden sm:inline">
              PDF Studio & Editor
            </span>
          </div>
          {file && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant font-mono truncate max-w-[140px] sm:max-w-[200px]">
              {file.name}
            </span>
          )}
        </div>

        {/* ── Mode Switcher Bar ── */}
        {file && (
          <div className="flex items-center bg-m3-surface-container-lowest dark:bg-m3-surface-container p-1 rounded-full border border-m3-outline-variant/40 shadow-sm">
            <button
              onClick={() => handleModeChange("edit")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                mode === "edit"
                  ? "bg-m3-primary text-m3-on-primary shadow-sm"
                  : "text-m3-on-surface-variant hover:text-m3-on-surface"
              }`}
            >
              ✏️ Edit & Annotate
            </button>
            <button
              onClick={() => handleModeChange("sign")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                mode === "sign"
                  ? "bg-m3-primary text-m3-on-primary shadow-sm"
                  : "text-m3-on-surface-variant hover:text-m3-on-surface"
              }`}
            >
              ✍️ Sign & Stamp
            </button>
            <button
              onClick={() => handleModeChange("organize")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                mode === "organize"
                  ? "bg-m3-primary text-m3-on-primary shadow-sm"
                  : "text-m3-on-surface-variant hover:text-m3-on-surface"
              }`}
            >
              📑 Organize Pages ({pages.length})
            </button>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="flex items-center gap-2">
          {file && (
            <>
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="p-1.5 rounded-full hover:bg-m3-surface-container-high disabled:opacity-30 transition"
                title="Undo (Ctrl+Z)"
              >
                ↩️
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="p-1.5 rounded-full hover:bg-m3-surface-container-high disabled:opacity-30 transition"
                title="Redo (Ctrl+Y)"
              >
                ↪️
              </button>
              <button
                onClick={exportPDF}
                disabled={stage === "exporting"}
                className="px-4 py-1.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-xs shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-95 transition flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>{stage === "exporting" ? "Exporting..." : "Export PDF"}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Secondary Toolbar (Mode A & B) ── */}
      {file && mode !== "organize" && (
        <div className="bg-m3-surface-container-low border-b border-m3-outline-variant/30 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
          {/* Tools for Edit Mode */}
          {mode === "edit" && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveTool("select")}
                className={`px-2.5 py-1 rounded-md border font-medium ${
                  activeTool === "select"
                    ? "bg-m3-primary/10 border-m3-primary text-m3-primary"
                    : "border-transparent hover:bg-m3-surface-container-high"
                }`}
              >
                👆 Select / Move
              </button>
              <button
                onClick={() => setActiveTool("text")}
                className={`px-2.5 py-1 rounded-md border font-medium ${
                  activeTool === "text"
                    ? "bg-m3-primary/10 border-m3-primary text-m3-primary"
                    : "border-transparent hover:bg-m3-surface-container-high"
                }`}
              >
                ✏️ Edit / Add Text
              </button>
              <button
                onClick={() => setActiveTool("whiteout")}
                className={`px-2.5 py-1 rounded-md border font-medium ${
                  activeTool === "whiteout"
                    ? "bg-m3-primary/10 border-m3-primary text-m3-primary"
                    : "border-transparent hover:bg-m3-surface-container-high"
                }`}
              >
                ⬜ Whiteout Redact
              </button>
              <button
                onClick={() => setActiveTool("highlight")}
                className={`px-2.5 py-1 rounded-md border font-medium ${
                  activeTool === "highlight"
                    ? "bg-m3-primary/10 border-m3-primary text-m3-primary"
                    : "border-transparent hover:bg-m3-surface-container-high"
                }`}
              >
                🖍️ Highlight
              </button>
              <button
                onClick={() => setActiveTool("shape")}
                className={`px-2.5 py-1 rounded-md border font-medium ${
                  activeTool === "shape"
                    ? "bg-m3-primary/10 border-m3-primary text-m3-primary"
                    : "border-transparent hover:bg-m3-surface-container-high"
                }`}
              >
                🔲 Box Shape
              </button>

              {/* Formatting Controls */}
              {activeTool === "text" && (
                <div className="flex items-center gap-2 pl-3 ml-2 border-l border-m3-outline-variant/40">
                  <select
                    value={textStyle.fontFamily}
                    onChange={(e) => setTextStyle({ ...textStyle, fontFamily: e.target.value })}
                    className="bg-m3-surface-container px-2 py-0.5 rounded border border-m3-outline-variant/40 text-xs"
                  >
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times-Roman">Times New Roman</option>
                    <option value="Courier">Courier Monospace</option>
                  </select>
                  <select
                    value={textStyle.fontSize}
                    onChange={(e) => setTextStyle({ ...textStyle, fontSize: Number(e.target.value) })}
                    className="bg-m3-surface-container px-2 py-0.5 rounded border border-m3-outline-variant/40 text-xs"
                  >
                    {[10, 12, 14, 16, 18, 24, 32].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz} pt
                      </option>
                    ))}
                  </select>
                  <input
                    type="color"
                    value={textStyle.color}
                    onChange={(e) => setTextStyle({ ...textStyle, color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    title="Text Color"
                  />
                  <button
                    onClick={() => setTextStyle({ ...textStyle, bold: !textStyle.bold })}
                    className={`px-2 py-0.5 rounded font-bold border ${
                      textStyle.bold ? "bg-m3-primary text-m3-on-primary" : "border-m3-outline-variant/40"
                    }`}
                  >
                    B
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tools for Sign Mode */}
          {mode === "sign" && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowSignModal(true)}
                className="px-3 py-1 rounded-full bg-m3-primary text-m3-on-primary font-semibold shadow-sm hover:scale-105 active:scale-95 transition flex items-center gap-1"
              >
                <span>➕</span>
                <span>Create Signature</span>
              </button>
              <div className="h-4 w-px bg-m3-outline-variant/40 mx-1"></div>
              <span className="text-m3-on-surface-variant font-medium">Quick Stamps:</span>
              <button
                onClick={() => handleAddStamp("APPROVED", "#16a34a")}
                className="px-2 py-0.5 rounded border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                APPROVED
              </button>
              <button
                onClick={() => handleAddStamp("CONFIDENTIAL", "#dc2626")}
                className="px-2 py-0.5 rounded border border-red-500 text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                CONFIDENTIAL
              </button>
              <button
                onClick={() => handleAddStamp("VERIFIED", "#2563eb")}
                className="px-2 py-0.5 rounded border border-blue-500 text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                VERIFIED
              </button>
              <button
                onClick={handleAddDateStamp}
                className="px-2 py-0.5 rounded border border-indigo-500 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
              >
                📅 Date Stamp
              </button>
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="p-1 rounded hover:bg-m3-surface-container-high"
              title="Zoom Out"
            >
              🔍-
            </button>
            <span className="font-mono text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, z + 0.25))}
              className="p-1 rounded hover:bg-m3-surface-container-high"
              title="Zoom In"
            >
              🔍+
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="px-2 py-0.5 rounded bg-m3-surface-container hover:bg-m3-surface-container-high text-xs"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ── Main Work Area ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* ── Initial Dropzone (0% CPU/RAM Overhead) ── */}
        {!file && (
          <div className="w-full max-w-3xl flex flex-col items-center gap-8 py-8 animate-fadeIn">
            <div className="text-center space-y-3">
              <div className="inline-flex p-4 rounded-3xl bg-m3-primary/10 text-m3-primary text-4xl shadow-inner">
                ✍️
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-m3-on-surface tracking-tight">
                PDF Studio, E-Sign & Page Organizer
              </h1>
              <p className="text-m3-on-surface-variant text-sm sm:text-base max-w-xl mx-auto">
                100% In-Browser Vector PDF editing. Edit text without rasterization, sign with smooth Bezier curves, add stamps, reorder, rotate, and merge pages with zero server upload.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.[0]) handleInitialFile(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ${
                dragging
                  ? "border-m3-primary bg-m3-primary/10 scale-[1.01]"
                  : "border-m3-outline-variant/70 hover:border-m3-primary/60 bg-m3-surface-container-low hover:bg-m3-surface-container"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleInitialFile(e.target.files[0]);
                }}
              />
              <div className="w-16 h-16 rounded-2xl bg-m3-primary/10 flex items-center justify-center text-3xl text-m3-primary">
                📄
              </div>
              <div className="text-center">
                <span className="font-semibold text-m3-on-surface text-base">
                  Choose a PDF document or drop it here
                </span>
                <p className="text-xs text-m3-on-surface-variant mt-1">
                  Supports up to {MAX_SIZE_MB}MB · 100% private & client-side
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="w-full p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 text-sm text-center">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* ── Progress Banner ── */}
        {stage === "loading" && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-10 h-10 border-4 border-m3-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-semibold text-m3-on-surface">{progressMsg}</span>
          </div>
        )}

        {/* ── Mode A & B: Virtualized PDF Viewport ── */}
        {file && mode !== "organize" && (
          <div className="w-full flex flex-col items-center gap-8 py-4">
            {pages.map((p, idx) => {
              const totalRot = (p.baseRotation + p.rotation + 360) % 360;
              const isRotated90or270 = totalRot === 90 || totalRot === 270;
              const visualWidth = (isRotated90or270 ? p.height : p.width) * zoom;
              const visualHeight = (isRotated90or270 ? p.width : p.height) * zoom;

              return (
                <PDFPageView
                  key={p.pageId}
                  pageDesc={p}
                  pageIndex={idx}
                  zoom={zoom}
                  visualWidth={visualWidth}
                  visualHeight={visualHeight}
                  sourceDocs={sourceDocsRef.current}
                  annotations={annotations.filter((a) => a.pageId === p.pageId)}
                  activeTool={activeTool}
                  textStyle={textStyle}
                  highlightColor={highlightColor}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onAddAnnotation={addAnnotation}
                  onUpdateAnnotation={updateAnnotation}
                  onDeleteAnnotation={deleteAnnotation}
                  onSelectPage={() => setSelectedPageId(p.pageId)}
                  isSelectedPage={selectedPageId === p.pageId}
                />
              );
            })}
          </div>
        )}

        {/* ── Mode C: Organize Pages (Full-Width Thumbnail Grid) ── */}
        {file && mode === "organize" && (
          <div className="w-full max-w-6xl flex flex-col gap-6 py-4 animate-fadeIn">
            {/* Action Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3 bg-m3-surface-container-low p-4 rounded-2xl border border-m3-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Organize & Manage Pages</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-m3-primary/10 text-m3-primary font-semibold">
                  {pages.length} Pages
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleRotateAll(-90)}
                  className="px-3 py-1.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold transition"
                >
                  ↺ Rotate All -90°
                </button>
                <button
                  onClick={() => handleRotateAll(90)}
                  className="px-3 py-1.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold transition"
                >
                  ↻ Rotate All +90°
                </button>
                <button
                  onClick={() => handleInsertBlankPage(pages.length - 1)}
                  className="px-3 py-1.5 rounded-full bg-m3-surface-container hover:bg-m3-surface-container-high text-xs font-semibold transition flex items-center gap-1"
                >
                  <span>📄+</span>
                  <span>Insert Blank Page</span>
                </button>
                <button
                  onClick={() => appendInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-full bg-m3-primary text-m3-on-primary text-xs font-semibold shadow-sm hover:scale-105 active:scale-95 transition flex items-center gap-1.5"
                >
                  <span>📎</span>
                  <span>Append Another PDF</span>
                </button>
                <input
                  ref={appendInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleAppendFile}
                />
              </div>
            </div>

            {/* Thumbnail Drag & Drop Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {pages.map((p, idx) => (
                <div
                  key={p.pageId}
                  draggable
                  onDragStart={(e) => handlePageDragStart(e, idx)}
                  onDragOver={(e) => handlePageDragOver(e, idx)}
                  onDrop={(e) => handlePageDrop(e, idx)}
                  className="group relative flex flex-col rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/40 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {/* Top Bar on Card */}
                  <div className="p-2 bg-m3-surface-container-high/60 flex items-center justify-between text-[11px] font-semibold text-m3-on-surface-variant">
                    <span>Page {idx + 1}</span>
                    {p.rotation !== 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-m3-primary/10 text-m3-primary">
                        {p.rotation}°
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Image View */}
                  <div className="p-3 flex items-center justify-center min-h-[160px] bg-m3-surface-container-lowest dark:bg-black/20">
                    {p.isBlank ? (
                      <div className="w-24 h-32 border border-dashed border-m3-outline-variant flex flex-col items-center justify-center text-xs text-m3-on-surface-variant bg-white dark:bg-zinc-900 rounded">
                        <span>Blank Page</span>
                      </div>
                    ) : (
                      <img
                        src={p.thumbUrl}
                        alt={`Page ${idx + 1}`}
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                        className="max-h-36 max-w-full object-contain shadow-sm rounded transition-transform duration-200 pointer-events-none"
                      />
                    )}
                  </div>

                  {/* Bottom Action Controls */}
                  <div className="p-2 bg-m3-surface-container-high/40 border-t border-m3-outline-variant/20 flex items-center justify-around text-xs">
                    <button
                      onClick={() => handleRotatePage(p.pageId, -90)}
                      className="p-1 hover:bg-m3-surface-container rounded"
                      title="Rotate Counter-Clockwise"
                    >
                      ↺
                    </button>
                    <button
                      onClick={() => handleRotatePage(p.pageId, 90)}
                      className="p-1 hover:bg-m3-surface-container rounded"
                      title="Rotate Clockwise"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => handleDuplicatePage(p.pageId)}
                      className="p-1 hover:bg-m3-surface-container rounded"
                      title="Duplicate Page"
                    >
                      📑
                    </button>
                    <button
                      onClick={() => handleDeletePage(p.pageId)}
                      disabled={pages.length <= 1}
                      className="p-1 text-red-500 hover:bg-red-500/10 rounded disabled:opacity-30"
                      title="Delete Page"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Export Stage / Done Modal ── */}
        {stage === "done" && exportBlob && (
          <div className="w-full max-w-xl p-6 rounded-3xl bg-m3-surface-container border border-m3-outline-variant/60 shadow-m3-elevation-2 flex flex-col items-center gap-4 my-6 animate-scaleIn">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-2xl">
              ✓
            </div>
            <div className="text-center">
              <h3 className="font-display font-bold text-lg text-m3-on-surface">
                Vector PDF Successfully Compiled!
              </h3>
              <p className="text-xs text-m3-on-surface-variant mt-1">
                {exportFileName} · {formatBytes(exportBlob.size)} · 100% Vector Quality
              </p>
            </div>
            <div className="w-full pt-2 border-t border-m3-outline-variant/40">
              <ActionButtons
                blob={exportBlob}
                fileName={exportFileName}
                toolName="PDF Studio"
                onReset={handleReset}
                auth={auth}
              />
            </div>
          </div>
        )}
      </main>

      {/* ── Signature Creation Modal ── */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-m3-surface rounded-3xl border border-m3-outline-variant shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-m3-outline-variant/40 flex items-center justify-between">
              <span className="font-display font-bold text-base">Create Digital Signature</span>
              <button
                onClick={() => setShowSignModal(false)}
                className="p-1 rounded-full hover:bg-m3-surface-container"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-m3-outline-variant/30 text-xs font-semibold">
              <button
                onClick={() => setSignTab("draw")}
                className={`flex-1 py-2.5 text-center border-b-2 transition ${
                  signTab === "draw"
                    ? "border-m3-primary text-m3-primary bg-m3-primary/5"
                    : "border-transparent text-m3-on-surface-variant"
                }`}
              >
                ✍️ Draw
              </button>
              <button
                onClick={() => setSignTab("type")}
                className={`flex-1 py-2.5 text-center border-b-2 transition ${
                  signTab === "type"
                    ? "border-m3-primary text-m3-primary bg-m3-primary/5"
                    : "border-transparent text-m3-on-surface-variant"
                }`}
              >
                ⌨️ Type
              </button>
              <button
                onClick={() => setSignTab("upload")}
                className={`flex-1 py-2.5 text-center border-b-2 transition ${
                  signTab === "upload"
                    ? "border-m3-primary text-m3-primary bg-m3-primary/5"
                    : "border-transparent text-m3-on-surface-variant"
                }`}
              >
                🖼️ Upload
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4">
              {/* Tab: Draw */}
              {signTab === "draw" && (
                <div className="flex flex-col gap-3">
                  <div className="relative border-2 border-dashed border-m3-outline-variant/60 rounded-2xl bg-white overflow-hidden h-44 cursor-crosshair">
                    <canvas
                      ref={drawCanvasRef}
                      width={500}
                      height={200}
                      className="w-full h-full"
                      onMouseDown={(e) => {
                        const canvas = drawCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        const rect = canvas.getBoundingClientRect();
                        const pt = {
                          x: (e.clientX - rect.left) * (canvas.width / rect.width),
                          y: (e.clientY - rect.top) * (canvas.height / rect.height),
                        };
                        drawLastPtRef.current = pt;
                        drawLastMidRef.current = pt;
                        isDrawingRef.current = true;
                        setHasDrawn(true);
                        ctx.strokeStyle = penColor;
                        ctx.lineWidth = penWidth;
                        ctx.lineCap = "round";
                        ctx.lineJoin = "round";
                      }}
                      onMouseMove={(e) => {
                        if (!isDrawingRef.current || !drawLastPtRef.current) return;
                        const canvas = drawCanvasRef.current;
                        const ctx = canvas.getContext("2d");
                        const rect = canvas.getBoundingClientRect();
                        const pt = {
                          x: (e.clientX - rect.left) * (canvas.width / rect.width),
                          y: (e.clientY - rect.top) * (canvas.height / rect.height),
                        };
                        const pPrev = drawLastPtRef.current;
                        const prevMid = drawLastMidRef.current;
                        const currMid = { x: (pPrev.x + pt.x) / 2, y: (pPrev.y + pt.y) / 2 };

                        ctx.beginPath();
                        ctx.moveTo(prevMid.x, prevMid.y);
                        ctx.quadraticCurveTo(pPrev.x, pPrev.y, currMid.x, currMid.y);
                        ctx.stroke();

                        drawLastPtRef.current = pt;
                        drawLastMidRef.current = currMid;
                      }}
                      onMouseUp={() => {
                        if (isDrawingRef.current && drawLastPtRef.current && drawLastMidRef.current) {
                          const canvas = drawCanvasRef.current;
                          const ctx = canvas?.getContext("2d");
                          if (ctx) {
                            const pPrev = drawLastPtRef.current;
                            const prevMid = drawLastMidRef.current;
                            ctx.beginPath();
                            ctx.moveTo(prevMid.x, prevMid.y);
                            ctx.lineTo(pPrev.x, pPrev.y);
                            ctx.stroke();
                          }
                        }
                        isDrawingRef.current = false;
                        drawLastPtRef.current = null;
                        drawLastMidRef.current = null;
                      }}
                      onMouseLeave={() => {
                        if (isDrawingRef.current && drawLastPtRef.current && drawLastMidRef.current) {
                          const canvas = drawCanvasRef.current;
                          const ctx = canvas?.getContext("2d");
                          if (ctx) {
                            const pPrev = drawLastPtRef.current;
                            const prevMid = drawLastMidRef.current;
                            ctx.beginPath();
                            ctx.moveTo(prevMid.x, prevMid.y);
                            ctx.lineTo(pPrev.x, pPrev.y);
                            ctx.stroke();
                          }
                        }
                        isDrawingRef.current = false;
                        drawLastPtRef.current = null;
                        drawLastMidRef.current = null;
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPenColor("#0f172a")}
                        className={`w-6 h-6 rounded-full bg-slate-900 border-2 ${
                          penColor === "#0f172a" ? "border-m3-primary scale-110" : "border-transparent"
                        }`}
                      />
                      <button
                        onClick={() => setPenColor("#1e3a8a")}
                        className={`w-6 h-6 rounded-full bg-blue-900 border-2 ${
                          penColor === "#1e3a8a" ? "border-m3-primary scale-110" : "border-transparent"
                        }`}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const canvas = drawCanvasRef.current;
                        const ctx = canvas?.getContext("2d");
                        ctx?.clearRect(0, 0, canvas.width, canvas.height);
                        setHasDrawn(false);
                      }}
                      className="text-xs text-m3-error hover:underline font-semibold"
                    >
                      Clear Drawing
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Type */}
              {signTab === "type" && (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={typeText}
                    onChange={(e) => setTypeText(e.target.value)}
                    placeholder="Type your name..."
                    className="w-full px-4 py-2.5 rounded-xl bg-m3-surface-container border border-m3-outline-variant/60 text-sm focus:outline-none focus:border-m3-primary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: "Caveat", font: "40px 'Caveat', cursive" },
                      { name: "Dancing Script", font: "36px 'Dancing Script', cursive" },
                      { name: "Great Vibes", font: "38px 'Great Vibes', cursive" },
                      { name: "Sacramento", font: "42px 'Sacramento', cursive" },
                    ].map((f) => (
                      <button
                        key={f.name}
                        onClick={() => setTypeFont(f.font)}
                        style={{ fontFamily: f.name }}
                        className={`p-3 rounded-xl border text-lg truncate text-center ${
                          typeFont === f.font
                            ? "border-m3-primary bg-m3-primary/10 text-m3-primary"
                            : "border-m3-outline-variant/40 bg-m3-surface-container-low"
                        }`}
                      >
                        {typeText || f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Upload */}
              {signTab === "upload" && (
                <div className="flex flex-col gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => setUploadImg(reader.result);
                      reader.readAsDataURL(f);
                    }}
                    className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-m3-primary file:text-m3-on-primary"
                  />
                  {uploadImg && (
                    <div className="flex flex-col items-center gap-2 p-3 bg-m3-surface-container-low rounded-xl">
                      <img src={uploadImg} alt="Preview" className="max-h-24 object-contain" />
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={removeBg}
                          onChange={(e) => setRemoveBg(e.target.checked)}
                          className="rounded"
                        />
                        <span>Auto-remove white background</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-m3-outline-variant/30 flex justify-end gap-2">
              <button
                onClick={() => setShowSignModal(false)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-m3-surface-container"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSignature}
                className="px-5 py-1.5 rounded-full bg-m3-primary text-m3-on-primary text-xs font-semibold shadow-sm hover:scale-105 active:scale-95 transition"
              >
                Add to Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Virtualized Page Viewport Component ──────────────────────────────────────
function PDFPageView({
  pageDesc,
  pageIndex,
  zoom,
  visualWidth,
  visualHeight,
  sourceDocs,
  annotations,
  activeTool,
  textStyle,
  highlightColor,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectPage,
  isSelectedPage,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [viewportObj, setViewportObj] = useState(null);
  const [textItems, setTextItems] = useState([]);

  // Active inline editing state for smart whiteout text
  const [editingTextId, setEditingTextId] = useState(null);
  const [dragRect, setDragRect] = useState(null);
  const lastBlurTimeRef = useRef(0);

  // IntersectionObserver: Only render when visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          renderCanvas();
        }
      },
      { rootMargin: "300px" }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [pageDesc, zoom]);

  const renderCanvas = async () => {
    if (pageDesc.isBlank) {
      setRendered(true);
      return;
    }

    const srcDoc = sourceDocs[pageDesc.sourceDocIndex];
    if (!srcDoc || !srcDoc.pdfJsDoc) return;

    try {
      const p = await srcDoc.pdfJsDoc.getPage(pageDesc.originalPageIndex + 1);
      const totalRot = (pageDesc.baseRotation + pageDesc.rotation + 360) % 360;
      const vp = p.getViewport({ scale: zoom * 1.5, rotation: totalRot }); // 1.5 for high-DPI clarity

      setViewportObj(p.getViewport({ scale: zoom, rotation: totalRot }));

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");

      await p.render({ canvasContext: ctx, viewport: vp }).promise;

      // Extract text content for Smart Whiteout editing (with marked content & font descriptors resolved)
      const textContent = await p.getTextContent({ includeMarkedContent: true });
      const unscaledVp = p.getViewport({ scale: 1, rotation: totalRot });
      const stylesDict = textContent.styles || {};

      const rawItems = textContent.items.map((item) => {
        const fontInfo = introspectPdfFont(p, srcDoc.pdfJsDoc, item, stylesDict);
        const tx = item.transform || [12, 0, 0, 12, 0, 0];
        const [vx, vy] = unscaledVp.convertToViewportPoint(tx[4], tx[5]);
        const fontSize = fontInfo.fontSize;
        // Tighten vertical bounds to cap-height and baseline
        const boxHeight = fontSize * 0.98;
        return {
          str: item.str,
          x: vx,
          y: vy - fontSize * 0.82, // Baseline to top-left Y
          width: item.width || 0,
          height: boxHeight,
          ...fontInfo,
        };
      });

      // Sort raw items top-to-bottom, left-to-right
      rawItems.sort((a, b) => (Math.abs(a.y - b.y) < 3 ? a.x - b.x : a.y - b.y));

      // Merge adjacent text fragments on the same line with space & gap handling
      const merged = [];
      for (const item of rawItems) {
        if (!item.str || !item.str.trim()) continue;
        const last = merged[merged.length - 1];
        const gap = last ? item.x - (last.x + last.width) : 0;
        const sameLine = last && Math.abs(last.y - item.y) < 3;
        const isAdjacent =
          sameLine && gap >= -last.fontSize * 0.5 && gap <= last.fontSize * 2.0;

        if (last && isAdjacent) {
          const needsSpace =
            gap > last.fontSize * 0.15 &&
            !last.str.endsWith(" ") &&
            !item.str.startsWith(" ");
          last.str += (needsSpace ? " " : "") + item.str;
          last.width = Math.max(last.width, item.x + item.width - last.x);
          last.height = Math.max(last.height, item.height);
          last.fontSize = Math.max(last.fontSize, item.fontSize);
        } else {
          merged.push({ ...item });
        }
      }

      // Vertical Paragraph Clustering: Group consecutive lines into unified ParagraphBlocks
      const clustered = [];
      for (const line of merged) {
        if (!clustered.length) {
          clustered.push({
            isMultiLine: false,
            lines: [line],
            str: line.str,
            x: line.x,
            y: line.y,
            width: line.width,
            height: line.height,
            fontSize: line.fontSize,
            fontFamily: line.fontFamily,
            cssFontStack: line.cssFontStack,
            bold: line.bold,
            italic: line.italic,
            detectedFontLabel: line.detectedFontLabel,
          });
          continue;
        }

        const lastBlock = clustered[clustered.length - 1];
        const prevLine = lastBlock.lines[lastBlock.lines.length - 1];

        const gapY = line.y - (prevLine.y + prevLine.height);
        const fontMatch =
          lastBlock.fontFamily === line.fontFamily &&
          Math.abs(lastBlock.fontSize - line.fontSize) <= 1 &&
          lastBlock.bold === line.bold &&
          lastBlock.italic === line.italic;

        const marginMatch = Math.abs(lastBlock.x - line.x) < Math.max(32, lastBlock.fontSize * 3);
        const isListMarker = /^\s*(\d+[\.\)]|[•\-\*\u2022])\s+/.test(line.str);

        const isParagraphContinuation =
          fontMatch &&
          marginMatch &&
          !isListMarker &&
          prevLine.width > 180 &&
          gapY >= -4 &&
          gapY < lastBlock.fontSize * 1.5;

        if (isParagraphContinuation) {
          lastBlock.lines.push(line);
          lastBlock.isMultiLine = true;
          lastBlock.str += "\n" + line.str;
          const minX = Math.min(lastBlock.x, line.x);
          const maxX = Math.max(lastBlock.x + lastBlock.width, line.x + line.width);
          lastBlock.x = minX;
          lastBlock.width = maxX - minX;
          lastBlock.height = (line.y + line.height) - lastBlock.y;
        } else {
          clustered.push({
            isMultiLine: false,
            lines: [line],
            str: line.str,
            x: line.x,
            y: line.y,
            width: line.width,
            height: line.height,
            fontSize: line.fontSize,
            fontFamily: line.fontFamily,
            cssFontStack: line.cssFontStack,
            bold: line.bold,
            italic: line.italic,
            detectedFontLabel: line.detectedFontLabel,
          });
        }
      }

      // Enforce zero-bleed safe boundary between adjacent vertical blocks
      for (let i = 0; i < clustered.length; i++) {
        const current = clustered[i];
        if (i < clustered.length - 1) {
          const nextY = clustered[i + 1].y;
          const safeMaxH = Math.max(current.fontSize, nextY - current.y - 2);
          if (current.height > safeMaxH) {
            current.height = safeMaxH;
          }
        }
      }

      setTextItems(clustered);
      setRendered(true);
    } catch (err) {
      console.warn("Render canvas error:", err);
    }
  };

  // Click handler on page for tools (with drag-to-highlight/shape support)
  const handlePagePointerDown = (e) => {
    onSelectPage();
    if (!viewportObj) return;

    // Detect if the user clicks a valid glyph target matching the .cursor-text wrapper selector class
    const isCursorTextTarget = Boolean(
      e.target && e.target.closest && e.target.closest(".cursor-text")
    );

    if (isCursorTextTarget) {
      // Instantly clear the debounce block and exit early to let handleTextGlyphClick take immediate control
      lastBlurTimeRef.current = 0;
      setEditingTextId(null);
      onSelectAnnotation(null);
      return;
    }

    // Fix B: If editing, selected, or blurred recently (< 250ms), ONLY clear selection and return
    if (
      editingTextId !== null ||
      selectedAnnotationId !== null ||
      Date.now() - lastBlurTimeRef.current < 250
    ) {
      setEditingTextId(null);
      onSelectAnnotation(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const domX = (e.clientX - rect.left) * (viewportObj.width / rect.width);
    const domY = (e.clientY - rect.top) * (viewportObj.height / rect.height);

    // Visual coordinates normalized to scale 1.0
    const visualX = domX / zoom;
    const visualY = domY / zoom;

    const startX = visualX;
    const startY = visualY;
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    if (activeTool === "highlight" || activeTool === "whiteout" || activeTool === "shape") {
      const handlePointerMove = (moveEvt) => {
        const dragDx = (moveEvt.clientX - startClientX) / zoom;
        const dragDy = (moveEvt.clientY - startClientY) / zoom;
        if (Math.hypot(dragDx, dragDy) > 4) {
          const boxX = Math.min(startX, startX + dragDx);
          const boxY = Math.min(startY, startY + dragDy);
          const boxW = Math.max(8, Math.abs(dragDx));
          const boxH = Math.max(6, Math.abs(dragDy));
          setDragRect({ x: boxX, y: boxY, width: boxW, height: boxH, tool: activeTool });
        }
      };

      const handlePointerUp = (upEvt) => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        setDragRect(null);
        const dragDx = (upEvt.clientX - startClientX) / zoom;
        const dragDy = (upEvt.clientY - startClientY) / zoom;
        const isDragged = Math.hypot(dragDx, dragDy) > 6;

        const boxX = isDragged ? Math.min(startX, startX + dragDx) : startX;
        const boxY = isDragged ? Math.min(startY, startY + dragDy) : startY;

        if (activeTool === "highlight") {
          onAddAnnotation({
            type: "highlight",
            fillColor: highlightColor,
            x: boxX,
            y: boxY,
            width: isDragged ? Math.max(15, Math.abs(dragDx)) : 90,
            height: isDragged ? Math.max(10, Math.abs(dragDy)) : 18,
            opacity: 0.35,
          });
        } else if (activeTool === "whiteout") {
          onAddAnnotation({
            type: "patch",
            fillColor: "#ffffff",
            x: boxX,
            y: boxY,
            width: isDragged ? Math.max(15, Math.abs(dragDx)) : 80,
            height: isDragged ? Math.max(10, Math.abs(dragDy)) : 25,
          });
        } else if (activeTool === "shape") {
          onAddAnnotation({
            type: "shape",
            fillColor: "#3b82f6",
            strokeColor: "#1d4ed8",
            strokeWidth: 2,
            x: boxX,
            y: boxY,
            width: isDragged ? Math.max(20, Math.abs(dragDx)) : 100,
            height: isDragged ? Math.max(20, Math.abs(dragDy)) : 60,
            opacity: 0.8,
          });
        }
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return;
    }

    if (activeTool === "text") {
      const newId = crypto.randomUUID();
      const cssStack =
        textStyle.fontFamily === "Times-Roman"
          ? "'Times New Roman', Times, Georgia, serif"
          : textStyle.fontFamily === "Courier"
          ? "'Courier New', Courier, monospace"
          : "Helvetica, Arial, sans-serif";
      onAddAnnotation({
        id: newId,
        type: "text",
        text: "",
        x: visualX,
        y: visualY,
        width: 120,
        height: (textStyle.fontSize || 14) * 1.25 + 4,
        fontSize: textStyle.fontSize || 14,
        fontFamily: textStyle.fontFamily || "Helvetica",
        cssFontStack: cssStack,
        color: textStyle.color || "#0f172a",
        bold: textStyle.bold || false,
        italic: textStyle.italic || false,
      });
      setEditingTextId(newId);
    }
  };

  // Smart Whiteout Text Replacement trigger
  const handleTextGlyphClick = (e, item) => {
    e.stopPropagation();
    if (!viewportObj || activeTool !== "text") return;

    // Fix B: If editing, selected, or blurred recently (< 250ms), ONLY clear selection and return
    if (
      editingTextId !== null ||
      selectedAnnotationId !== null ||
      Date.now() - lastBlurTimeRef.current < 250
    ) {
      setEditingTextId(null);
      onSelectAnnotation(null);
      return;
    }

    // Guard against duplicate annotation spawning: If an annotation already claims this text item, select it instead of re-spawning
    const existingAnn = annotations.find((ann) => {
      if (ann.type !== "text") return false;
      const targetX = ann.origX !== undefined ? ann.origX : ann.x;
      const targetY = ann.origY !== undefined ? ann.origY : ann.y;
      return Math.abs(targetX - (item.x - 2)) < 6 && Math.abs(targetY - item.y) < 6;
    });

    if (existingAnn) {
      onSelectAnnotation(existingAnn.id);
      return;
    }

    const canvas = canvasRef.current;
    const sampledBg = sampleBackgroundColor(canvas, {
      left: item.x * zoom,
      top: item.y * zoom,
      right: (item.x + item.width) * zoom,
      bottom: (item.y + item.height) * zoom,
    });

    const textId = crypto.randomUUID();
    const padX = 2;
    const padY = 0;
    const origX = item.x - padX;
    const origY = item.y;
    const origW = item.width + 4;
    const origH = item.height;

    // Measure maximum line width for multi-line or single-line text
    const lines = (item.str || "").split("\n");
    let maxMeasuredW = 0;
    for (const l of lines) {
      const mw = measureTextWidthPt(
        l,
        item.fontSize || 12,
        item.cssFontStack,
        item.bold,
        item.italic
      );
      if (mw > maxMeasuredW) maxMeasuredW = mw;
    }
    const boxW = Math.max(origW, maxMeasuredW + 10);

    onAddAnnotation({
      id: textId,
      type: "text",
      text: item.str,
      fillColor: sampledBg,
      x: origX,
      y: origY,
      width: boxW,
      height: origH,
      origX,
      origY,
      origWidth: origW,
      origHeight: origH,
      fontSize: item.fontSize || 12,
      fontFamily: item.fontFamily || "Helvetica",
      cssFontStack: item.cssFontStack || "Helvetica, Arial, sans-serif",
      bold: item.bold || false,
      italic: item.italic || false,
      detectedFontLabel: item.detectedFontLabel || item.fontFamily,
      color: "#0f172a",
      isMultiLine: !!item.isMultiLine,
    });

    setEditingTextId(textId);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handlePagePointerDown}
      style={{
        width: Math.floor(visualWidth),
        height: Math.floor(visualHeight),
      }}
      className={`relative bg-white shadow-m3-elevation-2 rounded-lg overflow-hidden transition-shadow ${
        isSelectedPage ? "ring-2 ring-m3-primary" : ""
      }`}
    >
      {/* Background Rendered Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: pageDesc.isBlank ? "none" : "block",
        }}
      />

      {/* Clickable Text Glyphs for Smart Whiteout Editing */}
      {activeTool === "text" &&
        textItems
          .filter((item) => {
            // Do not render clickable glyph target if an annotation already replaces/covers this text
            return !annotations.some((ann) => {
              if (ann.type !== "text") return false;
              const targetX = ann.origX !== undefined ? ann.origX : ann.x;
              const targetY = ann.origY !== undefined ? ann.origY : ann.y;
              return Math.abs(targetX - (item.x - 2)) < 6 && Math.abs(targetY - item.y) < 6;
            });
          })
          .map((item, tIdx) => (
            <div
              key={tIdx}
              onClick={(e) => handleTextGlyphClick(e, item)}
              style={{
                left: item.x * zoom,
                top: item.y * zoom,
                width: item.width * zoom,
                height: item.height * zoom,
              }}
              className="absolute cursor-text hover:bg-blue-400/20 rounded-sm pointer-events-auto"
              title="Click to edit text with smart whiteout patch"
            />
          ))}

      {/* Base Whiteout Masks to prevent reveal on drag */}
      {annotations.map((ann) => {
        if (ann.origX === undefined || ann.origY === undefined || !ann.origWidth || !ann.origHeight) return null;
        return (
          <div
            key={`orig-mask-${ann.id}`}
            style={{
              left: ann.origX * zoom,
              top: ann.origY * zoom,
              width: ann.origWidth * zoom,
              height: ann.origHeight * zoom,
              backgroundColor: ann.fillColor || "#ffffff",
            }}
            className="absolute pointer-events-none"
          />
        );
      })}

      {/* Rendered Annotations Over Canvas (Visual Viewport Space) */}
      {annotations.map((ann) => {
        const screenX = ann.x * zoom;
        const screenY = ann.y * zoom;
        const isSelected = selectedAnnotationId === ann.id;

        return (
          <AnnotationElement
            key={ann.id}
            ann={ann}
            pageWidth={pageDesc.width || (viewportObj ? viewportObj.width / zoom : 595)}
            screenX={screenX}
            screenY={screenY}
            zoom={zoom}
            isSelected={isSelected}
            onSelect={() => onSelectAnnotation(ann.id)}
            onUpdate={(changes) => onUpdateAnnotation(ann.id, changes)}
            onDelete={() => onDeleteAnnotation(ann.id)}
            isEditingText={editingTextId === ann.id}
            onStartEditingText={() => setEditingTextId(ann.id)}
            onStopEditingText={() => {
              lastBlurTimeRef.current = Date.now();
              setEditingTextId(null);
            }}
          />
        );
      })}

      {/* Live Drag Rubber-Band Preview */}
      {dragRect && (
        <div
          style={{
            left: dragRect.x * zoom,
            top: dragRect.y * zoom,
            width: dragRect.width * zoom,
            height: dragRect.height * zoom,
            backgroundColor:
              dragRect.tool === "highlight"
                ? highlightColor
                : dragRect.tool === "shape"
                ? "#3b82f6"
                : "#ffffff",
            opacity: dragRect.tool === "highlight" ? 0.35 : dragRect.tool === "shape" ? 0.6 : 0.9,
            border:
              dragRect.tool === "shape"
                ? "2px solid #1d4ed8"
                : "1px dashed #3b82f6",
          }}
          className="absolute pointer-events-none z-30 rounded-sm"
        />
      )}
    </div>
  );
}

// ── Interactive Annotation Element (Draggable & Editable) ────────────────────
function AnnotationElement({
  ann,
  pageWidth,
  screenX,
  screenY,
  zoom,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  isEditingText,
  onStartEditingText,
  onStopEditingText,
}) {
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, annX: 0, annY: 0 });
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditingText && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditingText]);

  const handlePointerDown = (e) => {
    e.stopPropagation();
    onSelect();
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      annX: ann.x,
      annY: ann.y,
    };

    const handlePointerMove = (moveEvt) => {
      if (!isDraggingRef.current) return;
      const dx = (moveEvt.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (moveEvt.clientY - dragStartRef.current.mouseY) / zoom;
      onUpdate({
        x: Math.max(0, dragStartRef.current.annX + dx),
        y: Math.max(0, dragStartRef.current.annY + dy),
      });
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const effectiveW = ann.width || (ann.origWidth ? Math.max(ann.origWidth, ann.width || 0) : (ann.width || 0));
  const lineCount = (ann.text || "").split("\n").length;
  const contentH = lineCount * (ann.fontSize || 14) * 1.25 + 4;
  const effectiveH = ann.height || contentH;
  const widthPx = effectiveW * zoom;
  const heightPx = effectiveH * zoom;

  // Standardized Box Model: Round-calibrated zoom horizontal padding metrics
  const padXpx = Math.round((ann.origWidth ? 2 : 1) * zoom);
  const textCommonStyle = {
    fontSize: `${(ann.fontSize || 14) * zoom}px`,
    lineHeight: 1.25,
    fontFamily: ann.cssFontStack || "Helvetica, Arial, sans-serif",
    fontWeight: ann.bold ? "bold" : "normal",
    fontStyle: ann.italic ? "italic" : "normal",
    color: ann.color || "#0f172a",
    padding: `0 ${padXpx}px`,
    margin: 0,
    border: "0px solid transparent",
    outline: "none",
    boxSizing: "border-box",
    display: "block",
    width: "100%",
    height: "100%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    letterSpacing: "normal",
    wordSpacing: "normal",
    verticalAlign: "top",
    backgroundColor: "transparent",
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onSelect();
        if (ann.type === "text" && onStartEditingText) {
          onStartEditingText();
        }
      }}
      style={{
        left: screenX,
        top: screenY,
        width: widthPx,
        height: heightPx,
      }}
      className={`absolute cursor-move select-none ${
        isSelected ? "ring-2 ring-blue-500 shadow-md" : ""
      }`}
    >
      {/* ── Section 3: Contextual Floating Text Toolbar ── */}
      {ann.type === "text" && (isSelected || isEditingText) && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            [screenY < 48 ? "top" : "bottom"]: "calc(100% + 6px)",
            left: 0,
          }}
          className="absolute z-50 flex items-center gap-1.5 p-1.5 rounded-2xl bg-m3-surface-container-high border border-m3-outline-variant/60 shadow-xl backdrop-blur-md whitespace-nowrap text-xs text-m3-on-surface"
        >
          {/* Detected Font Badge */}
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-m3-primary/10 text-m3-primary max-w-[85px] truncate"
            title={`Detected Font: ${ann.detectedFontLabel || ann.fontFamily}`}
          >
            {ann.detectedFontLabel || ann.fontFamily}
          </span>

          {/* Font Family Select */}
          <select
            value={ann.fontFamily || "Helvetica"}
            onChange={(e) => {
              const newFam = e.target.value;
              const newStack =
                newFam === "Times-Roman"
                  ? "'Times New Roman', Times, Georgia, serif"
                  : newFam === "Courier"
                  ? "'Courier New', Courier, monospace"
                  : "Helvetica, Arial, sans-serif";
              let w = ann.width;
              if (!ann.isMultiLine) {
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, ann.fontSize || 14, newStack, ann.bold, ann.italic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
              }
              onUpdate({ fontFamily: newFam, cssFontStack: newStack, width: w });
            }}
            className="bg-m3-surface border border-m3-outline-variant/60 rounded-lg px-1.5 py-0.5 text-xs text-m3-on-surface font-medium outline-none cursor-pointer"
          >
            <option value="Helvetica">Helvetica</option>
            <option value="Times-Roman">Times New Roman</option>
            <option value="Courier">Courier</option>
          </select>

          {/* Font Size Controls (- / size / +) */}
          <div className="flex items-center gap-0.5 bg-m3-surface rounded-lg border border-m3-outline-variant/60 px-1 py-0.5">
            <button
              type="button"
              onClick={() => {
                const newSize = Math.max(6, (ann.fontSize || 14) - 1);
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, newSize, ann.cssFontStack, ann.bold, ann.italic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                const w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
                const lineCount = Math.max(1, lines.length);
                const h = lineCount * newSize * 1.25 + 4;
                onUpdate({ fontSize: newSize, width: w, height: h });
              }}
              className="w-4 h-4 flex items-center justify-center font-bold text-m3-on-surface hover:bg-m3-surface-variant rounded transition text-[11px]"
              title="Decrease font size"
            >
              -
            </button>
            <input
              type="number"
              min="6"
              max="72"
              value={ann.fontSize || 14}
              onChange={(e) => {
                const newSize = Math.max(6, Math.min(72, Number(e.target.value) || 14));
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, newSize, ann.cssFontStack, ann.bold, ann.italic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                const w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
                const lineCount = Math.max(1, lines.length);
                const h = lineCount * newSize * 1.25 + 4;
                onUpdate({ fontSize: newSize, width: w, height: h });
              }}
              className="w-8 text-center text-xs bg-transparent outline-none font-semibold p-0"
            />
            <button
              type="button"
              onClick={() => {
                const newSize = Math.min(72, (ann.fontSize || 14) + 1);
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, newSize, ann.cssFontStack, ann.bold, ann.italic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                const w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
                const lineCount = Math.max(1, lines.length);
                const h = lineCount * newSize * 1.25 + 4;
                onUpdate({ fontSize: newSize, width: w, height: h });
              }}
              className="w-4 h-4 flex items-center justify-center font-bold text-m3-on-surface hover:bg-m3-surface-variant rounded transition text-[11px]"
              title="Increase font size"
            >
              +
            </button>
          </div>

          {/* Bold Toggle [B] */}
          <button
            type="button"
            onClick={() => {
              const newBold = !ann.bold;
              let w = ann.width;
              if (!ann.isMultiLine) {
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, ann.fontSize || 14, ann.cssFontStack, newBold, ann.italic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
              }
              onUpdate({ bold: newBold, width: w });
            }}
            className={`w-6 h-6 rounded-lg font-bold flex items-center justify-center transition text-xs ${
              ann.bold ? "bg-m3-primary text-m3-on-primary shadow-sm" : "hover:bg-m3-surface text-m3-on-surface"
            }`}
            title="Bold"
          >
            B
          </button>

          {/* Italic Toggle [I] */}
          <button
            type="button"
            onClick={() => {
              const newItalic = !ann.italic;
              let w = ann.width;
              if (!ann.isMultiLine) {
                const lines = (ann.text || "").split("\n");
                let maxLineW = 0;
                for (const l of lines) {
                  const lw = measureTextWidthPt(l, ann.fontSize || 14, ann.cssFontStack, ann.bold, newItalic);
                  if (lw > maxLineW) maxLineW = lw;
                }
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);
                w = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
              }
              onUpdate({ italic: newItalic, width: w });
            }}
            className={`w-6 h-6 rounded-lg italic font-serif flex items-center justify-center transition text-xs ${
              ann.italic ? "bg-m3-primary text-m3-on-primary shadow-sm" : "hover:bg-m3-surface text-m3-on-surface"
            }`}
            title="Italic"
          >
            I
          </button>

          {/* Text Color Picker */}
          <label className="flex items-center cursor-pointer" title="Text Color">
            <input
              type="color"
              value={ann.color || "#0f172a"}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border border-m3-outline-variant/60 p-0"
            />
          </label>

          {/* Background Patch Color Picker */}
          <label className="flex items-center cursor-pointer" title="Whiteout / Mask Color">
            <input
              type="color"
              value={ann.fillColor || "#ffffff"}
              onChange={(e) => onUpdate({ fillColor: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer border border-m3-outline-variant/60 p-0"
            />
          </label>

          {/* Delete Button */}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(ann.id)}
              className="w-6 h-6 rounded-lg text-red-500 hover:bg-red-500/10 flex items-center justify-center transition"
              title="Delete text annotation"
            >
              🗑️
            </button>
          )}
        </div>
      )}

      {/* 1. Whiteout / Redaction Patch */}
      {(ann.type === "patch" || ann.type === "whiteout") && (
        <div
          style={{ backgroundColor: ann.fillColor || "#ffffff", opacity: 1 }}
          className="w-full h-full"
        />
      )}

      {/* 2. Highlight */}
      {ann.type === "highlight" && (
        <div
          style={{
            backgroundColor: ann.fillColor || "#fef08a",
            opacity: ann.opacity || 0.35,
          }}
          className="w-full h-full rounded-sm"
        />
      )}

      {/* 3. Shape */}
      {ann.type === "shape" && (
        <div
          style={{
            backgroundColor: ann.fillColor,
            border: `${ann.strokeWidth || 2}px solid ${ann.strokeColor || "#1d4ed8"}`,
            opacity: ann.opacity || 1,
          }}
          className="w-full h-full rounded"
        />
      )}

      {/* 4. Text Annotation */}
      {ann.type === "text" && (
        <div className="w-full h-full flex flex-col justify-start relative">
          {ann.fillColor && (
            <div
              style={{ backgroundColor: ann.fillColor, opacity: 1 }}
              className="absolute inset-0 pointer-events-none rounded-sm"
            />
          )}
          {isEditingText ? (
            <textarea
              ref={textareaRef}
              autoFocus
              rows={1}
              value={ann.text}
              onChange={(e) => {
                const newText = e.target.value;
                const target = e.target;
                target.style.height = "auto";
                const newScrollH = target.scrollHeight;
                const lines = newText.split("\n");
                const contentH = lines.length * (ann.fontSize || 14) * 1.25 + 4;
                const newH = Math.max(contentH, newScrollH / zoom);

                // Clamp new width so it never exceeds page right margin
                const maxPageW = Math.max(80, (pageWidth || 595) - ann.x - 15);

                let newW;
                if (ann.isMultiLine && lines.length > 1) {
                  // Lock width for existing multi-line paragraphs so text wraps naturally and expands downward
                  newW = Math.min(maxPageW, ann.width || ann.origWidth || maxPageW);
                } else {
                  // Single line: expand width up to page margin
                  let maxLineW = 0;
                  for (const l of lines) {
                    const lw = measureTextWidthPt(
                      l,
                      ann.fontSize || 14,
                      ann.cssFontStack,
                      ann.bold,
                      ann.italic
                    );
                    if (lw > maxLineW) maxLineW = lw;
                  }
                  newW = Math.min(maxPageW, Math.max(ann.origWidth || 0, maxLineW + 10));
                }

                onUpdate({
                  text: newText,
                  width: newW,
                  height: newH,
                  isMultiLine: lines.length > 1 || newH > (ann.fontSize || 14) * 1.5,
                });
              }}
              onBlur={() => {
                // Section 2 Bug 1: Auto-delete any newly created text box if blurred with empty text
                if (!ann.text || !ann.text.trim()) {
                  if (onDelete) onDelete(ann.id);
                }
                onStopEditingText();
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || e.key === "Escape") {
                  e.preventDefault();
                  onStopEditingText();
                }
              }}
              style={{
                ...textCommonStyle,
                resize: "none",
                overflow: "hidden",
                backgroundColor: ann.fillColor || "transparent",
              }}
              className="w-full h-full relative z-10 m-0 p-0 outline-none border-0 select-text"
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelect();
                if (onStartEditingText) {
                  onStartEditingText();
                }
              }}
              style={textCommonStyle}
              className="w-full h-full block relative z-10 select-none m-0 p-0 border-0"
            >
              {ann.text}
            </span>
          )}
        </div>
      )}

      {/* 5. Signature / Stamp */}
      {(ann.type === "sign" || ann.type === "stamp") && ann.dataUrl && (
        <img
          src={ann.dataUrl}
          alt="Signature"
          className="w-full h-full object-contain pointer-events-none"
        />
      )}
    </div>
  );
}
