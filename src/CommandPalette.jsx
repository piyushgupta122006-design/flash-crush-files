// CommandPalette.jsx — Spotlight-style Neo-Brutalist Instant Search (Ctrl + K)
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const ALL_COMMANDS = [
  // ── PDF Tools ──
  {
    id: "pdf-compress",
    label: "PDF Compressor",
    desc: "Reduce PDF file size with high-efficiency local compression",
    category: "PDF",
    icon: "⚡",
    path: "/pdf",
    keywords: ["compress", "shrink", "reduce", "size", "optimize", "mb", "kb", "fast"]
  },
  {
    id: "pdf-merge",
    label: "Merge PDF",
    desc: "Combine multiple PDF documents into a single organized file",
    category: "PDF",
    icon: "📑",
    path: "/merge-pdf",
    keywords: ["merge", "combine", "join", "concat", "multiple", "unite"]
  },
  {
    id: "pdf-split",
    label: "Split & Extract PDF",
    desc: "Extract custom page ranges or split all pages into a ZIP",
    category: "PDF",
    icon: "✂️",
    path: "/split-pdf",
    keywords: ["split", "extract", "cut", "separate", "pages", "divide", "break"]
  },
  {
    id: "pdf-to-img",
    label: "PDF to Images",
    desc: "Convert PDF pages into high-resolution JPG, PNG, or WebP",
    category: "PDF",
    icon: "🖼️",
    path: "/pdf-to-img",
    keywords: ["convert", "images", "jpg", "png", "webp", "render", "export", "photo"]
  },
  {
    id: "pdf-organize",
    label: "Organize & Rotate PDF",
    desc: "Visual drag-and-drop page reordering and 90° rotation",
    category: "PDF",
    icon: "🔄",
    path: "/organize-pdf",
    keywords: ["organize", "reorder", "rotate", "delete", "rearrange", "pages", "sort"]
  },
  {
    id: "pdf-security",
    label: "PDF Lock & Unlock",
    desc: "AES-256 client-side password encryption and decryption",
    category: "PDF",
    icon: "🔐",
    path: "/pdf-security",
    keywords: ["lock", "unlock", "password", "security", "encrypt", "decrypt", "protect", "aes"]
  },
  {
    id: "pdf-watermark",
    label: "Watermark & Page Numbers",
    desc: "Add custom text stamps, opacity control, and page numbering",
    category: "PDF",
    icon: "🏷️",
    path: "/pdf-watermark",
    keywords: ["watermark", "stamp", "numbers", "page number", "confidential", "brand"]
  },
  {
    id: "ocr-tool",
    label: "OCR Text Extractor",
    desc: "Extract text from scanned PDFs and photos using Tesseract AI",
    category: "PDF & Image",
    icon: "🔍",
    path: "/ocr",
    keywords: ["ocr", "text", "extract", "scan", "read", "copy", "tesseract", "document", "photo"]
  },
  {
    id: "pdf-sign",
    label: "PDF E-Sign Studio",
    desc: "Draw, type, or stamp digital signatures directly on PDF documents",
    category: "PDF",
    icon: "✍️",
    path: "/sign-pdf",
    keywords: ["sign", "signature", "e-sign", "stamp", "draw", "contract", "initial", "form"]
  },

  // ── Image Tools ──
  {
    id: "img-compress",
    label: "Image Compressor",
    desc: "Lightning-fast single image compression with live preview",
    category: "IMAGE",
    icon: "🗜️",
    path: "/image",
    keywords: ["compress", "shrink", "reduce", "photo", "jpg", "png", "webp", "size"]
  },
  {
    id: "img-bulk",
    label: "Bulk Image Compressor",
    desc: "Batch compress 20–50+ images simultaneously with ZIP export",
    category: "IMAGE",
    icon: "📦",
    path: "/bulk-compress",
    keywords: ["bulk", "batch", "multiple", "zip", "photos", "gallery", "mass"]
  },
  {
    id: "img-convert",
    label: "Image Converter",
    desc: "Convert image formats between WebP, PNG, JPG, and AVIF",
    category: "IMAGE",
    icon: "🔄",
    path: "/convert",
    keywords: ["convert", "format", "webp", "png", "jpg", "jpeg", "avif", "transform"]
  },
  {
    id: "img-to-pdf",
    label: "Image to PDF",
    desc: "Convert multiple JPG/PNG images into a single printable PDF",
    category: "IMAGE",
    icon: "📄",
    path: "/img2pdf",
    keywords: ["img2pdf", "photos to pdf", "album", "gallery to pdf", "print"]
  },
  {
    id: "passport-resizer",
    label: "Passport Photo Resizer",
    desc: "Official dimensions for Indian Passport, US Visa, Schengen & Govt Exams",
    category: "IMAGE",
    icon: "🛂",
    path: "/passport-resizer",
    keywords: ["passport", "visa", "exam", "govt", "upsc", "ssc", "dimension", "kb", "kyc"]
  },
  {
    id: "img-crop",
    label: "Crop & Resize Image",
    desc: "Preset aspect ratios (16:9, 1:1, 4:5), rotate, flip, and exact pixels",
    category: "IMAGE",
    icon: "📐",
    path: "/image-crop",
    keywords: ["crop", "resize", "aspect ratio", "dimensions", "rotate", "flip", "cut"]
  },
  {
    id: "bg-remover",
    label: "AI Background Remover",
    desc: "100% in-browser on-device transparent cutout tool",
    category: "IMAGE",
    icon: "🤖",
    path: "/bg-remover",
    keywords: ["background", "remove bg", "transparent", "cutout", "ai", "mask", "png"]
  },
  {
    id: "qr-studio",
    label: "QR Code Studio",
    desc: "Design custom QR codes with colors, gradients, center logos & vCards",
    category: "IMAGE",
    icon: "📱",
    path: "/qr-studio",
    keywords: ["qr", "qr code", "vcard", "wifi", "barcode", "generator", "link"]
  },
  {
    id: "upscaler",
    label: "AI Image Upscaler",
    desc: "2x & 4x super-resolution enhancer with Bicubic & Lanczos sharpening",
    category: "IMAGE",
    icon: "✨",
    path: "/upscaler",
    keywords: ["upscale", "super resolution", "enhance", "sharpen", "hd", "4k", "enlarge", "2x", "4x"]
  },
  {
    id: "vectorizer",
    label: "SVG Vectorizer",
    desc: "Convert raster PNG/JPG artwork into scalable vector SVG shapes",
    category: "IMAGE",
    icon: "📐",
    path: "/vectorize",
    keywords: ["vector", "svg", "vectorize", "potrace", "logo", "icon", "trace", "path"]
  },
  {
    id: "exif-cleaner",
    label: "EXIF Privacy Cleaner",
    desc: "View camera metadata & GPS coordinates, then strip them for privacy",
    category: "PRIVACY",
    icon: "🛡️",
    path: "/exif-cleaner",
    keywords: ["exif", "metadata", "privacy", "gps", "location", "camera", "strip", "clean", "iso"]
  },
  {
    id: "crushdrop",
    label: "CrushDrop (P2P File Transfer)",
    desc: "AirDrop files directly between laptop & phone over WebRTC peer-to-peer",
    category: "TRANSFER",
    icon: "🌐",
    path: "/drop",
    keywords: ["airdrop", "p2p", "transfer", "share", "drop", "send", "receive", "webrtc", "direct", "wifi"]
  },

  // ── System Quick Actions ──
  {
    id: "action-home",
    label: "Go to Home",
    desc: "Return to FlashCrush dashboard with all tool cards",
    category: "ACTION",
    icon: "🏠",
    path: "/",
    keywords: ["home", "dashboard", "main", "start"]
  },
  {
    id: "action-history",
    label: "Open History Drawer",
    desc: "View recent local offline processing history & download past outputs",
    category: "ACTION",
    icon: "🕒",
    actionKey: "openHistory",
    keywords: ["history", "recent", "past", "logs", "saved", "indexeddb", "downloads"]
  },
  {
    id: "action-theme",
    label: "Toggle Theme (Light / Dark)",
    desc: "Switch between clean Light mode and sleek Dark Neo-Brutalist mode",
    category: "ACTION",
    icon: "🌓",
    actionKey: "toggleTheme",
    keywords: ["dark", "light", "theme", "mode", "toggle", "appearance", "black", "white"]
  }
];

export default function CommandPalette({
  isOpen,
  onClose,
  onOpenHistory,
  theme,
  setTheme,
  canInstall,
  installApp
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Reset query and selected index on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build filtered list
  const filteredCommands = ALL_COMMANDS.filter(cmd => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    const matchLabel = cmd.label.toLowerCase().includes(q);
    const matchDesc = cmd.desc.toLowerCase().includes(q);
    const matchCategory = cmd.category.toLowerCase().includes(q);
    const matchKeywords = cmd.keywords?.some(k => k.toLowerCase().includes(q));
    return matchLabel || matchDesc || matchCategory || matchKeywords;
  });

  // Clamp selectedIndex when list changes
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  // Execute an item
  const handleSelect = (cmd) => {
    if (!cmd) return;
    onClose();

    if (cmd.path) {
      navigate(cmd.path);
    } else if (cmd.actionKey === "openHistory") {
      onOpenHistory?.();
    } else if (cmd.actionKey === "toggleTheme") {
      setTheme?.(theme === "dark" ? "light" : "dark");
    } else if (cmd.actionKey === "installApp") {
      installApp?.();
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Keep selected item scrolled into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selectedEl = listEl.children[selectedIndex];
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div
        className="cmd-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Search Input Bar */}
        <div className="cmd-search-wrap">
          <span className="cmd-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-search-input"
            placeholder="Type a tool, keyword, or action (e.g. compress, sign, ocr, drop)..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              type="button"
              className="cmd-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
          <kbd className="cmd-esc-badge" onClick={onClose}>ESC</kbd>
        </div>

        {/* Results List */}
        <div className="cmd-results-list" ref={listRef}>
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`cmd-item ${isSelected ? "active" : ""}`}
                  onClick={() => handleSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="cmd-item-icon">{cmd.icon}</span>
                  <div className="cmd-item-body">
                    <div className="cmd-item-header">
                      <span className="cmd-item-label">{cmd.label}</span>
                      <span className={`cmd-tag cmd-tag-${cmd.category.toLowerCase().replace(/[^a-z]/g, "")}`}>
                        {cmd.category}
                      </span>
                    </div>
                    <div className="cmd-item-desc">{cmd.desc}</div>
                  </div>
                  {isSelected && <span className="cmd-arrow-enter">↵</span>}
                </div>
              );
            })
          ) : (
            <div className="cmd-empty-state">
              <div className="cmd-empty-icon">🔎</div>
              <div className="cmd-empty-title">No tools found for "{query}"</div>
              <div className="cmd-empty-hint">Try searching "pdf", "compress", "crop", "sign", or "drop"</div>
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="cmd-footer">
          <div className="cmd-footer-shortcuts">
            <span><kbd className="cmd-mini-kbd">↑</kbd><kbd className="cmd-mini-kbd">↓</kbd> Navigate</span>
            <span><kbd className="cmd-mini-kbd">↵</kbd> Open</span>
            <span><kbd className="cmd-mini-kbd">ESC</kbd> Close</span>
          </div>
          <div className="cmd-footer-branding">
            FlashCrush ⚡ 22+ Tools
          </div>
        </div>
      </div>
    </div>
  );
}
