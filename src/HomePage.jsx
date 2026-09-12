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

function IconNetwork() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/>
      <circle cx="5" cy="19" r="3"/>
      <circle cx="19" cy="19" r="3"/>
      <line x1="7.5" y1="17.5" x2="10.5" y2="7.5"/>
      <line x1="16.5" y1="17.5" x2="13.5" y2="7.5"/>
      <line x1="7" y1="19" x2="17" y2="19"/>
    </svg>
  );
}

function IconVideo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  );
}

function IconScanner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
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
  const [filter, setFilter] = useState("all");
  useScrollReveal(pageRef);

  const SUGGESTED_TOOLS = [
    { path: "/pdf", label: "PDF Compressor", desc: "Reduce PDF size up to 80%", icon: <IconPDF /> },
    { path: "/image", label: "Image Compressor", desc: "Target exact KB size", icon: <IconImage /> },
    { path: "/merge-pdf", label: "PDF Merger", desc: "Combine multiple documents", icon: <IconMerge /> },
    { path: "/bg-remover", label: "AI BG Remover", desc: "On-device instant cutout", icon: <IconSparkles /> },
  ];

  const ALL_TOOLS = [
    { path: "/pdf", category: "pdf", title: "PDF Compressor", desc: "Shrink bulky PDF files by up to 80% with lossless clarity. Supports Low, Medium & High presets.", icon: <IconPDF />, tags: [".PDF", "Up to 30 MB", "Smart Fallback"], cta: "Compress PDF" },
    { path: "/merge-pdf", category: "pdf", title: "PDF Merger", desc: "Combine multiple PDF files into one clean document. Drag and reorder pages effortlessly.", icon: <IconMerge />, tags: ["Multi-PDF", "Drag & Drop", "Fast Merge"], cta: "Merge PDFs" },
    { path: "/image", category: "image", title: "Image Compressor", desc: "Compress JPG, PNG, and WebP images. Set custom target file sizes (e.g. exactly 50 KB) with live comparison.", icon: <IconImage />, tags: ["JPG / PNG / WebP", "Exact KB Target"], cta: "Compress Image" },
    { path: "/img2pdf", category: "pdf", title: "Image to PDF", desc: "Convert one or multiple images into a professional PDF document. Custom margins and page fit.", icon: <IconImg2Pdf />, tags: ["Multi-Image", "A4 & Letter", "Instant"], cta: "Convert to PDF" },
    { path: "/convert", category: "image", title: "Image Converter", desc: "Convert between JPG, PNG, WebP, AVIF, SVG, BMP, and GIF with adjustable quality and instant download.", icon: <IconConvert />, tags: ["All Formats", "Lossless Mode"], cta: "Convert Format" },
    { path: "/pdf-to-img", category: "pdf", title: "PDF to Images", desc: "Extract every page of your PDF into high-resolution JPG, PNG, or WebP images with 1-click ZIP download.", icon: <IconPdf2Img />, tags: ["PDF → JPG/PNG", "1-Click ZIP", "Up to 300 DPI"], cta: "Extract Images" },
    { path: "/split-pdf", category: "pdf", title: "Split & Extract PDF", desc: "Extract specific pages, split into individual PDFs, or chunk into groups with page thumbnails.", icon: <IconSplit />, tags: ["Extract Pages", "Split All", "ZIP Output"], cta: "Split PDF" },
    { path: "/organize-pdf", category: "pdf", title: "PDF Organizer & Rotator", desc: "Visually reorder, rotate 90/180/270°, delete individual pages, or duplicate pages in real-time.", icon: <IconOrganize />, tags: ["Visual Reorder", "Rotate Pages", "Instant Save"], cta: "Organize Pages" },
    { path: "/pdf-security", category: "pdf", title: "PDF Password Lock & Unlock", desc: "Encrypt PDF with AES-256 password protection, or unlock password-protected PDFs in browser.", icon: <IconLock />, tags: ["AES-256 Lock", "Remove Password", "100% Private"], cta: "Protect PDF" },
    { path: "/pdf-watermark", category: "pdf", title: "PDF Watermark & Page Numbers", desc: "Add custom text/image watermarks, opacity sliders, position grids, and formatted page numbers.", icon: <IconWatermark />, tags: ["Text / Image", "Page Numbers", "Live Preview"], cta: "Watermark PDF" },
    { path: "/bulk-compress", category: "image", title: "Bulk Image Compressor", desc: "Compress 20 to 50+ images simultaneously. Live per-file progress, batch target sizing & ZIP download.", icon: <IconBulk />, tags: ["Batch 50+ Files", "ZIP Download", "Multi-Threaded"], cta: "Bulk Compress" },
    { path: "/passport-resizer", category: "image", title: "Passport Photo Resizer", desc: "Generate compliant passport and visa photos. Auto-crop to official mm dimensions and white background.", icon: <IconPassport />, tags: ["US / UK / Schengen / India", "Printable Sheets", "Custom Size"], cta: "Create Passport Photo" },
    { path: "/image-crop", category: "image", title: "Crop & Resize Image", desc: "Crop images with aspect ratio locks (1:1, 16:9, 4:3), rotate, flip, and export at exact dimensions.", icon: <IconCrop />, tags: ["Aspect Locks", "Rotate & Flip", "Exact Dimensions"], cta: "Crop & Resize" },
    { path: "/bg-remover", category: "utilities", title: "AI Background Remover", desc: "Remove image backgrounds automatically with 100% in-browser on-device AI. No server uploads.", icon: <IconSparkles />, tags: ["🤖 On-Device AI", "Zero Upload", "Instant Cutout"], cta: "Remove Background" },
    { path: "/qr-studio", category: "utilities", title: "QR Code Studio", desc: "Generate customized QR codes for URLs, WiFi, vCards, text, and email. Custom colors & center logo.", icon: <IconQR />, tags: ["WiFi / vCard / Link", "Custom Colors", "Center Logo"], cta: "Create QR Code" },
    { path: "/ocr", category: "utilities", title: "PDF & Image OCR Text Extract", desc: "Extract editable text from scanned PDFs and photos using in-browser optical character recognition.", icon: <IconSearch />, tags: ["100+ Languages", "Searchable PDF", "Copy Text"], cta: "Extract Text" },
    { path: "/sign-pdf", category: "pdf", title: "PDF E-Sign Studio", desc: "Sign PDFs privately. Draw, type, or upload signatures. Add date and status stamps anywhere on the page.", icon: <IconPDF />, tags: ["✍️ Draw/Type", "📅 Stamps", "Drag & Drop"], cta: "Sign PDF" },
    { path: "/upscaler", category: "utilities", title: "AI Image Upscaler", desc: "Enhance low-resolution photos & graphics with 2x & 4x AI super-resolution and live before/after slider.", icon: <IconSparkles />, tags: ["✨ 2x / 4x HD", "🤖 On-Device AI", "Split Slider"], cta: "Upscale Image" },
    { path: "/vectorize", category: "utilities", title: "SVG Vectorizer", desc: "Convert raster PNG, JPG & WebP into crisp, infinitely scalable vector SVG paths with live code export.", icon: <IconConvert />, tags: ["📐 PNG → SVG", "🎨 Presets", "📋 Code Copy"], cta: "Vectorize Image" },
    { path: "/exif-cleaner", category: "utilities", title: "EXIF Privacy Cleaner", desc: "View & strip hidden GPS locations, camera metadata, and date stamps from photos for 100% privacy.", icon: <IconLock />, tags: ["🛡️ Strip GPS", "📸 Camera Data", "100% Private"], cta: "Clean Image" },
    { path: "/drop", category: "utilities", title: "CrushDrop P2P", desc: "AirDrop files directly between any two devices. 100% P2P WebRTC transfer. Zero server limits.", icon: <IconMerge />, tags: ["🌐 WebRTC", "🚀 No Limits", "AirDrop"], cta: "Share Files" },
    { path: "/video-compress", category: "utilities", title: "Video Compressor", desc: "Compress MP4, WebM & MOV videos and audio on-device. WhatsApp 16MB auto-fit, resolution scaling & trim.", icon: <IconCrop />, tags: ["🎬 WhatsApp 16MB", "⚡ 100% Local", "No Limits"], cta: "Compress Video" },
    { path: "/scan-pdf", category: "pdf", title: "Doc Scanner (Camera)", desc: "Scan documents, notes & receipts with your camera or photos. Magic B&W filter & 1-click clean PDF export.", icon: <IconPassport />, tags: ["📷 Cam to PDF", "⚡ Magic Clean", "Multi-Page"], cta: "Scan Document" },
    { path: "/history", category: "utilities", title: "Offline Local History", desc: "View, re-download, or export past compressed PDFs, images, and QR codes stored privately in IndexedDB.", icon: <IconLock />, tags: ["🕒 IndexedDB", "100% Private", "Zero Server Logs"], cta: "View History" },
  ];

  const filteredTools = filter === "all" ? ALL_TOOLS : ALL_TOOLS.filter(t => t.category === filter);

  return (
    <div ref={pageRef} className="min-h-screen bg-[#f8fafd] dark:bg-[#131314] text-gray-800 dark:text-gray-100 font-sans p-2 sm:p-6 lg:p-8 flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto w-full transition-colors">
      
      {/* ── Google Drive Style Canvas Sheet ── */}
      <div className="rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1e1f20] p-4 sm:p-6 lg:p-8 shadow-sm border border-gray-200/60 dark:border-gray-800 transition-colors">
        
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 sm:pb-6 mb-4 sm:mb-6 border-b border-gray-100 dark:border-gray-800/80 gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-normal text-gray-800 dark:text-gray-100 font-sans tracking-tight">
              Welcome to FlashCrush
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 font-normal leading-relaxed">
              Zero-upload, 100% private in-browser file suite. Processed securely on your device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
            <button
              onClick={() => navigate("/pdf")}
              className="rounded-full px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs transition-colors flex items-center gap-2"
            >
              <span className="text-base font-bold">+</span>
              <span>New Document</span>
            </button>
            <button
              onClick={() => navigate("/drop")}
              className="rounded-full px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-[#f0f4f9] dark:bg-[#28292a] text-gray-800 dark:text-gray-200 hover:bg-[#e9eef6] dark:hover:bg-[#333537] border border-gray-200/60 dark:border-gray-700/60 transition-colors flex items-center gap-1.5"
            >
              <span>🌐</span>
              <span>P2P Drop</span>
            </button>
          </div>
        </div>

        {/* ── Suggested Folders / Tools (Google Drive Style) ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 select-none">
              <span>Suggested tools</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {SUGGESTED_TOOLS.map(t => (
              <div
                key={t.path}
                onClick={() => navigate(t.path)}
                className="rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] p-3.5 flex items-center justify-between hover:bg-[#e9eef6] dark:hover:bg-[#333537] transition-colors cursor-pointer group border border-transparent shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#1e1f20] flex items-center justify-center flex-shrink-0 shadow-xs text-blue-600">
                    {t.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {t.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {t.desc}
                    </div>
                  </div>
                </div>
                <span className="text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 group-hover:translate-x-0.5 transition-all text-sm pr-1">
                  →
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Category Filter Pills (Google Drive Chips) ── */}
        <div className="flex items-center gap-2 pb-4 mb-6 overflow-x-auto border-b border-gray-100 dark:border-gray-800/80">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                : "bg-[#f0f4f9] dark:bg-[#28292a] text-gray-700 dark:text-gray-300 hover:bg-[#e9eef6] dark:hover:bg-[#333537]"
            }`}
          >
            All Tools ({ALL_TOOLS.length})
          </button>
          <button
            onClick={() => setFilter("pdf")}
            className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              filter === "pdf"
                ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                : "bg-[#f0f4f9] dark:bg-[#28292a] text-gray-700 dark:text-gray-300 hover:bg-[#e9eef6] dark:hover:bg-[#333537]"
            }`}
          >
            📄 PDF Tools ({ALL_TOOLS.filter(t => t.category === "pdf").length})
          </button>
          <button
            onClick={() => setFilter("image")}
            className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              filter === "image"
                ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                : "bg-[#f0f4f9] dark:bg-[#28292a] text-gray-700 dark:text-gray-300 hover:bg-[#e9eef6] dark:hover:bg-[#333537]"
            }`}
          >
            🖼️ Image Tools ({ALL_TOOLS.filter(t => t.category === "image").length})
          </button>
          <button
            onClick={() => setFilter("utilities")}
            className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              filter === "utilities"
                ? "bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff]"
                : "bg-[#f0f4f9] dark:bg-[#28292a] text-gray-700 dark:text-gray-300 hover:bg-[#e9eef6] dark:hover:bg-[#333537]"
            }`}
          >
            ⚡ AI & Utilities ({ALL_TOOLS.filter(t => t.category === "utilities").length})
          </button>
        </div>

        {/* ── All Tools Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map(tool => (
            <div
              key={tool.path}
              onClick={() => navigate(tool.path)}
              className="rounded-2xl bg-[#f0f4f9] dark:bg-[#28292a] p-5 hover:bg-[#e9eef6] dark:hover:bg-[#333537] transition-all cursor-pointer border border-transparent hover:shadow-xs flex flex-col justify-between group"
            >
              <div>
                <div className="w-11 h-11 rounded-xl bg-white dark:bg-[#1e1f20] flex items-center justify-center text-xl shadow-xs mb-3 text-blue-600">
                  {tool.icon}
                </div>
                <h3 className="text-base font-medium text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {tool.title}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-1.5 mb-3.5 line-clamp-2">
                  {tool.desc}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tool.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-white dark:bg-[#1e1f20] text-gray-600 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  className="w-full rounded-full py-2 px-4 text-xs sm:text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>{tool.cta}</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* ── Google Keep Style Trust Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#1e1f20] p-5 border border-gray-200/60 dark:border-gray-800 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mb-3 text-lg">
            🔒
          </div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
            100% Client-Side Privacy
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            All files are compressed and converted strictly in your browser. Files never touch any external server.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1f20] p-5 border border-gray-200/60 dark:border-gray-800 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mb-3 text-lg">
            ⚡
          </div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
            WebAssembly & WebGPU
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Powered by high-performance WASM and on-device neural runtimes for near-instant execution.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1f20] p-5 border border-gray-200/60 dark:border-gray-800 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-3 text-lg">
            ☁️
          </div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
            Google Drive Direct Sync
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Import directly from Google Drive and export optimized files straight back into your folders.
          </p>
        </div>
      </div>

    </div>
  );
}
