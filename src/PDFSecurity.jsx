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
  { id: "unlock", label: "🔓 Unlock PDF", desc: "Remove password from a locked PDF" },
  { id: "protect", label: "🔒 Protect PDF", desc: "Add password to an open PDF" },
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
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">PDF Security</div>
        <div className="tool-page-meta">Lock & Unlock · Password Protection</div>
      </div>

      <div className="compressor-wrap">
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(56, 189, 248, 0.4)", boxShadow: "0 0 20px rgba(56, 189, 248, 0.3)" }}>
              🔐
            </div>
            <div className="comp-title">PDF Password Protect & Unlock</div>
          </div>
          <p className="comp-sub">Remove passwords from locked PDFs or add password protection to open files.</p>
        </div>

        <div className="comp-card">

          {/* ── Mode Selector ── */}
          {(stage === "idle" || stage === "ready" || stage === "done" || stage === "error") && (
            <div className="level-wrap">
              <span className="level-label">1. Choose Action</span>
              <div className="level-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`level-btn${mode === m.id ? " active" : ""}`}
                    onClick={() => { setMode(m.id); setErrorMsg(""); }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{m.id === "unlock" ? "🔓" : "🔒"}</span>
                    <span className="level-name">{m.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-sub)" }}>{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Drop Zone ── */}
          {(stage === "idle" || (stage === "error" && !file)) && (
            <div
              className={`drop-zone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden
                onChange={(e) => handleFile(e.target.files[0])} />
              <span className="drop-icon">{mode === "unlock" ? "🔓" : "🔒"}</span>
              <p className="drop-main">{dragging ? "Drop your PDF here!" :
                mode === "unlock" ? "Drop your locked PDF here" : "Drop your PDF to protect"}</p>
              <p className="drop-sub">
                {mode === "unlock"
                  ? "Upload a password-protected PDF to remove its password"
                  : "Upload an open PDF to add password protection"} · max {MAX_SIZE_MB} MB
              </p>

              <div className="drop-btn-row" onClick={(e) => e.stopPropagation()}>
                <button className="drop-btn" onClick={() => inputRef.current?.click()}>📁 Browse PDF</button>
                <button className="drop-btn-drive" onClick={handleDrivePick}
                  disabled={pickLoading || auth.authStatus === "loading"}>
                  <DriveIconSmall />{drivePickLabel()}
                </button>
              </div>

              {stage === "error" && <div className="error-box" style={{ marginTop: 14 }}>⚠ {errorMsg}</div>}
            </div>
          )}

          {/* ── File Row ── */}
          {file && stage !== "idle" && !(stage === "error" && !file) && (
            <div className="file-row">
              <div className="file-icon">{isLocked ? "🔒" : "📄"}</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">
                  {fmt(file.size)} ·{" "}
                  <span style={{ color: isLocked ? "#f87171" : "#34d399", fontWeight: 700 }}>
                    {isLocked === null ? "Checking..." : isLocked ? "🔒 Password Protected" : "🔓 Not Locked"}
                  </span>
                </div>
              </div>
              {stage !== "processing" && <button className="close-btn" onClick={reset}>✕</button>}
            </div>
          )}

          {/* ── Error inside ready state ── */}
          {(stage === "ready" || stage === "error") && file && errorMsg && (
            <div style={{ padding: "0 20px 10px" }}>
              <div className="error-box">⚠ {errorMsg}</div>
            </div>
          )}

          {/* ── Password Input (Unlock mode) ── */}
          {(stage === "ready" || stage === "done") && mode === "unlock" && isLocked && (
            <div style={{ padding: "0 20px 16px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                2. Enter the PDF Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter PDF password..."
                  style={{
                    width: "100%", padding: "14px 50px 14px 16px", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "14px", color: "#fff", outline: "none",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#38bdf8"; e.target.style.boxShadow = "0 0 20px rgba(56,189,248,0.3)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && canExecute) unlockPDF(); }}
                />
                <button onClick={() => setShowPassword(!showPassword)} style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "16px",
                }}>{showPassword ? "🙈" : "👁"}</button>
              </div>
            </div>
          )}

          {/* ── Password Input (Protect mode) ── */}
          {(stage === "ready" || stage === "done") && mode === "protect" && isLocked === false && (
            <div style={{ padding: "0 20px 16px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                2. Set a Password (min 4 characters)
              </label>
              <div style={{ position: "relative", marginBottom: "10px" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter new password..."
                  style={{
                    width: "100%", padding: "14px 50px 14px 16px", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "14px", color: "#fff", outline: "none",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#8b5cf6"; e.target.style.boxShadow = "0 0 20px rgba(139,92,246,0.3)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
                />
                <button onClick={() => setShowPassword(!showPassword)} style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "16px",
                }}>{showPassword ? "🙈" : "👁"}</button>
              </div>

              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(""); }}
                placeholder="Re-enter password..."
                style={{
                  width: "100%", padding: "14px 16px", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)",
                  border: `1.5px solid ${confirmPassword && confirmPassword !== password ? "rgba(244,63,94,0.5)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: "12px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "14px", color: "#fff", outline: "none",
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && canExecute) protectPDF(); }}
              />
              {confirmPassword && confirmPassword !== password && (
                <div style={{ fontSize: "12px", color: "#f87171", marginTop: "6px" }}>
                  ⚠ Passwords do not match
                </div>
              )}
              {password.length > 0 && password.length < 4 && (
                <div style={{ fontSize: "12px", color: "#fbbf24", marginTop: "6px" }}>
                  ⚠ Password must be at least 4 characters
                </div>
              )}

              {/* Password strength indicator */}
              {password.length >= 4 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                    {[1, 2, 3, 4].map(level => (
                      <div key={level} style={{
                        flex: 1, height: "4px", borderRadius: "2px",
                        background: password.length >= level * 3
                          ? level <= 1 ? "#f87171" : level <= 2 ? "#fbbf24" : level <= 3 ? "#34d399" : "#06b6d4"
                          : "rgba(255,255,255,0.1)",
                        transition: "background 0.3s",
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-sub)" }}>
                    Strength: {password.length < 6 ? "Weak" : password.length < 9 ? "Medium" : password.length < 12 ? "Strong" : "Very Strong"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Action Button ── */}
          {(stage === "ready" || stage === "done") && file && (
            <div className="action-wrap">
              <button className="btn-compress" onClick={mode === "unlock" ? unlockPDF : protectPDF}
                disabled={!canExecute}>
                {mode === "unlock"
                  ? (stage === "done" ? "🔁 Re-unlock PDF" : "🔓 Unlock & Remove Password")
                  : (stage === "done" ? "🔁 Re-protect PDF" : "🔒 Protect with Password")}
              </button>
            </div>
          )}

          {/* ── Progress ── */}
          {stage === "processing" && (
            <div className="progress-wrap">
              <div className="progress-header">
                <span className="progress-title">{mode === "unlock" ? "Unlocking PDF..." : "Protecting PDF..."}</span>
                <span className="progress-pct">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-msg">{progressMsg}</p>
            </div>
          )}

          {/* ── Result ── */}
          {stage === "done" && resultBlob && (
            <div style={{ padding: "0 20px 20px" }}>
              <div className="result-box" style={{
                margin: "10px 0 20px",
                background: mode === "unlock" ? "rgba(16,185,129,0.08)" : "rgba(56,189,248,0.08)",
                borderColor: mode === "unlock" ? "rgba(16,185,129,0.3)" : "rgba(56,189,248,0.3)",
              }}>
                <div className="result-grid">
                  <div>
                    <span className="result-label">Original</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-muted)" }}>
                      {isLocked ? "🔒 Locked" : "🔓 Open"} · {fmt(file.size)}
                    </span>
                  </div>
                  <div className="result-arrow">→</div>
                  <div>
                    <span className="result-label">Output</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800,
                      color: mode === "unlock" ? "#34d399" : "#38bdf8"
                    }}>
                      {resultInfo}
                    </span>
                  </div>
                </div>
                <div className="result-badge" style={{
                  background: mode === "unlock" ? "rgba(16,185,129,0.18)" : "rgba(56,189,248,0.18)",
                  borderColor: mode === "unlock" ? "#10b981" : "#38bdf8",
                  color: mode === "unlock" ? "#34d399" : "#38bdf8",
                }}>
                  {mode === "unlock" ? "🔓 Password Removed Successfully" : "🔒 Password Protection Added"}
                </div>
              </div>

              <ActionButtons blob={resultBlob} fileName={resultName} onReset={reset} auth={auth} />
            </div>
          )}

          <div className="comp-footer">
            <span>FlashCrush · PDF Security Tool</span>
            <span>100% in-browser processing · Zero server uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
