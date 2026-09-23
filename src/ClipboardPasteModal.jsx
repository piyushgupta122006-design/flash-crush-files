// ClipboardPasteModal.jsx — Material Design 3 Quick Action Modal for Pasted Files (Ctrl + V)
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm transition-opacity font-sans" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full max-w-2xl max-h-[90vh] bg-m3-surface-container rounded-3xl shadow-m3-elevation-3 border border-m3-outline-variant/60 overflow-hidden flex flex-col text-m3-on-surface transition-colors"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pasted File Action Selector"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-m3-outline-variant/40 bg-m3-surface-container-low gap-3">
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-m3-secondary-container text-m3-on-secondary-container border border-m3-primary/30 w-fit mb-1.5 shadow-sm">
              <span>📋</span>
              <span>Clipboard Detected</span>
            </span>
            <h3 className="text-lg sm:text-xl font-normal text-m3-on-surface tracking-tight leading-snug">
              Where would you like to use this {isImage ? "image" : isPdf ? "PDF" : "file"}?
            </h3>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest transition-colors flex items-center justify-center flex-shrink-0 text-sm font-semibold"
            onClick={onClose}
            title="Close (ESC)"
          >
            ✕
          </button>
        </div>

        {/* File Card Info */}
        <div className="flex items-center gap-4 px-5 sm:px-6 py-3.5 bg-m3-surface-container border-b border-m3-outline-variant/40">
          {previewUrl ? (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-m3-surface-container-high border border-m3-outline-variant/60 flex items-center justify-center flex-shrink-0 shadow-sm">
              <img src={previewUrl} alt="Pasted clipboard preview" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-m3-surface-container-high border border-m3-outline-variant/60 flex items-center justify-center flex-shrink-0 shadow-sm text-2xl sm:text-3xl text-m3-primary">
              <span>📄</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm sm:text-base text-m3-on-surface truncate break-all mb-1">
              {file.name || (isImage ? "Pasted_Screenshot.png" : "Pasted_Document.pdf")}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant border border-m3-outline-variant/40 font-mono text-[11px]">
                {formatBytes(file.size)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-m3-surface-container-high text-m3-on-surface-variant border border-m3-outline-variant/40 font-mono text-[11px]">
                {file.type || (isImage ? "image/png" : "application/pdf")}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-2.5 py-0.5 rounded-full">
                ⚡ Ready to Process
              </span>
            </div>
          </div>
        </div>

        {/* Actions Grid */}
        <div className="px-5 sm:px-6 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-m3-on-surface-variant/80">
          Select a Tool to Process Immediately:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 px-5 sm:px-6 py-2 overflow-y-auto max-h-[320px] overscroll-contain">
          {actions.map((act) => (
            <button
              key={act.path}
              type="button"
              className="group flex items-center gap-3.5 p-3 rounded-2xl bg-m3-surface-container-low hover:bg-m3-surface-container-high active:bg-m3-secondary-container/40 border border-m3-outline-variant/40 hover:border-m3-primary/40 text-left transition-all duration-150 cursor-pointer shadow-sm hover:shadow-m3-elevation-1"
              onClick={() => onSelectTool(act.path)}
            >
              <div className="w-10 h-10 rounded-xl bg-m3-surface-container-highest group-hover:bg-m3-primary/10 flex items-center justify-center text-xl flex-shrink-0 transition-colors">
                <span className="clipboard-tool-icon">{act.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-m3-on-surface group-hover:text-m3-primary transition-colors truncate">
                  {act.label}
                </div>
                <div className="text-[11px] text-m3-on-surface-variant truncate block mt-0.5">
                  {act.desc}
                </div>
              </div>
              <span className="text-m3-outline group-hover:text-m3-primary group-hover:translate-x-0.5 transition-all text-sm font-bold flex-shrink-0 ml-1">
                ➜
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-m3-surface-container-low border-t border-m3-outline-variant/40 text-xs text-m3-on-surface-variant">
          <span className="flex items-center gap-1.5">
            Press <kbd className="px-1.5 py-0.5 rounded-md bg-m3-surface-container-high border border-m3-outline-variant/60 shadow-sm font-mono text-[10px] font-bold text-m3-on-surface-variant">ESC</kbd> or click outside to cancel
          </span>
          <button
            type="button"
            className="px-4 py-1.5 rounded-full text-xs font-medium text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest border border-m3-outline-variant/60 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
