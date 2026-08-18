// ActionButtons.jsx
// Uses auth.uploadToDrive from useAuth — same token, no repeated login popups.
// Pre-upload modal lets user edit file name and pick a Drive folder.

import { useState, useRef, useEffect } from "react";
import { GOOGLE_API_KEY } from "./useAuth.js";

function DriveIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── Drive Folder Picker Modal ─────────────────────────────────────────────────
// Opens Google Picker filtered to folders only.
async function pickDriveFolder(auth) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await auth.getToken();

      // Load gapi picker if needed
      if (!window.google?.picker) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://apis.google.com/js/api.js";
          s.onload = () => window.gapi.load("picker", res);
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const folderView = new window.google.picker.DocsView()
        .setMimeTypes("application/vnd.google-apps.folder")
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true);

      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setAppId("564511509147")
        .setOrigin(window.location.origin)
        .setTitle("Choose a folder to save your file")
        .addView(folderView)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const folder = data.docs[0];
            resolve({ id: folder.id, name: folder.name });
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

// ── Pre-Upload Modal ──────────────────────────────────────────────────────────
function DriveUploadModal({ initialFileName, auth, onConfirm, onClose }) {
  const [fileName, setFileName]       = useState(initialFileName);
  const [folder, setFolder]           = useState(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [error, setError]             = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handlePickFolder = async () => {
    setPickingFolder(true);
    setError("");
    try {
      const picked = await pickDriveFolder(auth);
      if (picked) setFolder(picked);
    } catch {
      setError("Could not open folder picker. Try again.");
    } finally {
      setPickingFolder(false);
    }
  };

  const handleConfirm = () => {
    const trimmed = fileName.trim();
    if (!trimmed) { setError("File name cannot be empty."); return; }
    onConfirm({ fileName: trimmed, folderId: folder?.id || null });
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.70)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
        animation: "fcModalFadeIn 0.18s ease forwards",
      }}
    >
      <style>{`
        @keyframes fcModalFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        .fc-modal-card {
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255,255,255,0.90);
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(124,58,237,0.18), 0 1px 0 rgba(255,255,255,0.95) inset;
          width: 100%;
          max-width: 440px;
          padding: 28px;
          font-family: 'Inter', -apple-system, sans-serif;
          position: relative;
          overflow: hidden;
        }
        .fc-modal-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #a855f7, #6d28d9);
          border-radius: 20px 20px 0 0;
        }
        .fc-modal-title {
          font-size: 17px; font-weight: 800; color: #1a0533;
          margin-bottom: 4px; letter-spacing: -0.3px;
          display: flex; align-items: center; gap: 8px;
        }
        .fc-modal-sub {
          font-size: 12px; color: #9b87b8; margin-bottom: 22px;
        }
        .fc-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          text-transform: uppercase; color: #9b87b8; margin-bottom: 6px;
          display: block;
        }
        .fc-input {
          width: 100%; padding: 11px 14px;
          background: rgba(255,255,255,0.80);
          border: 1.5px solid rgba(168,85,247,0.20);
          border-radius: 11px;
          font-family: 'JetBrains Mono', 'Courier New', monospace;
          font-size: 13px; color: #1a0533;
          outline: none; transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .fc-input:focus { border-color: #a855f7; }
        .fc-folder-btn {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 11px 14px;
          background: rgba(255,255,255,0.70);
          border: 1.5px dashed rgba(168,85,247,0.25);
          border-radius: 11px; cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 500;
          color: #7e22ce; transition: all 0.15s;
          text-align: left;
        }
        .fc-folder-btn:hover:not(:disabled) {
          background: rgba(168,85,247,0.08);
          border-color: #a855f7;
        }
        .fc-folder-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .fc-folder-selected {
          background: rgba(168,85,247,0.08);
          border-style: solid; border-color: rgba(168,85,247,0.35);
          color: #6d28d9;
        }
        .fc-folder-hint {
          font-size: 11px; color: #9b87b8; margin-top: 5px;
        }
        .fc-error {
          font-size: 12px; color: #dc2626;
          background: #fef2f2; border: 1px solid #fca5a5;
          border-radius: 8px; padding: 8px 12px; margin-top: 14px;
        }
        .fc-actions {
          display: flex; gap: 10px; margin-top: 22px;
        }
        .fc-btn-cancel {
          flex: 1; padding: 12px;
          background: rgba(255,255,255,0.60);
          border: 1.5px solid rgba(168,85,247,0.15);
          border-radius: 11px; cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 600;
          color: #7e22ce; transition: all 0.15s;
        }
        .fc-btn-cancel:hover { background: rgba(255,255,255,0.90); }
        .fc-btn-save {
          flex: 2; padding: 12px;
          background: linear-gradient(135deg, #a855f7, #6d28d9);
          border: none; border-radius: 11px; cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 700; color: #fff;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 4px 16px rgba(124,58,237,0.30);
          transition: all 0.15s;
        }
        .fc-btn-save:hover { opacity: 0.90; transform: translateY(-1px); }
        .fc-close-btn {
          position: absolute; top: 16px; right: 16px;
          background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.15);
          border-radius: 8px; width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9b87b8; transition: all 0.15s;
        }
        .fc-close-btn:hover { background: rgba(168,85,247,0.16); color: #7e22ce; }
        .fc-divider { height: 1px; background: rgba(168,85,247,0.12); margin: 20px 0; }
        .fc-root-hint {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: #9b87b8;
          background: rgba(168,85,247,0.05);
          border: 1px solid rgba(168,85,247,0.10);
          border-radius: 8px; padding: 8px 10px; margin-top: 8px;
        }
      `}</style>

      <div className="fc-modal-card">
        {/* Close button */}
        <button className="fc-close-btn" onClick={onClose} title="Cancel">
          <CloseIcon />
        </button>

        <div className="fc-modal-title">
          <DriveIcon size={18} />
          Save to Google Drive
        </div>
        <div className="fc-modal-sub">Rename your file and choose where to save it.</div>

        {/* File name input */}
        <label className="fc-label">File Name</label>
        <input
          ref={inputRef}
          className="fc-input"
          value={fileName}
          onChange={e => { setFileName(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
          placeholder="compressed_file.pdf"
          spellCheck={false}
        />

        <div className="fc-divider" />

        {/* Folder picker */}
        <label className="fc-label">Save Location</label>
        <button
          className={`fc-folder-btn${folder ? " fc-folder-selected" : ""}`}
          onClick={handlePickFolder}
          disabled={pickingFolder}
          type="button"
        >
          <FolderIcon />
          {pickingFolder
            ? "Opening picker…"
            : folder
              ? `📁 ${folder.name}`
              : "Choose a folder (optional)"}
        </button>

        {!folder && (
          <div className="fc-root-hint">
            <span>ℹ️</span> If no folder is selected, the file will be saved to your Drive root.
          </div>
        )}
        {folder && (
          <div className="fc-folder-hint">
            Will save to: <strong>{folder.name}</strong> &nbsp;
            <span
              style={{ color: "#a855f7", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setFolder(null)}
            >
              clear
            </span>
          </div>
        )}

        {error && <div className="fc-error">⚠ {error}</div>}

        {/* Action buttons */}
        <div className="fc-actions">
          <button className="fc-btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button className="fc-btn-save" onClick={handleConfirm} type="button">
            <DriveIcon size={14} />
            Save to Drive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ActionButtons component ──────────────────────────────────────────────
export default function ActionButtons({ blob, fileName, onReset, auth }) {
  const [driveStatus, setDriveStatus] = useState("idle"); // idle|modal|uploading|success|error
  const [driveLink,   setDriveLink]   = useState(null);
  const [driveError,  setDriveError]  = useState(null);
  const [shared,      setShared]      = useState(false);

  const isSignedIn = auth.authStatus === "signedin";

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // ── Open Drive modal (or sign-in first) ────────────────────────────────────
  const handleDriveClick = async () => {
    if (!blob) return;
    if (!isSignedIn) {
      await auth.signIn();
      return;
    }
    setDriveStatus("modal");
    setDriveError(null);
  };

  // ── Called when user confirms in modal ─────────────────────────────────────
  const handleModalConfirm = async ({ fileName: editedName, folderId }) => {
    setDriveStatus("uploading");
    setDriveError(null);
    try {
      const result = await auth.uploadToDrive(blob, editedName, folderId);
      setDriveLink(result.webViewLink);
      setDriveStatus("success");
    } catch (err) {
      setDriveError(err.message || "Upload failed. Try again.");
      setDriveStatus("error");
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (navigator.share) {
      try { await navigator.share({ title: "Compressed file", text: fileName, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const driveButtonLabel = () => {
    if (!isSignedIn)                  return "Sign in to Save to Drive";
    if (driveStatus === "uploading")  return "Uploading…";
    if (driveStatus === "success")    return "Saved to Drive ✓";
    const name = auth.user?.name?.split(" ")[0] || auth.user?.email?.split("@")[0] || "your account";
    return `Save to Drive  ·  ${name}`;
  };

  const isDriveDisabled =
    driveStatus === "uploading" ||
    driveStatus === "success"   ||
    driveStatus === "modal"     ||
    auth.authStatus === "loading";

  return (
    <>
      {/* Pre-upload modal */}
      {driveStatus === "modal" && (
        <DriveUploadModal
          initialFileName={fileName}
          auth={auth}
          onConfirm={handleModalConfirm}
          onClose={() => setDriveStatus("idle")}
        />
      )}

      <div className="action-group">
        {/* Download */}
        <button className="btn-download" onClick={handleDownload}>
          ⬇ Download file
        </button>

        {/* Save to Drive */}
        <button
          className="btn-drive-upload"
          onClick={handleDriveClick}
          disabled={isDriveDisabled}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
        >
          <DriveIcon />
          {auth.authStatus === "loading" ? "Signing in…" : driveButtonLabel()}
          {isSignedIn && driveStatus === "idle" && (
            <span style={{ marginLeft: "auto", opacity: 0.50 }}>
              <EditIcon />
            </span>
          )}
        </button>

        {/* Drive feedback */}
        {driveStatus === "success" && driveLink && (
          <div className="drive-feedback success">
            ✓ Saved to {auth.user?.email || "your Drive"}!{" "}
            <a href={driveLink} target="_blank" rel="noopener noreferrer"
              style={{ color: "inherit", fontWeight: 700 }}>
              Open in Drive →
            </a>
          </div>
        )}
        {driveStatus === "error" && driveError && (
          <div className="drive-feedback error">
            ⚠ {driveError}{" "}
            <span
              style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 700 }}
              onClick={() => setDriveStatus("modal")}
            >
              Retry
            </span>
          </div>
        )}

        {/* Share */}
        <button className={`btn-share${shared ? " shared" : ""}`} onClick={handleShare}>
          {shared ? "✓ Link copied!" : "↗ Share file"}
        </button>

        {/* Reset */}
        <button className="btn-reset" onClick={onReset}>
          ↺ Process another file
        </button>
      </div>
    </>
  );
}
