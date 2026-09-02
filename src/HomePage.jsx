// HomePage.jsx — Neo-Brutalism UI
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ── Scroll reveal — fires for every .scroll-anim ── */
function useScrollReveal(ref) {
  useEffect(() => {
    const activate = () => {
      const els = ref.current?.querySelectorAll(".scroll-anim:not(.visible)");
      if (!els?.length) return;

      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        }),
        { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
      );

      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 30) {
          el.classList.add("visible");
        } else {
          io.observe(el);
        }
      });
      return () => io.disconnect();
    };

    activate();
    const t = setTimeout(activate, 100);
    return () => clearTimeout(t);
  }, []);
}

/* ── Simple Brutal Card wrapper (no 3D tilt) ── */
function TiltCard({ children, className, onClick }) {
  return (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  );
}

/* ── Animated Counter ── */
function Counter({ target, suffix = "" }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (target === 0) return;
      const num = parseFloat(target);
      let cur = 0;
      const step = num / 30;
      const t = setInterval(() => {
        cur += step;
        if (cur >= num) {
          setVal(num);
          clearInterval(t);
        } else {
          setVal(parseFloat(cur.toFixed(1)));
        }
      }, 30);
    }, { threshold: 0.5 });

    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [target]);

  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Futuristic SVG Icons ── */
function IconPDF() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="12" y2="17"/>
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function IconConvert() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

function IconMerge() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>
      <path d="M18 9l4-4-4-4"/>
      <path d="M14 5h8v8"/>
      <line x1="14" y1="10" x2="21" y2="3"/>
    </svg>
  );
}

function IconImg2Pdf() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="13" rx="2"/>
      <path d="M14 8h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3"/>
      <circle cx="8" cy="8" r="1"/>
      <polyline points="13 13 10 10 5 15"/>
    </svg>
  );
}

function IconPdf2Img() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <circle cx="10" cy="14" r="1.5"/>
      <polyline points="16 18 13 15 9 19"/>
    </svg>
  );
}

function IconSplit() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22"/>
      <path d="M17 8l4-4-4-4"/>
      <path d="M7 8L3 4l4-4"/>
      <path d="M12 12h8"/>
      <path d="M12 12H4"/>
    </svg>
  );
}

function IconOrganize() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 17h7"/>
      <path d="M17.5 14v7"/>
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconWatermark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}

function IconBulk() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function IconPassport() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <circle cx="9" cy="10" r="2"/>
      <path d="M15 8h2"/>
      <path d="M15 12h2"/>
      <path d="M7 16h10"/>
    </svg>
  );
}

function IconCrop() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
      <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function IconQR() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
      <rect x="14" y="14" width="3" height="3"/>
      <rect x="18" y="14" width="3" height="3"/>
      <rect x="14" y="18" width="3" height="3"/>
      <rect x="18" y="18" width="3" height="3"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
    </svg>
  );
}

function IconPen() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="M2 2l7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
  );
}

function IconVector() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1"/>
      <rect x="15" y="3" width="6" height="6" rx="1"/>
      <rect x="15" y="15" width="6" height="6" rx="1"/>
      <rect x="3" y="15" width="6" height="6" rx="1"/>
      <path d="M6 9v6"/>
      <path d="M9 6h6"/>
      <path d="M15 9l-6 6"/>
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IconCloud() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="logo-glow-mark">
      <rect width="32" height="32" rx="6" fill="#FF6B9D" stroke="#1a1a1a" strokeWidth="2.5"/>
      <path d="M10 8h8l4 4v12a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="white" fillOpacity="0.5"/>
      <path d="M18 8l4 4h-3a1 1 0 0 1-1-1V8z" fill="white" fillOpacity="0.8"/>
      <path d="M13 17.5l-2 2m0 0h2m-2 0v-2" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 14.5l2-2m0 0h-2m2 0v2" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="14" y1="18" x2="18" y2="14" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

export default function HomePage() {
  const pageRef = useRef(null);
  const navigate = useNavigate();
  useScrollReveal(pageRef);

  return (
    <div ref={pageRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ══ HERO SECTION ══ */}
      <section className="hero anim d0">
        <div className="hero-badge anim d1">
          <span className="hero-badge-pulse" />
          ⚡ Zero-Upload In-Browser Engine · Quantum Speed
        </div>

        <h1 className="hero-title anim d2">
          High-Performance File Suite.<br />
          <span className="hero-title-gradient">Zero Compromise.</span>
        </h1>

        <p className="hero-sub anim d3">
          Compress, merge, convert, and generate PDFs &amp; images in seconds directly on your device. 
          100% free, private, and synced with your Google Drive.
        </p>

        <div className="hero-cta-group anim d4">
          <button className="hero-btn-image" onClick={() => navigate("/image")}>
            <span className="hero-btn-icon-wrap"><IconImage /></span>
            <span>Launch Image Compressor</span>
            <span className="hero-btn-arrow">→</span>
          </button>
          <button className="hero-btn-pdf" onClick={() => navigate("/pdf")}>
            <span className="hero-btn-icon-wrap"><IconPDF /></span>
            <span>Launch PDF Compressor</span>
            <span className="hero-btn-arrow">→</span>
          </button>
        </div>

        {/* ══ LIVE METRICS BAR ══ */}
        <div className="hero-stats-bar anim d5">
          <div className="stat-item">
            <div className="stat-num"><Counter target={5} /></div>
            <div className="stat-label">Power Tools</div>
          </div>
          <div className="stat-item">
            <div className="stat-num"><Counter target={100} suffix=" MB" /></div>
            <div className="stat-label">Max File Size</div>
          </div>
          <div className="stat-item">
            <div className="stat-num"><Counter target={0} /></div>
            <div className="stat-label">Server Storage (100% Private)</div>
          </div>
          <div className="stat-item">
            <div className="stat-num" style={{ color: "var(--cyan-neon)" }}>☁️ Sync</div>
            <div className="stat-label">Google Drive Ready</div>
          </div>
        </div>
      </section>

      {/* ══ 5 TOOLS DECK ══ */}
      <section style={{ maxWidth: "1180px", margin: "0 auto", padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
            The Complete Toolkit
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2.2rem", fontWeight: 700, color: "var(--text-main)" }}>
            Select Your Tool
          </h2>
        </div>

        <div className="tools-grid">

          {/* 1. PDF Compressor */}
          <TiltCard className="tool-card" onClick={() => navigate("/pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconPDF />
              </div>
              <div className="tool-card-title">PDF Compressor</div>
              <p className="tool-card-desc">
                Shrink bulky PDF files by up to 80% with lossless clarity. Supports Low, Medium, High &amp; Custom DPI compression.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">.PDF</span>
                <span className="tool-tag">Up to 30 MB</span>
                <span className="tool-tag">Smart Fallback</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Compress PDF</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 2. PDF Merger */}
          <TiltCard className="tool-card" onClick={() => navigate("/merge-pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconMerge />
              </div>
              <div className="tool-card-title">PDF Merger</div>
              <p className="tool-card-desc">
                Combine multiple PDF files into one clean document. Drag and reorder pages effortlessly before merging.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">Multi-PDF</span>
                <span className="tool-tag">Drag &amp; Drop</span>
                <span className="tool-tag">Fast Merge</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Merge PDFs</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 3. Image Compressor */}
          <TiltCard className="tool-card" onClick={() => navigate("/image")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconImage />
              </div>
              <div className="tool-card-title">Image Compressor</div>
              <p className="tool-card-desc">
                Compress JPG, PNG, and WebP images. Set custom target file sizes (e.g. exactly 50 KB) with live comparison.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">JPG / PNG / WebP</span>
                <span className="tool-tag">Exact KB Target</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Compress Image</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 4. Image to PDF */}
          <TiltCard className="tool-card" onClick={() => navigate("/img2pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconImg2Pdf />
              </div>
              <div className="tool-card-title">Image to PDF</div>
              <p className="tool-card-desc">
                Convert one or multiple images into a professional PDF document. Custom margins, page orientation, and A4 fit.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">Multi-Image</span>
                <span className="tool-tag">A4 &amp; Letter</span>
                <span className="tool-tag">Instant</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Convert to PDF</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 5. Image Converter */}
          <TiltCard className="tool-card" onClick={() => navigate("/convert")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconConvert />
              </div>
              <div className="tool-card-title">Image Converter</div>
              <p className="tool-card-desc">
                Convert between JPG, PNG, WebP, AVIF, SVG, BMP, and GIF with adjustable quality and instant download.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">All Formats</span>
                <span className="tool-tag">Lossless Mode</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Convert Format</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 6. PDF to Images */}
          <TiltCard className="tool-card" onClick={() => navigate("/pdf-to-img")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconPdf2Img />
              </div>
              <div className="tool-card-title">PDF to Images</div>
              <p className="tool-card-desc">
                Extract every page of your PDF into high-resolution JPG, PNG, or WebP images with 1-click ZIP download.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">PDF → JPG/PNG</span>
                <span className="tool-tag">1-Click ZIP</span>
                <span className="tool-tag">Up to 300 DPI</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Extract Images</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 7. Split & Extract PDF */}
          <TiltCard className="tool-card" onClick={() => navigate("/split-pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconSplit />
              </div>
              <div className="tool-card-title">Split & Extract PDF</div>
              <p className="tool-card-desc">
                Extract specific pages, split into individual PDFs, or chunk into groups. Visual page thumbnail selector.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">Extract Pages</span>
                <span className="tool-tag">Split All</span>
                <span className="tool-tag">ZIP Output</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Split PDF</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 8. PDF Page Organizer & Rotator */}
          <TiltCard className="tool-card" onClick={() => navigate("/organize-pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconOrganize />
              </div>
              <div className="tool-card-title">PDF Organizer & Rotator</div>
              <p className="tool-card-desc">
                Visually drag to reorder pages, rotate 90°/180°/270°, delete unwanted pages, and export a clean PDF.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">Drag & Drop</span>
                <span className="tool-tag">Rotate</span>
                <span className="tool-tag">Delete Pages</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Organize PDF</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 9. PDF Password Protect & Unlock */}
          <TiltCard className="tool-card" onClick={() => navigate("/pdf-security")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconLock />
              </div>
              <div className="tool-card-title">PDF Lock & Unlock</div>
              <p className="tool-card-desc">
                Remove passwords from locked PDFs or add password protection. Auto-detects locked files instantly.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🔓 Unlock</span>
                <span className="tool-tag">🔒 Protect</span>
                <span className="tool-tag">Auto-Detect</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Open Security Tool</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 10. PDF Watermark & Remover */}
          <TiltCard className="tool-card" onClick={() => navigate("/pdf-watermark")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconWatermark />
              </div>
              <div className="tool-card-title">Watermark & Remover</div>
              <p className="tool-card-desc">
                Stamp custom text watermarks & page numbers, or cleanly erase unwanted watermarks and stamps with live preview.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🏷️ Add</span>
                <span className="tool-tag">🧹 Remove</span>
                <span className="tool-tag">🔢 Numbers</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Open Watermark Studio</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 11. Bulk Image Compressor */}
          <TiltCard className="tool-card" onClick={() => navigate("/bulk-compress")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconBulk />
              </div>
              <div className="tool-card-title">Bulk Image Compressor</div>
              <p className="tool-card-desc">
                Compress 20–50+ images at once with target KB size mode, instant savings stats, and 1-click .ZIP archive download.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">📦 Bulk ZIP</span>
                <span className="tool-tag">🎯 Target KB</span>
                <span className="tool-tag">Multi-Upload</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Batch Compress</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 12. Passport & Govt Exam Photo Resizer */}
          <TiltCard className="tool-card" onClick={() => navigate("/passport-resizer")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconPassport />
              </div>
              <div className="tool-card-title">Passport & Exam Photo</div>
              <p className="tool-card-desc">
                Crop to official India, US Visa, SSC & Govt Exam specs, align with face oval guide, and generate 4×6 print sheets.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🛂 Passport & Visa</span>
                <span className="tool-tag">📝 Govt Exam</span>
                <span className="tool-tag">4×6 Print Sheet</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Resize Passport Photo</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 13. Image Crop & Resize Studio */}
          <TiltCard className="tool-card" onClick={() => navigate("/image-crop")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconCrop />
              </div>
              <div className="tool-card-title">Image Crop & Resize</div>
              <p className="tool-card-desc">
                Crop to 1:1, 9:16, 16:9, scale exact dimensions, rotate, flip mirror, and export in WebP, PNG or JPG.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">📐 Aspect Ratios</span>
                <span className="tool-tag">📏 Exact Pixels</span>
                <span className="tool-tag">Rotate & Flip</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Open Crop Studio</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 14. AI Background Remover */}
          <TiltCard className="tool-card" onClick={() => navigate("/bg-remover")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconSparkles />
              </div>
              <div className="tool-card-title">AI Background Remover</div>
              <p className="tool-card-desc">
                Erase photo backgrounds in 1-click using 100% on-device AI. Replace with studio backdrops, colors & soft shadow.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🤖 100% Local AI</span>
                <span className="tool-tag">🏁 Transparent PNG</span>
                <span className="tool-tag">Studio Shadow</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Remove Background</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 15. QR Code Studio */}
          <TiltCard className="tool-card" onClick={() => navigate("/qr-studio")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconQR />
              </div>
              <div className="tool-card-title">Custom QR Studio</div>
              <p className="tool-card-desc">
                Generate high-res QR codes with cyber gradients, custom dot shapes, center logos, Wi-Fi login, vCard & UPI.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">📱 Gradients & Logos</span>
                <span className="tool-tag">📶 Wi-Fi & vCard</span>
                <span className="tool-tag">SVG / PNG HD</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Open QR Studio</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 16. OCR Text Extractor */}
          <TiltCard className="tool-card" onClick={() => navigate("/ocr")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconSearch />
              </div>
              <div className="tool-card-title">OCR Text Extractor</div>
              <p className="tool-card-desc">
                Extract editable text from scanned PDFs, photos &amp; screenshots using 100% in-browser AI-powered OCR.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🔍 PDF &amp; Image</span>
                <span className="tool-tag">12+ Languages</span>
                <span className="tool-tag">.TXT / .DOC / .JSON</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Extract Text</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 17. PDF E-Sign Studio */}
          <TiltCard className="tool-card" onClick={() => navigate("/sign-pdf")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconPen />
              </div>
              <div className="tool-card-title">PDF E-Sign Studio</div>
              <p className="tool-card-desc">
                Sign PDFs privately. Draw, type, or upload signatures. Add date and status stamps anywhere on the page.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">✍️ Draw/Type</span>
                <span className="tool-tag">📅 Stamps</span>
                <span className="tool-tag">Drag & Drop</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Sign PDF</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 18. AI Image Upscaler */}
          <TiltCard className="tool-card" onClick={() => navigate("/upscaler")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconSparkles />
              </div>
              <div className="tool-card-title">AI Image Upscaler</div>
              <p className="tool-card-desc">
                Enhance low-resolution photos &amp; graphics with 2x &amp; 4x AI super-resolution and live before/after slider.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">✨ 2x / 4x HD</span>
                <span className="tool-tag">🤖 On-Device AI</span>
                <span className="tool-tag">Split Slider</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Upscale Image</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 19. SVG Vectorizer */}
          <TiltCard className="tool-card" onClick={() => navigate("/vectorize")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconVector />
              </div>
              <div className="tool-card-title">SVG Vectorizer</div>
              <p className="tool-card-desc">
                Convert raster PNG, JPG &amp; WebP into crisp, infinitely scalable vector SVG paths with live code export.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">📐 PNG → SVG</span>
                <span className="tool-tag">🎨 Presets</span>
                <span className="tool-tag">📋 Code Copy</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Vectorize Image</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 20. EXIF Privacy Cleaner */}
          <TiltCard className="tool-card" onClick={() => navigate("/exif-cleaner")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconShield />
              </div>
              <div className="tool-card-title">EXIF Privacy Cleaner</div>
              <p className="tool-card-desc">
                View &amp; strip hidden GPS locations, camera metadata, and date stamps from photos for 100% privacy.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🛡️ Strip GPS</span>
                <span className="tool-tag">📸 Camera Data</span>
                <span className="tool-tag">100% Private</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>Clean Image</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

          {/* 17. Offline Local History */}
          <TiltCard className="tool-card" onClick={() => navigate("/history")}>
            <div>
              <div className="tool-card-icon-wrap">
                <IconHistory />
              </div>
              <div className="tool-card-title">Offline Local History</div>
              <p className="tool-card-desc">
                View, re-download, or export past compressed PDFs, images, and QR codes stored 100% privately in IndexedDB.
              </p>
              <div className="tool-card-tags">
                <span className="tool-tag">🕒 IndexedDB</span>
                <span className="tool-tag">100% Private</span>
                <span className="tool-tag">Zero Server Logs</span>
              </div>
            </div>
            <div className="tool-card-cta">
              <span>View History</span>
              <div className="tool-card-cta-arrow"><IconArrowRight /></div>
            </div>
          </TiltCard>

        </div>
      </section>

      {/* ══ WHY FLASHCRUSH ══ */}
      <section style={{ maxWidth: "1000px", margin: "0 auto 80px", padding: "0 20px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "var(--text-main)" }}>
            Engineered for Pure Performance
          </h3>
          <p style={{ color: "var(--text-sub)", fontSize: "0.95rem", marginTop: "6px" }}>
            No ads, no watermarks, no server latency.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: "20px" }}>
          <div style={{ background: "#F0F9FF", border: "3px solid #1a1a1a", borderRadius: "16px", padding: "28px", boxShadow: "5px 5px 0px #1a1a1a" }}>
            <div style={{ marginBottom: "16px" }}><IconLock /></div>
            <h4 style={{ color: "var(--text-main)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>100% Client-Side Privacy</h4>
            <p style={{ color: "var(--text-sub)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              All processing executes locally in your browser sandbox. Your confidential files never touch any external server.
            </p>
          </div>

          <div style={{ background: "#FFFBEB", border: "3px solid #1a1a1a", borderRadius: "16px", padding: "28px", boxShadow: "5px 5px 0px #1a1a1a" }}>
            <div style={{ marginBottom: "16px" }}><IconBolt /></div>
            <h4 style={{ color: "var(--text-main)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>Blazing Fast Engine</h4>
            <p style={{ color: "var(--text-sub)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              Leverages high-speed WebAssembly and HTML5 Canvas pipelines to process large multi-megabyte files in milliseconds.
            </p>
          </div>

          <div style={{ background: "#FAF5FF", border: "3px solid #1a1a1a", borderRadius: "16px", padding: "28px", boxShadow: "5px 5px 0px #1a1a1a" }}>
            <div style={{ marginBottom: "16px" }}><IconCloud /></div>
            <h4 style={{ color: "var(--text-main)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>Google Drive Cloud Sync</h4>
            <p style={{ color: "var(--text-sub)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              Seamlessly import documents from your Google Drive and save your optimized files directly to any custom Drive folder.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
