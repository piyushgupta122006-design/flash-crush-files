// PDFToImage.jsx — High-Resolution PDF to Images Converter (JPG, PNG, WebP) with 1-Click ZIP Download
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 50;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

const FORMATS = [
  { id: "jpg", label: "JPG", desc: "Best for sharing & compact size", mime: "image/jpeg" },
  { id: "png", label: "PNG", desc: "Lossless crisp text & transparent", mime: "image/png" },
  { id: "webp", label: "WebP", desc: "Modern super-compact format", mime: "image/webp" },
];

const RESOLUTIONS = [
  { id: "standard", label: "Standard", scale: 1.5, desc: "150 DPI · Fast" },
  { id: "high", label: "High Res", scale: 2.0, desc: "200 DPI · Crisp Text" },
  { id: "ultra", label: "Ultra HD", scale: 3.0, desc: "300 DPI · Print Quality" },
];

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

export default function PDFToImage({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [format, setFormat] = useState("jpg");
  const [resolution, setResolution] = useState("high");
  const [stage, setStage] = useState("idle"); // idle | ready | converting | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [pages, setPages] = useState([]); // [{ pageNum, url, blob, width, height, size }]
  const [zipBlob, setZipBlob] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [pickLoading, setPickLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (f) => {
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
    setStage("ready");
    setErrorMsg("");
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
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf");

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147")
        .setOAuthToken(token)
        .addView(view)
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
              setErrorMsg(err.message || "Failed to download from Drive.");
              setStage("error");
            }
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  const convertPDF = async () => {
    if (!file) return;
    setStage("converting");
    setProgress(5);
    setProgressMsg("Loading PDF Engine...");
    setErrorMsg("");

    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;

      if (numPages === 0) throw new Error("PDF contains no pages.");

      const selectedRes = RESOLUTIONS.find(r => r.id === resolution) || RESOLUTIONS[1];
      const selectedFmt = FORMATS.find(f => f.id === format) || FORMATS[0];
      const scale = selectedRes.scale;
      const mime = selectedFmt.mime;
      const ext = selectedFmt.id;

      const convertedPages = [];
      const zip = new JSZip();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const folder = zip.folder(`${baseName}_images`);

      for (let i = 1; i <= numPages; i++) {
        setProgress(Math.round(10 + (i / numPages) * 75));
        setProgressMsg(`Rendering page ${i} of ${numPages}...`);

        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");

        // Fill white background for JPG / transparent formats
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, mime, ext === "png" ? 1 : 0.92);
        });

        const url = URL.createObjectURL(blob);
        const pageFileName = `${baseName}_page_${String(i).padStart(2, "0")}.${ext}`;

        folder.file(pageFileName, blob);

        convertedPages.push({
          pageNum: i,
          fileName: pageFileName,
          url,
          blob,
          width: canvas.width,
          height: canvas.height,
          size: blob.size,
        });
      }

      setProgress(90);
      setProgressMsg("Packing ZIP archive...");

      const zipData = await zip.generateAsync({ type: "blob" });
      setZipBlob(zipData);
      setPages(convertedPages);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(`Conversion failed: ${err.message || "Unknown error"}`);
      setStage("error");
    }
  };

  const reset = () => {
    pages.forEach(p => URL.revokeObjectURL(p.url));
    setPages([]);
    setFile(null);
    setZipBlob(null);
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setPreviewModal(null);
  };

  const downloadSinglePage = (page) => {
    const a = document.createElement("a");
    a.href = page.url;
    a.download = page.fileName;
    a.click();
  };

  const downloadZip = () => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name.replace(/\.[^.]+$/, "")}_images.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
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
      {/* ── Top Bar with Back Navigation ── */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 flex items-center justify-between transition-colors">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container-low hover:bg-m3-surface-container text-m3-on-surface text-sm font-semibold transition-all duration-200 shadow-sm active:scale-95"
          onClick={() => navigate("/")}
        >
          <span className="text-base leading-none">←</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">🖼️</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF to Images</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Max {MAX_SIZE_MB} MB · High Res · ZIP
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero Header ── */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            🖼️
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            PDF to Images Converter
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Convert every page of your PDF into crisp JPG, PNG, or WebP images with 1-click ZIP download. 100% private, on-device processing.
          </p>
        </div>

        {/* ── Outer Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1 transition-colors">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer ${
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
                📑
              </span>
              <p className="text-lg sm:text-xl font-display font-bold text-m3-on-surface mb-1.5">
                {dragging ? "Drop your PDF here!" : "Drag & drop your PDF document here"}
              </p>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6">
                Extract high-resolution images page by page · Max {MAX_SIZE_MB} MB
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

          {/* ── Selected File Row ── */}
          {(stage === "ready" || stage === "done" || stage === "converting") && file && (
            <div className="bg-m3-surface-container rounded-2xl p-4 sm:p-5 border border-m3-outline-variant/50 flex items-center justify-between gap-4 mb-6 shadow-sm">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-2.5 rounded-xl bg-m3-primary/10 text-m3-primary text-xl flex-shrink-0">
                  📄
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm sm:text-base text-m3-on-surface truncate">
                    {file.name}
                  </div>
                  <div className="text-xs font-mono text-m3-on-surface-variant mt-0.5">
                    {fmt(file.size)}
                  </div>
                </div>
              </div>
              {stage !== "converting" && (
                <button
                  type="button"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-error hover:bg-m3-error-container/30 transition-colors text-sm font-bold flex-shrink-0"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── Output Format & Quality Selectors ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="space-y-6 my-6">
              <div>
                <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-primary mb-3 block">
                  1. Choose Output Image Format
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`p-4 rounded-2xl text-left transition-all duration-200 cursor-pointer ${
                        format === f.id
                          ? "border-2 border-m3-primary bg-m3-primary-container text-m3-on-primary-container shadow-sm"
                          : "border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface"
                      }`}
                      onClick={() => setFormat(f.id)}
                    >
                      <div className="font-display font-bold text-base mb-1">
                        .{f.label}
                      </div>
                      <div className={`text-xs ${format === f.id ? "text-m3-on-primary-container/80" : "text-m3-on-surface-variant"}`}>
                        {f.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-primary mb-3 block">
                  2. Image Quality &amp; Resolution
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {RESOLUTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`p-4 rounded-2xl text-left transition-all duration-200 cursor-pointer ${
                        resolution === r.id
                          ? "border-2 border-m3-primary bg-m3-primary-container text-m3-on-primary-container shadow-sm"
                          : "border border-m3-outline-variant/70 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface"
                      }`}
                      onClick={() => setResolution(r.id)}
                    >
                      <div className="font-display font-bold text-base mb-1">
                        {r.label}
                      </div>
                      <div className={`text-xs ${resolution === r.id ? "text-m3-on-primary-container/80" : "text-m3-on-surface-variant"}`}>
                        {r.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Convert Button ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="my-6">
              <button
                type="button"
                className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                onClick={convertPDF}
              >
                <span>
                  {stage === "done" ? "🔁 Re-convert PDF to Images" : "⚡ Convert PDF to Images"}
                </span>
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "converting" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-m3-on-surface mb-2.5">
                <span>Converting PDF pages to images...</span>
                <span className="font-mono text-m3-primary font-bold text-sm">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-m3-surface-container-highest overflow-hidden">
                <div
                  className="h-full rounded-full bg-m3-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs font-medium text-m3-on-surface-variant mt-2.5 text-center animate-pulse">
                {progressMsg}
              </p>
            </div>
          )}

          {/* ── Results & Page Gallery ── */}
          {stage === "done" && pages.length > 0 && (
            <>
              {/* Summary Stats Banner */}
              <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
                <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Total Pages</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">
                      {pages.length} Pages
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">Total Images Size</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {fmt(pages.reduce((acc, p) => acc + p.size, 0))}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span className="rounded-full px-4 py-1.5 text-xs font-mono font-bold bg-m3-tertiary-container text-m3-on-tertiary-container inline-block border border-m3-tertiary/20 shadow-xs">
                    🎉 Converted to .{format.toUpperCase()} Successfully
                  </span>
                </div>
              </div>

              {/* 1-Click ZIP Download & Google Drive ActionButtons */}
              <div className="flex flex-col gap-3 mb-8">
                <button
                  type="button"
                  className="w-full py-3.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  onClick={downloadZip}
                >
                  <span>📦</span>
                  <span>Download All {pages.length} Pages as .ZIP</span>
                </button>

                {zipBlob && (
                  <ActionButtons
                    blob={zipBlob}
                    fileName={`${file.name.replace(/\.[^.]+$/, "")}_images.zip`}
                    onReset={reset}
                    auth={auth}
                    toolName="PDF to Images"
                  />
                )}
              </div>

              {/* Pages Grid */}
              <div className="my-6">
                <div className="flex justify-between items-center mb-3.5">
                  <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface">
                    Converted Pages Preview ({pages.length})
                  </span>
                  <span className="text-xs text-m3-on-surface-variant font-medium">
                    Click thumbnail to zoom
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto p-3 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/40">
                  {pages.map((p) => (
                    <div
                      key={p.pageNum}
                      className="rounded-xl bg-m3-surface-container border border-m3-outline-variant/60 overflow-hidden flex flex-col group hover:shadow-md transition-all"
                    >
                      {/* Image Thumbnail */}
                      <div
                        onClick={() => setPreviewModal(p)}
                        className="relative aspect-[3/4] cursor-zoom-in overflow-hidden bg-m3-surface-container-highest flex items-center justify-center"
                      >
                        <img
                          src={p.url}
                          alt={`Page ${p.pageNum}`}
                          className="w-full h-full object-contain"
                        />
                        <span className="absolute top-1.5 left-1.5 bg-m3-surface/85 backdrop-blur-sm text-m3-on-surface text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-m3-outline-variant/40">
                          Page {p.pageNum}
                        </span>
                      </div>

                      {/* Footer & Download Single Page */}
                      <div className="p-2 sm:p-2.5 flex items-center justify-between gap-1 border-t border-m3-outline-variant/30">
                        <span className="text-[11px] font-mono text-m3-on-surface-variant truncate">
                          {fmt(p.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => downloadSinglePage(p)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-m3-secondary-container text-m3-on-secondary-container hover:bg-m3-secondary-container/80 transition-all active:scale-95 flex-shrink-0"
                          title="Download this page"
                        >
                          ⬇ Save
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · PDF to Images Tool</span>
            <span>100% Client-Side · Zero Server Uploads</span>
          </div>

        </div>
      </div>

      {/* ── Zoom Preview Modal ── */}
      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 transition-all"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center p-4 sm:p-6 rounded-3xl bg-m3-surface-container border border-m3-outline-variant/50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewModal.url}
              alt={`Page ${previewModal.pageNum}`}
              className="max-w-full max-h-[72vh] object-contain rounded-xl shadow-md"
            />
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              <button
                type="button"
                className="px-5 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-sm shadow-sm active:scale-95 transition-all"
                onClick={() => downloadSinglePage(previewModal)}
              >
                ⬇ Download Page {previewModal.pageNum} ({format.toUpperCase()})
              </button>
              <button
                type="button"
                className="px-5 py-2.5 rounded-full border border-m3-outline-variant bg-m3-surface-container-low hover:bg-m3-surface-container text-m3-on-surface font-display font-semibold text-sm shadow-sm active:scale-95 transition-all"
                onClick={() => setPreviewModal(null)}
              >
                ✕ Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
