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
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top Bar ── */}
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
          <span className="p-1.5 rounded-xl bg-m3-primary/10 text-m3-primary text-base">🛡️</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">EXIF Cleaner &amp; Viewer</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ── Header ── */}
        {!file && (
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
              🛡️
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
              EXIF Cleaner &amp; Viewer
            </h1>
            <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-2xl mx-auto leading-relaxed">
              Extract, visualize, and scrub hidden GPS locations, camera models, and date stamps from photos. 100% private client-side processing with zero uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone ── */}
        {!file && !processing && (
          <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 shadow-m3-elevation-1">
            <div
              className="border-2 border-dashed border-m3-outline-variant hover:border-m3-primary bg-m3-surface-container/40 hover:bg-m3-surface-container/80 rounded-3xl p-8 sm:p-14 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="w-20 h-20 rounded-full bg-m3-primary/10 text-m3-primary flex items-center justify-center text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                📸
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-m3-on-surface mb-2">
                Drop Photo to Analyze
              </div>
              <div className="text-sm text-m3-on-surface-variant mb-6 max-w-md">
                JPG, PNG, HEIC, TIFF · 100% offline private analysis (up to {MAX_SIZE_MB}MB)
              </div>
              <button
                type="button"
                className="px-8 py-3.5 rounded-full bg-m3-primary text-m3-on-primary font-semibold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 hover:bg-m3-primary/90 active:scale-95 transition-all duration-200"
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
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── Privacy Inspector & Controls ── */}
        {file && !cleanBlob && (
          <div className="flex flex-col gap-6">
            
            {/* Image Summary */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 sm:p-6 shadow-m3-elevation-1">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={previewSrc}
                    alt="Original"
                    className="w-16 h-16 rounded-2xl object-cover border border-m3-outline-variant/80 shadow-sm flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-base sm:text-lg text-m3-on-surface truncate max-w-xs sm:max-w-md">
                      {file.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-m3-surface-container text-xs font-mono text-m3-on-surface-variant border border-m3-outline-variant/50">
                        📏 {origDims.w} × {origDims.h} px
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-m3-surface-container text-xs font-mono text-m3-on-surface-variant border border-m3-outline-variant/50">
                        💾 {formatBytes(file.size)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-4 py-2 rounded-full border border-m3-outline-variant/80 hover:bg-m3-error-container hover:text-m3-on-error-container hover:border-m3-error/30 text-sm font-semibold text-m3-on-surface transition-all duration-200 active:scale-95 disabled:opacity-50"
                  onClick={resetAll}
                  disabled={processing}
                >
                  Change Image
                </button>
              </div>
            </div>

            {/* Metadata Report Cards */}
            {metadata && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Location / GPS Data */}
                <div className={`rounded-3xl p-6 shadow-m3-elevation-1 transition-all ${
                  hasGPS
                    ? "bg-m3-error-container/20 border-2 border-m3-error/50"
                    : "bg-m3-surface-container-low border border-m3-outline-variant/60"
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="text-base sm:text-lg font-display font-bold text-m3-on-surface flex items-center gap-2">
                      <span>📍</span> GPS Location
                    </h3>
                    {hasGPS && (
                      <span className="px-2.5 py-0.5 rounded-full bg-m3-error text-m3-on-error text-xs font-bold tracking-wide animate-pulse">
                        CRITICAL WARNING
                      </span>
                    )}
                  </div>

                  {hasGPS ? (
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Latitude:</span>
                        <span className="font-mono text-m3-on-surface-variant">{metadata.GPSLatitude?.description} {metadata.GPSLatitudeRef?.value[0]}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Longitude:</span>
                        <span className="font-mono text-m3-on-surface-variant">{metadata.GPSLongitude?.description} {metadata.GPSLongitudeRef?.value[0]}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Altitude:</span>
                        <span className="font-mono text-m3-on-surface-variant">{metadata.GPSAltitude?.description || "N/A"}</span>
                      </div>

                      <div className="pt-2">
                        <a
                          href={getGoogleMapsLink()}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-m3-error text-m3-on-error text-xs font-bold shadow-sm hover:bg-m3-error/90 active:scale-95 transition-all"
                        >
                          <span>🗺️</span>
                          <span>View on Google Maps</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-m3-on-surface-variant flex items-center gap-2 py-4">
                      <span>✅</span> No embedded GPS location data found.
                    </p>
                  )}
                </div>

                {/* Camera / Device Info */}
                <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 shadow-m3-elevation-1">
                  <h3 className="text-base sm:text-lg font-display font-bold text-m3-on-surface flex items-center gap-2 mb-4">
                    <span>📸</span> Camera &amp; Lens
                  </h3>

                  {hasCamera ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Make:</span>
                        <span className="font-mono text-m3-on-surface-variant text-right truncate max-w-[160px]">{renderTagValue(metadata.Make)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Model:</span>
                        <span className="font-mono text-m3-on-surface-variant text-right truncate max-w-[160px]">{renderTagValue(metadata.Model)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Lens:</span>
                        <span className="font-mono text-m3-on-surface-variant text-right truncate max-w-[160px]">{renderTagValue(metadata.LensModel)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Aperture:</span>
                        <span className="font-mono text-m3-on-surface-variant">{renderTagValue(metadata.FNumber)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Shutter:</span>
                        <span className="font-mono text-m3-on-surface-variant">{renderTagValue(metadata.ExposureTime)}s</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">ISO:</span>
                        <span className="font-mono text-m3-on-surface-variant">{renderTagValue(metadata.ISOSpeedRatings)}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-m3-outline-variant/30">
                        <span className="font-semibold text-m3-on-surface">Date Captured:</span>
                        <span className="font-mono text-m3-on-surface-variant text-right truncate max-w-[160px]">{renderTagValue(metadata.DateTimeOriginal)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-m3-on-surface-variant flex items-center gap-2 py-4">
                      <span>✅</span> No camera/device model data found.
                    </p>
                  )}
                </div>

              </div>
            )}

            {/* Raw Dump (Collapsible) */}
            {hasExif && metadata && (
              <details className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-5 shadow-m3-elevation-1 group">
                <summary className="font-display font-bold text-sm sm:text-base text-m3-on-surface cursor-pointer list-none flex items-center justify-between py-1">
                  <span>📂 View All Raw Metadata Tags ({Object.keys(metadata).length})</span>
                  <span className="text-xs text-m3-primary transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl bg-m3-surface-container border border-m3-outline-variant/40 p-4">
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      {Object.keys(metadata).map((key) => {
                        if (key === "Thumbnail") return null;
                        return (
                          <tr key={key} className="border-b border-m3-outline-variant/25 last:border-0 text-xs">
                            <td className="py-2 pr-3 font-mono font-bold text-m3-on-surface w-2/5">{key}</td>
                            <td className="py-2 font-mono text-m3-on-surface-variant break-all">{renderTagValue(metadata[key])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Scrub Trigger */}
            <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 text-center shadow-m3-elevation-1 max-w-xl mx-auto w-full">
              <h3 className="text-lg sm:text-xl font-display font-bold text-m3-on-surface mb-2">
                Ready to share this photo securely?
              </h3>
              <p className="text-sm text-m3-on-surface-variant mb-6 leading-relaxed">
                Scrubbing removes 100% of EXIF, IPTC, and XMP data while preserving photo quality.
              </p>
              
              <button
                type="button"
                className="w-full py-4 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-base shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-50"
                onClick={scrubMetadata}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <span className="inline-block w-5 h-5 border-2 border-m3-on-primary border-t-transparent rounded-full animate-spin" />
                    <span>Scrubbing...</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">🛡️</span>
                    <span>Scrub All Metadata</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/20 font-medium text-sm flex items-center gap-3 shadow-sm">
            <span className="text-lg flex-shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Results Area ── */}
        {cleanBlob && (
          <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-10 max-w-2xl mx-auto w-full text-center shadow-m3-elevation-1">
            <div className="text-4xl sm:text-5xl mb-3">✅</div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-m3-on-surface mb-2">
              Metadata 100% Scrubbed!
            </h2>
            <p className="text-sm text-m3-on-surface-variant mb-6 leading-relaxed">
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
