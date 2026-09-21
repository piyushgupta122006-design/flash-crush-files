// PDFSecurity.jsx — Unlock (Remove Password) & Protect (Add Password) PDF
// Unlock: Uses PDF.js to decrypt + pdf-lib to rebuild a clean unlocked PDF
// Protect: Uses pdf-lib + Web Crypto API for AES-256 encryption
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PDFDocument } from "pdf-lib";
import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import ActionButtons from "./ActionButtons";

const MAX_SIZE_MB = 50;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

function fmt(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function DriveIconSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

// Load PDF.js from CDN
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF engine"));
    document.head.appendChild(s);
  });
}

const MODES = [
  { id: "unlock", label: "Unlock PDF", desc: "Remove password from a locked PDF" },
  { id: "protect", label: "Protect PDF", desc: "Add password to an open PDF" },
];

export default function PDFSecurity({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState("unlock");
  const [stage, setStage] = useState("idle"); // idle | ready | processing | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [resultInfo, setResultInfo] = useState("");
  const [pickLoading, setPickLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(null); // null = unknown, true/false
  const inputRef = useRef(null);
  const pdfBytesRef = useRef(null);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported."); setStage("error"); return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds ${MAX_SIZE_MB} MB limit.`); setStage("error"); return;
    }
    setFile(f);
    setErrorMsg("");
    setPassword("");
    setConfirmPassword("");

    // Check if PDF is password-protected
    try {
      const arrayBuffer = await f.arrayBuffer();
      pdfBytesRef.current = new Uint8Array(arrayBuffer);

      const pdfjs = await loadPdfJs();
      try {
        await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
        // Opened without password → not locked
        setIsLocked(false);
        if (mode === "unlock") {
          setErrorMsg("This PDF is not password-protected. Switch to 'Protect' mode to add a password.");
        }
      } catch (err) {
        if (err.name === "PasswordException") {
          setIsLocked(true);
          if (mode === "protect") {
            setErrorMsg("This PDF is already locked. Switch to 'Unlock' mode to remove the password first.");
          }
        } else {
          throw err;
        }
      }
      setStage("ready");
    } catch (err) {
      if (err.name !== "PasswordException") {
        setErrorMsg("Failed to read PDF: " + (err.message || "Unknown error"));
        setStage("error");
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth.getToken();
      await auth.ensurePickerReady();
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true).setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf");
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147").setOAuthToken(token).addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "document.pdf";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: "application/pdf" }));
            } catch (err) {
              setErrorMsg(err.message); setStage("error");
            }
          }
        }).build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Drive picker failed."); setStage("error");
    } finally { setPickLoading(false); }
  };

  // ── UNLOCK: Remove password by rendering pages to canvas then rebuilding PDF ──
  const unlockPDF = async () => {
    if (!pdfBytesRef.current || !password.trim()) return;
    setStage("processing");
    setProgress(5);
    setProgressMsg("Decrypting PDF with your password...");
    setErrorMsg("");

    try {
      const pdfjs = await loadPdfJs();

      // Try to open with the provided password
      let pdfDoc;
      try {
        pdfDoc = await pdfjs.getDocument({
          data: pdfBytesRef.current.slice(0),
          password: password.trim(),
        }).promise;
      } catch (err) {
        if (err.name === "PasswordException") {
          throw new Error("Wrong password. Please check and try again.");
        }
        throw err;
      }

      const numPages = pdfDoc.numPages;
      setProgress(15);
      setProgressMsg(`Password accepted! Rebuilding ${numPages} pages...`);

      // Render each page to high-res canvas and embed into new PDF
      const newDoc = await PDFDocument.create();
      const scale = 2.0; // 200 DPI for good quality

      for (let i = 1; i <= numPages; i++) {
        setProgress(Math.round(15 + (i / numPages) * 70));
        setProgressMsg(`Rebuilding page ${i} of ${numPages}...`);

        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Convert canvas to JPEG bytes
        const imgBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
        const imgBytes = new Uint8Array(await imgBlob.arrayBuffer());
        const embeddedImg = await newDoc.embedJpg(imgBytes);

        // Get original page dimensions (at scale=1)
        const origVp = page.getViewport({ scale: 1 });
        const newPage = newDoc.addPage([origVp.width, origVp.height]);
        newPage.drawImage(embeddedImg, {
          x: 0, y: 0,
          width: origVp.width,
          height: origVp.height,
        });
      }

      setProgress(90);
      setProgressMsg("Saving unlocked PDF...");
      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const baseName = file.name.replace(/\.[^.]+$/, "");

      setResultBlob(blob);
      setResultName(`${baseName}_unlocked.pdf`);
      setResultInfo(`${numPages} pages · ${fmt(blob.size)} · Password removed`);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Unlock failed.");
      setStage("error");
    }
  };

  // ── PROTECT: Add password with standard AES-256 encryption ──
  const protectPDF = async () => {
    if (!pdfBytesRef.current || !password.trim()) return;
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match."); return;
    }
    if (password.length < 4) {
      setErrorMsg("Password must be at least 4 characters."); return;
    }

    setStage("processing");
    setProgress(15);
    setProgressMsg("Applying AES-256 password encryption...");
    setErrorMsg("");

    try {
      setProgress(40);
      setProgressMsg("Encrypting document structure...");

      // Standard AES-256 encryption recognized by Adobe, Chrome, Edge, Safari, and all mobile PDF apps
      const encryptedBytes = await encryptPDF(pdfBytesRef.current, password.trim(), {
        algorithm: "AES-256",
      });

      setProgress(90);
      setProgressMsg("Saving password-protected PDF...");
      const blob = new Blob([encryptedBytes], { type: "application/pdf" });
      const baseName = file.name.replace(/\.[^.]+$/, "");

      setResultBlob(blob);
      setResultName(`${baseName}_protected.pdf`);
      setResultInfo(`${fmt(blob.size)} · 🔒 AES-256 Password Protected`);
      setProgress(100);
      setProgressMsg("Done!");
      setStage("done");

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Protection failed.");
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setResultBlob(null);
    setResultName("");
    setResultInfo("");
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setPassword("");
    setConfirmPassword("");
    setIsLocked(null);
    pdfBytesRef.current = null;
  };

  const drivePickLabel = () => {
    if (pickLoading || auth.authStatus === "loading") return "Loading...";
    if (auth.authStatus === "signedin") {
      const name = auth.user?.name?.split(" ")[0] || auth.user?.email?.split("@")[0];
      return `Import from Drive  ·  ${name}`;
    }
    return "Import from Drive";
  };

  const canExecute = mode === "unlock"
    ? (password.trim().length > 0 && isLocked === true)
    : (password.trim().length >= 4 && password === confirmPassword && isLocked === false);

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans transition-colors duration-300 pb-20">
      {/* ── Top App Bar ── */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-display font-semibold text-m3-on-surface-variant hover:text-m3-on-surface bg-m3-surface-container hover:bg-m3-surface-container-high border border-m3-outline-variant/50 transition-all duration-200 active:scale-95 shadow-sm"
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🔐</span>
          <span className="text-base sm:text-lg font-display font-bold text-m3-on-surface">PDF Security</span>
        </div>
        <div className="text-xs font-mono font-medium text-m3-on-surface-variant bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/50 hidden sm:block">
          Lock & Unlock · AES-256
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero Header ── */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-m3-primary/10 text-m3-primary text-3xl mb-4 shadow-sm">
            🔐
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-m3-on-surface mb-3">
            PDF Password Protect & Unlock
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Remove passwords from locked PDFs or secure open files with AES-256 password encryption. 100% private, on-device processing.
          </p>
        </div>

        {/* ── Outer Card ── */}
        <div className="bg-m3-surface-container-low border border-m3-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-m3-elevation-1 transition-colors">

          {/* ── Mode Selector ── */}
          {(stage === "idle" || stage === "ready" || stage === "done" || stage === "error") && (
            <div className="mb-6">
              <span className="block text-xs font-display font-bold uppercase tracking-wider text-m3-on-surface-variant mb-3">
                1. Choose Action
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODES.map((m) => {
                  const isActive = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`flex flex-col items-start text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                        isActive
                          ? "border-m3-primary bg-m3-primary/10 text-m3-on-surface shadow-sm ring-1 ring-m3-primary"
                          : "border-m3-outline-variant/60 bg-m3-surface-container/60 hover:bg-m3-surface-container text-m3-on-surface-variant hover:text-m3-on-surface"
                      }`}
                      onClick={() => { setMode(m.id); setErrorMsg(""); }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{m.id === "unlock" ? "🔓" : "🔒"}</span>
                        <span className="font-display font-bold text-sm sm:text-base text-m3-on-surface">
                          {m.label}
                        </span>
                      </div>
                      <span className="text-xs text-m3-on-surface-variant leading-relaxed">
                        {m.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-8 sm:p-12 text-center cursor-pointer mb-6 ${
                dragging
                  ? "border-m3-primary bg-m3-primary-container/20 scale-[0.99]"
                  : "border-m3-outline-variant/80 hover:border-m3-primary bg-m3-surface-container/50 hover:bg-m3-surface-container"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
              <span className="text-4xl sm:text-5xl mb-3 block transform group-hover:scale-110 transition-transform">
                {mode === "unlock" ? "🔓" : "🔒"}
              </span>
              <p className="text-lg sm:text-xl font-display font-bold text-m3-on-surface mb-1.5">
                {dragging
                  ? "Drop your PDF here!"
                  : mode === "unlock"
                  ? "Drop your locked PDF here"
                  : "Drop your PDF to protect"}
              </p>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6">
                {mode === "unlock"
                  ? "Upload a password-protected PDF to remove its password"
                  : "Upload an open PDF to add password protection"} · Max {MAX_SIZE_MB} MB
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="px-6 py-3 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-display font-bold text-sm shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-95 transition-all flex items-center gap-2"
                  onClick={() => inputRef.current?.click()}
                >
                  <span>📁</span>
                  <span>Browse PDF</span>
                </button>
                <button
                  type="button"
                  className="px-5 py-3 rounded-full border border-m3-outline-variant/80 bg-m3-surface-container hover:bg-m3-surface-container-high text-m3-on-surface font-display font-semibold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}
                >
                  <DriveIconSmall />
                  <span>{drivePickLabel()}</span>
                </button>
              </div>

              {stage === "error" && (
                <div className="mt-4 p-3 rounded-xl bg-m3-error-container/40 border border-m3-error/30 text-m3-on-error-container text-xs sm:text-sm font-medium">
                  ⚠ {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* ── File Row ── */}
          {file && stage !== "idle" && !(stage === "error" && !file) && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/60 shadow-sm mb-6 transition-all">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-m3-surface flex items-center justify-center text-xl shadow-xs border border-m3-outline-variant/40 flex-shrink-0">
                  {isLocked ? "🔒" : "📄"}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-m3-on-surface truncate">
                    {file.name}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-m3-on-surface-variant mt-0.5">
                    <span>{fmt(file.size)}</span>
                    <span>·</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                        isLocked === null
                          ? "bg-m3-surface-variant text-m3-on-surface-variant"
                          : isLocked
                          ? "bg-m3-error-container/60 text-m3-error border border-m3-error/20"
                          : "bg-m3-tertiary-container/60 text-m3-on-tertiary-container border border-m3-tertiary/20"
                      }`}
                    >
                      {isLocked === null ? "Checking..." : isLocked ? "🔒 Password Protected" : "🔓 Not Locked"}
                    </span>
                  </div>
                </div>
              </div>
              {stage !== "processing" && (
                <button
                  type="button"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-error hover:bg-m3-error-container/40 transition-colors flex-shrink-0 ml-2"
                  onClick={reset}
                  title="Remove file"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* ── Error inside ready state ── */}
          {(stage === "ready" || stage === "error") && file && errorMsg && (
            <div className="mb-6 p-3.5 rounded-xl bg-m3-error-container/40 border border-m3-error/30 text-m3-on-error-container text-xs sm:text-sm font-medium flex items-center gap-2">
              <span className="text-base">⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── Password Input (Unlock mode) ── */}
          {(stage === "ready" || stage === "done") && mode === "unlock" && isLocked && (
            <div className="mb-6 p-5 rounded-2xl bg-m3-surface-container/60 border border-m3-outline-variant/60">
              <label className="block text-xs font-display font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2.5">
                2. Enter the PDF Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter PDF password..."
                  className="w-full px-4 py-3.5 pr-12 rounded-xl bg-m3-surface border border-m3-outline-variant/80 text-m3-on-surface font-mono text-sm placeholder:text-m3-on-surface-variant/50 focus:outline-none focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 transition-all"
                  onKeyDown={(e) => { if (e.key === "Enter" && canExecute) unlockPDF(); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-m3-on-surface-variant hover:text-m3-on-surface text-lg p-1 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>
          )}

          {/* ── Password Input (Protect mode) ── */}
          {(stage === "ready" || stage === "done") && mode === "protect" && isLocked === false && (
            <div className="mb-6 p-5 rounded-2xl bg-m3-surface-container/60 border border-m3-outline-variant/60">
              <label className="block text-xs font-display font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2.5">
                2. Set a Password (min 4 characters)
              </label>
              <div className="relative mb-4">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter new password..."
                  className="w-full px-4 py-3.5 pr-12 rounded-xl bg-m3-surface border border-m3-outline-variant/80 text-m3-on-surface font-mono text-sm placeholder:text-m3-on-surface-variant/50 focus:outline-none focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-m3-on-surface-variant hover:text-m3-on-surface text-lg p-1 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>

              <label className="block text-xs font-display font-bold text-m3-on-surface-variant uppercase tracking-wider mb-2.5">
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(""); }}
                placeholder="Re-enter password..."
                className={`w-full px-4 py-3.5 rounded-xl bg-m3-surface border text-m3-on-surface font-mono text-sm placeholder:text-m3-on-surface-variant/50 focus:outline-none transition-all ${
                  confirmPassword && confirmPassword !== password
                    ? "border-m3-error focus:ring-2 focus:ring-m3-error/20"
                    : "border-m3-outline-variant/80 focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/20"
                }`}
                onKeyDown={(e) => { if (e.key === "Enter" && canExecute) protectPDF(); }}
              />

              {confirmPassword && confirmPassword !== password && (
                <div className="text-xs text-m3-error font-medium mt-2 flex items-center gap-1.5">
                  <span>⚠</span>
                  <span>Passwords do not match</span>
                </div>
              )}
              {password.length > 0 && password.length < 4 && (
                <div className="text-xs text-amber-500 dark:text-amber-400 font-medium mt-2 flex items-center gap-1.5">
                  <span>⚠</span>
                  <span>Password must be at least 4 characters</span>
                </div>
              )}

              {/* Password strength indicator */}
              {password.length >= 4 && (
                <div className="mt-3.5">
                  <div className="flex gap-1.5 mb-1.5">
                    {[1, 2, 3, 4].map((level) => {
                      const filled = password.length >= level * 3;
                      const colors = [
                        "bg-m3-error",
                        "bg-amber-500",
                        "bg-emerald-500",
                        "bg-m3-primary",
                      ];
                      return (
                        <div
                          key={level}
                          className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                            filled ? colors[level - 1] : "bg-m3-outline-variant/40"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-medium text-m3-on-surface-variant">
                    Strength:{" "}
                    <span className="font-bold text-m3-on-surface">
                      {password.length < 6
                        ? "Weak"
                        : password.length < 9
                        ? "Medium"
                        : password.length < 12
                        ? "Strong"
                        : "Very Strong"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Action Button ── */}
          {(stage === "ready" || stage === "done") && file && (
            <div className="mb-6">
              <button
                type="button"
                className={`w-full py-4 rounded-full font-display font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 ${
                  canExecute
                    ? "bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 active:scale-[0.99] cursor-pointer"
                    : "opacity-40 cursor-not-allowed bg-m3-surface-variant text-m3-on-surface-variant"
                }`}
                onClick={mode === "unlock" ? unlockPDF : protectPDF}
                disabled={!canExecute}
              >
                <span>{mode === "unlock" ? "🔓" : "🔒"}</span>
                <span>
                  {mode === "unlock"
                    ? stage === "done"
                      ? "Re-unlock PDF"
                      : "Unlock & Remove Password"
                    : stage === "done"
                    ? "Re-protect PDF"
                    : "Protect with Password"}
                </span>
              </button>
            </div>
          )}

          {/* ── Progress ── */}
          {stage === "processing" && (
            <div className="mb-6 p-6 rounded-2xl bg-m3-surface-container border border-m3-outline-variant/50">
              <div className="flex items-center justify-between text-xs font-display font-semibold mb-2">
                <span className="text-m3-on-surface">
                  {mode === "unlock" ? "Unlocking PDF..." : "Protecting PDF..."}
                </span>
                <span className="font-mono font-bold text-m3-primary">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-m3-surface-variant overflow-hidden">
                <div
                  className="h-full bg-m3-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-m3-on-surface-variant mt-2 animate-pulse font-mono">
                {progressMsg}
              </p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && resultBlob && (
            <div className="mb-6">
              <div className="rounded-2xl bg-m3-surface-container p-6 my-6 border border-m3-outline-variant/50 shadow-sm">
                <div className="flex items-center justify-center gap-6 sm:gap-10 py-3">
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-on-surface-variant mb-1">Original</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-on-surface">
                      {isLocked ? "🔒 Locked" : "🔓 Open"} · {fmt(file.size)}
                    </div>
                  </div>
                  <div className="text-xl text-m3-outline font-bold">→</div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-m3-primary mb-1">Output</div>
                    <div className="text-base sm:text-lg font-mono font-bold text-m3-primary">
                      {resultInfo}
                    </div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <span
                    className={`rounded-full px-4 py-1.5 text-xs font-mono font-bold inline-block border shadow-xs ${
                      mode === "unlock"
                        ? "bg-m3-tertiary-container text-m3-on-tertiary-container border-m3-tertiary/20"
                        : "bg-m3-primary-container text-m3-on-primary-container border-m3-primary/20"
                    }`}
                  >
                    {mode === "unlock"
                      ? "🔓 Password Removed Successfully"
                      : "🔒 Password Protection Added"}
                  </span>
                </div>
              </div>

              <ActionButtons
                blob={resultBlob}
                fileName={resultName}
                onReset={reset}
                auth={auth}
                toolName="PDF Security"
              />
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-m3-on-surface-variant/70 pt-6 mt-6 border-t border-m3-outline-variant/30">
            <span>FlashCrush · PDF Security Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
