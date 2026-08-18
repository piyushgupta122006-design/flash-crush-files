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
    <div className="compressor-page">

      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">Image to PDF Converter</div>
        <div className="tool-page-meta">Max {MAX_SIZE_MB} MB · JPG · PNG · WebP</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)", color: "#16a34a" }}>
              🖼️
            </div>
            <div className="comp-title">Image to PDF</div>
          </div>
          <p className="comp-sub">Combine and convert your images into a beautiful single PDF document.</p>
        </div>

        <div className="comp-card">

          {/* ── Drop Zone (Idle / Empty state) ── */}
          {(stage === "idle" || (stage === "error" && images.length === 0)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              style={{ "--dz-accent": "#16a34a", "--dz-bg": "rgba(22,163,74,0.04)" }}
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
              <span className="drop-icon">🖼️</span>
              <p className="drop-main">
                {dragging ? "Drop your images here!" : "Drag & drop images here"}
              </p>
              <p className="drop-sub">JPG, PNG, WebP · Select multiple files</p>

              {stage !== "error" && (
                <div className="drop-btn-row">
                  <button
                    className="drop-btn"
                    style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 3px 12px rgba(22,163,74,0.25)" }}
                    onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  >
                    📁 Browse Images
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

          {/* ── Thumbnail Grid & Controls ── */}
          {(stage === "ready" || stage === "done" || stage === "generating") && images.length > 0 && (
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text)" }}>
                  Selected Images ({images.length})
                </span>
                {stage !== "generating" && stage !== "done" && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      ref={addMoreRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      hidden
                      onChange={(e) => addFiles(Array.from(e.target.files))}
                    />
                    <button
                      onClick={() => addMoreRef.current?.click()}
                      style={{
                        padding: "5px 12px", background: "rgba(22,163,74,0.08)",
                        border: "1px solid rgba(22,163,74,0.25)", borderRadius: "8px",
                        color: "#16a34a", fontSize: "12px", fontWeight: "600", cursor: "pointer"
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
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Thumbnails list */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                gap: "10px", maxHeight: "260px", overflowY: "auto", padding: "4px",
                borderRadius: "10px", background: "var(--p50)", border: "1px solid var(--border)"
              }}>
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      position: "relative", borderRadius: "8px", overflow: "hidden",
                      border: "1px solid var(--border2)", background: "#fff",
                      aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center"
                    }}
                  >
                    <img
                      src={img.preview}
                      alt={`Image ${idx + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {/* Index badge */}
                    <span style={{
                      position: "absolute", top: "4px", left: "4px",
                      background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "10px",
                      padding: "2px 6px", borderRadius: "100px", fontWeight: "700"
                    }}>
                      {idx + 1}
                    </span>

                    {stage !== "generating" && stage !== "done" && (
                      <>
                        {/* Remove button */}
                        <button
                          onClick={() => removeImage(img.id)}
                          style={{
                            position: "absolute", top: "4px", right: "4px",
                            width: "20px", height: "20px", borderRadius: "50%",
                            background: "#dc2626", color: "#fff", border: "none",
                            fontSize: "11px", display: "flex", alignItems: "center",
                            justifyContent: "center", cursor: "pointer"
                          }}
                          title="Remove image"
                        >
                          ✕
                        </button>
                        {/* Reorder buttons */}
                        <div style={{
                          position: "absolute", bottom: "4px", left: "4px", right: "4px",
                          display: "flex", justifyContent: "space-between", gap: "4px"
                        }}>
                          {idx > 0 && (
                            <button
                              onClick={() => moveImage(idx, -1)}
                              style={{
                                flex: 1, padding: "2px 0", background: "rgba(0,0,0,0.65)",
                                color: "#fff", border: "none", borderRadius: "4px",
                                fontSize: "10px", cursor: "pointer"
                              }}
                              title="Move back"
                            >
                              ◀
                            </button>
                          )}
                          {idx < images.length - 1 && (
                            <button
                              onClick={() => moveImage(idx, 1)}
                              style={{
                                flex: 1, padding: "2px 0", background: "rgba(0,0,0,0.65)",
                                color: "#fff", border: "none", borderRadius: "4px",
                                fontSize: "10px", cursor: "pointer"
                              }}
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
            <div className="level-wrap">
              <span className="level-label">Page Layout Options</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                <div>
                  <span style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Orientation
                  </span>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "8px",
                      border: "1px solid var(--border2)", background: "#fff",
                      fontSize: "12px", fontFamily: "inherit", outline: "none", color: "var(--text)"
                    }}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>

                <div>
                  <span style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Margin
                  </span>
                  <select
                    value={margin}
                    onChange={(e) => setMargin(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "8px",
                      border: "1px solid var(--border2)", background: "#fff",
                      fontSize: "12px", fontFamily: "inherit", outline: "none", color: "var(--text)"
                    }}
                  >
                    <option value="none">No Margin</option>
                    <option value="small">Small (15pt)</option>
                    <option value="normal">Standard (30pt)</option>
                  </select>
                </div>

                <div>
                  <span style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Page Size
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: "8px",
                      border: "1px solid var(--border2)", background: "#fff",
                      fontSize: "12px", fontFamily: "inherit", outline: "none", color: "var(--text)"
                    }}
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
            <div className="action-wrap">
              <button
                className="btn-compress"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 20px rgba(22,163,74,0.28)" }}
                onClick={convertToPDF}
              >
                {stage === "done" ? "🔁 Re-generate PDF" : `📄 Convert ${images.length} Image${images.length > 1 ? "s" : ""} to PDF`}
              </button>
            </div>
          )}

          {/* ── Progress Bar ── */}
          {stage === "generating" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">Generating PDF document...</span>
                <span className="progress-pct" style={{ color: "#16a34a" }}>{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #4ade80, #16a34a)" }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && result && (
            <>
              <div className="result-box" style={{ background: "rgba(22,163,74,0.06)", borderColor: "rgba(22,163,74,0.20)" }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Total Images</span>
                    <span className="result-val-orig">{result.pageCount} Pages</span>
                  </div>
                  <div className="result-arrow" style={{ color: "#16a34a" }}>→</div>
                  <div>
                    <span className="result-label">PDF Size</span>
                    <span className="result-val-comp" style={{ color: "#16a34a" }}>{fmt(result.pdfSize)}</span>
                  </div>
                </div>
                <div className="result-badge" style={{ marginTop: "12px" }}>
                  <span style={{ color: "#16a34a", background: "rgba(22,163,74,0.08)", borderColor: "rgba(22,163,74,0.25)" }}>
                    🎉 PDF Generated Successfully!
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={generatedBlob}
                fileName={getFileName()}
                onReset={reset}
                auth={auth}
              />
            </>
          )}

          <div className="comp-footer">
            <span>Flash Crush-Files · Image to PDF</span>
            <span>Files never leave your browser</span>
          </div>
        </div>
      </div>
    </div>
  );
}
