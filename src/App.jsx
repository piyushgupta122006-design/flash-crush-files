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
    <div className="site-layout">
      {/* ── Offline Status Banner ── */}
      {!pwa.isOnline && (
        <div style={{
          background: "var(--brutal-yellow)", color: "var(--text-main)",
          fontSize: "12px", fontWeight: 700, padding: "6px 16px", textAlign: "center",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", zIndex: 100,
          borderBottom: "3px solid #1a1a1a"
        }}>
          <span>⚡ Offline Mode Active</span>
          <span style={{ opacity: 0.8 }}>— 100% of tools work locally in your browser without internet.</span>
        </div>
      )}

      {/* ── Floating glass navbar ── */}
      <nav className="navbar anim-fade d0">
        <div className="navbar-left">
          {/* Logo */}
          <div className="navbar-logo" onClick={() => navigate("/")}>
            <LogoMark size={28} />
            <span>Flash<span style={{ color: "var(--brutal-pink)" }}>Crush</span></span>
          </div>

          {/* Desktop Categorized Navigation Links */}
          <div className="navbar-links desktop-nav">
            {/* Home */}
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Home
            </NavLink>

            {/* PDF Tools Dropdown */}
            <div className="nav-dropdown-trigger-wrap" ref={pdfMenuRef}>
              <button
                type="button"
                className={`nav-dropdown-trigger${isPdfActive ? " active" : ""}`}
                onClick={() => {
                  setShowPdfMenu(p => !p);
                  setShowImgMenu(false);
                }}
                onMouseEnter={() => setShowPdfMenu(true)}
              >
                <span>📄 PDF Tools</span>
                <span className="nav-chevron">{showPdfMenu ? "▲" : "▼"}</span>
              </button>

              {showPdfMenu && (
                <div
                  className="nav-category-menu"
                  onMouseLeave={() => setShowPdfMenu(false)}
                >
                  <div className="nav-category-header">PDF Power Tools</div>
                  <div className="nav-category-grid">
                    {PDF_TOOLS.map(t => (
                      <NavLink
                        key={t.path}
                        to={t.path}
                        className={({ isActive }) => `nav-category-item${isActive ? " active-item" : ""}`}
                        onClick={() => setShowPdfMenu(false)}
                      >
                        <span className="nav-cat-icon">{t.icon}</span>
                        <div>
                          <div className="nav-cat-label">{t.label}</div>
                          <div className="nav-cat-desc">{t.desc}</div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Image Tools Dropdown */}
            <div className="nav-dropdown-trigger-wrap" ref={imgMenuRef}>
              <button
                type="button"
                className={`nav-dropdown-trigger${isImgActive ? " active" : ""}`}
                onClick={() => {
                  setShowImgMenu(p => !p);
                  setShowPdfMenu(false);
                }}
                onMouseEnter={() => setShowImgMenu(true)}
              >
                <span>🖼️ Image Tools</span>
                <span className="nav-chevron">{showImgMenu ? "▲" : "▼"}</span>
              </button>

              {showImgMenu && (
                <div
                  className="nav-category-menu"
                  onMouseLeave={() => setShowImgMenu(false)}
                >
                  <div className="nav-category-header">Image Super-Tools</div>
                  <div className="nav-category-grid">
                    {IMAGE_TOOLS.map(t => (
                      <NavLink
                        key={t.path}
                        to={t.path}
                        className={({ isActive }) => `nav-category-item${isActive ? " active-item" : ""}`}
                        onClick={() => setShowImgMenu(false)}
                      >
                        <span className="nav-cat-icon">{t.icon}</span>
                        <div>
                          <div className="nav-cat-label">{t.label}</div>
                          <div className="nav-cat-desc">{t.desc}</div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Auth + Mobile Hamburger */}
        <div className="navbar-right">
          {/* User Auth */}
          {isSignedIn ? (
            <div className="nav-user-wrap" ref={menuRef}>
              <div className="nav-user" onClick={() => setShowMenu(m => !m)}>
                {auth.user?.picture
                  ? <img src={auth.user.picture} alt="" className="nav-avatar" />
                  : <div className="nav-avatar">{auth.user?.name?.[0] || "G"}</div>
                }
                <span className="nav-chevron">{showMenu ? "▲" : "▼"}</span>
              </div>
              {showMenu && (
                <div className="nav-dropdown">
                  <div className="nav-dropdown-user">
                    <div className="nav-dropdown-name">{auth.user?.name}</div>
                    <div className="nav-dropdown-email">{auth.user?.email}</div>
                  </div>
                  <button className="nav-dropdown-logout" onClick={() => { auth.signOut(); setShowMenu(false); }}>
                    <span>⏻</span> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="nav-signin-wrap">
              <button
                className="btn-nav-signin"
                onClick={auth.signIn}
                disabled={auth.authStatus === "loading"}
              >
                <GoogleIcon />
                <span className="signin-text-full">
                  {auth.authStatus === "loading" ? "Signing in…" : "Sign in with Google"}
                </span>
                <span className="signin-text-short">
                  {auth.authStatus === "loading" ? "Signing in…" : "Sign in"}
                </span>
              </button>
              {signInError && <div className="nav-signin-error">{signInError}</div>}
            </div>
          )}

          {/* Install PWA App Button */}
          {pwa.canInstall && (
            <button
              type="button"
              className="nav-install-btn"
              onClick={pwa.installApp}
              title="Install FlashCrush as Native App"
            >
              <span>📲</span>
              <span className="install-text-full">Install App</span>
            </button>
          )}

          {/* Quick Command Palette (Ctrl+K) */}
          <button
            type="button"
            className="nav-cmd-btn"
            onClick={() => setShowCmdPalette(true)}
            title="Quick Search & Tools (Ctrl + K)"
          >
            <span>🔍</span>
            <span className="cmd-text-full">Search</span>
            <kbd className="cmd-kbd-badge">Ctrl K</kbd>
          </button>

          {/* Local Offline History Drawer Button */}
          <button
            type="button"
            className="nav-history-btn"
            onClick={() => setShowHistoryDrawer(true)}
            title="Local Offline History (IndexedDB)"
          >
            <span>🕒</span>
            <span className="history-text-full">History</span>
            {historyCount > 0 && (
              <span style={{
                background: "var(--text-main)", color: "#fff", fontSize: "10px", fontWeight: 800,
                padding: "1px 6px", borderRadius: "6px"
              }}>
                {historyCount}
              </span>
            )}
          </button>

          {/* Theme Toggle Dropdown */}
          <div className="nav-theme-wrap" ref={themeMenuRef}>
            <button
              type="button"
              className="nav-theme-btn"
              onClick={() => setShowThemeMenu(m => !m)}
              title={`Theme: ${theme === "system" ? "System Default" : theme === "dark" ? "Dark Mode" : "Light Mode"}`}
            >
              <span>{theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "💻"}</span>
              <span className="theme-text-full">
                {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "Auto"}
              </span>
              <span className="nav-chevron">{showThemeMenu ? "▲" : "▼"}</span>
            </button>

            {showThemeMenu && (
              <div className="nav-theme-dropdown">
                <button
                  type="button"
                  className={`nav-theme-option${theme === "light" ? " active" : ""}`}
                  onClick={() => { setTheme("light"); setShowThemeMenu(false); }}
                >
                  <span>☀️</span>
                  <span>Light Mode</span>
                </button>
                <button
                  type="button"
                  className={`nav-theme-option${theme === "dark" ? " active" : ""}`}
                  onClick={() => { setTheme("dark"); setShowThemeMenu(false); }}
                >
                  <span>🌙</span>
                  <span>Dark Mode</span>
                </button>
                <button
                  type="button"
                  className={`nav-theme-option${theme === "system" ? " active" : ""}`}
                  onClick={() => { setTheme("system"); setShowThemeMenu(false); }}
                >
                  <span>💻</span>
                  <span>System (Auto)</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-hamburger-btn"
            onClick={() => setMobileNavOpen(o => !o)}
            title="Toggle Menu"
          >
            {mobileNavOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* ── Mobile Drawer Menu ── */}
      {mobileNavOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
          <div className="mobile-nav-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div className="navbar-logo" onClick={() => { navigate("/"); setMobileNavOpen(false); }}>
                <LogoMark size={24} />
                <span>Flash<span style={{ color: "var(--brutal-pink)" }}>Crush</span></span>
              </div>
              <button className="close-btn" onClick={() => setMobileNavOpen(false)}>✕</button>
            </div>

            <NavLink
              to="/"
              end
              className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <span>🏠</span> Home
            </NavLink>

            {/* Mobile Theme Selector */}
            <div style={{ marginTop: "4px", marginBottom: "4px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-sub)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px", paddingLeft: "4px" }}>
                Theme Mode
              </div>
              <div className="mobile-theme-segment">
                <button
                  type="button"
                  className={`mobile-theme-btn${theme === "light" ? " active" : ""}`}
                  onClick={() => setTheme("light")}
                >
                  <span style={{ fontSize: "16px" }}>☀️</span>
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={`mobile-theme-btn${theme === "dark" ? " active" : ""}`}
                  onClick={() => setTheme("dark")}
                >
                  <span style={{ fontSize: "16px" }}>🌙</span>
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  className={`mobile-theme-btn${theme === "system" ? " active" : ""}`}
                  onClick={() => setTheme("system")}
                >
                  <span style={{ fontSize: "16px" }}>💻</span>
                  <span>Auto</span>
                </button>
              </div>
            </div>

            {/* Mobile History Link */}
            <div
              className="mobile-nav-item"
              onClick={() => { setShowHistoryDrawer(true); setMobileNavOpen(false); }}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}
            >
              <span><span>🕒</span> Local History</span>
              {historyCount > 0 && (
                <span style={{ background: "var(--text-main)", color: "#fff", fontSize: "10px", fontWeight: 800, padding: "1px 6px", borderRadius: "6px" }}>
                  {historyCount}
                </span>
              )}
            </div>

            {/* Mobile Install App Button */}
            {pwa.canInstall && (
              <div
                className="mobile-nav-item"
                onClick={() => { pwa.installApp(); setMobileNavOpen(false); }}
                style={{ cursor: "pointer", color: "var(--text-main)", fontWeight: 800 }}
              >
                <span>📲</span> Install FlashCrush App
              </div>
            )}

            <div className="mobile-nav-section-title">📄 PDF Tools</div>
            <div className="mobile-nav-grid">
              {PDF_TOOLS.map(t => (
                <NavLink
                  key={t.path}
                  to={t.path}
                  className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span>{t.icon}</span> {t.label}
                </NavLink>
              ))}
            </div>

            <div className="mobile-nav-section-title" style={{ marginTop: "14px" }}>🖼️ Image Tools</div>
            <div className="mobile-nav-grid">
              {IMAGE_TOOLS.map(t => (
                <NavLink
                  key={t.path}
                  to={t.path}
                  className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`}
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
