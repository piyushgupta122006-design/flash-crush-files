// ClipboardPasteModal.jsx — Neo-Brutalist Quick Action Modal for Pasted Files (Ctrl + V)
import { useState, useEffect, useRef } from "react";

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

const IMAGE_ACTIONS = [
  { path: "/image", label: "Compress Image", icon: "🗜️", desc: "Reduce file size with live preview" },
  { path: "/bg-remover", label: "Remove Background", icon: "🤖", desc: "100% on-device AI transparent cutout" },
  { path: "/ocr", label: "Extract Text (OCR)", icon: "🔍", desc: "Scan text from screenshot via Tesseract" },
  { path: "/upscaler", label: "AI Upscaler (2x / 4x)", icon: "✨", desc: "Enhance resolution & sharpen" },
  { path: "/vectorize", label: "Vectorize to SVG", icon: "📐", desc: "Convert to crisp scalable vector SVG" },
  { path: "/img2pdf", label: "Image to PDF", icon: "📄", desc: "Convert photo into printable PDF" },
  { path: "/image-crop", label: "Crop & Resize", icon: "✂️", desc: "Exact dimensions, rotate & flip" },
  { path: "/convert", label: "Convert Format", icon: "🔄", desc: "Convert to WebP, PNG, JPG, AVIF" },
  { path: "/exif-cleaner", label: "EXIF Privacy Cleaner", icon: "🛡️", desc: "Scrub metadata & GPS location" },
  { path: "/drop", label: "CrushDrop P2P", icon: "🌐", desc: "AirDrop directly to phone or laptop" },
];

const PDF_ACTIONS = [
  { path: "/pdf", label: "Compress PDF", icon: "⚡", desc: "Reduce PDF size with local compression" },
  { path: "/sign-pdf", label: "E-Sign PDF Studio", icon: "✍️", desc: "Draw, stamp, or type digital signature" },
  { path: "/ocr", label: "Extract Text (OCR)", icon: "🔍", desc: "OCR scanned pages with AI" },
  { path: "/merge-pdf", label: "Merge PDF", icon: "📑", desc: "Combine with other PDF documents" },
  { path: "/split-pdf", label: "Split & Extract", icon: "✂️", desc: "Extract pages or split to ZIP" },
  { path: "/pdf-to-img", label: "PDF to Images", icon: "🖼️", desc: "Export pages to JPG/PNG/WebP" },
  { path: "/organize-pdf", label: "Organize & Rotate", icon: "🔄", desc: "Reorder & rotate pages visually" },
  { path: "/pdf-security", label: "Lock & Unlock", icon: "🔐", desc: "AES-256 password protection" },
  { path: "/pdf-watermark", label: "Watermark", icon: "🏷️", desc: "Add stamp & page numbers" },
  { path: "/drop", label: "CrushDrop P2P", icon: "🌐", desc: "AirDrop directly to phone or laptop" },
];

const VIDEO_ACTIONS = [
  { path: "/video-compress", label: "Compress Video / Audio", icon: "🎬", desc: "Compress MP4/WebM with WhatsApp 16MB preset" },
  { path: "/drop", label: "CrushDrop P2P", icon: "🌐", desc: "AirDrop directly to phone or laptop" },
];

export default function ClipboardPasteModal({ file, onClose, onSelectTool }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const modalRef = useRef(null);

  const isImage = file?.type?.startsWith("image/") || file?.name?.match(/\.(jpe?g|png|webp|avif|bmp|svg)$/i);
  const isPdf = file?.type === "application/pdf" || file?.name?.match(/\.pdf$/i);
  const isVideo = file?.type?.startsWith("video/") || file?.type?.startsWith("audio/") || file?.name?.match(/\.(mp4|webm|mov|mkv|avi|mp3|wav)$/i);

  // Generate image preview
  useEffect(() => {
    if (file && isImage) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file, isImage]);

  // Lock background scroll when open
  useEffect(() => {
    if (file) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [file]);

  // Click / Tap outside modal to dismiss
  useEffect(() => {
    if (!file) return;
    function handlePointerDown(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [file, onClose]);

  // Escape key to dismiss
  useEffect(() => {
    if (!file) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, onClose]);

  if (!file) return null;

  const actions = isVideo ? VIDEO_ACTIONS : isImage ? IMAGE_ACTIONS : isPdf ? PDF_ACTIONS : [];

  return (
    <div className="clipboard-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="clipboard-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pasted File Action Selector"
      >
        {/* Header */}
        <div className="clipboard-modal-header">
          <div className="clipboard-modal-title">
            <span className="clipboard-modal-badge">📋 CLIPBOARD DETECTED</span>
            <h3>Where would you like to use this {isImage ? "image" : isPdf ? "PDF" : "file"}?</h3>
          </div>
          <button type="button" className="clipboard-close-btn" onClick={onClose} title="Close (ESC)">
            ✕
          </button>
        </div>

        {/* File Card Info */}
        <div className="clipboard-file-info-card">
          {previewUrl && (
            <div className="clipboard-thumb-wrap">
              <img src={previewUrl} alt="Pasted clipboard preview" className="clipboard-thumb-img" />
            </div>
          )}
          {!previewUrl && (
            <div className="clipboard-thumb-wrap clipboard-pdf-icon">
              <span>📄</span>
            </div>
          )}
          <div className="clipboard-file-details">
            <div className="clipboard-file-name">{file.name || (isImage ? "Pasted_Screenshot.png" : "Pasted_Document.pdf")}</div>
            <div className="clipboard-file-meta">
              <span className="clipboard-meta-pill">{formatBytes(file.size)}</span>
              <span className="clipboard-meta-pill">{file.type || (isImage ? "image/png" : "application/pdf")}</span>
              <span className="clipboard-meta-ready">⚡ Ready to Process</span>
            </div>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="clipboard-actions-header">Select a Tool to Process Immediately:</div>
        <div className="clipboard-actions-grid">
          {actions.map((act) => (
            <button
              key={act.path}
              type="button"
              className="clipboard-tool-btn"
              onClick={() => onSelectTool(act.path)}
            >
              <span className="clipboard-tool-icon">{act.icon}</span>
              <div className="clipboard-tool-text">
                <div className="clipboard-tool-label">{act.label}</div>
                <div className="clipboard-tool-desc">{act.desc}</div>
              </div>
              <span className="clipboard-tool-arrow">➜</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="clipboard-modal-footer">
          <span>Press <kbd className="cmd-mini-kbd">ESC</kbd> or click outside to cancel</span>
          <button type="button" className="clipboard-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
