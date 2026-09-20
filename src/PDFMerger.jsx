// PDFMerger.jsx
// Merge multiple PDF files sequentially in the browser using pdf-lib.
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 100;
const MAX_SIZE    = MAX_SIZE_MB * 1024 * 1024;

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

export default function PDFMerger({ auth }) {
  const navigate = useNavigate();
  const [pdfFiles,       setPdfFiles]       = useState([]); // [{ id, file }]
  const [dragging,       setDragging]       = useState(false);
  const [stage,          setStage]          = useState("idle"); // idle | ready | merging | done | error
  const [progress,       setProgress]       = useState(0);
  const [progressMsg,    setProgressMsg]    = useState("");
  const [result,         setResult]         = useState(null);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [mergedBlob,     setMergedBlob]     = useState(null);
  const [pickLoading,    setPickLoading]    = useState(false);
  const inputRef = useRef(null);
  const addMoreRef = useRef(null);

  const addFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const valid = [];
    let totalSize = pdfFiles.reduce((acc, p) => acc + p.file.size, 0);

    for (const f of fileList) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
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
      });
    }

    if (valid.length === 0) {
      setErrorMsg("Please select valid PDF documents.");
      setStage("error");
      return;
    }

    const updated = [...pdfFiles, ...valid];
    setPdfFiles(updated);
    setStage(updated.length >= 2 ? "ready" : "need_more");
    setErrorMsg("");
  };

  const removeFile = (id) => {
    const updated = pdfFiles.filter(item => item.id !== id);
    setPdfFiles(updated);
    if (updated.length === 0) {
      setStage("idle");
    } else if (updated.length < 2) {
      setStage("need_more");
    }
  };

  const moveFile = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= pdfFiles.length) return;
    const updated = [...pdfFiles];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setPdfFiles(updated);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.pickFromDrive(["application/pdf"], (pickedFile) => {
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

  const mergePDFs = async () => {
    if (pdfFiles.length < 2) {
      setErrorMsg("Please select at least 2 PDF files to merge.");
      return;
    }

    setStage("merging");
    setProgress(5);
    setProgressMsg("Creating combined PDF structure...");
    setErrorMsg("");

    try {
      const mergedPdf = await PDFDocument.create();
      let totalPagesAdded = 0;

      for (let i = 0; i < pdfFiles.length; i++) {
        const pct = Math.round(5 + ((i + 1) / pdfFiles.length) * 85);
        setProgress(pct);
        setProgressMsg(`Merging file ${i + 1} of ${pdfFiles.length} (${pdfFiles[i].file.name})...`);

        const arrayBuffer = await pdfFiles[i].file.arrayBuffer();
        const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        const pageIndices = srcPdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);

        copiedPages.forEach((page) => mergedPdf.addPage(page));
        totalPagesAdded += copiedPages.length;
      }

      setProgress(95);
      setProgressMsg("Saving merged PDF...");

      const mergedBytes = await mergedPdf.save({ useObjectStreams: true });
      const blob = new Blob([mergedBytes], { type: "application/pdf" });

      setProgress(100);
      setProgressMsg("Done!");

      const totalOrigBytes = pdfFiles.reduce((acc, p) => acc + p.file.size, 0);

      setMergedBlob(blob);
      setResult({
        fileCount: pdfFiles.length,
        totalPages: totalPagesAdded,
        totalOrigSize: totalOrigBytes,
        mergedSize: blob.size,
      });
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(`Merge failed: ${err.message || "Unknown error"}`);
      setStage("error");
    }
  };

  const reset = () => {
    setPdfFiles([]);
    setStage("idle");
    setProgress(0);
    setResult(null);
    setErrorMsg("");
    setProgressMsg("");
    setMergedBlob(null);
  };

  const getFileName = () => {
    const first = pdfFiles[0]?.file?.name.replace(/\.[^.]+$/, "") || "documents";
    return `${first}_merged.pdf`;
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
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">📑</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF Merger</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Max {MAX_SIZE_MB} MB · Multiple PDFs
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            📑
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            Merge PDF Files
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            Combine multiple PDF documents into a single organized file in seconds. 100% private, on-device merging.
          </p>
        </div>

        {/* ── Main Container Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1 transition-colors">

          {/* ── Drop Zone (Empty / Initial state) ── */}
          {(stage === "idle" || (stage === "error" && pdfFiles.length === 0)) && (
            <div
              className={`rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center transition-all duration-300 cursor-pointer group ${
                dragging
                  ? "border-m3-primary bg-m3-primary-container/30"
                  : "border-m3-outline-variant hover:border-m3-primary bg-m3-surface-container/40 hover:bg-m3-surface-container/80"
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
                multiple
                hidden
                onChange={(e) => addFiles(Array.from(e.target.files))}
              />
              <div className="w-20 h-20 rounded-full bg-m3-primary/10 text-m3-primary text-4xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                📑
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-m3-on-surface mb-2">
                {dragging ? "Drop your PDF files here!" : "Drag & drop PDF files here"}
              </div>
              <div className="text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
                Select 2 or more PDFs to combine · Max {MAX_SIZE_MB} MB
              </div>

              {stage !== "error" && (
                <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="px-8 py-3.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 hover:bg-m3-primary/90 active:scale-95 transition-all duration-200 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  >
                    <span>📁</span>
                    <span>Browse PDFs</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-5 py-3 text-sm font-semibold bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/80 text-m3-on-surface shadow-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                    onClick={(e) => { e.stopPropagation(); handleDrivePick(); }}
                    disabled={pickLoading || auth.authStatus === "loading"}
                  >
                    <DriveIconSmall />
                    <span>{drivePickLabel()}</span>
                  </button>
                </div>
              )}

              {stage === "error" && (
                <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/20 font-medium text-sm flex items-center justify-center gap-2 shadow-sm max-w-md mx-auto">
                  <span>⚠</span>
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* ── File List & Reorder Section ── */}
          {(stage === "ready" || stage === "need_more" || stage === "merging" || stage === "done") && pdfFiles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm sm:text-base text-m3-on-surface">
                    Selected PDFs ({pdfFiles.length})
                  </span>
                  {pdfFiles.length === 1 && (
                    <span className="text-xs font-semibold text-m3-tertiary bg-m3-tertiary-container/30 border border-m3-tertiary/20 px-2.5 py-0.5 rounded-full">
                      Add at least 1 more file to merge
                    </span>
                  )}
                </div>

                {stage !== "merging" && stage !== "done" && (
                  <div className="flex items-center gap-2">
                    <input
                      ref={addMoreRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      hidden
                      onChange={(e) => addFiles(Array.from(e.target.files))}
                    />
                    <button
                      type="button"
                      onClick={() => addMoreRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <span>+</span>
                      <span>Add More</span>
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="px-3.5 py-1.5 rounded-full border border-m3-error/30 bg-m3-error-container/30 hover:bg-m3-error-container text-m3-on-error-container text-xs font-semibold shadow-xs transition-all active:scale-95"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* PDF items list */}
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto p-2 rounded-2xl bg-m3-surface-container/40 border border-m3-outline-variant/40">
                {pdfFiles.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 sm:gap-4 bg-m3-surface-container border border-m3-outline-variant/60 rounded-xl p-3 sm:p-4 transition-all duration-200 hover:border-m3-outline shadow-xs"
                  >
                    {/* Index */}
                    <span className="w-7 h-7 rounded-full bg-m3-primary/10 text-m3-primary border border-m3-primary/20 text-xs font-mono font-bold flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>

                    {/* PDF Icon */}
                    <span className="text-lg flex-shrink-0">📄</span>

                    {/* Name & Size */}
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm text-m3-on-surface truncate">
                        {item.file.name}
                      </div>
                      <div className="text-xs font-mono text-m3-on-surface-variant mt-0.5">
                        {fmt(item.file.size)}
                      </div>
                    </div>

                    {/* Reorder and Delete controls */}
                    {stage !== "merging" && stage !== "done" && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveFile(idx, -1)}
                          disabled={idx === 0}
                          className="w-8 h-8 rounded-full border border-m3-outline-variant/70 bg-m3-surface-container-low hover:bg-m3-surface-container-high text-m3-on-surface text-xs flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveFile(idx, 1)}
                          disabled={idx === pdfFiles.length - 1}
                          className="w-8 h-8 rounded-full border border-m3-outline-variant/70 bg-m3-surface-container-low hover:bg-m3-surface-container-high text-m3-on-surface text-xs flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          className="w-8 h-8 rounded-full bg-m3-error-container/30 hover:bg-m3-error-container text-m3-on-error-container text-xs font-bold flex items-center justify-center transition-all active:scale-90"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Merge Action Button ── */}
          {(stage === "ready" || stage === "need_more" || stage === "done") && pdfFiles.length > 0 && (
            <div className="my-6">
              <button
                type="button"
                className={`w-full py-4 rounded-full font-display font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 ${
                  pdfFiles.length < 2
                    ? "bg-m3-surface-container-highest text-m3-on-surface-variant/50 cursor-not-allowed border border-m3-outline-variant/40"
                    : "bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] cursor-pointer"
                }`}
                onClick={mergePDFs}
                disabled={pdfFiles.length < 2}
              >
                <span>
                  {stage === "done"
                    ? "🔁 Merge Again"
                    : pdfFiles.length < 2
                    ? "📑 Add 1 more PDF to merge"
                    : `📑 Merge ${pdfFiles.length} PDF Files`}
                </span>
              </button>
            </div>
          )}

          {/* ── Progress Bar (M3 Linear Indicator) ── */}
          {stage === "merging" && (
            <div className="my-6 p-5 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-m3-on-surface mb-2.5">
                <span>Merging PDF documents...</span>
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
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Files Merged</div>
                    <div className="text-base sm:text-lg font-display font-bold text-m3-on-surface">
                      {result.fileCount} Documents
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">Merged Size</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {fmt(result.mergedSize)}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span className="rounded-full px-4 py-1.5 text-xs font-mono font-bold bg-m3-tertiary-container text-m3-on-tertiary-container inline-block border border-m3-tertiary/20 shadow-xs">
                    🎉 {result.totalPages} Total Pages Combined!
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={mergedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
                toolName="PDF Merger"
              />
            </>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · PDF Merger</span>
            <span>100% Client-Side · Zero Server Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
