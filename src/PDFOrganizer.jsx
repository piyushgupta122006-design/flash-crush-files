// PDFOrganizer.jsx — Visual Drag & Drop Page Organizer, Rotator & Deleter
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument, degrees } from "pdf-lib";
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

export default function PDFOrganizer({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | loading | loaded | building | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  // pages: [{ id, originalIndex, rotation, thumbUrl, deleted }]
  const [pages, setPages] = useState([]);
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const inputRef = useRef(null);
  const pdfBytesRef = useRef(null);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported."); setStage("error"); return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`); setStage("error"); return;
    }
    setFile(f);
    setErrorMsg("");
    setStage("loading");
    setProgress(10);
    setProgressMsg("Loading PDF pages...");

    try {
      const arrayBuffer = await f.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(arrayBuffer);

      const pdfjs = await loadPdfJs();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const numPages = pdfDoc.numPages;

      const pageData = [];
      for (let i = 1; i <= numPages; i++) {
        setProgress(Math.round(10 + (i / numPages) * 80));
        setProgressMsg(`Rendering page ${i} of ${numPages}...`);

        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        pageData.push({
          id: `page-${i}-${Date.now()}`,
          originalIndex: i - 1, // 0-indexed for pdf-lib
          pageNum: i,
          rotation: 0,
          thumbUrl: canvas.toDataURL("image/jpeg", 0.65),
          deleted: false,
        });
      }

      setPages(pageData);
      setProgress(100);
      setProgressMsg("Ready!");
      setStage("loaded");
    } catch (err) {
      setErrorMsg("Failed to load PDF: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
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

  // ── Page Operations ──
  const rotatePage = (id, deg) => {
    setPages(prev => prev.map(p =>
      p.id === id ? { ...p, rotation: (p.rotation + deg + 360) % 360 } : p
    ));
  };

  const deletePage = (id) => {
    setPages(prev => prev.map(p =>
      p.id === id ? { ...p, deleted: !p.deleted } : p
    ));
  };

  const undoAllDeletes = () => {
    setPages(prev => prev.map(p => ({ ...p, deleted: false })));
  };

  const resetAllRotations = () => {
    setPages(prev => prev.map(p => ({ ...p, rotation: 0 })));
  };

  // ── Drag & Drop Reorder ──
  const handleDragStart = useCallback((idx) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setPages(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(dragIdx, 1);
        arr.splice(dragOverIdx, 0, moved);
        return arr;
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx]);

  // ── Move page up / down (fallback for touch) ──
  const movePage = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= pages.length) return;
    setPages(prev => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  // ── Build Output PDF ──
  const buildPDF = async () => {
    if (!pdfBytesRef.current) return;
    const activePages = pages.filter(p => !p.deleted);
    if (activePages.length === 0) {
      setErrorMsg("No pages remaining. Undo deletions or upload a new file.");
      setStage("error");
      return;
    }

    setStage("building");
    setProgress(10);
    setProgressMsg("Building reorganized PDF...");
    setErrorMsg("");

    try {
      const srcDoc = await PDFDocument.load(pdfBytesRef.current);
      const newDoc = await PDFDocument.create();

      const indices = activePages.map(p => p.originalIndex);
      const copiedPages = await newDoc.copyPages(srcDoc, indices);

      for (let i = 0; i < copiedPages.length; i++) {
        setProgress(Math.round(10 + (i / copiedPages.length) * 75));
        setProgressMsg(`Adding page ${i + 1} of ${copiedPages.length}...`);

        const page = copiedPages[i];
        const rot = activePages[i].rotation;
        if (rot !== 0) {
          page.setRotation(degrees((page.getRotation().angle + rot) % 360));
        }
        newDoc.addPage(page);
      }

      setProgress(90);
      setProgressMsg("Saving PDF...");
      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const name = `${baseName}_organized.pdf`;

      setResultBlob(blob);
      setResultName(name);
      setResultInfo(`${activePages.length} pages · ${fmt(blob.size)}`);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");
    } catch (err) {
      console.error(err);
      setErrorMsg("Build failed: " + (err.message || "Unknown error"));
      setStage("error");
    }
  };

  const reset = () => {
    setPages([]);
    setFile(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    pdfBytesRef.current = null;
  };

  const activeCount = pages.filter(p => !p.deleted).length;
  const deletedCount = pages.filter(p => p.deleted).length;
  const hasChanges = pages.some((p, i) => p.originalIndex !== i || p.rotation !== 0 || p.deleted);

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
        <div className="tool-page-title">Organize & Rotate PDF</div>
        <div className="tool-page-meta">Drag · Rotate · Delete · Reorder</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(245, 158, 11, 0.4)", boxShadow: "0 0 20px rgba(245, 158, 11, 0.3)" }}>
              🔄
            </div>
            <div className="comp-title">PDF Page Organizer & Rotator</div>
          </div>
          <p className="comp-sub">Drag to reorder, rotate (90°/180°/270°), or delete pages. Export the reorganized PDF.</p>
        </div>

        <div className="comp-card">

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
              <span className="drop-icon">🔄</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" : "Drag & drop your PDF to organize"}</p>
              <p className="drop-sub">Reorder, rotate & delete pages visually · max {MAX_SIZE_MB} MB</p>

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

          {/* ── Loading Progress ── */}
          {stage === "loading" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Loading PDF pages...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── File Row ── */}
          {file && (stage === "loaded" || stage === "done" || stage === "building" || (stage === "error" && file)) && (
            <div className="file-row">
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)} · {pages.length} pages</div>
              </div>
              {stage !== "building" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── Error inside loaded state ── */}
          {stage === "error" && file && errorMsg && (
            <div style={{ padding: "0 20px 10px" }}>
              <div className="error-box">⚠ {errorMsg}</div>
            </div>
          )}

          {/* ── Toolbar ── */}
          {(stage === "loaded" || stage === "done") && pages.length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: "8px", padding: "0 20px 12px",
              alignItems: "center", justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center" }}>
                  {activeCount} active · {deletedCount} deleted
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {deletedCount > 0 && (
                  <button onClick={undoAllDeletes} style={{
                    padding: "5px 12px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: "8px", color: "#34d399", fontSize: "11px", fontWeight: 700, cursor: "pointer"
                  }}>↩ Undo All Deletes</button>
                )}
                <button onClick={resetAllRotations} style={{
                  padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px", color: "#94a3b8", fontSize: "11px", fontWeight: 700, cursor: "pointer"
                }}>Reset Rotations</button>
              </div>
            </div>
          )}

          {/* ── Visual Page Grid with Drag & Drop ── */}
          {(stage === "loaded" || stage === "done") && pages.length > 0 && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
                Drag to reorder · Click buttons to rotate or delete
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(130px, 100%), 1fr))",
                gap: "12px", maxHeight: "480px", overflowY: "auto", padding: "8px",
                borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)"
              }}>
                {pages.map((p, idx) => (
                  <div
                    key={p.id}
                    draggable={!p.deleted}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    style={{
                      position: "relative",
                      border: dragOverIdx === idx ? "2px solid #8b5cf6" : p.deleted ? "2px solid rgba(244,63,94,0.4)" : "2px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                      overflow: "hidden",
                      opacity: p.deleted ? 0.35 : dragIdx === idx ? 0.5 : 1,
                      transition: "all 0.2s ease",
                      background: p.deleted ? "rgba(244,63,94,0.05)" : "rgba(255,255,255,0.03)",
                      cursor: p.deleted ? "default" : "grab",
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{
                      aspectRatio: "3/4", overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#0a0a0a",
                    }}>
                      <img
                        src={p.thumbUrl}
                        alt={`Page ${p.pageNum}`}
                        style={{
                          maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                          transform: `rotate(${p.rotation}deg)`,
                          transition: "transform 0.3s ease",
                        }}
                        draggable={false}
                      />
                    </div>

                    {/* Page Number Badge */}
                    <span style={{
                      position: "absolute", top: "5px", left: "5px",
                      background: p.deleted ? "rgba(244,63,94,0.85)" : "rgba(0,0,0,0.8)",
                      color: p.deleted ? "#fca5a5" : "var(--cyan-neon)",
                      fontSize: "10px", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                      padding: "2px 8px", borderRadius: "6px",
                    }}>
                      {p.deleted ? "DEL" : `#${idx + 1}`}
                    </span>

                    {/* Original page number */}
                    <span style={{
                      position: "absolute", top: "5px", right: "5px",
                      background: "rgba(0,0,0,0.7)", color: "#94a3b8",
                      fontSize: "9px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                      padding: "2px 6px", borderRadius: "4px",
                    }}>
                      P{p.pageNum}
                    </span>

                    {/* Rotation badge */}
                    {p.rotation !== 0 && !p.deleted && (
                      <span style={{
                        position: "absolute", bottom: "38px", right: "5px",
                        background: "rgba(139,92,246,0.85)", color: "#fff",
                        fontSize: "9px", fontWeight: 800, padding: "2px 6px",
                        borderRadius: "4px",
                      }}>
                        {p.rotation}°
                      </span>
                    )}

                    {/* Action Buttons */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: "3px", padding: "5px 4px",
                      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)",
                    }}>
                      {/* Move Up */}
                      <button onClick={() => movePage(idx, -1)} disabled={idx === 0 || p.deleted}
                        title="Move Left"
                        style={{
                          width: "26px", height: "26px", borderRadius: "6px", border: "none",
                          background: "rgba(255,255,255,0.08)", color: "#94a3b8",
                          cursor: idx === 0 || p.deleted ? "not-allowed" : "pointer",
                          fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: idx === 0 || p.deleted ? 0.3 : 1,
                        }}>◀</button>

                      {/* Rotate Left */}
                      <button onClick={() => rotatePage(p.id, -90)} disabled={p.deleted}
                        title="Rotate Left 90°"
                        style={{
                          width: "26px", height: "26px", borderRadius: "6px", border: "none",
                          background: "rgba(139,92,246,0.2)", color: "#c084fc",
                          cursor: p.deleted ? "not-allowed" : "pointer",
                          fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>↺</button>

                      {/* Rotate Right */}
                      <button onClick={() => rotatePage(p.id, 90)} disabled={p.deleted}
                        title="Rotate Right 90°"
                        style={{
                          width: "26px", height: "26px", borderRadius: "6px", border: "none",
                          background: "rgba(139,92,246,0.2)", color: "#c084fc",
                          cursor: p.deleted ? "not-allowed" : "pointer",
                          fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>↻</button>

                      {/* Delete / Undo */}
                      <button onClick={() => deletePage(p.id)}
                        title={p.deleted ? "Undo Delete" : "Delete Page"}
                        style={{
                          width: "26px", height: "26px", borderRadius: "6px", border: "none",
                          background: p.deleted ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)",
                          color: p.deleted ? "#34d399" : "#f87171",
                          cursor: "pointer",
                          fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{p.deleted ? "↩" : "🗑"}</button>

                      {/* Move Down */}
                      <button onClick={() => movePage(idx, 1)} disabled={idx >= pages.length - 1 || p.deleted}
                        title="Move Right"
                        style={{
                          width: "26px", height: "26px", borderRadius: "6px", border: "none",
                          background: "rgba(255,255,255,0.08)", color: "#94a3b8",
                          cursor: idx >= pages.length - 1 || p.deleted ? "not-allowed" : "pointer",
                          fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: idx >= pages.length - 1 || p.deleted ? 0.3 : 1,
                        }}>▶</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Build Button ── */}
          {(stage === "loaded" || stage === "done") && (
            <div className="action-wrap">
              <button className="btn-compress" onClick={buildPDF} disabled={activeCount === 0}>
                {stage === "done" ? "🔁 Rebuild Organized PDF" : `⚡ Build Organized PDF (${activeCount} pages)`}
              </button>
              {!hasChanges && stage !== "done" && (
                <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-sub)", marginTop: "8px" }}>
                  ℹ Drag, rotate, or delete pages above before building.
                </div>
              )}
            </div>
          )}

          {/* ── Building Progress ── */}
          {stage === "building" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Building reorganized PDF...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{ margin: "10px 0 20px", background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)" }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {pages.length} Pages · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Organized</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "#fbbf24" }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{ background: "rgba(245,158,11,0.18)", borderColor: "#f59e0b", color: "#fbbf24" }}>
                  🔄 PDF Reorganized Successfully
                </div>
              </div>

              <ActionButtons blob={resultBlob} fileName={resultName} onReset={reset} auth={auth} />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF Page Organizer Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
