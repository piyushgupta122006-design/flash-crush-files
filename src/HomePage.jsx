// HomePage.jsx — Every element fades in on scroll
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
        { threshold: 0, rootMargin: "0px 0px -40px 0px" }
      );

      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 40) {
          el.classList.add("visible");
        } else {
          io.observe(el);
        }
      });
      return () => io.disconnect();
    };

    const c1 = activate();
    const t  = setTimeout(activate, 80);
    return () => { c1?.(); clearTimeout(t); };
  }, []);
}

/* ── Magnetic button ── */
function MagneticBtn({ children, className, onClick }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width  / 2) * 0.20;
    const y = (e.clientY - r.top  - r.height / 2) * 0.20;
    ref.current.style.transform = `translate(${x}px,${y}px)`;
  };
  const onLeave = () => { ref.current.style.transform = "translate(0,0)"; };
  return (
    <button ref={ref} className={className} onClick={onClick}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </button>
  );
}

/* ── Tilt card ── */
function TiltCard({ children, className, onClick }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * 10;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * -10;
    ref.current.style.transform =
      `perspective(800px) rotateX(${y}deg) rotateY(${x}deg) translateY(-6px)`;
    ref.current.style.boxShadow =
      `${-x*1.5}px ${y*1.5}px 40px rgba(124,58,237,0.18)`;
  };
  const onLeave = () => {
    ref.current.style.transform = "";
    ref.current.style.boxShadow = "";
  };
  return (
    <div ref={ref} className={className} onClick={onClick}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}

/* ── Counter ── */
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
      const step = num / 40;
      const t = setInterval(() => {
        cur += step;
        if (cur >= num) { setVal(num); clearInterval(t); }
        else setVal(parseFloat(cur.toFixed(1)));
      }, 28);
    }, { threshold: 0.5 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── SVG Icons ── */
function IconPDF() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="12" y2="17"/>
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
function IconConvert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}
function IconMerge() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>
      <path d="M18 9l4-4-4-4"/>
      <path d="M14 5h8v8"/>
      <line x1="14" y1="10" x2="21" y2="3"/>
    </svg>
  );
}
function IconImg2Pdf() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="13" rx="2"/>
      <path d="M14 8h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3"/>
      <circle cx="8" cy="8" r="1"/>
      <polyline points="13 13 10 10 5 15"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function IconCloud() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

/* ── Logo Mark ── */
export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="9" fill="url(#lg1)"/>
      <path d="M10 8h8l4 4v12a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        fill="white" fillOpacity="0.25"/>
      <path d="M18 8l4 4h-3a1 1 0 0 1-1-1V8z" fill="white" fillOpacity="0.5"/>
      <path d="M13 17.5l-2 2m0 0h2m-2 0v-2" stroke="white" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 14.5l2-2m0 0h-2m2 0v2" stroke="white" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="14" y1="18" x2="18" y2="14" stroke="white" strokeWidth="1.5"
        strokeLinecap="round" strokeOpacity="0.7"/>
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="32" y2="32"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7"/>
          <stop offset="1" stopColor="#6d28d9"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Floating Orbs ── */
function FloatingOrbs() {
  return (
    <div className="floating-orbs" aria-hidden="true">
      <div className="orb orb-1"/><div className="orb orb-2"/>
      <div className="orb orb-3"/><div className="orb orb-4"/>
    </div>
  );
}

/* ══════════════════════════════════════════
   PAGE
══════════════════════════════════════════ */
export default function HomePage() {
  const pageRef = useRef(null);
  const navigate = useNavigate();
  useScrollReveal(pageRef);

  return (
    <div className="home-wrap" ref={pageRef}>
      <FloatingOrbs />

      {/* ══ HERO ══ */}
      <section className="hero-section">
        <div className="hero-inner">

          <div className="hero-pill anim d0">
            <span className="hero-pill-dot" />
            100% Free · No sign-up · No file limits
          </div>

          <h1 className="hero-title anim d1">
            Flash Crush-Files Compress &amp; Convert.<br /><span className="grad">Instantly.</span>
          </h1>

          <p className="hero-sub anim d2">
            Powerful client-side tools to compress, merge, convert, and generate PDFs &amp; images in seconds.
          </p>

          <div className="hero-ctas anim d3">
            <MagneticBtn className="btn-hero-pdf" onClick={() => navigate("/pdf")}>
              <span className="btn-icon-wrap btn-icon-wrap--pdf"><IconPDF /></span>
              <span>Compress PDF</span>
              <span className="btn-arrow"><IconArrow /></span>
            </MagneticBtn>
            <MagneticBtn className="btn-hero-merge" onClick={() => navigate("/merge-pdf")}>
              <span className="btn-icon-wrap btn-icon-wrap--merge"><IconMerge /></span>
              <span>Merge PDF</span>
              <span className="btn-arrow"><IconArrow /></span>
            </MagneticBtn>
            <MagneticBtn className="btn-hero-img" onClick={() => navigate("/image")}>
              <span className="btn-icon-wrap btn-icon-wrap--img"><IconImage /></span>
              <span>Compress Image</span>
              <span className="btn-arrow"><IconArrow /></span>
            </MagneticBtn>
            <MagneticBtn className="btn-hero-img2pdf" onClick={() => navigate("/img2pdf")}>
              <span className="btn-icon-wrap btn-icon-wrap--img2pdf"><IconImg2Pdf /></span>
              <span>Image to PDF</span>
              <span className="btn-arrow"><IconArrow /></span>
            </MagneticBtn>
            <MagneticBtn className="btn-hero-convert" onClick={() => navigate("/convert")}>
              <span className="btn-icon-wrap btn-icon-wrap--convert"><IconConvert /></span>
              <span>Convert Format</span>
              <span className="btn-arrow"><IconArrow /></span>
            </MagneticBtn>
          </div>

          <div className="hero-stats anim d4">
            <div className="hero-stat">
              <div className="hero-stat-num"><Counter target={5} /></div>
              <div className="hero-stat-label">Power Tools</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num"><Counter target={100} suffix=" MB" /></div>
              <div className="hero-stat-label">Max File Size</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num"><Counter target={0} /></div>
              <div className="hero-stat-label">Files Stored (100% Private)</div>
            </div>
          </div>

        </div>
      </section>

      {/* ══ TOOLS ══ */}
      <section className="tools-section">
        <div className="section-inner" style={{ maxWidth: "1000px" }}>

          <span className="section-eyebrow scroll-anim sd1">Suite</span>
          <h2 className="section-title scroll-anim sd2">Pick your tool</h2>
          <p className="section-sub scroll-anim sd3">
            All 5 tools work offline in your browser — zero server uploads, total privacy.
          </p>

          <div className="tool-grid-5">

            {/* 1. PDF Compressor */}
            <TiltCard className="tool-card scroll-anim sd1" onClick={() => navigate("/pdf")}>
              <div className="tool-card-glow tool-card-glow--pdf" />
              <div className="tool-card-header">
                <div className="tool-icon-box pdf"><IconPDF /></div>
                <span className="tool-chip pdf">PDF</span>
              </div>
              <div className="tool-name">PDF Compressor</div>
              <p className="tool-desc">
                Shrink your PDF while keeping it crystal clear. Choose from 3 compression levels and download in seconds.
              </p>
              <div className="tool-tags">
                <span className="tag">.pdf</span>
                <span className="tag">Up to 30 MB</span>
                <span className="tag">Smart Fallback</span>
              </div>
              <div className="tool-footer">
                <span className="tool-cta-text">Compress PDF</span>
                <div className="tool-arrow-box">
                  <span className="arrow-inner"><IconArrow /></span>
                </div>
              </div>
            </TiltCard>

            {/* 2. PDF Merge */}
            <TiltCard className="tool-card scroll-anim sd2" onClick={() => navigate("/merge-pdf")}>
              <div className="tool-card-glow tool-card-glow--merge" />
              <div className="tool-card-header">
                <div className="tool-icon-box merge"><IconMerge /></div>
                <span className="tool-chip merge">New</span>
              </div>
              <div className="tool-name">PDF Merger</div>
              <p className="tool-desc">
                Combine multiple PDF documents into a single organized file. Reorder pages and files before merging.
              </p>
              <div className="tool-tags">
                <span className="tag">.pdf</span>
                <span className="tag">Multi-file</span>
                <span className="tag">Reorder</span>
              </div>
              <div className="tool-footer">
                <span className="tool-cta-text">Merge PDFs</span>
                <div className="tool-arrow-box">
                  <span className="arrow-inner"><IconArrow /></span>
                </div>
              </div>
            </TiltCard>

            {/* 3. Image Compressor */}
            <TiltCard className="tool-card scroll-anim sd3" onClick={() => navigate("/image")}>
              <div className="tool-card-glow tool-card-glow--img" />
              <div className="tool-card-header">
                <div className="tool-icon-box img"><IconImage /></div>
                <span className="tool-chip img">Image</span>
              </div>
              <div className="tool-name">Image Compressor</div>
              <p className="tool-desc">
                Compress JPG, PNG, and WebP images. Supports presets plus custom exact target size (e.g. 50 KB).
              </p>
              <div className="tool-tags">
                <span className="tag">.jpg .png .webp</span>
                <span className="tag">Exact KB Target</span>
              </div>
              <div className="tool-footer">
                <span className="tool-cta-text">Compress Image</span>
                <div className="tool-arrow-box">
                  <span className="arrow-inner"><IconArrow /></span>
                </div>
              </div>
            </TiltCard>

            {/* 4. Image to PDF */}
            <TiltCard className="tool-card scroll-anim sd4" onClick={() => navigate("/img2pdf")}>
              <div className="tool-card-glow tool-card-glow--img2pdf" />
              <div className="tool-card-header">
                <div className="tool-icon-box img2pdf"><IconImg2Pdf /></div>
                <span className="tool-chip img2pdf">New</span>
              </div>
              <div className="tool-name">Image to PDF</div>
              <p className="tool-desc">
                Convert one or multiple images into a clean PDF document with custom margins, orientation, and A4 fit.
              </p>
              <div className="tool-tags">
                <span className="tag">Multi-image</span>
                <span className="tag">A4 &amp; Letter</span>
                <span className="tag">Instant</span>
              </div>
              <div className="tool-footer">
                <span className="tool-cta-text">Image to PDF</span>
                <div className="tool-arrow-box">
                  <span className="arrow-inner"><IconArrow /></span>
                </div>
              </div>
            </TiltCard>

            {/* 5. Image Converter */}
            <TiltCard className="tool-card scroll-anim sd5" onClick={() => navigate("/convert")}>
              <div className="tool-card-glow tool-card-glow--convert" />
              <div className="tool-card-header">
                <div className="tool-icon-box convert"><IconConvert /></div>
                <span className="tool-chip convert">Converter</span>
              </div>
              <div className="tool-name">Image Converter</div>
              <p className="tool-desc">
                Convert between PNG, JPG, WebP, BMP, and GIF. Choose output quality and download with zero quality loss.
              </p>
              <div className="tool-tags">
                <span className="tag">.png .jpg .webp</span>
                <span className="tag">.bmp .gif</span>
              </div>
              <div className="tool-footer">
                <span className="tool-cta-text">Convert Image</span>
                <div className="tool-arrow-box">
                  <span className="arrow-inner"><IconArrow /></span>
                </div>
              </div>
            </TiltCard>

          </div>

        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section className="features-section">
        <div className="section-inner" style={{ maxWidth: "1000px" }}>

          <span className="section-eyebrow scroll-anim sd1">Why FlashCrush</span>
          <h2 className="section-title scroll-anim sd2">Built differently</h2>
          <p className="section-sub scroll-anim sd3">No ads, no tracking, no server uploads.</p>

          <div className="features-grid">
            {[
              { Icon: IconLock,  name: "100% Private",  desc: "All compression, merging, and conversion happens locally in your browser using JavaScript.", delay: "sd1" },
              { Icon: IconBolt,  name: "Instant Speed",  desc: "Zero waiting, no queue delays. Process large files instantaneously directly on your device.",   delay: "sd2" },
              { Icon: IconCloud, name: "Google Drive",   desc: "Sign in with Google to import from Drive and save your output files to any custom folder.",  delay: "sd3" },
            ].map(({ Icon, name, desc, delay }) => (
              <div key={name} className={`feature-card scroll-anim ${delay}`}>
                <div className="feature-icon-wrap"><Icon /></div>
                <div className="feature-name">{name}</div>
                <p className="feature-desc">{desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>
    </div>
  );
}

