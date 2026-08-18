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
    <div className="compressor-page">

      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">PDF Merger</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · Multiple PDFs</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)", color: "#d97706" }}>
              📑
            </div>
            <div className="comp-title">Merge PDF Files</div>
          </div>
          <p className="comp-sub">Combine multiple PDF documents into a single organized file.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone (Empty / Initial state) ── */}
          {(stage === "idle" || (stage === "error" && pdfFiles.length === 0)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              style={{ "--dz-accent": "#d97706", "--dz-bg": "rgba(217,119,6,0.04)" }}
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
              <span className="drop-icon">📑</span>
              <p className="drop-main">
                {dragging ? "Drop your PDF files here!" : "Drag & drop PDF files here"}
              </p>
              <p className="drop-sub">Select 2 or more PDFs to combine</p>

              {stage !== "error" && (
                <div className="drop-btn-row">
                  <button
                    className="drop-btn"
                    style={{ background: "linear-gradient(135deg, #d97706, #b45309)", boxShadow: "0 3px 12px rgba(217,119,6,0.25)" }}
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  >
                    📁 Browse PDFs
                  </button>
                  <button
                    className="drop-btn-drive"
                    onClick={(e) => { e.stopPropagation(); handleDrivePick(); }}
                    disabled={pickLoading || auth.authStatus === "loading"}
                  >
                    <DriveIconSmall />
                    {drivePickLabel()}
                  </button>
                </div>
              )}

              {stage === "error" && (
                <div className="error-box">⚠ {errorMsg}</div>
              )}
            </div>
          )}

          {/* ── File List & Reorder Section ── */}
          {(stage === "ready" || stage === "need_more" || stage === "merging" || stage === "done") && pdfFiles.length > 0 && (
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)" }}>
                    Selected PDFs ({pdfFiles.length})
                  </span>
                  {pdfFiles.length === 1 && (
                    <span style={{ fontSize: "11px", color: "#d97706", marginLeft: "8px", fontWeight: "600" }}>
                      (Add at least 1 more file to merge)
                    </span>
                  )}
                </div>

                {stage !== "merging" && stage !== "done" && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      ref={addMoreRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      hidden
                      onChange={(e) => addFiles(Array.from(e.target.files))}
                    />
                    <button
                      onClick={() => addMoreRef.current?.click()}
                      style={{
                        padding: "5px 12px", background: "rgba(217,119,6,0.08)",
                        border: "1px solid rgba(217,119,6,0.25)", borderRadius: "8px",
                        color: "#d97706", fontSize: "12px", fontWeight: "600", cursor: "pointer"
                      }}
                    >
                      + Add More
                    </button>
                    <button
                      onClick={reset}
                      style={{
                        padding: "5px 10px", background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.20)", borderRadius: "8px",
                        color: "#dc2626", fontSize: "12px", fontWeight: "600", cursor: "pointer"
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* PDF items list */}
              <div style={{
                display: "flex", flexDirection: "column", gap: "8px",
                maxHeight: "260px", overflowY: "auto", padding: "4px",
                borderRadius: "10px", background: "var(--p50)", border: "1px solid var(--border)"
              }}>
                {pdfFiles.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      background: "#fff", border: "1px solid var(--border2)",
                      borderRadius: "9px", padding: "10px 12px"
                    }}
                  >
                    {/* Index */}
                    <span style={{
                      width: "24px", height: "24px", borderRadius: "50%",
                      background: "rgba(217,119,6,0.12)", color: "#b45309",
                      fontSize: "11px", fontWeight: "700", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {idx + 1}
                    </span>

                    {/* PDF Icon */}
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>📄</span>

                    {/* Name & Size */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.file.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmt(item.file.size)}
                      </div>
                    </div>

                    {/* Reorder and Delete controls */}
                    {stage !== "merging" && stage !== "done" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        <button
                          onClick={() => moveFile(idx, -1)}
                          disabled={idx === 0}
                          style={{
                            padding: "4px 7px", background: "rgba(0,0,0,0.05)",
                            border: "1px solid rgba(0,0,0,0.1)", borderRadius: "6px",
                            fontSize: "11px", cursor: idx === 0 ? "not-allowed" : "pointer",
                            opacity: idx === 0 ? 0.3 : 1
                          }}
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveFile(idx, 1)}
                          disabled={idx === pdfFiles.length - 1}
                          style={{
                            padding: "4px 7px", background: "rgba(0,0,0,0.05)",
                            border: "1px solid rgba(0,0,0,0.1)", borderRadius: "6px",
                            fontSize: "11px", cursor: idx === pdfFiles.length - 1 ? "not-allowed" : "pointer",
                            opacity: idx === pdfFiles.length - 1 ? 0.3 : 1
                          }}
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => removeFile(item.id)}
                          style={{
                            padding: "4px 8px", background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.20)", borderRadius: "6px",
                            color: "#dc2626", fontSize: "11px", fontWeight: "700", cursor: "pointer"
                          }}
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
            <div className="action-wrap">
              <button
                className="btn-compress"
                style={{
                  background: pdfFiles.length < 2 ? "rgba(217,119,6,0.4)" : "linear-gradient(135deg, #d97706, #b45309)",
                  boxShadow: pdfFiles.length < 2 ? "none" : "0 4px 20px rgba(217,119,6,0.28)",
                  cursor: pdfFiles.length < 2 ? "not-allowed" : "pointer"
                }}
                onClick={mergePDFs}
                disabled={pdfFiles.length < 2}
              >
                {stage === "done" ? "🔁 Merge Again" : `📑 Merge ${pdfFiles.length} PDF Files`}
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "merging" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Merging PDF documents...</span>
                <span className="progress-pct" style={{ color: "#d97706" }}>{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #fbbf24, #d97706)" }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <>
              <div className="result-box" style={{ background: "rgba(217,119,6,0.06)", borderColor: "rgba(217,119,6,0.20)" }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Files Merged</span>
                    <span className="result-val-orig">{result.fileCount} Documents</span>
                  </div>
                  <div className="result-arrow" style={{ color: "#d97706" }}>→</div>
                  <div>
                    <span className="result-label">Merged Size</span>
                    <span className="result-val-comp" style={{ color: "#d97706" }}>{fmt(result.mergedSize)}</span>
                  </div>
                </div>
                <div className="result-badge" style={{ marginTop: "12px" }}>
                  <span style={{ color: "#d97706", background: "rgba(217,119,6,0.08)", borderColor: "rgba(217,119,6,0.25)" }}>
                    🎉 {result.totalPages} Total Pages Combined!
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={mergedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
              />
            </>
          )}

          <div className="comp-footer">
            <span>Flash Crush-Files · Merge PDF</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
