// ImageToPDF.jsx
// Convert multiple images (JPG, PNG, WebP) into a single clean PDF document using pdf-lib in browser.
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, PageSizes } from "pdf-lib";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 50;
const MAX_SIZE    = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED    = ["image/jpeg", "image/png", "image/webp"];

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024)        return bytes + " B";
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

// Convert image File -> JPEG ArrayBuffer
async function fileToJpegBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          if (!blob) { reject(new Error("Canvas export failed")); return; }
          const buf = await blob.arrayBuffer();
          resolve({ buffer: buf, width: img.naturalWidth, height: img.naturalHeight });
        }, "image/jpeg", 0.92);
      };
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export default function ImageToPDF({ auth }) {
  const navigate = useNavigate();
  const [images,         setImages]         = useState([]); // [{ file, preview, id }]
  const [dragging,       setDragging]       = useState(false);
  const [orientation,    setOrientation]    = useState("auto"); // auto | portrait | landscape
  const [margin,         setMargin]         = useState("small"); // none | small | normal
  const [pageSize,       setPageSize]       = useState("a4"); // a4 | fit | letter
  const [stage,          setStage]          = useState("idle"); // idle | ready | generating | done | error
  const [progress,       setProgress]       = useState(0);
  const [progressMsg,    setProgressMsg]    = useState("");
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [generatedBlob,  setGeneratedBlob]  = useState(null);
  const [pickLoading,    setPickLoading]    = useState(false);
  const inputRef = useRef(null);
  const addMoreRef = useRef(null);

  const addFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const valid = [];
    let totalSize = images.reduce((acc, img) => acc + img.file.size, 0);

    for (const f of fileList) {
      if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(jpe?g|png|webp)$/i)) {
        continue;
      }
      if (totalSize + f.size > MAX_SIZE) {
        setErrorMsg(`Total files exceed ${MAX_SIZE_MB} MB limit.`);
        setStage("error");
        return;
      }
      totalSize += f.size;
      valid.push({
        id: Math.random().toString(36).substring(2, 9),
        file: f,
        preview: URL.createObjectURL(f),
      });
    }

    if (valid.length === 0) {
      setErrorMsg("Please select valid JPG, PNG, or WebP image files.");
      setStage("error");
      return;
    }

    const updated = [...images, ...valid];
    setImages(updated);
    setStage("ready");
    setErrorMsg("");
  };

  const removeImage = (id) => {
    const target = images.find(img => img.id === id);
    if (target?.preview) URL.revokeObjectURL(target.preview);
    const updated = images.filter(img => img.id !== id);
    setImages(updated);
    if (updated.length === 0) {
      setStage("idle");
    }
  };

  const moveImage = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const updated = [...images];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setImages(updated);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.pickFromDrive(ACCEPTED, (pickedFile) => {
        addFiles([pickedFile]);
      }, token);
    } catch (err) {
      setErrorMsg(err.message || "Could not import from Drive. Try again.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const convertToPDF = async () => {
    if (images.length === 0) return;
    setStage("generating");
    setProgress(5);
    setProgressMsg("Creating PDF document...");
    setErrorMsg("");

    try {
      const pdfDoc = await PDFDocument.create();
      const marginMap = { none: 0, small: 15, normal: 30 };
      const chosenMargin = marginMap[margin] ?? 15;

      for (let i = 0; i < images.length; i++) {
        const pct = Math.round(5 + ((i + 1) / images.length) * 85);
        setProgress(pct);
        setProgressMsg(`Processing image ${i + 1} of ${images.length}...`);

        const { buffer, width: imgW, height: imgH } = await fileToJpegBuffer(images[i].file);
        const jpgImage = await pdfDoc.embedJpg(buffer);

        let pWidth, pHeight;

        if (pageSize === "fit") {
          pWidth = imgW + chosenMargin * 2;
          pHeight = imgH + chosenMargin * 2;
        } else {
          const baseSize = pageSize === "letter" ? PageSizes.Letter : PageSizes.A4; // [width, height] in portrait
          const isImgLandscape = imgW > imgH;
          const makeLandscape = orientation === "landscape" || (orientation === "auto" && isImgLandscape);

          pWidth = makeLandscape ? baseSize[1] : baseSize[0];
          pHeight = makeLandscape ? baseSize[0] : baseSize[1];
        }

        const page = pdfDoc.addPage([pWidth, pHeight]);
        const availW = pWidth - chosenMargin * 2;
        const availH = pHeight - chosenMargin * 2;

        let drawW = availW;
        let drawH = (imgH * availW) / imgW;

        if (drawH > availH) {
          drawH = availH;
          drawW = (imgW * availH) / imgH;
        }

        const posX = (pWidth - drawW) / 2;
        const posY = (pHeight - drawH) / 2;

        page.drawImage(jpgImage, {
          x: posX,
          y: posY,
          width: drawW,
          height: drawH,
        });
      }

      setProgress(95);
      setProgressMsg("Finalizing PDF...");

      const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([pdfBytes], { type: "application/pdf" });

      setProgress(100);
      setProgressMsg("Done!");
      setGeneratedBlob(blob);
      const totalOrigBytes = images.reduce((acc, img) => acc + img.file.size, 0);
      setResult({
        pageCount: images.length,
        totalOrigSize: totalOrigBytes,
        pdfSize: blob.size,
      });
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(`PDF generation failed: ${err.message || "Unknown error"}`);
      setStage("error");
    }
  };

  const reset = () => {
    images.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
    setImages([]);
    setStage("idle");
    setProgress(0);
    setResult(null);
    setErrorMsg("");
    setProgressMsg("");
    setGeneratedBlob(null);
  };

  const getFileName = () => {
    const first = images[0]?.file?.name.replace(/\.[^.]+$/, "") || "images";
    return `${first}_converted.pdf`;
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
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">📄</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">Image to PDF</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Max {MAX_SIZE_MB} MB · JPG · PNG · WebP
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero Header ── */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            📄
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            Image to PDF Converter
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Combine and convert your images into a clean, printable PDF document. 100% private, on-device processing.
          </p>
        </div>

        {/* ── Outer Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1 transition-colors">

          {/* ── Drop Zone (Idle / Empty state) ── */}
          {(stage === "idle" || (stage === "error" && images.length === 0)) && (
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
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => addFiles(Array.from(e.target.files))}
              />
              <span className="text-4xl sm:text-5xl mb-3 block transform group-hover:scale-110 transition-transform">
                🖼️
              </span>
              <p className="text-lg sm:text-xl font-display font-bold text-m3-on-surface mb-1.5">
                {dragging ? "Drop your images here!" : "Drag & drop images here"}
              </p>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6">
                JPG, PNG, WebP · Select multiple photos or documents
              </p>

              {stage !== "error" && (
                <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="px-6 py-3 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-95 transition-all flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  >
                    <span>📁</span>
                    <span>Browse Images</span>
                  </button>
                  <button
                    type="button"
                    className="px-5 py-3 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface font-display font-semibold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => { e.stopPropagation(); handleDrivePick(); }}
                    disabled={pickLoading || auth.authStatus === "loading"}
                  >
                    <DriveIconSmall />
                    <span>{drivePickLabel()}</span>
                  </button>
                </div>
              )}

              {stage === "error" && (
                <div className="mt-4 p-3 rounded-xl bg-m3-error-container/40 border border-m3-error/30 text-m3-on-error-container text-xs sm:text-sm font-medium">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ── Thumbnail Grid & Controls ── */}
          {(stage === "ready" || stage === "done" || stage === "generating") && images.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface">
                  Selected Images ({images.length})
                </span>
                {stage !== "generating" && stage !== "done" && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={addMoreRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      hidden
                      onChange={(e) => addFiles(Array.from(e.target.files))}
                    />
                    <button
                      type="button"
                      onClick={() => addMoreRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-primary text-xs font-semibold shadow-xs transition-all active:scale-95"
                    >
                      + Add More
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="px-3 py-1.5 rounded-full bg-m3-error-container/40 hover:bg-m3-error-container text-m3-on-error-container text-xs font-semibold shadow-xs transition-all active:scale-95"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Thumbnails grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-72 overflow-y-auto p-3 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className="relative rounded-xl overflow-hidden border border-m3-outline-variant/60 bg-m3-surface-container-highest aspect-square flex items-center justify-center group shadow-xs hover:shadow-sm transition-all"
                  >
                    <img
                      src={img.preview}
                      alt={`Image ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Index badge */}
                    <span className="absolute top-1.5 left-1.5 bg-m3-surface/85 backdrop-blur-sm text-m3-on-surface text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-m3-outline-variant/40">
                      {idx + 1}
                    </span>

                    {stage !== "generating" && stage !== "done" && (
                      <>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-m3-error-container/90 hover:bg-m3-error-container text-m3-on-error-container flex items-center justify-center text-xs font-bold transition-all active:scale-90 shadow-xs"
                          title="Remove image"
                        >
                          ✕
                        </button>
                        {/* Reorder buttons */}
                        <div className="absolute bottom-1.5 inset-x-1.5 flex justify-between gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => moveImage(idx, -1)}
                              className="flex-1 py-1 rounded-full bg-m3-surface/85 backdrop-blur-sm hover:bg-m3-surface text-m3-on-surface text-[10px] font-bold border border-m3-outline-variant/40 flex items-center justify-center transition-all active:scale-95"
                              title="Move back"
                            >
                              ◀
                            </button>
                          )}
                          {idx < images.length - 1 && (
                            <button
                              type="button"
                              onClick={() => moveImage(idx, 1)}
                              className="flex-1 py-1 rounded-full bg-m3-surface/85 backdrop-blur-sm hover:bg-m3-surface text-m3-on-surface text-[10px] font-bold border border-m3-outline-variant/40 flex items-center justify-center transition-all active:scale-95"
                              title="Move forward"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Page Options ── */}
          {(stage === "ready" || stage === "done") && images.length > 0 && (
            <div className="p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50 my-6 shadow-sm">
              <span className="text-xs font-display font-bold uppercase tracking-wider text-m3-primary mb-3.5 block">
                Page Layout Options
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-m3-on-surface-variant block mb-1.5">
                    Orientation
                  </label>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-m3-outline-variant/80 bg-m3-surface text-m3-on-surface text-xs sm:text-sm font-medium focus:outline-none focus:border-m3-primary focus:ring-1 focus:ring-m3-primary transition-all cursor-pointer"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-m3-on-surface-variant block mb-1.5">
                    Margin
                  </label>
                  <select
                    value={margin}
                    onChange={(e) => setMargin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-m3-outline-variant/80 bg-m3-surface text-m3-on-surface text-xs sm:text-sm font-medium focus:outline-none focus:border-m3-primary focus:ring-1 focus:ring-m3-primary transition-all cursor-pointer"
                  >
                    <option value="none">No Margin (0pt)</option>
                    <option value="small">Small (15pt)</option>
                    <option value="normal">Standard (30pt)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-m3-on-surface-variant block mb-1.5">
                    Page Size
                  </label>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-m3-outline-variant/80 bg-m3-surface text-m3-on-surface text-xs sm:text-sm font-medium focus:outline-none focus:border-m3-primary focus:ring-1 focus:ring-m3-primary transition-all cursor-pointer"
                  >
                    <option value="a4">A4 Standard</option>
                    <option value="fit">Fit to Image</option>
                    <option value="letter">US Letter</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Generate Action Button ── */}
          {(stage === "ready" || stage === "done") && images.length > 0 && (
            <div className="my-6">
              <button
                type="button"
                className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                onClick={convertToPDF}
              >
                <span>
                  {stage === "done" ? "🔁 Re-generate PDF" : `📄 Convert ${images.length} Image${images.length > 1 ? "s" : ""} to PDF`}
                </span>
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "generating" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-m3-on-surface mb-2.5">
                <span>Generating PDF document...</span>
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

          {/* ── Result ── */}
          {stage === "done" && result && (
            <>
              <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
                <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Total Images</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">
                      {result.pageCount} Pages
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">PDF Size</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {fmt(result.pdfSize)}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span className="rounded-full px-4 py-1.5 text-xs font-mono font-bold bg-m3-tertiary-container text-m3-on-tertiary-container inline-block border border-m3-tertiary/20 shadow-xs">
                    🎉 PDF Generated Successfully!
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={generatedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
                toolName="Image to PDF"
              />
            </>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · Image to PDF Tool</span>
            <span>100% Client-Side · Zero Server Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
