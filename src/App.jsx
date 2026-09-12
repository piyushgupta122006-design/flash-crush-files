// App.jsx — FlashCrush with Categorized Dropdown Navigation & Mobile Drawer (Neo-Brutalism)
import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./styles.css";
import { useAuth } from "./useAuth";
import HomePage, { LogoMark } from "./HomePage";
import PDFCompressor   from "./PDFCompressor";
import ImageCompressor from "./ImageCompressor";
import ImageConverter  from "./ImageConverter";
import ImageToPDF      from "./ImageToPDF";
import PDFMerger       from "./PDFMerger";
import PDFToImage      from "./PDFToImage";
import SplitPDF        from "./SplitPDF";
import PDFOrganizer    from "./PDFOrganizer";
import PDFSecurity     from "./PDFSecurity";
import PDFWatermark    from "./PDFWatermark";
import BulkImageCompressor from "./BulkImageCompressor";
import PassportResizer     from "./PassportResizer";
import ImageCropResize    from "./ImageCropResize";
import BackgroundRemover  from "./BackgroundRemover";
import QRCodeStudio       from "./QRCodeStudio";
import PDFImageOCR        from "./PDFImageOCR";
import PDFSignStudio      from "./PDFSignStudio";
import ImageUpscaler      from "./ImageUpscaler";
import SVGVectorizer      from "./SVGVectorizer";
import EXIFCleaner        from "./EXIFCleaner";
import CrushDrop          from "./CrushDrop";
import LocalHistory       from "./LocalHistory";
import VideoCompressor   from "./VideoCompressor";
import DocumentScanner  from "./DocumentScanner";
import CommandPalette   from "./CommandPalette";
import ClipboardPasteModal from "./ClipboardPasteModal";
import { setPendingFile, consumePendingFile } from "./clipboardStore";
import { getAllHistoryRecords } from "./historyDB";
import { usePWA }         from "./usePWA";
import { useTheme }       from "./useTheme";

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

const PDF_TOOLS = [
  { path: "/pdf", label: "PDF Compressor", desc: "Reduce PDF size with extreme compression", icon: "⚡" },
  { path: "/merge-pdf", label: "Merge PDF", desc: "Combine multiple PDF files into one", icon: "📑" },
  { path: "/split-pdf", label: "Split & Extract", desc: "Extract pages or split all to ZIP", icon: "✂️" },
  { path: "/pdf-to-img", label: "PDF to Images", desc: "Convert PDF pages to JPG/PNG/WebP", icon: "🖼️" },
  { path: "/organize-pdf", label: "Organize & Rotate", desc: "Visual drag & drop page reorder", icon: "🔄" },
  { path: "/pdf-security", label: "Lock & Unlock", desc: "AES-256 password protection & unlock", icon: "🔐" },
  { path: "/pdf-watermark", label: "Watermark & Numbers", desc: "Add or remove watermarks & numbering", icon: "🏷️" },
  { path: "/ocr", label: "OCR Text Extract", desc: "Extract text from scanned PDFs & photos", icon: "🔍" },
  { path: "/sign-pdf", label: "PDF E-Sign Studio", desc: "Draw, type, or upload signatures & stamps", icon: "✍️" },
  { path: "/scan-pdf", label: "Doc Scanner (Camera)", desc: "Scan documents & notes directly to PDF", icon: "📷" },
];

const IMAGE_TOOLS = [
  { path: "/image", label: "Image Compressor", desc: "Fast single image compression", icon: "🗜️" },
  { path: "/bulk-compress", label: "Bulk Compressor", desc: "Batch compress 20–50+ photos to ZIP", icon: "📦" },
  { path: "/convert", label: "Image Converter", desc: "Convert between WebP, PNG, JPG, AVIF", icon: "🔄" },
  { path: "/img2pdf", label: "Image to PDF", desc: "Convert multiple photos to printable PDF", icon: "📄" },
  { path: "/passport-resizer", label: "Passport Photo", desc: "Official sizes for Passport, Visa & Govt Exams", icon: "🛂" },
  { path: "/image-crop", label: "Crop & Resize", desc: "Aspect ratios, exact dimensions, rotate & flip", icon: "📐" },
  { path: "/bg-remover", label: "AI BG Remover", desc: "100% in-browser on-device background remover", icon: "🤖" },
  { path: "/qr-studio", label: "QR Studio", desc: "Custom colors, gradients, center logo & vCard", icon: "📱" },
  { path: "/ocr", label: "Image OCR", desc: "Extract text from photos & screenshots", icon: "🔍" },
  { path: "/upscaler", label: "AI Image Upscaler", desc: "2x & 4x super-resolution enhancer", icon: "✨" },
  { path: "/vectorize", label: "SVG Vectorizer", desc: "Convert PNG/JPG to scalable vector SVG", icon: "📐" },
  { path: "/exif-cleaner", label: "EXIF Privacy Cleaner", desc: "View & strip photo location & camera data", icon: "🛡️" },
  { path: "/drop", label: "CrushDrop P2P", desc: "AirDrop files directly between devices", icon: "🌐" },
  { path: "/video-compress", label: "Video Compressor", desc: "Compress MP4/WebM videos & audio locally", icon: "🎬" },
];

export default function App() {
  const auth = useAuth();
  const pwa = usePWA();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [showMenu, setShowMenu] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const [showImgMenu, setShowImgMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [signInError, setSignInError] = useState("");
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [clipboardFile, setClipboardFile] = useState(null);
  const [pasteToast, setPasteToast] = useState("");

  const menuRef = useRef(null);
  const pdfMenuRef = useRef(null);
  const imgMenuRef = useRef(null);
  const themeMenuRef = useRef(null);

  const isSignedIn = auth.authStatus === "signedin";

  // Check active category for glow highlighting
  const isPdfActive = PDF_TOOLS.some(t => t.path === location.pathname);
  const isImgActive = IMAGE_TOOLS.some(t => t.path === location.pathname);

  // Update history count
  useEffect(() => {
    const updateCount = async () => {
      const records = await getAllHistoryRecords();
      setHistoryCount(records.length);
    };
    updateCount();
    window.addEventListener("flashcrush:history-updated", updateCount);
    return () => window.removeEventListener("flashcrush:history-updated", updateCount);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setShowPdfMenu(false);
      }
      if (imgMenuRef.current && !imgMenuRef.current.contains(e.target)) {
        setShowImgMenu(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target)) {
        setShowThemeMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global shortcut for Command Palette (Ctrl+K or Cmd+K)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCmdPalette(prev => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Global Clipboard Paste (Ctrl+V) listener
  useEffect(() => {
    function handlePaste(e) {
      // Ignore if user is typing in an input or textarea
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || document.activeElement?.isContentEditable) {
        return;
      }

      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const isImage = file.type?.startsWith("image/") || file.name?.match(/\.(jpe?g|png|webp|avif|bmp|svg)$/i);
      const isPdf = file.type === "application/pdf" || file.name?.match(/\.pdf$/i);

      if (!isImage && !isPdf) return;

      e.preventDefault();

      // If active tool already has a file input, inject directly!
      const currentFileInput = document.querySelector('main input[type="file"]:not([disabled])');
      if (currentFileInput && location.pathname !== "/") {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          currentFileInput.files = dt.files;
          currentFileInput.dispatchEvent(new Event("change", { bubbles: true }));
          setPasteToast(`📋 Pasted into active tool!`);
          setTimeout(() => setPasteToast(""), 3000);
          return;
        } catch {
          // Fallback to modal if injection fails
        }
      }

      // Otherwise, open the Clipboard Quick Action Modal
      setClipboardFile(file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [location.pathname]);

  // Inject pending file after navigating to chosen tool
  useEffect(() => {
    const pending = consumePendingFile();
    if (!pending) return;

    const timer = setTimeout(() => {
      const fileInput = document.querySelector('main input[type="file"]:not([disabled])');
      if (fileInput) {
        try {
          const dt = new DataTransfer();
          dt.items.add(pending);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          setPasteToast(`📋 Loaded pasted file into tool!`);
          setTimeout(() => setPasteToast(""), 3000);
        } catch {
          // Silent ignore
        }
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Show sign-in error prominently
  useEffect(() => {
    if (!auth.authError) {
      setSignInError("");
      return;
    }
    setSignInError(auth.authError);
    const t = setTimeout(() => setSignInError(""), 10000);
    return () => clearTimeout(t);
  }, [auth.authError]);

  // Scroll to top on route change & close menus
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setShowPdfMenu(false);
    setShowImgMenu(false);
    setShowThemeMenu(false);
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="site-layout min-h-screen bg-[#f8fafd] dark:bg-[#131314] text-gray-800 dark:text-gray-100 font-sans transition-colors">
      {/* ── Offline Status Banner (M3 Tonal Amber) ── */}
      {!pwa.isOnline && (
        <div className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center gap-2 border-b border-amber-200/50 dark:border-amber-900/50 z-50">
          <span>⚡ Offline Mode Active</span>
          <span className="opacity-80">— 100% of tools work locally in your browser without internet.</span>
        </div>
      )}

      {/* ── Google M3 Workspace Top App Bar ── */}
      <nav className="sticky top-0 z-40 w-full bg-[#f8fafd] dark:bg-[#131314] px-4 lg:px-6 py-2.5 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800 transition-colors">
        {/* Left Side: Logo & Navigation Pills */}
        <div className="flex items-center gap-2 lg:gap-4">
          {/* Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none py-1 px-2 rounded-full hover:bg-gray-200/40 dark:hover:bg-gray-800 transition-colors"
            onClick={() => navigate("/")}
            onMouseEnter={() => {
              setShowPdfMenu(false);
              setShowImgMenu(false);
            }}
          >
            <LogoMark size={28} />
            <span className="text-xl font-normal text-gray-800 dark:text-gray-100 font-sans tracking-tight">
              Flash<span className="text-blue-600 dark:text-blue-400 font-medium">Crush</span>
            </span>
          </div>

          {/* Desktop Categorized Navigation Links (M3 Pills) */}
          <div className="hidden md:flex items-center gap-1.5">
            {/* Home */}
            <NavLink
              to="/"
              end
              onMouseEnter={() => {
                setShowPdfMenu(false);
                setShowImgMenu(false);
              }}
              className={({ isActive }) =>
                `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800"
                }`
              }
            >
              Home
            </NavLink>

            {/* PDF Tools Dropdown */}
            <div
              className="relative"
              ref={pdfMenuRef}
              onMouseEnter={() => {
                setShowPdfMenu(true);
                setShowImgMenu(false);
              }}
              onMouseLeave={() => setShowPdfMenu(false)}
            >
              <button
                type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isPdfActive
                    ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800"
                }`}
                onClick={() => {
                  setShowPdfMenu(p => !p);
                  setShowImgMenu(false);
                }}
              >
                <span>📄 PDF Tools</span>
                <span className="text-[10px] text-gray-500">{showPdfMenu ? "▲" : "▼"}</span>
              </button>

              {showPdfMenu && (
                <div
                  className="absolute top-full left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-[#1e1f20] shadow-lg border border-gray-200/80 dark:border-gray-800 p-2 z-50"
                >
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    PDF Power Tools
                  </div>
                  <div className="grid grid-cols-1 gap-1 max-h-96 overflow-y-auto">
                    {PDF_TOOLS.map(t => (
                      <NavLink
                        key={t.path}
                        to={t.path}
                        className={({ isActive }) =>
                          `flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                            isActive
                              ? "bg-[#f0f4f9] dark:bg-[#28292a]"
                              : "hover:bg-gray-100/80 dark:hover:bg-[#28292a]"
                          }`
                        }
                        onClick={() => setShowPdfMenu(false)}
                      >
                        <span className="text-lg select-none">{t.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{t.desc}</div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Image Tools Dropdown */}
            <div
              className="relative"
              ref={imgMenuRef}
              onMouseEnter={() => {
                setShowImgMenu(true);
                setShowPdfMenu(false);
              }}
              onMouseLeave={() => setShowImgMenu(false)}
            >
              <button
                type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isImgActive
                    ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800"
                }`}
                onClick={() => {
                  setShowImgMenu(p => !p);
                  setShowPdfMenu(false);
                }}
              >
                <span>🖼️ Image Tools</span>
                <span className="text-[10px] text-gray-500">{showImgMenu ? "▲" : "▼"}</span>
              </button>

              {showImgMenu && (
                <div
                  className="absolute top-full left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-[#1e1f20] shadow-lg border border-gray-200/80 dark:border-gray-800 p-2 z-50"
                >
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Image Super-Tools
                  </div>
                  <div className="grid grid-cols-1 gap-1 max-h-96 overflow-y-auto">
                    {IMAGE_TOOLS.map(t => (
                      <NavLink
                        key={t.path}
                        to={t.path}
                        className={({ isActive }) =>
                          `flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                            isActive
                              ? "bg-[#f0f4f9] dark:bg-[#28292a]"
                              : "hover:bg-gray-100/80 dark:hover:bg-[#28292a]"
                          }`
                        }
                        onClick={() => setShowImgMenu(false)}
                      >
                        <span className="text-lg select-none">{t.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{t.desc}</div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Google Drive Style Pill Search Bar */}
        <div
          className="hidden lg:flex flex-1 max-w-lg mx-6 items-center gap-3 px-4 py-2 rounded-full bg-[#edf2fc] dark:bg-[#28292a] hover:bg-[#e4ebf7] dark:hover:bg-[#333537] text-gray-600 dark:text-gray-300 text-sm cursor-pointer transition-colors border border-transparent shadow-xs"
          onClick={() => setShowCmdPalette(true)}
          onMouseEnter={() => {
            setShowPdfMenu(false);
            setShowImgMenu(false);
          }}
          title="Search tools, PDFs & actions (Ctrl + K)"
        >
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="flex-1 select-none text-gray-500 dark:text-gray-400">Search in FlashCrush...</span>
          <kbd className="rounded-full px-2.5 py-0.5 text-xs bg-white dark:bg-[#1e1f20] text-gray-500 dark:text-gray-400 font-mono shadow-xs border border-gray-200/60 dark:border-gray-700">
            Ctrl K
          </kbd>
        </div>

        {/* Right Side: Quick Tools, Auth & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Search Button (Tablet/Mobile) */}
          <button
            type="button"
            className="lg:hidden rounded-full p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setShowCmdPalette(true)}
            title="Quick Search (Ctrl + K)"
          >
            <span className="text-base">🔍</span>
          </button>

          {/* Local Offline History Button */}
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 flex items-center gap-1.5 transition-colors"
            onClick={() => setShowHistoryDrawer(true)}
            title="Local Offline History (IndexedDB)"
          >
            <span>🕒</span>
            <span className="hidden xl:inline">History</span>
            {historyCount > 0 && (
              <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                {historyCount}
              </span>
            )}
          </button>

          {/* PWA Install Button */}
          {pwa.canInstall && (
            <button
              type="button"
              className="rounded-full px-3.5 py-1.5 text-sm font-medium bg-[#f0f4f9] dark:bg-[#28292a] text-gray-800 dark:text-gray-200 hover:bg-[#e9eef6] dark:hover:bg-[#333537] flex items-center gap-1.5 shadow-xs transition-colors"
              onClick={pwa.installApp}
              title="Install FlashCrush as Native App"
            >
              <span>📲</span>
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Theme Toggle Dropdown */}
          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 border border-gray-300/70 dark:border-gray-700 flex items-center gap-1.5 transition-colors"
              onClick={() => setShowThemeMenu(m => !m)}
              title={`Theme: ${theme === "system" ? "System Default" : theme === "dark" ? "Dark Mode" : "Light Mode"}`}
            >
              <span>{theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "💻"}</span>
              <span className="hidden sm:inline text-xs font-normal">
                {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"}
              </span>
              <span className="text-[9px] text-gray-500">{showThemeMenu ? "▲" : "▼"}</span>
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-white dark:bg-[#1e1f20] shadow-lg border border-gray-200/80 dark:border-gray-800 p-1.5 z-50">
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    theme === "light"
                      ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => { setTheme("light"); setShowThemeMenu(false); }}
                >
                  <span>☀️</span>
                  <span>Light Mode</span>
                </button>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    theme === "dark"
                      ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => { setTheme("dark"); setShowThemeMenu(false); }}
                >
                  <span>🌙</span>
                  <span>Dark Mode</span>
                </button>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    theme === "system"
                      ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => { setTheme("system"); setShowThemeMenu(false); }}
                >
                  <span>💻</span>
                  <span>System (Auto)</span>
                </button>
              </div>
            )}
          </div>

          {/* User Auth (Google Sign-In or Avatar) */}
          {isSignedIn ? (
            <div className="relative" ref={menuRef}>
              <div
                className="flex items-center gap-1 p-0.5 rounded-full hover:ring-2 hover:ring-blue-500/30 cursor-pointer transition-all"
                onClick={() => setShowMenu(m => !m)}
              >
                {auth.user?.picture ? (
                  <img src={auth.user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-medium text-xs flex items-center justify-center">
                    {auth.user?.name?.[0] || "G"}
                  </div>
                )}
                <span className="text-[8px] text-gray-500">{showMenu ? "▲" : "▼"}</span>
              </div>
              {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#1e1f20] shadow-lg border border-gray-200/80 dark:border-gray-800 p-3 z-50">
                  <div className="border-b border-gray-100 dark:border-gray-800 pb-2.5 mb-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{auth.user?.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{auth.user?.email}</div>
                  </div>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    onClick={() => { auth.signOut(); setShowMenu(false); }}
                  >
                    <span>⏻</span> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center">
              <button
                className="rounded-full px-4 py-1.5 text-sm font-medium border border-gray-300/80 dark:border-gray-700 bg-white dark:bg-[#1e1f20] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-xs flex items-center gap-2 transition-all"
                onClick={auth.signIn}
                disabled={auth.authStatus === "loading"}
              >
                <GoogleIcon />
                <span className="hidden sm:inline">
                  {auth.authStatus === "loading" ? "Signing in…" : "Sign in"}
                </span>
              </button>
              {signInError && (
                <div className="text-xs text-rose-600 ml-2">{signInError}</div>
              )}
            </div>
          )}

          {/* Mobile Drawer Hamburger Button */}
          <button
            type="button"
            className="md:hidden rounded-full p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors text-base"
            onClick={() => setMobileNavOpen(o => !o)}
            title="Toggle Menu"
          >
            {mobileNavOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>


      {/* ── Mobile Drawer Menu (Google M3 Style) ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-start" onClick={() => setMobileNavOpen(false)}>
          <div
            className="w-80 max-w-[85vw] h-full bg-[#f8fafd] dark:bg-[#1e1f20] p-5 flex flex-col gap-2 shadow-2xl overflow-y-auto border-r border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 mb-2">
              <div
                className="flex items-center gap-2.5 cursor-pointer"
                onClick={() => { navigate("/"); setMobileNavOpen(false); }}
              >
                <LogoMark size={24} />
                <span className="text-lg font-normal text-gray-800 dark:text-gray-100 font-sans tracking-tight">
                  Flash<span className="text-blue-600 dark:text-blue-400 font-medium">Crush</span>
                </span>
              </div>
              <button
                className="rounded-full p-2 text-gray-500 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors text-sm"
                onClick={() => setMobileNavOpen(false)}
              >
                ✕
              </button>
            </div>

            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-full px-4 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors ${
                  isActive
                    ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800"
                }`
              }
              onClick={() => setMobileNavOpen(false)}
            >
              <span>🏠</span> Home
            </NavLink>

            {/* Mobile Theme Segment */}
            <div className="my-2">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-3 mb-1.5">
                Theme
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-gray-200/70 dark:bg-[#28292a] rounded-full">
                <button
                  type="button"
                  className={`rounded-full py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                    theme === "light"
                      ? "bg-white dark:bg-[#1e1f20] text-gray-800 dark:text-gray-100 shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                  }`}
                  onClick={() => setTheme("light")}
                >
                  <span>☀️</span> Light
                </button>
                <button
                  type="button"
                  className={`rounded-full py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                    theme === "dark"
                      ? "bg-white dark:bg-[#1e1f20] text-gray-800 dark:text-gray-100 shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                  }`}
                  onClick={() => setTheme("dark")}
                >
                  <span>🌙</span> Dark
                </button>
                <button
                  type="button"
                  className={`rounded-full py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                    theme === "system"
                      ? "bg-white dark:bg-[#1e1f20] text-gray-800 dark:text-gray-100 shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                  }`}
                  onClick={() => setTheme("system")}
                >
                  <span>💻</span> Auto
                </button>
              </div>
            </div>

            {/* Mobile History Link */}
            <div
              className="rounded-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800 flex items-center justify-between cursor-pointer transition-colors"
              onClick={() => { setShowHistoryDrawer(true); setMobileNavOpen(false); }}
            >
              <span className="flex items-center gap-3"><span>🕒</span> Local History</span>
              {historyCount > 0 && (
                <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 leading-none">
                  {historyCount}
                </span>
              )}
            </div>

            {/* Mobile Install App Button */}
            {pwa.canInstall && (
              <div
                className="rounded-full px-4 py-2.5 text-sm font-medium bg-[#f0f4f9] dark:bg-[#28292a] text-blue-600 dark:text-blue-400 hover:bg-[#e9eef6] dark:hover:bg-[#333537] flex items-center gap-3 cursor-pointer shadow-xs transition-colors"
                onClick={() => { pwa.installApp(); setMobileNavOpen(false); }}
              >
                <span>📲</span> Install App
              </div>
            )}

            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-3 mt-3">
              📄 PDF Tools
            </div>
            <div className="flex flex-col gap-0.5">
              {PDF_TOOLS.map(t => (
                <NavLink
                  key={t.path}
                  to={t.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium flex items-center gap-3 transition-colors ${
                      isActive
                        ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800"
                    }`
                  }
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span>{t.icon}</span> {t.label}
                </NavLink>
              ))}
            </div>

            <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-3 mt-4">
              🖼️ Image Tools
            </div>
            <div className="flex flex-col gap-0.5 pb-6">
              {IMAGE_TOOLS.map(t => (
                <NavLink
                  key={t.path}
                  to={t.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium flex items-center gap-3 transition-colors ${
                      isActive
                        ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800"
                    }`
                  }
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span>{t.icon}</span> {t.label}
                </NavLink>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── Routes ── */}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/"              element={<HomePage auth={auth} />} />
          <Route path="/pdf"           element={<PDFCompressor auth={auth} />} />
          <Route path="/merge-pdf"     element={<PDFMerger auth={auth} />} />
          <Route path="/image"         element={<ImageCompressor auth={auth} />} />
          <Route path="/convert"       element={<ImageConverter auth={auth} />} />
          <Route path="/img2pdf"       element={<ImageToPDF auth={auth} />} />
          <Route path="/pdf-to-img"    element={<PDFToImage auth={auth} />} />
          <Route path="/split-pdf"     element={<SplitPDF auth={auth} />} />
          <Route path="/organize-pdf"  element={<PDFOrganizer auth={auth} />} />
          <Route path="/pdf-security"  element={<PDFSecurity auth={auth} />} />
          <Route path="/pdf-watermark" element={<PDFWatermark auth={auth} />} />
          <Route path="/bulk-compress"     element={<BulkImageCompressor auth={auth} />} />
          <Route path="/passport-resizer"  element={<PassportResizer auth={auth} />} />
          <Route path="/image-crop"        element={<ImageCropResize auth={auth} />} />
          <Route path="/bg-remover"        element={<BackgroundRemover auth={auth} />} />
          <Route path="/qr-studio"         element={<QRCodeStudio auth={auth} />} />
          <Route path="/ocr"               element={<PDFImageOCR auth={auth} />} />
          <Route path="/sign-pdf"          element={<PDFSignStudio auth={auth} />} />
          <Route path="/upscaler"          element={<ImageUpscaler auth={auth} />} />
          <Route path="/vectorize"         element={<SVGVectorizer auth={auth} />} />
          <Route path="/exif-cleaner"      element={<EXIFCleaner auth={auth} />} />
          <Route path="/drop"              element={<CrushDrop auth={auth} />} />
          <Route path="/video-compress"    element={<VideoCompressor auth={auth} />} />
          <Route path="/scan-pdf"          element={<DocumentScanner auth={auth} />} />
          <Route path="/history"           element={<LocalHistory auth={auth} isPage={true} />} />
          <Route path="*"                  element={<HomePage auth={auth} />} />
        </Routes>
      </main>

      {/* ── Offline Local History Drawer ── */}
      <LocalHistory auth={auth} isOpen={showHistoryDrawer} onClose={() => setShowHistoryDrawer(false)} />

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette
        isOpen={showCmdPalette}
        onClose={() => setShowCmdPalette(false)}
        onOpenHistory={() => setShowHistoryDrawer(true)}
        theme={theme}
        setTheme={setTheme}
        canInstall={pwa.canInstall}
        installApp={pwa.installApp}
      />

      {/* ── Clipboard Paste Modal & Toast ── */}
      <ClipboardPasteModal
        file={clipboardFile}
        onClose={() => setClipboardFile(null)}
        onSelectTool={(targetPath) => {
          setPendingFile(clipboardFile);
          setClipboardFile(null);
          navigate(targetPath);
        }}
      />

      {pasteToast && (
        <div className="clipboard-toast">
          <span>{pasteToast}</span>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="site-footer">
        <span><strong>FlashCrush</strong> — 100% free, no account required</span>
        <span>All files processed locally · Never uploaded without your permission · <a href="#privacy" style={{ color: "inherit" }}>Privacy Policy</a></span>
      </footer>
    </div>
  );
}
