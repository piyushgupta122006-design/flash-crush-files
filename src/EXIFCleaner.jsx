// EXIFCleaner.jsx — 100% Client-Side EXIF Metadata Scrubber (Neo-Brutalism)
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ExifReader from "exifreader";
import ActionButtons from "./ActionButtons";
import { addHistoryRecord } from "./historyDB";

const MAX_SIZE_MB = 30;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function EXIFCleaner({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // States
  const [file, setFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [origDims, setOrigDims] = useState({ w: 0, h: 0 });

  // EXIF Metadata State
  const [metadata, setMetadata] = useState(null);
  const [hasGPS, setHasGPS] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasExif, setHasExif] = useState(false);

  // Processing & Results
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [cleanBlob, setCleanBlob] = useState(null);
  const [resultFileName, setResultFileName] = useState("");

  const resetAll = useCallback(() => {
    setFile(null);
    setPreviewSrc(null);
    setOrigDims({ w: 0, h: 0 });
    setMetadata(null);
    setHasGPS(false);
    setHasCamera(false);
    setHasExif(false);
    setProcessing(false);
    setError("");
    setCleanBlob(null);
    setResultFileName("");
  }, []);

  const handleFile = async (selectedFile) => {
    resetAll();
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please upload a valid image file (JPG, PNG, HEIC, WebP, TIFF).");
      return;
    }

    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image exceeds maximum allowed size of ${MAX_SIZE_MB} MB.`);
      return;
    }

    setFile(selectedFile);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewSrc(objectUrl);

    // Read Dimensions
    const img = new Image();
    img.onload = () => {
      setOrigDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = objectUrl;

    // Parse EXIF Metadata securely in the browser
    try {
      const tags = await ExifReader.load(selectedFile);
      setMetadata(tags);

      // Check key sections
      const gpsLat = tags.GPSLatitude;
      const gpsLon = tags.GPSLongitude;
      setHasGPS(!!(gpsLat && gpsLon));

      const make = tags.Make;
      const model = tags.Model;
      setHasCamera(!!(make || model));

      // Consider it has EXIF if it has more than just the basics
      const tagKeys = Object.keys(tags);
      setHasExif(tagKeys.length > 5);

    } catch (err) {
      console.warn("ExifReader error or no EXIF data found:", err);
      // It's possible the image simply has NO exif data.
      setMetadata({});
      setHasExif(false);
    }
  };

  // 1-Click Scrub Metadata (via Canvas Redraw)
  const scrubMetadata = async () => {
    if (!file || !previewSrc) return;

    setProcessing(true);
    setError("");

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for scrubbing."));
        img.src = previewSrc;
      });

      // Canvas strips all metadata natively
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Determine output format (JPEG is best for photos to keep size down, PNG for vectors)
      const isPngOrWebp = file.type === "image/png" || file.type === "image/webp";
      const outMime = isPngOrWebp ? "image/png" : "image/jpeg";
      const outExt = isPngOrWebp ? ".png" : ".jpg";
      const quality = isPngOrWebp ? undefined : 0.98;

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setError("Failed to generate clean image blob.");
            setProcessing(false);
            return;
          }

          setCleanBlob(blob);
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const outName = `${baseName}_stripped${outExt}`;
          setResultFileName(outName);

          // Save to Local History
          await addHistoryRecord({
            toolName: "EXIF Cleaner",
            fileName: outName,
            originalSize: file.size,
            resultSize: blob.size,
            mimeType: outMime,
            timestamp: Date.now(),
          });
          window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));
          setProcessing(false);
        },
        outMime,
        quality
      );
    } catch (err) {
      console.error(err);
      setError("Error stripping EXIF data. Please try another image.");
      setProcessing(false);
    }
  };

  // Helper to render value from EXIF tag
  const renderTagValue = (tag) => {
    if (!tag) return "N/A";
    if (tag.description) return tag.description;
    if (tag.value && Array.isArray(tag.value)) return tag.value.join(", ");
    return String(tag.value);
  };

  // Helper for Maps
  const getGoogleMapsLink = () => {
    if (!metadata || !hasGPS) return null;
    try {
      const latRaw = metadata.GPSLatitude.description; // e.g. "48.8584"
      const lonRaw = metadata.GPSLongitude.description; // e.g. "2.2945"
      const latRef = metadata.GPSLatitudeRef?.value[0] || "N";
      const lonRef = metadata.GPSLongitudeRef?.value[0] || "E";
      
      let lat = parseFloat(latRaw);
      let lon = parseFloat(lonRaw);
      
      if (latRef === "S") lat = -lat;
      if (lonRef === "W") lon = -lon;
      
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="compressor-page">
      {/* ── Top Bar ── */}
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">🛡️ EXIF Cleaner &amp; Viewer</span>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "900px" }}>
        
        {/* ── Header ── */}
        {!file && (
          <div className="comp-header">
            <div className="comp-title-row">
              <div className="comp-icon-badge" style={{ background: "var(--brutal-yellow)" }}>🛡️</div>
              <h1 className="comp-title">EXIF Cleaner &amp; Viewer</h1>
            </div>
            <p className="comp-sub">
              Extract, visualize, and scrub hidden GPS locations, camera models, and date stamps from photos. 100% private, zero uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="comp-card">
            <div
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <span className="drop-icon">📸</span>
              <div className="drop-main">Drop Photo to Analyze</div>
              <div className="drop-sub">JPG, PNG, HEIC, TIFF · 100% offline analysis</div>
              <button
                type="button"
                className="drop-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Privacy Inspector & Controls ── */}
        {file && !cleanBlob && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Image Summary */}
            <div className="comp-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <img
                    src={previewSrc}
                    alt="Original"
                    style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "2px solid #000" }}
                  />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{file.name}</div>
                    <div style={{ color: "var(--text-sub)", fontSize: "0.88rem", fontWeight: 600, display: "flex", gap: "10px", marginTop: "4px" }}>
                      <span>📏 {origDims.w} × {origDims.h} px</span>
                      <span>💾 {formatBytes(file.size)}</span>
                    </div>
                  </div>
                </div>
                <button className="btn-reset" onClick={resetAll} disabled={processing}>
                  Change Image
                </button>
              </div>
            </div>

            {/* Metadata Report Cards */}
            {metadata && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                
                {/* Location / GPS Data */}
                <div className="comp-card" style={{ padding: "20px", background: hasGPS ? "#FEE2E2" : "var(--bg-main)", borderColor: hasGPS ? "#B91C1C" : "#000" }}>
                  <h3 style={{ fontSize: "1.15rem", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    📍 GPS Location {hasGPS && <span style={{ fontSize: "0.75rem", background: "#B91C1C", color: "#fff", padding: "4px 8px", borderRadius: "6px" }}>CRITICAL WARNING</span>}
                  </h3>
                  {hasGPS ? (
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Latitude: <span style={{ fontWeight: 500 }}>{metadata.GPSLatitude?.description} {metadata.GPSLatitudeRef?.value[0]}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Longitude: <span style={{ fontWeight: 500 }}>{metadata.GPSLongitude?.description} {metadata.GPSLongitudeRef?.value[0]}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "12px" }}>Altitude: <span style={{ fontWeight: 500 }}>{metadata.GPSAltitude?.description}</span></p>
                      <a
                        href={getGoogleMapsLink()}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-reset"
                        style={{ background: "#B91C1C", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, border: "2px solid #000", textDecoration: "none", display: "inline-block" }}
                      >
                        🗺️ View on Google Maps
                      </a>
                    </div>
                  ) : (
                    <p style={{ fontWeight: 600, color: "var(--text-sub)" }}>✅ No embedded GPS location data found.</p>
                  )}
                </div>

                {/* Camera / Device Info */}
                <div className="comp-card" style={{ padding: "20px", background: hasCamera ? "var(--brutal-yellow)" : "var(--bg-main)" }}>
                  <h3 style={{ fontSize: "1.15rem", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                    📸 Camera &amp; Lens
                  </h3>
                  {hasCamera ? (
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Make: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.Make)}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Model: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.Model)}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Lens: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.LensModel)}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Aperture: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.FNumber)}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Shutter: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.ExposureTime)}s</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>ISO: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.ISOSpeedRatings)}</span></p>
                      <p style={{ fontWeight: 700, marginBottom: "6px" }}>Date Captured: <span style={{ fontWeight: 500 }}>{renderTagValue(metadata.DateTimeOriginal)}</span></p>
                    </div>
                  ) : (
                    <p style={{ fontWeight: 600, color: "var(--text-sub)" }}>✅ No camera/device model data found.</p>
                  )}
                </div>

              </div>
            )}

            {/* Raw Dump (Collapsible) */}
            {hasExif && metadata && (
              <details style={{ background: "var(--bg-main)", padding: "16px", borderRadius: "12px", border: "3px solid #1a1a1a", boxShadow: "4px 4px 0 #1a1a1a" }}>
                <summary style={{ fontWeight: 800, cursor: "pointer", fontSize: "1.05rem" }}>
                  📂 View All Raw Metadata Tags ({Object.keys(metadata).length})
                </summary>
                <div style={{ marginTop: "14px", maxHeight: "300px", overflowY: "auto", fontSize: "0.8rem", background: "#f1f1f1", padding: "12px", borderRadius: "6px", border: "1px solid #ddd" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <tbody>
                      {Object.keys(metadata).map((key) => {
                        // Skip thumbnail parsing for raw table view
                        if (key === "Thumbnail") return null; 
                        return (
                          <tr key={key} style={{ borderBottom: "1px solid #ccc" }}>
                            <td style={{ padding: "6px", fontWeight: 800, width: "35%", color: "#333" }}>{key}</td>
                            <td style={{ padding: "6px", color: "#555", wordBreak: "break-all" }}>{renderTagValue(metadata[key])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Scrub Trigger */}
            <div className="comp-card" style={{ padding: "24px", textAlign: "center" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "12px" }}>
                Ready to share this photo securely?
              </h3>
              <p style={{ fontWeight: 600, color: "var(--text-sub)", marginBottom: "20px" }}>
                Scrubbing removes 100% of EXIF, IPTC, and XMP data while preserving photo quality.
              </p>
              
              <button
                className="btn-compress"
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  margin: "0 auto",
                  padding: "16px",
                  fontSize: "1.15rem",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "10px",
                  background: "var(--brutal-pink)",
                  color: "#fff",
                }}
                onClick={scrubMetadata}
                disabled={processing}
              >
                {processing ? "Scrubbing..." : "🛡️ Scrub All Metadata"}
              </button>
            </div>

          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div
            className="error-banner"
            style={{
              background: "#FEE2E2",
              border: "3px solid #1a1a1a",
              padding: "14px",
              borderRadius: "10px",
              color: "#B91C1C",
              fontWeight: "bold",
              marginTop: "20px",
              boxShadow: "4px 4px 0 #000",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* ── Results Area ── */}
        {cleanBlob && (
          <div className="comp-card" style={{ maxWidth: "720px", margin: "0 auto", padding: "28px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "8px" }}>✅</div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: "6px" }}>
              Metadata 100% Scrubbed!
            </h2>
            <p style={{ color: "var(--text-sub)", marginBottom: "20px", fontWeight: 600 }}>
              Your photo is now completely safe and private to upload to Reddit, Twitter, or anywhere else.
            </p>

            <ActionButtons
              auth={auth}
              blob={cleanBlob}
              fileName={resultFileName}
              resultMime={cleanBlob.type}
              onReset={resetAll}
              toolName="EXIF Cleaner"
            />
          </div>
        )}

      </div>
    </div>
  );
}
