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
    <div className="compressor-page">

      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">PDF to Images</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · High Res · ZIP</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(6, 182, 212, 0.4)", boxShadow: "0 0 20px rgba(6, 182, 212, 0.3)" }}>
              🖼️
            </div>
            <div className="comp-title">PDF to Images</div>
          </div>
          <p className="comp-sub">Convert every page of your PDF into crisp JPG, PNG, or WebP images with 1-click ZIP download.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone ── */}
          {(stage === "idle" || stage === "error") && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">📑</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" : "Drag & drop your PDF document here"}</p>
              <p className="drop-sub">Select PDF to extract high-resolution images · max {MAX_SIZE_MB} MB</p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>
                  📁 Browse PDF
                </button>
                <button className="drop-btn-drive"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && (
                <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>
              )}
            </div>
          )}

          {/* ── Selected File Row ── */}
          {(stage === "ready" || stage === "done" || stage === "converting") && file && (
            <div className="file-row">
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{fmt(file.size)}</div>
              </div>
              {stage !== "converting" && (
                <button className="close-btn" onClick={reset}>✕</button>
              )}
            </div>
          )}

          {/* ── Output Format & Quality Selectors ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="level-wrap">
              <span className="level-label">1. Choose Output Image Format</span>
              <div className="level-grid" style={{ marginBottom: "16px" }}>
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    className={`level-btn${format === f.id ? " active" : ""}`}
                    onClick={() => setFormat(f.id)}
                  >
                    <span className="level-name">.{f.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{f.desc}</span>
                  </button>
                ))}
              </div>

              <span className="level-label">2. Image Quality &amp; Resolution</span>
              <div className="level-grid">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    className={`level-btn${resolution === r.id ? " active" : ""}`}
                    onClick={() => setResolution(r.id)}
                  >
                    <span className="level-name">{r.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Convert Button ── */}
          {(stage === "ready" || stage === "done") && (
            <div className="action-wrap">
              <button className="btn-compress" onClick={convertPDF}>
                {stage === "done" ? "🔁 Re-convert PDF to Images" : "⚡ Convert PDF to Images"}
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "converting" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Converting PDF pages to images...</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Results & Page Gallery ── */}
          {stage === "done" && pages.length > 0 && (
            <div style={{ padding: "0 20px 20px" }}>
              {/* Summary Stats Banner */}
              <div className="result-box" style={{ margin: "10px 0 20px", background: "rgba(6, 182, 212, 0.08)", borderColor: "rgba(6, 182, 212, 0.3)" }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Total Pages</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.3rem", fontWeight: 800, color: "#fff" }}>
                      {pages.length} Pages
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Total Images Size</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.3rem", fontWeight: 800, color: "var(--cyan-neon)" }}>
                      {fmt(pages.reduce((acc, p) => acc + p.size, 0))}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{ background: "rgba(6, 182, 212, 0.18)", borderColor: "var(--cyan-neon)", color: "#38bdf8" }}>
                  <span>🎉 Converted to .{format.toUpperCase()} Successfully</span>
                </div>
              </div>

              {/* 1-Click ZIP Download & Google Drive */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                <button
                  className="btn-download"
                  onClick={downloadZip}
                  style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }}
                >
                  📦 Download All {pages.length} Pages as .ZIP
                </button>

                {zipBlob && (
                  <ActionButtons
                    blob={zipBlob}
                    fileName={`${file.name.replace(/\.[^.]+$/, "")}_images.zip`}
                    onReset={reset}
                    auth={auth}
                  />
                )}
              </div>

              {/* Pages Grid */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Converted Pages Preview ({pages.length})
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-sub)" }}>
                    Click thumbnail to zoom
                  </span>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(140px, 100%), 1fr))",
                  gap: "14px",
                  maxHeight: "380px",
                  overflowY: "auto",
                  padding: "8px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)"
                }}>
                  {pages.map((p) => (
                    <div
                      key={p.pageNum}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "var(--radius-sm)",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        transition: "all 0.2s ease"
                      }}
                    >
                      {/* Image Thumbnail */}
                      <div
                        onClick={() => setPreviewModal(p)}
                        style={{
                          position: "relative",
                          aspectRatio: "3/4",
                          cursor: "zoom-in",
                          overflow: "hidden",
                          background: "#000"
                        }}
                      >
                        <img
                          src={p.url}
                          alt={`Page ${p.pageNum}`}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                        <span style={{
                          position: "absolute",
                          top: "6px",
                          left: "6px",
                          background: "rgba(0,0,0,0.75)",
                          color: "var(--cyan-neon)",
                          fontSize: "10px",
                          fontWeight: "800",
                          fontFamily: "'JetBrains Mono', monospace",
                          padding: "2px 8px",
                          borderRadius: "100px"
                        }}>
                          Page {p.pageNum}
                        </span>
                      </div>

                      {/* Footer & Download Single Page */}
                      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-sub)", fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmt(p.size)}
                        </span>
                        <button
                          onClick={() => downloadSinglePage(p)}
                          style={{
                            padding: "4px 8px",
                            background: "rgba(6, 182, 212, 0.15)",
                            border: "1px solid var(--cyan-neon)",
                            color: "#38bdf8",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          title="Download this page"
                        >
                          ⬇ Save
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF to Images Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>

        </div>
      </div>

      {/* ── Zoom Preview Modal ── */}
      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 3000,
            background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "20px"
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
            <img
              src={previewModal.url}
              alt={`Page ${previewModal.pageNum}`}
              style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: "12px", boxShadow: "0 0 40px rgba(0,0,0,0.9)" }}
            />
            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
              <button
                className="btn-download"
                onClick={() => downloadSinglePage(previewModal)}
                style={{ padding: "8px 20px", fontSize: "0.88rem" }}
              >
                ⬇ Download Page {previewModal.pageNum} ({format.toUpperCase()})
              </button>
              <button
                className="btn-reset"
                onClick={() => setPreviewModal(null)}
                style={{ padding: "8px 18px", fontSize: "0.88rem" }}
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
