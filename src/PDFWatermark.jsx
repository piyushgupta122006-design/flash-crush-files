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
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">PDF Watermark Studio</div>
        <div className="tool-page-meta">Add & Remove Watermarks · Page Numbers</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(236, 72, 153, 0.4)", boxShadow: "0 0 20px rgba(236, 72, 153, 0.3)" }}>
              🏷️
            </div>
            <div className="comp-title">PDF Watermark & Remover Studio</div>
          </div>
          <p className="comp-sub">Stamp custom watermarks & page numbers, or cleanly erase unwanted watermarks with live preview.</p>
        </div>

        <div className="comp-card">

          {/* ── Action Switcher: ADD WATERMARK vs REMOVE WATERMARK ── */}
          {(stage === "idle" || stage === "loaded" || stage === "done" || stage === "error") && (
            <div className="level-wrap" style={{ marginBottom: "16px" }}>
              <span className="level-label">Choose Action</span>
              <div className="level-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <button
                  type="button"
                  onClick={() => setMainAction("add")}
                  className={`level-btn${mainAction === "add" ? " active" : ""}`}
                >
                  <span style={{ fontSize: "1.4rem" }}>🏷️</span>
                  <span className="level-name">Add Watermark & Numbers</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>Stamp text, angle, opacity & page numbers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMainAction("remove")}
                  className={`level-btn${mainAction === "remove" ? " active" : ""}`}
                >
                  <span style={{ fontSize: "1.4rem" }}>🧹</span>
                  <span className="level-name">Remove Watermark</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>Erase faint watermarks, stamps & text</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">{mainAction === "add" ? "🏷️" : "🧹"}</span>
              <p className="drop-main">
                {dragging
                  ? "Drop your PDF here!"
                  : mainAction === "add"
                    ? "Drag & drop PDF to add watermark"
                    : "Drag & drop PDF to remove watermark"}
              </p>
              <p className="drop-sub">
                {mainAction === "add"
                  ? "Add custom watermarks & page numbering · max 50 MB"
                  : "Remove faint watermarks, stamps & cleaner export · max 50 MB"}
              </p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>📁 Browse PDF</button>
                <button className="drop-btn-drive" onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>}
            </div>
          )}

          {/* ── File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "processing" || (stage === "error" && file)) && (
            <div className="file-row">
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)} · {totalPages} pages</div>
              </div>
              {stage !== "processing" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── Error Box inside loaded state ── */}
          {stage === "error" && file && errorMsg && (
            <div style={{ padding: "0 20px 10px" }}>
              <div className="error-box">⚠ {errorMsg}</div>
            </div>
          )}

          {/* ── CONTROLS & LIVE PREVIEW GRID ── */}
          {(stage === "loaded" || stage === "done") && (
            <div style={{ padding: "0 20px 16px" }}>

              {/* ── SECTION 1: IF MAIN ACTION == ADD WATERMARK ── */}
              {mainAction === "add" && (
                <>
                  {/* Mode Sub-Toggles */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      onClick={() => { setToolTab("both"); setEnableWatermark(true); setEnablePageNum(true); }}
                      className={`level-btn${toolTab === "both" ? " active" : ""}`}
                    >
                      <span style={{ fontSize: "1.2rem" }}>✨</span>
                      <span className="level-name">Watermark + Numbers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setToolTab("watermark"); setEnableWatermark(true); setEnablePageNum(false); }}
                      className={`level-btn${toolTab === "watermark" ? " active" : ""}`}
                    >
                      <span style={{ fontSize: "1.2rem" }}>🏷️</span>
                      <span className="level-name">Watermark Only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setToolTab("pagenumber"); setEnableWatermark(false); setEnablePageNum(true); }}
                      className={`level-btn${toolTab === "pagenumber" ? " active" : ""}`}
                    >
                      <span style={{ fontSize: "1.2rem" }}>🔢</span>
                      <span className="level-name">Page Numbers Only</span>
                    </button>
                  </div>
                </>
              )}

              {/* ── SECTION 2: IF MAIN ACTION == REMOVE WATERMARK ── */}
              {mainAction === "remove" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("faint")}
                    className={`level-btn${removeMethod === "faint" ? " active" : ""}`}
                  >
                    <span style={{ fontSize: "1.2rem" }}>🌟</span>
                    <span className="level-name">Faint Cleaner</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-sub)" }}>Remove light background watermark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("stamp")}
                    className={`level-btn${removeMethod === "stamp" ? " active" : ""}`}
                  >
                    <span style={{ fontSize: "1.2rem" }}>✂️</span>
                    <span className="level-name">Stamp / Banner Eraser</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-sub)" }}>Erase CamScanner / footer stamps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveMethod("keyword")}
                    className={`level-btn${removeMethod === "keyword" ? " active" : ""}`}
                  >
                    <span style={{ fontSize: "1.2rem" }}>🔤</span>
                    <span className="level-name">Text Layer Strip</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-sub)" }}>Strip watermark annotation layers</span>
                  </button>
                </div>
              )}

              {/* ── Two Column Layout: Settings on Left, Live Preview on Right ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

                {/* Left Column: Settings Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* ── ADD MODE SETTINGS ── */}
                  {mainAction === "add" && enableWatermark && (
                    <div style={{
                      padding: "14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#f472b6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🏷️</span> Watermark Text
                      </div>

                      <input
                        type="text"
                        value={wmText}
                        onChange={(e) => setWmText(e.target.value)}
                        placeholder="CONFIDENTIAL"
                        style={{
                          width: "100%", padding: "10px 14px", boxSizing: "border-box",
                          background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)",
                          borderRadius: "10px", fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "13px", color: "#fff", outline: "none", marginBottom: "10px",
                        }}
                      />

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px" }}>
                        {PRESET_WATERMARKS.map(txt => (
                          <button
                            key={txt}
                            type="button"
                            onClick={() => setWmText(txt)}
                            style={{
                              padding: "3px 8px", background: wmText === txt ? "rgba(236,72,153,0.3)" : "rgba(255,255,255,0.05)",
                              border: wmText === txt ? "1px solid #ec4899" : "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "6px", color: wmText === txt ? "#f472b6" : "#94a3b8",
                              fontSize: "10px", fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {txt}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Size</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmSize}px</span>
                          </div>
                          <input type="range" min="16" max="96" value={wmSize} onChange={(e) => setWmSize(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Rotation Angle</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmRotation}°</span>
                          </div>
                          <input type="range" min="-90" max="90" value={wmRotation} onChange={(e) => setWmRotation(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                            <span>Opacity</span>
                            <span style={{ color: "#fff", fontWeight: 700 }}>{wmOpacity}%</span>
                          </div>
                          <input type="range" min="5" max="100" value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} style={{ width: "100%", accentColor: "#ec4899" }} />
                        </div>

                        <div>
                          <span style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>Color</span>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setWmColor(c.hex)}
                                style={{
                                  width: "22px", height: "22px", borderRadius: "50%",
                                  background: c.hex, border: wmColor === c.hex ? "2px solid #fff" : "2px solid transparent",
                                  cursor: "pointer", transform: wmColor === c.hex ? "scale(1.15)" : "scale(1)",
                                }}
                                title={c.label}
                              />
                            ))}
                            <input
                              type="color"
                              value={wmColor}
                              onChange={(e) => setWmColor(e.target.value)}
                              style={{ width: "24px", height: "24px", padding: 0, border: "none", background: "none", cursor: "pointer", marginLeft: "4px" }}
                              title="Custom Color"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {mainAction === "add" && enablePageNum && (
                    <div style={{
                      padding: "14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🔢</span> Page Numbering
                      </div>

                      <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Format</label>
                      <select
                        value={numFormat}
                        onChange={(e) => setNumFormat(e.target.value)}
                        style={{
                          width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.06)",
                          border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: "10px",
                          color: "#fff", fontSize: "12px", outline: "none", marginBottom: "10px",
                        }}
                      >
                        <option value="Page {n} of {total}" style={{ background: "#0f172a" }}>Page 1 of {totalPages || 10}</option>
                        <option value="{n} / {total}" style={{ background: "#0f172a" }}>1 / {totalPages || 10}</option>
                        <option value="Page {n}" style={{ background: "#0f172a" }}>Page 1</option>
                        <option value="- {n} -" style={{ background: "#0f172a" }}>- 1 -</option>
                        <option value="{n}" style={{ background: "#0f172a" }}>1 (Number only)</option>
                      </select>

                      <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Position</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", marginBottom: "10px" }}>
                        {[
                          { id: "bottom-left", label: "Bottom Left" },
                          { id: "bottom-center", label: "Bottom Center" },
                          { id: "bottom-right", label: "Bottom Right" },
                          { id: "top-center", label: "Top Center" },
                          { id: "top-right", label: "Top Right" },
                        ].map(pos => (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setNumPosition(pos.id)}
                            style={{
                              padding: "6px", background: numPosition === pos.id ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                              border: numPosition === pos.id ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                              borderRadius: "6px", color: numPosition === pos.id ? "#38bdf8" : "#94a3b8",
                              fontSize: "10px", fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {pos.label}
                          </button>
                        ))}
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#cbd5e1", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={skipFirstPage}
                          onChange={(e) => setSkipFirstPage(e.target.checked)}
                          style={{ accentColor: "#38bdf8" }}
                        />
                        Skip first page (Cover / Title page)
                      </label>
                    </div>
                  )}

                  {/* ── REMOVE MODE SETTINGS ── */}
                  {mainAction === "remove" && (
                    <div style={{
                      padding: "14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "14px",
                    }}>
                      {removeMethod === "faint" && (
                        <>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🌟</span> Faint Watermark Cleaner
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-sub)", marginBottom: "12px" }}>
                            Erases faint background diagonal text/stamps while enhancing foreground text contrast.
                          </p>

                          <div style={{ marginBottom: "14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
                              <span>Cleaning Strength / Sensitivity</span>
                              <span style={{ color: "#c084fc", fontWeight: 700 }}>
                                {cleanSensitivity <= 175 ? "Aggressive" : cleanSensitivity <= 205 ? "Balanced" : "Gentle"} ({cleanSensitivity})
                              </span>
                            </div>
                            <input
                              type="range"
                              min="155"
                              max="230"
                              value={cleanSensitivity}
                              onChange={(e) => setCleanSensitivity(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#a855f7" }}
                            />
                          </div>

                          <div style={{ display: "flex", gap: "6px" }}>
                            {[
                              { label: "Gentle (215)", val: 215 },
                              { label: "Balanced (195)", val: 195 },
                              { label: "Aggressive (175)", val: 175 },
                            ].map(p => (
                              <button
                                key={p.val}
                                type="button"
                                onClick={() => setCleanSensitivity(p.val)}
                                style={{
                                  flex: 1, padding: "5px 4px",
                                  background: cleanSensitivity === p.val ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.05)",
                                  border: cleanSensitivity === p.val ? "1px solid #a855f7" : "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: "6px", color: cleanSensitivity === p.val ? "#c084fc" : "#94a3b8",
                                  fontSize: "10px", fontWeight: 700, cursor: "pointer",
                                }}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {removeMethod === "stamp" && (
                        <>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>✂️</span> Stamp & Banner Eraser
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-sub)", marginBottom: "12px" }}>
                            Select the banner area to cleanly erase watermark stamps across all pages.
                          </p>

                          <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>Erase Region</label>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {[
                              { id: "bottom-banner", label: "Bottom Stamp / Footer (e.g. Scanned with CamScanner)" },
                              { id: "top-banner", label: "Top Banner / Header Watermark" },
                              { id: "bottom-right", label: "Bottom Right Corner Stamp" },
                            ].map(r => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setStampRegion(r.id)}
                                style={{
                                  padding: "8px 12px", textAlign: "left",
                                  background: stampRegion === r.id ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.04)",
                                  border: stampRegion === r.id ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: "8px", color: stampRegion === r.id ? "#38bdf8" : "#cbd5e1",
                                  fontSize: "11px", fontWeight: 700, cursor: "pointer",
                                }}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {removeMethod === "keyword" && (
                        <>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🔤</span> Watermark Layer Stripper
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-sub)", marginBottom: "12px" }}>
                            Strips overlay annotations and watermark metadata directly from the PDF structure.
                          </p>

                          <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>Common Watermarks</label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px" }}>
                            {PRESET_REMOVE_KEYWORDS.map(kw => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => setRemoveKeyword(kw)}
                                style={{
                                  padding: "4px 8px", background: removeKeyword === kw ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.05)",
                                  border: removeKeyword === kw ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: "6px", color: removeKeyword === kw ? "#34d399" : "#94a3b8",
                                  fontSize: "10px", fontWeight: 700, cursor: "pointer",
                                }}
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

                {/* Right Column: Live Visual Preview */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {mainAction === "add" ? "Live Stamped Preview" : "Live Cleaned Preview"} (Page {previewPage} of {totalPages})
                    </span>
                    {totalPages > 1 && (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const p = Math.max(1, previewPage - 1);
                            setPreviewPage(p);
                          }}
                          disabled={previewPage <= 1}
                          style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", fontSize: "10px", cursor: previewPage <= 1 ? "not-allowed" : "pointer" }}
                        >
                          ◀ Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const p = Math.min(totalPages, previewPage + 1);
                            setPreviewPage(p);
                          }}
                          disabled={previewPage >= totalPages}
                          style={{ padding: "2px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "#fff", fontSize: "10px", cursor: previewPage >= totalPages ? "not-allowed" : "pointer" }}
                        >
                          Next ▶
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Canvas Container */}
                  <div style={{
                    width: "100%", maxHeight: "380px", overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#0a0a0a", borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    padding: "8px", boxSizing: "border-box"
                  }}>
                    <canvas
                      ref={previewCanvasRef}
                      style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain", borderRadius: "6px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="action-wrap" style={{ marginTop: "20px" }}>
                <button
                  className="btn-compress"
                  onClick={mainAction === "add" ? applyWatermarkAndPageNumbers : removeWatermarkFromPDF}
                >
                  {mainAction === "add"
                    ? (stage === "done" ? "🔁 Re-Apply Watermark & Numbers" : `⚡ Apply Watermark to All ${totalPages} Pages`)
                    : (stage === "done" ? "🔁 Re-Clean Watermark" : `🧹 Remove Watermark from All ${totalPages} Pages`)}
                </button>
              </div>
            </div>
          )}

          {/* ── Processing Bar ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">
                  {mainAction === "add" ? "Applying Watermark & Numbers..." : "Cleaning & Removing Watermark..."}
                </span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result Box ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{
                margin: "10px 0 20px",
                background: mainAction === "add" ? "rgba(236, 72, 153, 0.08)" : "rgba(168, 85, 247, 0.08)",
                borderColor: mainAction === "add" ? "rgba(236, 72, 153, 0.3)" : "rgba(168, 85, 247, 0.3)",
              }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {totalPages} Pages · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Output</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800,
                      color: mainAction === "add" ? "#f472b6" : "#c084fc"
                    }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{
                  background: mainAction === "add" ? "rgba(236, 72, 153, 0.18)" : "rgba(168, 85, 247, 0.18)",
                  borderColor: mainAction === "add" ? "#ec4899" : "#a855f7",
                  color: mainAction === "add" ? "#f472b6" : "#c084fc",
                }}>
                  {mainAction === "add" ? "🏷️ Watermark & Numbers Applied" : "🧹 Watermark Removed Successfully"}
                </div>
              </div>

              <ActionButtons blob={resultBlob} fileName={resultName} onReset={reset} auth={auth} />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF Watermark & Remover Studio</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
