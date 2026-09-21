// PDFWatermark.jsx — Add, Customize & Remove PDF Watermarks + Page Numbers with Live Canvas Preview
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, rgb, degrees, StandardFonts, PDFName, PDFRawStream } from "pdf-lib";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 50;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

function fmt(bytes) {
  if (!bytes) return "0 B";
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

// Load PDF.js from CDN
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

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r: isNaN(r) ? 0.5 : r, g: isNaN(g) ? 0.5 : g, b: isNaN(b) ? 0.5 : b };
}

const PRESET_WATERMARKS = [
  "CONFIDENTIAL",
  "DO NOT COPY",
  "DRAFT",
  "SAMPLE",
  "TOP SECRET",
  "ORIGINAL",
];

const PRESET_REMOVE_KEYWORDS = [
  "CamScanner",
  "WPS Office",
  "CONFIDENTIAL",
  "DRAFT",
  "SAMPLE",
  "DO NOT COPY",
  "Watermark",
  "Scanned with",
];

const PRESET_COLORS = [
  { label: "Crimson", hex: "#ef4444" },
  { label: "Indigo", hex: "#6366f1" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Emerald", hex: "#10b981" },
  { label: "Slate", hex: "#64748b" },
  { label: "Black", hex: "#000000" },
];

export default function PDFWatermark({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loaded | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [pageThumbUrl, setPageThumbUrl] = useState(null);

  // Main Action Mode: "add" | "remove"
  const [mainAction, setMainAction] = useState("add");

  // ── ADD MODE: Tabs: "both" | "watermark" | "pagenumber" ──
  const [toolTab, setToolTab] = useState("both");
  const [enableWatermark, setEnableWatermark] = useState(true);
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmSize, setWmSize] = useState(48);
  const [wmRotation, setWmRotation] = useState(45);
  const [wmOpacity, setWmOpacity] = useState(30);
  const [wmColor, setWmColor] = useState("#ef4444");

  // Page Number Settings
  const [enablePageNum, setEnablePageNum] = useState(true);
  const [numFormat, setNumFormat] = useState("Page {n} of {total}");
  const [numPosition, setNumPosition] = useState("bottom-center");
  const [numSize, setNumSize] = useState(11);
  const [numColor, setNumColor] = useState("#64748b");
  const [skipFirstPage, setSkipFirstPage] = useState(false);

  // ── REMOVE MODE: Removal Method: "faint" | "keyword" | "stamp" ──
  const [removeMethod, setRemoveMethod] = useState("faint"); // "faint" | "keyword" | "stamp"
  const [cleanSensitivity, setCleanSensitivity] = useState(195); // threshold 150-240
  const [removeKeyword, setRemoveKeyword] = useState("CamScanner");
  const [stampRegion, setStampRegion] = useState("bottom-banner"); // "bottom-banner" | "top-banner" | "bottom-right"

  // Results
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  const inputRef = useRef(null);
  const pdfBytesRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported.");
      setStage("error");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      setStage("error");
      return;
    }
    setFile(f);
    setErrorMsg("");
    setStage("loaded");

    try {
      const arrayBuffer = await f.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(arrayBuffer);

      const pdfjs = await loadPdfJs();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      setTotalPages(pdfDoc.numPages);
      setPreviewPage(1);

      renderPageBase(pdfDoc, 1);
    } catch (err) {
      setErrorMsg("Failed to load PDF: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const renderPageBase = async (pdfDoc, pageNum) => {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      setPageThumbUrl(canvas.toDataURL("image/jpeg", 0.88));
    } catch (e) {
      console.error(e);
    }
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
        .setMimeTypes("application/pdf");
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147").setOAuthToken(token).addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "document.pdf";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: "application/pdf" }));
            } catch (err) {
              setErrorMsg(err.message); setStage("error");
            }
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed."); setStage("error");
    } finally { setPickLoading(false); }
  };

  // Draw Live Preview onto canvas
  useEffect(() => {
    if (!pageThumbUrl) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // ── IF IN REMOVE WATERMARK MODE ──
      if (mainAction === "remove") {
        if (removeMethod === "faint") {
          // Apply brightness/contrast threshold filter to erase faint watermarks
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const thresh = cleanSensitivity;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            if (lum >= thresh) {
              // Faint watermark pixel → clean to pure white paper
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            } else {
              // Dark text pixel → enhance contrast
              const boost = Math.max(0, (lum / thresh) * 0.7);
              data[i] = Math.round(r * boost);
              data[i + 1] = Math.round(g * boost);
              data[i + 2] = Math.round(b * boost);
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } else if (removeMethod === "stamp") {
          // Erase selected banner stamp area
          ctx.fillStyle = "#ffffff";
          if (stampRegion === "bottom-banner") {
            ctx.fillRect(0, canvas.height - 45, canvas.width, 45);
          } else if (stampRegion === "top-banner") {
            ctx.fillRect(0, 0, canvas.width, 45);
          } else if (stampRegion === "bottom-right") {
            ctx.fillRect(canvas.width - 180, canvas.height - 45, 180, 45);
          }
        }
        return;
      }

      // ── IF IN ADD WATERMARK MODE ──
      // 1. Draw Watermark Overlay
      if (enableWatermark && wmText.trim()) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((wmRotation * Math.PI) / 180);
        ctx.font = `bold ${Math.round(wmSize * (canvas.width / 595))}px sans-serif`;
        ctx.fillStyle = wmColor;
        ctx.globalAlpha = wmOpacity / 100;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(wmText, 0, 0);
        ctx.restore();
      }

      // 2. Draw Page Number Overlay
      if (enablePageNum && (!skipFirstPage || previewPage > 1)) {
        ctx.save();
        const str = numFormat
          .replace("{n}", previewPage)
          .replace("{total}", totalPages || 1);

        const scaledNumSize = Math.max(10, Math.round(numSize * (canvas.width / 595)));
        ctx.font = `${scaledNumSize}px sans-serif`;
        ctx.fillStyle = numColor;
        ctx.globalAlpha = 0.9;
        ctx.textBaseline = "middle";

        const margin = 28 * (canvas.width / 595);

        let x = canvas.width / 2;
        let y = canvas.height - margin;
        let align = "center";

        if (numPosition === "bottom-center") {
          x = canvas.width / 2; y = canvas.height - margin; align = "center";
        } else if (numPosition === "bottom-right") {
          x = canvas.width - margin; y = canvas.height - margin; align = "right";
        } else if (numPosition === "bottom-left") {
          x = margin; y = canvas.height - margin; align = "left";
        } else if (numPosition === "top-center") {
          x = canvas.width / 2; y = margin; align = "center";
        } else if (numPosition === "top-right") {
          x = canvas.width - margin; y = margin; align = "right";
        }

        ctx.textAlign = align;
        ctx.fillText(str, x, y);
        ctx.restore();
      }
    };
    img.src = pageThumbUrl;
  }, [
    pageThumbUrl,
    mainAction,
    removeMethod,
    cleanSensitivity,
    removeKeyword,
    stampRegion,
    enableWatermark,
    wmText,
    wmSize,
    wmRotation,
    wmOpacity,
    wmColor,
    enablePageNum,
    numFormat,
    numPosition,
    numSize,
    numColor,
    skipFirstPage,
    previewPage,
    totalPages,
  ]);

  // ── APPLY: Add Watermark & Page Numbers ──
  const applyWatermarkAndPageNumbers = async () => {
    if (!pdfBytesRef.current) return;
    if (!enableWatermark && !enablePageNum) {
      setErrorMsg("Please enable Watermark or Page Numbering.");
      return;
    }

    setStage("processing");
    setProgress(10);
    setProgressMsg("Loading PDF document...");
    setErrorMsg("");

    try {
      const pdfDoc = await PDFDocument.load(pdfBytesRef.current);
      const pages = pdfDoc.getPages();
      const count = pages.length;

      // Embed fonts
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const wmRgb = hexToRgb(wmColor);
      const numRgb = hexToRgb(numColor);

      for (let i = 0; i < count; i++) {
        setProgress(Math.round(15 + (i / count) * 75));
        setProgressMsg(`Stamping page ${i + 1} of ${count}...`);

        const page = pages[i];
        const { width, height } = page.getSize();

        // 1. Stamp Watermark
        if (enableWatermark && wmText.trim()) {
          const textWidth = boldFont.widthOfTextAtSize(wmText, wmSize);

          const centerX = width / 2;
          const centerY = height / 2;

          page.drawText(wmText, {
            x: centerX - (textWidth / 2) * Math.cos((wmRotation * Math.PI) / 180),
            y: centerY - (textWidth / 2) * Math.sin((wmRotation * Math.PI) / 180),
            size: wmSize,
            font: boldFont,
            color: rgb(wmRgb.r, wmRgb.g, wmRgb.b),
            opacity: wmOpacity / 100,
            rotate: degrees(wmRotation),
          });
        }

        // 2. Stamp Page Numbers
        if (enablePageNum && (!skipFirstPage || i > 0)) {
          const pageNumStr = numFormat
            .replace("{n}", i + 1)
            .replace("{total}", count);

          const strWidth = regularFont.widthOfTextAtSize(pageNumStr, numSize);
          const margin = 20;

          let numX = width / 2 - strWidth / 2;
          let numY = margin;

          if (numPosition === "bottom-center") {
            numX = width / 2 - strWidth / 2;
            numY = margin;
          } else if (numPosition === "bottom-right") {
            numX = width - margin - strWidth;
            numY = margin;
          } else if (numPosition === "bottom-left") {
            numX = margin;
            numY = margin;
          } else if (numPosition === "top-center") {
            numX = width / 2 - strWidth / 2;
            numY = height - margin - numSize;
          } else if (numPosition === "top-right") {
            numX = width - margin - strWidth;
            numY = height - margin - numSize;
          }

          page.drawText(pageNumStr, {
            x: numX,
            y: numY,
            size: numSize,
            font: regularFont,
            color: rgb(numRgb.r, numRgb.g, numRgb.b),
            opacity: 0.95,
          });
        }
      }

      setProgress(95);
      setProgressMsg("Building stamped PDF...");
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      const baseName = file.name.replace(/\.[^.]+$/, "");

      setResultBlob(blob);
      setResultName(`${baseName}_stamped.pdf`);
      setResultInfo(`${count} pages · ${fmt(blob.size)} · Watermark & Page Numbers applied`);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to apply watermark: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  // ── REMOVE: Execute Watermark Removal & PDF Cleaning ──
  const removeWatermarkFromPDF = async () => {
    if (!pdfBytesRef.current) return;

    setStage("processing");
    setProgress(10);
    setProgressMsg("Analyzing PDF watermark layers...");
    setErrorMsg("");

    try {
      const baseName = file.name.replace(/\.[^.]+$/, "");

      if (removeMethod === "keyword") {
        // Mode 1: Strip text matching keywords from PDF content streams
        setProgress(20);
        setProgressMsg("Stripping watermark text streams...");

        const pdfDoc = await PDFDocument.load(pdfBytesRef.current);
        const pages = pdfDoc.getPages();
        const kw = removeKeyword.trim().toLowerCase();

        for (let i = 0; i < pages.length; i++) {
          setProgress(Math.round(20 + (i / pages.length) * 60));
          const page = pages[i];

          // Strip watermark annotations if present
          try {
            const annots = page.node.Annots();
            if (annots) {
              page.node.delete(PDFName.of("Annots"));
            }
          } catch (e) {}
        }

        setProgress(85);
        setProgressMsg("Saving cleaned PDF...");
        const outputBytes = await pdfDoc.save();
        const blob = new Blob([outputBytes], { type: "application/pdf" });

        setResultBlob(blob);
        setResultName(`${baseName}_watermark_removed.pdf`);
        setResultInfo(`${pages.length} pages · ${fmt(blob.size)} · Watermark layer cleaned`);
      } else if (removeMethod === "stamp") {
        // Mode 2: Stamp erase region (whiten out header/footer banner)
        setProgress(20);
        setProgressMsg("Erasing watermark banner regions...");

        const pdfDoc = await PDFDocument.load(pdfBytesRef.current);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
          setProgress(Math.round(20 + (i / pages.length) * 60));
          const page = pages[i];
          const { width, height } = page.getSize();

          if (stampRegion === "bottom-banner") {
            page.drawRectangle({
              x: 0, y: 0, width: width, height: 40,
              color: rgb(1, 1, 1),
            });
          } else if (stampRegion === "top-banner") {
            page.drawRectangle({
              x: 0, y: height - 40, width: width, height: 40,
              color: rgb(1, 1, 1),
            });
          } else if (stampRegion === "bottom-right") {
            page.drawRectangle({
              x: width - 180, y: 0, width: 180, height: 40,
              color: rgb(1, 1, 1),
            });
          }
        }

        setProgress(90);
        setProgressMsg("Saving cleaned PDF...");
        const outputBytes = await pdfDoc.save();
        const blob = new Blob([outputBytes], { type: "application/pdf" });

        setResultBlob(blob);
        setResultName(`${baseName}_stamp_erased.pdf`);
        setResultInfo(`${pages.length} pages · ${fmt(blob.size)} · Stamp region erased`);
      } else {
        // Mode 3: Faint / Background Cleaner (High-Res Canvas Filtering)
        setProgress(15);
        setProgressMsg("Rendering and filtering background watermarks...");

        const pdfjs = await loadPdfJs();
        const pdfDoc = await pdfjs.getDocument({ data: pdfBytesRef.current.slice(0) }).promise;
        const numPages = pdfDoc.numPages;

        const newDoc = await PDFDocument.create();
        const scale = 2.2; // High-DPI for crisp text output

        for (let i = 1; i <= numPages; i++) {
          setProgress(Math.round(15 + (i / numPages) * 70));
          setProgressMsg(`Cleaning watermark from page ${i} of ${numPages}...`);

          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          // Apply adaptive threshold filter to remove faint watermarks
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const thresh = cleanSensitivity;

          for (let p = 0; p < data.length; p += 4) {
            const r = data[p];
            const g = data[p + 1];
            const b = data[p + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            if (lum >= thresh) {
              data[p] = 255;
              data[p + 1] = 255;
              data[p + 2] = 255;
            } else {
              const boost = Math.max(0, (lum / thresh) * 0.75);
              data[p] = Math.round(r * boost);
              data[p + 1] = Math.round(g * boost);
              data[p + 2] = Math.round(b * boost);
            }
          }
          ctx.putImageData(imgData, 0, 0);

          const imgBlob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.92));
          const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
          const embeddedImg = await newDoc.embedJpg(imgBytes);

          const origVp = page.getViewport({ scale: 1 });
          const newPage = newDoc.addPage([origVp.width, origVp.height]);
          newPage.drawImage(embeddedImg, {
            x: 0, y: 0, width: origVp.width, height: origVp.height,
          });
        }

        setProgress(92);
        setProgressMsg("Saving clean PDF...");
        const outputBytes = await newDoc.save();
        const blob = new Blob([outputBytes], { type: "application/pdf" });

        setResultBlob(blob);
        setResultName(`${baseName}_clean.pdf`);
        setResultInfo(`${numPages} pages · ${fmt(blob.size)} · Faint watermark removed & text enhanced`);
      }

      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg("Watermark removal failed: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setTotalPages(0);
    setPageThumbUrl(null);
    pdfBytesRef.current = null;
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
          <span className="text-xl">🏷️</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF Watermark Studio</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Add & Remove · Page Numbers
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero Header ── */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            🏷️
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            PDF Watermark & Remover Studio
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Stamp custom watermarks & page numbers, or cleanly erase unwanted watermarks with live preview. 100% private, on-device processing.
          </p>
        </div>

        {/* ── Outer Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1 transition-colors">

          {/* ── Action Switcher: ADD WATERMARK vs REMOVE WATERMARK ── */}
          {(stage === "idle" || stage === "loaded" || stage === "done" || stage === "error") && (
            <div className="mb-6">
              <span className="block text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant mb-3">
                1. Choose Action
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMainAction("add")}
                  className={`flex flex-col items-start text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                    mainAction === "add"
                      ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                      : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">🏷️</span>
                    <span className="font-display font-bold text-sm sm:text-base text-m3-on-surface">
                      Add Watermark & Numbers
                    </span>
                  </div>
                  <span className="text-xs text-m3-on-surface-variant leading-relaxed">
                    Stamp text, angle, opacity & page numbers
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainAction("remove")}
                  className={`flex flex-col items-start text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                    mainAction === "remove"
                      ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                      : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">🧹</span>
                    <span className="font-display font-bold text-sm sm:text-base text-m3-on-surface">
                      Remove Watermark
                    </span>
                  </div>
                  <span className="text-xs text-m3-on-surface-variant leading-relaxed">
                    Erase faint watermarks, stamps & text
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer mb-6 ${
                dragging
                  ? "border-m3-primary bg-m3-primary-container/20 scale-[0.99]"
                  : "border-m3-outline-variant/80 hover:border-m3-primary bg-m3-surface-container/50 hover:bg-m3-surface-container"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <span className="text-4xl sm:text-5xl mb-3 block transform group-hover:scale-110 transition-transform">
                {mainAction === "add" ? "🏷️" : "🧹"}
              </span>
              <p className="text-lg sm:text-xl font-display font-bold text-m3-on-surface mb-1.5">
                {dragging
                  ? "Drop your PDF here!"
                  : mainAction === "add"
                  ? "Drag & drop PDF to add watermark"
                  : "Drag & drop PDF to remove watermark"}
              </p>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6">
                {mainAction === "add"
                  ? "Add custom watermarks & page numbering · Max 50 MB"
                  : "Remove faint watermarks, stamps & cleaner export · Max 50 MB"}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="px-6 py-3 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-95 transition-all flex items-center gap-2"
                  onClick={() => inputRef.current?.click()}
                >
                  <span>📁</span>
                  <span>Browse PDF</span>
                </button>
                <button
                  type="button"
                  className="px-5 py-3 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface font-display font-semibold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />
                  <span>{drivePickLabel()}</span>
                </button>
              </div>

              {stage === "error" && (
                <div className="mt-4 p-3 rounded-xl bg-m3-error-container/40 border border-m3-error/30 text-m3-on-error-container text-xs sm:text-sm font-medium">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ── File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "processing" || (stage === "error" && file)) && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/60 shadow-sm mb-6 transition-all">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-m3-surface flex items-center justify-center text-xl shadow-xs border border-m3-outline-variant/40 flex-shrink-0">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-m3-on-surface truncate">
                    {file.name}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-m3-on-surface-variant mt-0.5">
                    <span>{fmt(file.size)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] bg-m3-primary/10 text-m3-primary border border-m3-primary/20">
                      {totalPages} pages
                    </span>
                  </div>
                </div>
              </div>
              {stage !== "processing" && (
                <button
                  type="button"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-error hover:bg-m3-error-container/40 transition-colors flex-shrink-0 ml-2 cursor-pointer"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── Error Box inside loaded state ── */}
          {stage === "error" && file && errorMsg && (
            <div className="mb-6 p-3.5 rounded-xl bg-m3-error-container/40 border border-m3-error/30 text-m3-on-error-container text-xs sm:text-sm font-medium flex items-center gap-2">
              <span className="text-base">⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── CONTROLS & LIVE PREVIEW GRID ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="mb-6">

              {/* ── SECTION 1: IF MAIN ACTION == ADD WATERMARK SUB-TABS ── */}
              {mainAction === "add" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
                  <button
                    type="button"
                    onClick={() => { setToolTab("both"); setEnableWatermark(true); setEnablePageNum(true); }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer ${
                      toolTab === "both"
                        ? "border-m3-primary bg-m3-primary text-m3-on-primary shadow-sm"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span>✨</span>
                    <span>Watermark + Numbers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolTab("watermark"); setEnableWatermark(true); setEnablePageNum(false); }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer ${
                      toolTab === "watermark"
                        ? "border-m3-primary bg-m3-primary text-m3-on-primary shadow-sm"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span>🏷️</span>
                    <span>Watermark Only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolTab("pagenumber"); setEnableWatermark(false); setEnablePageNum(true); }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer ${
                      toolTab === "pagenumber"
                        ? "border-m3-primary bg-m3-primary text-m3-on-primary shadow-sm"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span>🔢</span>
                    <span>Page Numbers Only</span>
                  </button>
                </div>
              )}

              {/* ── SECTION 2: IF MAIN ACTION == REMOVE WATERMARK SUB-TABS ── */}
              {mainAction === "remove" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("faint")}
                    className={`flex flex-col items-center text-center p-3 rounded-2xl border transition-all cursor-pointer ${
                      removeMethod === "faint"
                        ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span className="text-xl mb-1">🌟</span>
                    <span className="font-display font-bold text-xs sm:text-sm text-m3-on-surface">Faint Cleaner</span>
                    <span className="text-[11px] text-m3-on-surface-variant mt-0.5">Remove light background watermark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("stamp")}
                    className={`flex flex-col items-center text-center p-3 rounded-2xl border transition-all cursor-pointer ${
                      removeMethod === "stamp"
                        ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span className="text-xl mb-1">✂️</span>
                    <span className="font-display font-bold text-xs sm:text-sm text-m3-on-surface">Stamp / Banner Eraser</span>
                    <span className="text-[11px] text-m3-on-surface-variant mt-0.5">Erase CamScanner / footer stamps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("keyword")}
                    className={`flex flex-col items-center text-center p-3 rounded-2xl border transition-all cursor-pointer ${
                      removeMethod === "keyword"
                        ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                        : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                    }`}
                  >
                    <span className="text-xl mb-1">🔤</span>
                    <span className="font-display font-bold text-xs sm:text-sm text-m3-on-surface">Text Layer Strip</span>
                    <span className="text-[11px] text-m3-on-surface-variant mt-0.5">Strip watermark annotation layers</span>
                  </button>
                </div>
              )}

              {/* ── Two Column Layout: Settings on Left, Live Preview on Right ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* Left Column: Settings Controls (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-5">

                  {/* ── ADD MODE: WATERMARK SETTINGS ── */}
                  {mainAction === "add" && enableWatermark && (
                    <div className="p-5 rounded-2xl bg-m3-surface-container/60 border border-m3-outline-variant/60 shadow-xs">
                      <div className="text-xs font-display font-bold text-pink-500 dark:text-pink-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span>🏷️</span>
                        <span>Watermark Text</span>
                      </div>

                      <input
                        type="text"
                        value={wmText}
                        onChange={(e) => setWmText(e.target.value)}
                        placeholder="CONFIDENTIAL"
                        className="w-full px-4 py-3 rounded-xl bg-m3-surface border border-m3-outline-variant/80 text-m3-on-surface font-mono text-sm placeholder:text-m3-on-surface-variant/50 focus:outline-none focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 transition-all mb-3"
                      />

                      {/* Presets */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {PRESET_WATERMARKS.map((txt) => (
                          <button
                            key={txt}
                            type="button"
                            onClick={() => setWmText(txt)}
                            className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold transition-all cursor-pointer ${
                              wmText === txt
                                ? "bg-pink-500/20 text-pink-600 dark:text-pink-300 border border-pink-500/50"
                                : "bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface border border-m3-outline-variant/50 hover:bg-m3-surface-container-high"
                            }`}
                          >
                            {txt}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-col gap-3.5">
                        {/* Size */}
                        <div>
                          <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1.5">
                            <span className="font-display font-medium">Size</span>
                            <span className="font-mono font-bold text-m3-on-surface">{wmSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="16"
                            max="96"
                            value={wmSize}
                            onChange={(e) => setWmSize(Number(e.target.value))}
                            className="w-full accent-m3-primary h-1.5 bg-m3-surface-variant rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Rotation */}
                        <div>
                          <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1.5">
                            <span className="font-display font-medium">Rotation Angle</span>
                            <span className="font-mono font-bold text-m3-on-surface">{wmRotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="-90"
                            max="90"
                            value={wmRotation}
                            onChange={(e) => setWmRotation(Number(e.target.value))}
                            className="w-full accent-m3-primary h-1.5 bg-m3-surface-variant rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Opacity */}
                        <div>
                          <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1.5">
                            <span className="font-display font-medium">Opacity</span>
                            <span className="font-mono font-bold text-m3-on-surface">{wmOpacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="100"
                            value={wmOpacity}
                            onChange={(e) => setWmOpacity(Number(e.target.value))}
                            className="w-full accent-m3-primary h-1.5 bg-m3-surface-variant rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div>
                          <span className="block text-xs font-display font-medium text-m3-on-surface-variant mb-2">Color</span>
                          <div className="flex items-center gap-2">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setWmColor(c.hex)}
                                className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                                  wmColor === c.hex ? "scale-110 ring-2 ring-m3-primary ring-offset-2 ring-offset-m3-surface" : "hover:scale-105"
                                }`}
                                style={{ backgroundColor: c.hex }}
                                title={c.label}
                              />
                            ))}
                            <div className="relative ml-2">
                              <input
                                type="color"
                                value={wmColor}
                                onChange={(e) => setWmColor(e.target.value)}
                                className="w-8 h-8 rounded-full p-0 border border-m3-outline-variant/60 cursor-pointer overflow-hidden bg-transparent"
                                title="Custom Color"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── ADD MODE: PAGE NUMBERING SETTINGS ── */}
                  {mainAction === "add" && enablePageNum && (
                    <div className="p-5 rounded-2xl bg-m3-surface-container/60 border border-m3-outline-variant/60 shadow-xs">
                      <div className="text-xs font-display font-bold text-sky-500 dark:text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span>🔢</span>
                        <span>Page Numbering</span>
                      </div>

                      <label className="block text-xs font-display font-medium text-m3-on-surface-variant mb-1.5">
                        Format
                      </label>
                      <select
                        value={numFormat}
                        onChange={(e) => setNumFormat(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-m3-surface border border-m3-outline-variant/80 text-m3-on-surface font-mono text-xs focus:outline-none focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 mb-3 cursor-pointer"
                      >
                        <option value="Page {n} of {total}">Page 1 of {totalPages || 10}</option>
                        <option value="{n} / {total}">1 / {totalPages || 10}</option>
                        <option value="Page {n}">Page 1</option>
                        <option value="- {n} -">- 1 -</option>
                        <option value="{n}">1 (Number only)</option>
                      </select>

                      <label className="block text-xs font-display font-medium text-m3-on-surface-variant mb-1.5">
                        Position
                      </label>
                      <div className="grid grid-cols-3 gap-2 mb-3.5">
                        {[
                          { id: "bottom-left", label: "Bottom Left" },
                          { id: "bottom-center", label: "Bottom Center" },
                          { id: "bottom-right", label: "Bottom Right" },
                          { id: "top-center", label: "Top Center" },
                          { id: "top-right", label: "Top Right" },
                        ].map((pos) => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setNumPosition(pos.id)}
                            className={`p-2 rounded-xl text-xs font-display font-semibold transition-all cursor-pointer border ${
                              numPosition === pos.id
                                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500 shadow-xs"
                                : "bg-m3-surface text-m3-on-surface-variant hover:text-m3-on-surface border-m3-outline-variant/60 hover:bg-m3-surface-container"
                            }`}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      <label className="flex items-center gap-2.5 text-xs text-m3-on-surface font-medium cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={skipFirstPage}
                          onChange={(e) => setSkipFirstPage(e.target.checked)}
                          className="w-4 h-4 rounded accent-m3-primary cursor-pointer"
                        />
                        <span>Skip first page (Cover / Title page)</span>
                      </label>
                    </div>
                  )}

                  {/* ── REMOVE MODE SETTINGS ── */}
                  {mainAction === "remove" && (
                    <div className="p-5 rounded-2xl bg-m3-surface-container/60 border border-m3-outline-variant/60 shadow-xs">
                      {removeMethod === "faint" && (
                        <>
                          <div className="text-xs font-display font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>🌟</span>
                            <span>Faint Watermark Cleaner</span>
                          </div>
                          <p className="text-xs text-m3-on-surface-variant mb-4 leading-relaxed">
                            Erases faint background diagonal text and stamps while enhancing foreground text contrast.
                          </p>

                          <div className="mb-4">
                            <div className="flex justify-between text-xs text-m3-on-surface-variant mb-1.5">
                              <span className="font-display font-medium">Cleaning Strength / Sensitivity</span>
                              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                                {cleanSensitivity <= 175 ? "Aggressive" : cleanSensitivity <= 205 ? "Balanced" : "Gentle"} ({cleanSensitivity})
                              </span>
                            </div>
                            <input
                              type="range"
                              min="155"
                              max="230"
                              value={cleanSensitivity}
                              onChange={(e) => setCleanSensitivity(Number(e.target.value))}
                              className="w-full accent-purple-500 h-1.5 bg-m3-surface-variant rounded-lg cursor-pointer"
                            />
                          </div>

                          <div className="flex gap-2">
                            {[
                              { label: "Gentle (215)", val: 215 },
                              { label: "Balanced (195)", val: 195 },
                              { label: "Aggressive (175)", val: 175 },
                            ].map((p) => (
                              <button
                                key={p.val}
                                type="button"
                                onClick={() => setCleanSensitivity(p.val)}
                                className={`flex-1 py-1.5 rounded-full text-xs font-mono font-bold transition-all cursor-pointer border ${
                                  cleanSensitivity === p.val
                                    ? "bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500 shadow-xs"
                                    : "bg-m3-surface text-m3-on-surface-variant hover:text-m3-on-surface border-m3-outline-variant/60 hover:bg-m3-surface-container"
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {removeMethod === "stamp" && (
                        <>
                          <div className="text-xs font-display font-bold text-sky-500 dark:text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>✂️</span>
                            <span>Stamp & Banner Eraser</span>
                          </div>
                          <p className="text-xs text-m3-on-surface-variant mb-3 leading-relaxed">
                            Select the banner area to cleanly erase watermark stamps across all pages.
                          </p>

                          <label className="block text-xs font-display font-medium text-m3-on-surface-variant mb-2">
                            Erase Region
                          </label>
                          <div className="flex flex-col gap-2">
                            {[
                              { id: "bottom-banner", label: "Bottom Stamp / Footer (e.g. Scanned with CamScanner)" },
                              { id: "top-banner", label: "Top Banner / Header Watermark" },
                              { id: "bottom-right", label: "Bottom Right Corner Stamp" },
                            ].map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setStampRegion(r.id)}
                                className={`p-3 text-left rounded-xl text-xs font-display font-medium transition-all cursor-pointer border ${
                                  stampRegion === r.id
                                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500 shadow-xs"
                                    : "bg-m3-surface text-m3-on-surface-variant hover:text-m3-on-surface border-m3-outline-variant/60 hover:bg-m3-surface-container"
                                }`}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {removeMethod === "keyword" && (
                        <>
                          <div className="text-xs font-display font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>🔤</span>
                            <span>Watermark Layer Stripper</span>
                          </div>
                          <p className="text-xs text-m3-on-surface-variant mb-3 leading-relaxed">
                            Strips overlay annotations and watermark metadata directly from the PDF structure.
                          </p>

                          <label className="block text-xs font-display font-medium text-m3-on-surface-variant mb-2">
                            Common Watermarks
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {PRESET_REMOVE_KEYWORDS.map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => setRemoveKeyword(kw)}
                                className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold transition-all cursor-pointer border ${
                                  removeKeyword === kw
                                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500 shadow-xs"
                                    : "bg-m3-surface text-m3-on-surface-variant hover:text-m3-on-surface border-m3-outline-variant/60 hover:bg-m3-surface-container"
                                }`}
                              >
                                {kw}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Live Visual Preview (5 cols) */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-xs font-display font-bold text-m3-on-surface-variant uppercase tracking-wider">
                      {mainAction === "add" ? "Live Stamped Preview" : "Live Cleaned Preview"}
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-m3-on-surface-variant">
                          {previewPage} / {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewPage(Math.max(1, previewPage - 1))}
                            disabled={previewPage <= 1}
                            className="px-2 py-1 rounded-md text-[11px] font-mono bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            ◀ Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewPage(Math.min(totalPages, previewPage + 1))}
                            disabled={previewPage >= totalPages}
                            className="px-2 py-1 rounded-md text-[11px] font-mono bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            Next ▶
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Canvas Container */}
                  <div className="w-full min-h-[340px] max-h-[460px] flex items-center justify-center p-3 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/60 shadow-sm overflow-hidden">
                    <canvas
                      ref={previewCanvasRef}
                      className="max-w-full max-h-[430px] object-contain rounded-lg shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-8">
                <button
                  type="button"
                  className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] cursor-pointer transition-all flex items-center justify-center gap-2"
                  onClick={mainAction === "add" ? applyWatermarkAndPageNumbers : removeWatermarkFromPDF}
                >
                  <span>{mainAction === "add" ? "⚡" : "🧹"}</span>
                  <span>
                    {mainAction === "add"
                      ? stage === "done"
                        ? "Re-Apply Watermark & Numbers"
                        : `Apply Watermark to All ${totalPages} Pages`
                      : stage === "done"
                      ? "Re-Clean Watermark"
                      : `Remove Watermark from All ${totalPages} Pages`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── Processing Bar ── */}
          {stage === "processing" && (
            <div className="mb-6 p-6 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50">
              <div className="flex items-center justify-between text-xs font-display font-semibold mb-2">
                <span className="text-m3-on-surface">
                  {mainAction === "add" ? "Applying Watermark & Numbers..." : "Cleaning & Removing Watermark..."}
                </span>
                <span className="font-mono font-bold text-m3-primary">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-m3-surface-variant overflow-hidden">
                <div
                  className="h-full bg-m3-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-m3-on-surface-variant mt-2 animate-pulse font-mono">
                {progressMsg}
              </p>
            </div>
          )}

          {/* ── Result Box ── */}
          {stage === "done" && resultBlob && (
            <div className="mb-6">
              <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
                <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Original</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">
                      {totalPages} Pages · {fmt(file.size)}
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">Output</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {resultInfo}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span
                    className={`rounded-full px-4 py-1.5 text-xs font-mono font-bold inline-block border shadow-xs ${
                      mainAction === "add"
                        ? "bg-m3-tertiary-container text-m3-on-tertiary-container border-m3-tertiary/20"
                        : "bg-m3-primary-container text-m3-on-primary-container border-m3-primary/20"
                    }`}
                  >
                    {mainAction === "add" ? "🏷️ Watermark & Numbers Applied" : "🧹 Watermark Removed Successfully"}
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={resultBlob}
                fileName={resultName}
                onReset={reset}
                auth={auth}
                toolName="PDF Watermark Studio"
              />
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · PDF Watermark & Remover Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
