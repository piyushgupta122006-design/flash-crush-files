// ActionButtons.jsx
// Uses auth.uploadToDrive from useAuth — same token, no repeated login popups.
// Pre-upload modal lets user edit file name and pick a Drive folder.

import { useState, useRef, useEffect } from "react";
import { GOOGLE_API_KEY } from "./useAuth.js";
import { addHistoryRecord } from "./historyDB.js";

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

      // Ensure picker is loaded
      await auth.ensurePickerReady();

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
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 transition-all animate-[fadeIn_0.15s_ease-out]"
    >
      <div className="w-full max-w-md rounded-3xl bg-m3-surface-container p-6 sm:p-8 border border-m3-outline-variant/60 shadow-m3-elevation-3 font-sans relative overflow-hidden text-m3-on-surface">
        
        {/* Close button */}
        <button 
          className="absolute top-4 right-4 p-2 rounded-full text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest transition-colors"
          onClick={onClose} 
          title="Cancel"
        >
          <CloseIcon />
        </button>

        <div className="text-xl sm:text-2xl font-normal text-m3-on-surface mb-1.5 flex items-center gap-2.5 tracking-tight">
          <DriveIcon size={20} />
          Save to Google Drive
        </div>
        <div className="text-sm text-m3-on-surface-variant mb-6">
          Rename your file and choose where to save it.
        </div>

        {/* File name input */}
        <label className="block text-[11px] font-bold tracking-wide uppercase text-m3-primary mb-2">
          File Name
        </label>
        <input
          ref={inputRef}
          className="w-full px-4 py-3 bg-m3-surface-container-high border border-m3-outline-variant/60 rounded-xl text-sm text-m3-on-surface outline-none focus:border-m3-primary focus:ring-1 focus:ring-m3-primary transition-all placeholder:text-m3-outline shadow-sm"
          value={fileName}
          onChange={e => { setFileName(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
          placeholder="compressed_file.pdf"
          spellCheck={false}
        />

        <div className="h-px w-full bg-m3-outline-variant/40 my-6" />

        {/* Folder picker */}
        <label className="block text-[11px] font-bold tracking-wide uppercase text-m3-primary mb-2">
          Save Location
        </label>
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl text-sm font-medium transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${
            folder 
              ? "bg-m3-secondary-container border-m3-primary text-m3-on-secondary-container border-solid shadow-sm" 
              : "bg-m3-surface-container-high border-m3-outline-variant/70 text-m3-on-surface hover:bg-m3-surface-container-highest hover:border-m3-primary"
          }`}
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
          <div className="flex items-center gap-2 text-xs text-m3-on-surface-variant bg-m3-surface-container-low border border-m3-outline-variant/40 rounded-xl px-3 py-2 mt-3">
            <span>ℹ️</span> If no folder is selected, the file will be saved to your Drive root.
          </div>
        )}
        {folder && (
          <div className="text-xs text-m3-on-surface-variant mt-2 ml-1">
            Will save to: <strong className="text-m3-on-surface">{folder.name}</strong> &nbsp;
            <span
              className="text-m3-primary cursor-pointer hover:underline"
              onClick={() => setFolder(null)}
            >
              clear
            </span>
          </div>
        )}

        {error && (
          <div className="text-xs text-m3-on-error-container bg-m3-error-container border border-m3-error/40 rounded-xl px-3 py-2.5 mt-4 font-medium">
            ⚠ {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button 
            className="flex-1 px-4 py-2.5 bg-m3-surface-container-high border border-m3-outline-variant/60 rounded-full text-sm font-medium text-m3-on-surface hover:bg-m3-surface-container-highest transition-colors shadow-sm active:scale-95"
            onClick={onClose} 
            type="button"
          >
            Cancel
          </button>
          <button 
            className="flex-[2] px-4 py-2.5 bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary border border-transparent rounded-full text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-m3-elevation-1 active:scale-95"
            onClick={handleConfirm} 
            type="button"
          >
            <DriveIcon size={14} />
            Save to Drive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ActionButtons component ──────────────────────────────────────────────
export default function ActionButtons({
  blob,
  resultBlob,
  fileName,
  outputFileName,
  onReset,
  auth,
  toolName,
  origSize,
  resultMime
}) {
  const activeBlob = blob || resultBlob;
  const activeFileName = fileName || outputFileName || "processed-file";

  const [driveStatus, setDriveStatus] = useState("idle"); // idle|modal|uploading|success|error
  const [driveLink,   setDriveLink]   = useState(null);
  const [driveError,  setDriveError]  = useState(null);
  const [shared,      setShared]      = useState(false);
  const recordedRef = useRef(false);

  const isSignedIn = auth?.authStatus === "signedin";

  // Auto-record to local IndexedDB once when blob is ready
  useEffect(() => {
    if (activeBlob && activeFileName && !recordedRef.current) {
      recordedRef.current = true;
      addHistoryRecord({
        tool: toolName || (activeFileName.endsWith(".pdf") ? "PDF Studio" : "Image Studio"),
        fileName: activeFileName,
        blob: activeBlob,
        newSize: activeBlob.size,
        origSize: origSize || 0,
      });
    }
  }, [activeBlob, activeFileName, toolName, origSize]);

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!activeBlob) return;
    const url = URL.createObjectURL(activeBlob);
    const a   = document.createElement("a");
    a.href = url; a.download = activeFileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // ── Open Drive modal (or sign-in first) ────────────────────────────────────
  const handleDriveClick = async () => {
    if (!activeBlob) return;
    if (!isSignedIn) {
      await auth?.signIn?.();
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
      const result = await auth.uploadToDrive(activeBlob, editedName, folderId);
      setDriveLink(result.webViewLink);
      setDriveStatus("success");
    } catch (err) {
      setDriveError(err.message || "Upload failed. Try again.");
      setDriveStatus("error");
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!activeBlob) return;

    // Detect MIME type (from blob or extension fallback)
    let mimeType = activeBlob.type || resultMime;
    if (!mimeType || mimeType === "application/octet-stream") {
      if (activeFileName.endsWith(".pdf")) mimeType = "application/pdf";
      else if (activeFileName.endsWith(".png")) mimeType = "image/png";
      else if (activeFileName.endsWith(".jpg") || activeFileName.endsWith(".jpeg")) mimeType = "image/jpeg";
      else if (activeFileName.endsWith(".webp")) mimeType = "image/webp";
      else if (activeFileName.endsWith(".zip")) mimeType = "application/zip";
      else if (activeFileName.endsWith(".txt")) mimeType = "text/plain";
      else if (activeFileName.endsWith(".json")) mimeType = "application/json";
      else mimeType = "application/octet-stream";
    }

    // 1. Native Web Share API Level 2 (Direct File Share)
    if (typeof navigator !== "undefined" && navigator.canShare && typeof File !== "undefined") {
      try {
        const fileObj = new File([activeBlob], activeFileName, { type: mimeType });
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            files: [fileObj],
            title: activeFileName,
            text: `Processed with FlashCrush (${activeFileName})`,
          });
          setShared("shared");
          setTimeout(() => setShared(false), 3000);
          return;
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return; // User dismissed share dialog
        }
      }
    }

    // 2. Fallback: Image Clipboard Copy
    if (mimeType.startsWith("image/") && navigator.clipboard && typeof ClipboardItem !== "undefined") {
      try {
        let pngBlob = activeBlob;
        if (mimeType !== "image/png") {
          const bitmap = await createImageBitmap(activeBlob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          pngBlob = await new Promise(r => canvas.toBlob(r, "image/png"));
        }
        if (pngBlob) {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob })
          ]);
          setShared("copied-image");
          setTimeout(() => setShared(false), 3000);
          return;
        }
      } catch (e) {
        // Clipboard write failed, proceed to link fallback
      }
    }

    // 3. Fallback: Copy link
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared("copied-link");
      setTimeout(() => setShared(false), 3000);
    } catch {
      setShared("copied-link");
      setTimeout(() => setShared(false), 3000);
    }
  };

  const driveButtonLabel = () => {
    if (!isSignedIn)                  return "Sign in to Save to Drive";
    if (driveStatus === "uploading")  return "Uploading…";
    if (driveStatus === "success")    return "Saved to Drive ✓";
    const name = auth?.user?.name?.split(" ")[0] || auth?.user?.email?.split("@")[0] || "your account";
    return `Save to Drive  ·  ${name}`;
  };

  const isDriveDisabled =
    driveStatus === "uploading" ||
    driveStatus === "success"   ||
    driveStatus === "modal"     ||
    auth?.authStatus === "loading";

  const getShareButtonLabel = () => {
    if (shared === "shared") return "✓ Shared successfully!";
    if (shared === "copied-image") return "✓ Image copied to clipboard!";
    if (shared === "copied-link" || shared === true) return "✓ Link copied!";
    return "↗ Share file";
  };

  return (
    <>
      {/* Pre-upload modal */}
      {driveStatus === "modal" && (
        <DriveUploadModal
          initialFileName={activeFileName}
          auth={auth}
          onConfirm={handleModalConfirm}
          onClose={() => setDriveStatus("idle")}
        />
      )}

      <div className="flex flex-col gap-3 w-full font-sans mt-6">
        
        {/* Download */}
        <button 
          className="w-full rounded-full py-3.5 px-4 text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary shadow-m3-elevation-1 hover:shadow-m3-elevation-2 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          onClick={handleDownload}
        >
          ⬇ Download file
        </button>

        {/* Save to Drive */}
        <button
          className="w-full rounded-full py-3.5 px-4 text-sm font-medium bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant/60 hover:bg-m3-surface-container-highest shadow-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleDriveClick}
          disabled={isDriveDisabled}
        >
          <DriveIcon />
          {auth?.authStatus === "loading" ? "Signing in…" : driveButtonLabel()}
          {isSignedIn && driveStatus === "idle" && (
            <span className="ml-auto opacity-60">
              <EditIcon />
            </span>
          )}
        </button>

        {/* Drive feedback */}
        {driveStatus === "success" && driveLink && (
          <div className="mt-1 px-4 py-3 rounded-2xl bg-m3-secondary-container/60 border border-m3-primary/30 text-m3-on-secondary-container text-sm font-medium flex items-center justify-between shadow-sm">
            <span>✓ Saved to {auth?.user?.email || "your Drive"}!</span>
            <a href={driveLink} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline text-m3-primary">
              Open in Drive →
            </a>
          </div>
        )}
        {driveStatus === "error" && driveError && (
          <div className="mt-1 px-4 py-3 rounded-2xl bg-m3-error-container/60 border border-m3-error/30 text-m3-on-error-container text-sm font-medium flex items-center justify-between shadow-sm">
            <span>⚠ {driveError}</span>
            <span
              className="cursor-pointer underline font-bold"
              onClick={() => setDriveStatus("modal")}
            >
              Retry
            </span>
          </div>
        )}

        {/* Share */}
        <button 
          className={`w-full rounded-full py-3.5 px-4 text-sm font-medium transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-sm ${
            shared 
              ? 'bg-m3-secondary-container text-m3-on-secondary-container border border-m3-primary/40' 
              : 'bg-m3-surface-container-high text-m3-on-surface border border-m3-outline-variant/60 hover:bg-m3-surface-container-highest'
          }`} 
          onClick={handleShare}
        >
          {getShareButtonLabel()}
        </button>

        {/* Reset */}
        {onReset && (
          <button 
            className="w-full rounded-full py-3 px-4 text-sm font-medium bg-m3-surface-container-low text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-high border border-m3-outline-variant/40 shadow-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 mt-1" 
            onClick={onReset}
          >
            ↺ Process another file
          </button>
        )}

      </div>
    </>
  );
}
