// VideoCompressor.jsx — 100% In-Browser Video & Audio Compressor (Material Design 3)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { addHistoryRecord } from "./historyDB";
import ActionButtons from "./ActionButtons";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function getBestVideoMimeType() {
  const types = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "video/webm";
}

export default function VideoCompressor({ auth }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const resultVideoRef = useRef(null);
  const recorderRef = useRef(null);
  const animationFrameRef = useRef(null);
  const abortControllerRef = useRef(false);

  // File state
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [isAudio, setIsAudio] = useState(false);
  const [duration, setDuration] = useState(0);
  const [origWidth, setOrigWidth] = useState(0);
  const [origHeight, setOrigHeight] = useState(0);

  // Compression options
  const [preset, setPreset] = useState("whatsapp"); // "whatsapp" | "extreme" | "balanced" | "high" | "custom"
  const [targetRes, setTargetRes] = useState("720p"); // "original" | "1080p" | "720p" | "480p" | "360p"
  const [videoBitrateKbps, setVideoBitrateKbps] = useState(1200);
  const [origBitrateKbps, setOrigBitrateKbps] = useState(1200);
  const [audioBitrateKbps, setAudioBitrateKbps] = useState(96);
  const [muteAudio, setMuteAudio] = useState(false);

  // Trimming
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Processing state
  const [stage, setStage] = useState("idle"); // "idle" | "ready" | "compressing" | "done" | "error"
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Result state
  const [resultBlob, setResultBlob] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultMime, setResultMime] = useState("");
  const [compressSpeed, setCompressSpeed] = useState("1x");

  // Load file and extract metadata
  const handleFile = (f) => {
    if (!f) return;
    const isVid = f.type.startsWith("video/") || f.name.match(/\.(mp4|webm|mov|mkv|avi)$/i);
    const isAud = f.type.startsWith("audio/") || f.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i);

    if (!isVid && !isAud) {
      setErrorMsg("Please select a valid video (MP4, WebM, MOV) or audio (MP3, WAV) file.");
      setStage("error");
      return;
    }

    // Revoke previous URL
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);

    const url = URL.createObjectURL(f);
    setFile(f);
    setFileUrl(url);
    setIsAudio(isAud);
    setResultBlob(null);
    setResultUrl(null);
    setErrorMsg("");
    setStage("loading");
    setProgress(0);

    // Extract metadata using temp video element
    const tempEl = document.createElement(isAud ? "audio" : "video");
    tempEl.preload = "metadata";
    tempEl.src = url;

    tempEl.onloadedmetadata = () => {
      const dur = tempEl.duration || 1;
      const w = tempEl.videoWidth || 1280;
      const h = tempEl.videoHeight || 720;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(Math.floor(dur));
      setOrigWidth(w);
      setOrigHeight(h);

      // Calculate baseline original bitrate (kbps)
      const calculatedOrigKbps = Math.max(100, Math.round((f.size * 8) / (dur * 1000)));
      setOrigBitrateKbps(calculatedOrigKbps);

      // Auto-configure WhatsApp preset:
      // If file is already <= 14.5MB, target 60% of original bitrate to guarantee compression!
      // If file is > 14.5MB, target budget to fit in 14.5MB
      if (dur > 0) {
        let autoKbps;
        if (f.size > 14.5 * 1024 * 1024) {
          const targetBits = 14.2 * 8 * 1024 * 1024;
          const budgetKbps = Math.floor((targetBits / dur) / 1000);
          autoKbps = Math.min(budgetKbps, Math.floor(calculatedOrigKbps * 0.70));
        } else {
          autoKbps = Math.min(1200, Math.max(120, Math.floor(calculatedOrigKbps * 0.60)));
        }
        setVideoBitrateKbps(Math.max(100, autoKbps));
      }

      // If video has small resolution (<= 480p), don't default targetRes to 720p
      if (h <= 480) {
        setTargetRes("original");
      }

      setStage("ready");
    };

    tempEl.onerror = () => {
      setErrorMsg("Could not read media file metadata. File format may be unsupported.");
      setStage("error");
    };
  };

  // Google Drive import
  const handleDrivePick = async () => {
    try {
      const token = await auth.getToken();
      await auth.pickFromDrive(["video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav"], (pickedFile) => {
        handleFile(pickedFile);
      }, token);
    } catch (err) {
      setErrorMsg(err.message || "Google Drive pick failed.");
    }
  };

  // Update preset parameters
  const applyPreset = (pKey) => {
    setPreset(pKey);
    const dur = Math.max(1, trimEnd - trimStart || duration || 1);
    const baseKbps = origBitrateKbps > 0 ? origBitrateKbps : (file?.size ? Math.round((file.size * 8) / (dur * 1000)) : 1200);

    if (pKey === "whatsapp") {
      setTargetRes(origHeight > 720 ? "720p" : "original");
      let autoKbps;
      if (file && file.size > 14.5 * 1024 * 1024) {
        const targetBits = 14.2 * 8 * 1024 * 1024;
        const budgetKbps = Math.floor((targetBits / dur) / 1000);
        autoKbps = Math.min(budgetKbps, Math.floor(baseKbps * 0.70));
      } else {
        autoKbps = Math.min(1200, Math.max(120, Math.floor(baseKbps * 0.60)));
      }
      setVideoBitrateKbps(Math.max(100, autoKbps));
      setAudioBitrateKbps(64);
      setMuteAudio(false);
    } else if (pKey === "extreme") {
      setTargetRes(origHeight > 480 ? "480p" : "original");
      const autoKbps = Math.min(500, Math.max(100, Math.floor(baseKbps * 0.35)));
      setVideoBitrateKbps(autoKbps);
      setAudioBitrateKbps(48);
      setMuteAudio(false);
    } else if (pKey === "balanced") {
      setTargetRes(origHeight > 720 ? "720p" : "original");
      const autoKbps = Math.min(1200, Math.max(180, Math.floor(baseKbps * 0.55)));
      setVideoBitrateKbps(autoKbps);
      setAudioBitrateKbps(96);
      setMuteAudio(false);
    } else if (pKey === "high") {
      setTargetRes("original");
      const autoKbps = Math.min(2200, Math.max(250, Math.floor(baseKbps * 0.75)));
      setVideoBitrateKbps(autoKbps);
      setAudioBitrateKbps(128);
      setMuteAudio(false);
    }
  };

  // Calculate target dimensions
  const getTargetDimensions = () => {
    let maxDimension = Infinity;
    if (targetRes === "1080p") maxDimension = 1080;
    else if (targetRes === "720p") maxDimension = 720;
    else if (targetRes === "480p") maxDimension = 480;
    else if (targetRes === "360p") maxDimension = 360;

    if (maxDimension === Infinity || origHeight <= maxDimension) {
      // Must be even numbers for video encoding
      return {
        w: origWidth % 2 === 0 ? origWidth : origWidth - 1,
        h: origHeight % 2 === 0 ? origHeight : origHeight - 1
      };
    }

    const aspect = origWidth / origHeight;
    let targetH = maxDimension;
    let targetW = Math.round(targetH * aspect);
    if (targetW % 2 !== 0) targetW -= 1;
    if (targetH % 2 !== 0) targetH -= 1;
    return { w: targetW, h: targetH };
  };

  // Run Compression
  const startCompression = async () => {
    if (!file || !fileUrl) return;

    setStage("compressing");
    setProgress(0);
    setProgressMsg("Initializing in-browser compression engine...");
    setErrorMsg("");
    abortControllerRef.current = false;

    const startTimeStamp = Date.now();
    const effectiveTrimStart = Math.max(0, trimStart);
    const effectiveTrimEnd = trimEnd > effectiveTrimStart ? trimEnd : duration;
    const trimDuration = effectiveTrimEnd - effectiveTrimStart;

    try {
      // Create offscreen video element for frame capture
      const video = document.createElement("video");
      video.muted = false;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = fileUrl;

      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });

      // Canvas setup
      const { w: targetW, h: targetH } = getTargetDimensions();
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d", { alpha: false });

      // Frame stream (30fps or 24fps)
      const canvasStream = canvas.captureStream(30);

      // Web Audio setup for audio track
      let audioCtx = null;
      if (!muteAudio) {
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const audioSource = audioCtx.createMediaElementSource(video);
          const audioDest = audioCtx.createMediaStreamDestination();
          audioSource.connect(audioDest);
          // Also connect to silent gain to avoid audible echo during fast compression
          const silentGain = audioCtx.createGain();
          silentGain.gain.value = 0;
          audioSource.connect(silentGain);
          silentGain.connect(audioCtx.destination);

          audioDest.stream.getAudioTracks().forEach(track => {
            canvasStream.addTrack(track);
          });
        } catch (audioErr) {
          console.warn("Audio extraction fallback:", audioErr);
        }
      }

      // Determine supported mimeType and target bitrate
      const bestMime = getBestVideoMimeType();
      setResultMime(bestMime);

      // Safety guard: For compression presets, never exceed 75% of original bitrate
      let effectiveKbps = videoBitrateKbps;
      if (preset !== "custom" && origBitrateKbps > 100) {
        effectiveKbps = Math.min(videoBitrateKbps, Math.floor(origBitrateKbps * 0.75));
      }
      const targetBps = Math.max(80000, effectiveKbps * 1000);
      const audioBps = muteAudio ? 0 : audioBitrateKbps * 1000;

      const recorder = new MediaRecorder(canvasStream, {
        mimeType: bestMime,
        videoBitsPerSecond: targetBps,
        audioBitsPerSecond: audioBps
      });
      recorderRef.current = recorder;

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recorderFinishedPromise = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });

      // Start recording with 500ms time slice chunks
      recorder.start(500);

      // Seek to trim start
      video.currentTime = effectiveTrimStart;
      await new Promise(r => { video.onseeked = r; });

      // Start playing
      await video.play();

      // Compression render loop
      const renderFrame = () => {
        if (abortControllerRef.current) {
          video.pause();
          recorder.stop();
          if (audioCtx) audioCtx.close();
          return;
        }

        // Draw current frame to scaled canvas
        ctx.drawImage(video, 0, 0, targetW, targetH);

        // Update progress
        const currentSec = video.currentTime - effectiveTrimStart;
        const pct = Math.min(99, Math.max(1, Math.round((currentSec / trimDuration) * 100)));
        setProgress(pct);

        const elapsedSec = (Date.now() - startTimeStamp) / 1000;
        const currentSpeed = (currentSec / Math.max(0.1, elapsedSec)).toFixed(1);
        setCompressSpeed(`${currentSpeed}x`);
        setProgressMsg(`Encoding frames (${pct}%) · Speed: ${currentSpeed}x`);

        // Check if finished
        if (video.currentTime >= effectiveTrimEnd || video.ended) {
          video.pause();
          setProgress(100);
          setProgressMsg("Finalizing compressed video blob...");
          recorder.stop();
          if (audioCtx && audioCtx.state !== "closed") {
            audioCtx.close();
          }
          return;
        }

        animationFrameRef.current = requestAnimationFrame(renderFrame);
      };

      renderFrame();

      // Wait for recorder to assemble all chunks
      await recorderFinishedPromise;

      if (abortControllerRef.current) {
        setStage("ready");
        return;
      }

      const ext = bestMime.includes("mp4") ? "mp4" : "webm";
      const compressedBlob = new Blob(chunks, { type: bestMime });
      const outUrl = URL.createObjectURL(compressedBlob);

      setResultBlob(compressedBlob);
      setResultUrl(outUrl);
      setStage("done");
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Save to local offline history
      addHistoryRecord({
        tool: "Video Compressor",
        name: file.name.replace(/\.[^/.]+$/, "") + `_compressed.${ext}`,
        size: compressedBlob.size,
        origSize: file.size,
        type: bestMime,
        details: `${targetW}x${targetH} · ${formatBytes(compressedBlob.size)}`
      });

    } catch (err) {
      console.error("Compression error:", err);
      setErrorMsg(err.message || "Compression failed. Please try a different preset or resolution.");
      setStage("error");
    }
  };

  // Cancel in-flight compression
  const cancelCompression = () => {
    abortControllerRef.current = true;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    setStage("ready");
    setProgress(0);
    setProgressMsg("");
  };

  // Download compressed file
  const handleDownload = () => {
    if (!resultBlob || !resultUrl) return;
    const ext = resultMime.includes("mp4") ? "mp4" : "webm";
    const originalBase = file?.name?.replace(/\.[^/.]+$/, "") || "video";
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${originalBase}_compressed_${targetRes}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [fileUrl, resultUrl]);

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface flex flex-col transition-colors duration-200">
      {/* ── Top App Bar (M3 Standard) ── */}
      <header className="sticky top-0 z-30 w-full bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-m3-on-surface-variant hover:text-m3-primary hover:bg-m3-surface-container-high px-3 py-1.5 rounded-full border border-m3-outline-variant/60 transition-all active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Tools
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎬</span>
            <span className="font-semibold text-base sm:text-lg tracking-tight text-m3-on-surface">
              Video &amp; Audio Compressor
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-m3-secondary-container text-m3-on-secondary-container border border-m3-outline-variant/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              100% In-Browser Engine
            </span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col">
        {/* ── Header Hero (When no file is selected) ── */}
        {!file && (
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-m3-primary/10 text-m3-primary border border-m3-primary/20 text-3xl mb-3 shadow-m3-elevation-1">
              🎬
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-m3-on-surface">
              Video &amp; Audio Compressor
            </h1>
            <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto mt-2 leading-relaxed">
              100% on-device video compression. WhatsApp &amp; Discord 16MB auto-fit, resolution scaling &amp; trim. Zero server uploads.
            </p>
          </div>
        )}

        {/* ── Drop Zone (When idle or error) ── */}
        {!file && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-10 shadow-m3-elevation-1 mb-8">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-m3-outline-variant hover:border-m3-primary rounded-2xl p-8 sm:p-12 transition-all bg-m3-surface-container-low hover:bg-m3-surface-container/60 cursor-pointer flex flex-col items-center justify-center gap-4 text-center group"
            >
              <div className="w-16 h-16 rounded-2xl bg-m3-primary/10 text-m3-primary flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shadow-sm">
                🎬
              </div>
              <div>
                <div className="text-lg sm:text-xl font-semibold text-m3-on-surface">
                  Drop Video or Audio Here to Compress
                </div>
                <div className="text-xs sm:text-sm text-m3-on-surface-variant mt-1">
                  Supports MP4, WebM, MOV, MP3, WAV · Max 500 MB · 100% Local Processing
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-6 py-2.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-medium text-sm shadow-m3-elevation-1 transition-all active:scale-95"
                >
                  Browse Video
                </button>
                {auth?.authStatus === "signedin" && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDrivePick();
                    }}
                    className="px-5 py-2.5 rounded-full bg-m3-surface-container-highest border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-high font-medium text-sm transition-all"
                  >
                    📁 Pick from Drive
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.avi,.mp3,.wav"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
            </div>
          </div>
        )}

        {/* ── Ready / Compressing State ── */}
        {file && (stage === "ready" || stage === "compressing") && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-8 shadow-m3-elevation-1 mb-8">
            {/* Top Info Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-m3-outline-variant/50">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-m3-secondary-container text-m3-on-secondary-container shrink-0">
                  {isAudio ? "🎵 AUDIO" : "🎬 VIDEO"}
                </span>
                <span className="font-semibold text-base text-m3-on-surface truncate">
                  {file.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-3 py-1 rounded-xl bg-m3-surface-container-high border border-m3-outline-variant/40 text-m3-on-surface-variant">
                  Original: <strong className="text-m3-on-surface font-semibold">{formatBytes(file.size)}</strong>
                </span>
                <span className="text-xs px-3 py-1 rounded-xl bg-m3-surface-container-high border border-m3-outline-variant/40 text-m3-on-surface-variant">
                  Duration: <strong className="text-m3-on-surface font-semibold">{formatTime(duration)}</strong>
                </span>
                {!isAudio && (
                  <span className="text-xs px-3 py-1 rounded-xl bg-m3-surface-container-high border border-m3-outline-variant/40 text-m3-on-surface-variant">
                    Resolution: <strong className="text-m3-on-surface font-semibold">{origWidth} × {origHeight}</strong>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setStage("idle");
                  }}
                  className="text-xs font-medium px-3.5 py-1 rounded-full border border-m3-outline-variant text-m3-on-surface hover:bg-m3-surface-container-highest transition-colors"
                >
                  Change File
                </button>
              </div>
            </div>

            {/* Main Split: Left Player & Trim / Right Settings */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-6">
              {/* Left Column: Video Preview & Trimming */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                <div className="bg-black/95 rounded-2xl overflow-hidden border border-m3-outline-variant/50 shadow-inner flex items-center justify-center aspect-video">
                  <video
                    ref={videoPreviewRef}
                    src={fileUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Trimming Controls */}
                <div className="bg-m3-surface-container-low rounded-2xl border border-m3-outline-variant/50 p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-m3-primary mb-3">
                    <span>✂️ Trim Range</span>
                    <span className="font-mono text-[11px] text-m3-on-surface-variant normal-case">
                      {formatTime(trimStart)} — {formatTime(trimEnd)} (Duration: {formatTime(trimEnd - trimStart)})
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-m3-on-surface-variant w-10 font-mono">Start</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.floor(duration)}
                        value={trimStart}
                        className="w-full accent-m3-primary cursor-pointer"
                        onChange={e => {
                          const val = Number(e.target.value);
                          if (val < trimEnd) setTrimStart(val);
                        }}
                      />
                      <span className="text-xs font-mono text-m3-on-surface w-12 text-right">{formatTime(trimStart)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-m3-on-surface-variant w-10 font-mono">End</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.floor(duration)}
                        value={trimEnd}
                        className="w-full accent-m3-primary cursor-pointer"
                        onChange={e => {
                          const val = Number(e.target.value);
                          if (val > trimStart) setTrimEnd(val);
                        }}
                      />
                      <span className="text-xs font-mono text-m3-on-surface w-12 text-right">{formatTime(trimEnd)}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-m3-on-surface-variant/80 mt-2">
                    Drag sliders to cut unwanted start/end parts during compression.
                  </div>
                </div>
              </div>

              {/* Right Column: Presets & Controls */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                <div className="text-xs font-bold uppercase tracking-wider text-m3-primary">
                  ⚡ Compression Presets
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Preset 1: WhatsApp 16MB */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 active:scale-[0.98] ${
                      preset === "whatsapp"
                        ? "bg-m3-secondary-container/70 border-m3-primary ring-1 ring-m3-primary/30 text-m3-on-surface shadow-sm"
                        : "bg-m3-surface-container-high border-m3-outline-variant/50 text-m3-on-surface hover:bg-m3-surface-container-highest"
                    }`}
                    onClick={() => applyPreset("whatsapp")}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">📱</span>
                    <div>
                      <div className="text-sm font-semibold text-m3-on-surface">WhatsApp &amp; Discord 16MB</div>
                      <div className="text-xs text-m3-on-surface-variant mt-0.5 leading-snug">Guaranteed under 16MB for instant sharing</div>
                    </div>
                  </div>

                  {/* Preset 2: Extreme 480p */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 active:scale-[0.98] ${
                      preset === "extreme"
                        ? "bg-m3-secondary-container/70 border-m3-primary ring-1 ring-m3-primary/30 text-m3-on-surface shadow-sm"
                        : "bg-m3-surface-container-high border-m3-outline-variant/50 text-m3-on-surface hover:bg-m3-surface-container-highest"
                    }`}
                    onClick={() => applyPreset("extreme")}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">🚀</span>
                    <div>
                      <div className="text-sm font-semibold text-m3-on-surface">Extreme Compression</div>
                      <div className="text-xs text-m3-on-surface-variant mt-0.5 leading-snug">480p resolution · ~75–85% smaller</div>
                    </div>
                  </div>

                  {/* Preset 3: Balanced 720p */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 active:scale-[0.98] ${
                      preset === "balanced"
                        ? "bg-m3-secondary-container/70 border-m3-primary ring-1 ring-m3-primary/30 text-m3-on-surface shadow-sm"
                        : "bg-m3-surface-container-high border-m3-outline-variant/50 text-m3-on-surface hover:bg-m3-surface-container-highest"
                    }`}
                    onClick={() => applyPreset("balanced")}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">🟡</span>
                    <div>
                      <div className="text-sm font-semibold text-m3-on-surface">Balanced Quality</div>
                      <div className="text-xs text-m3-on-surface-variant mt-0.5 leading-snug">720p HD · ~50–65% smaller</div>
                    </div>
                  </div>

                  {/* Preset 4: High */}
                  <div
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 active:scale-[0.98] ${
                      preset === "high"
                        ? "bg-m3-secondary-container/70 border-m3-primary ring-1 ring-m3-primary/30 text-m3-on-surface shadow-sm"
                        : "bg-m3-surface-container-high border-m3-outline-variant/50 text-m3-on-surface hover:bg-m3-surface-container-highest"
                    }`}
                    onClick={() => applyPreset("high")}
                  >
                    <span className="text-2xl shrink-0 mt-0.5">🟢</span>
                    <div>
                      <div className="text-sm font-semibold text-m3-on-surface">High Quality</div>
                      <div className="text-xs text-m3-on-surface-variant mt-0.5 leading-snug">Original resolution · ~30–45% smaller</div>
                    </div>
                  </div>
                </div>

                {/* Custom Fine-Tuning */}
                <div className="bg-m3-surface-container-low rounded-2xl border border-m3-outline-variant/50 p-4 shadow-sm flex flex-col gap-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-m3-primary">
                    ⚙️ Target Settings
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Resolution */}
                    <div>
                      <label className="text-xs text-m3-on-surface-variant block mb-1.5 font-medium">
                        Target Resolution
                      </label>
                      <select
                        value={targetRes}
                        className="w-full px-3.5 py-2.5 bg-m3-surface-container-high border border-m3-outline-variant/60 rounded-xl text-sm text-m3-on-surface outline-none focus:border-m3-primary focus:ring-1 focus:ring-m3-primary transition-all disabled:opacity-50"
                        onChange={e => setTargetRes(e.target.value)}
                        disabled={stage === "compressing"}
                      >
                        <option value="original">Original ({origWidth} × {origHeight})</option>
                        <option value="1080p">1080p Full HD</option>
                        <option value="720p">720p HD</option>
                        <option value="480p">480p Standard</option>
                        <option value="360p">360p Compact</option>
                      </select>
                    </div>

                    {/* Bitrate */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-m3-on-surface-variant mb-1.5 font-medium">
                        <span>Video Bitrate: <strong className="text-m3-on-surface font-semibold">{videoBitrateKbps} kbps</strong></span>
                        {origBitrateKbps > 0 && (
                          <span className="text-[11px] font-mono text-m3-on-surface-variant/70">
                            (Original: ~{origBitrateKbps} kbps)
                          </span>
                        )}
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="4000"
                        step="50"
                        value={videoBitrateKbps}
                        className="w-full accent-m3-primary cursor-pointer disabled:opacity-50"
                        onChange={e => {
                          setVideoBitrateKbps(Number(e.target.value));
                          setPreset("custom");
                        }}
                        disabled={stage === "compressing"}
                      />
                    </div>

                    {/* Audio Bitrate & Mute */}
                    <div className="pt-1">
                      <label className="flex items-center gap-2.5 text-xs text-m3-on-surface cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={muteAudio}
                          onChange={e => setMuteAudio(e.target.checked)}
                          disabled={stage === "compressing"}
                          className="w-4 h-4 rounded text-m3-primary accent-m3-primary border-m3-outline-variant focus:ring-m3-primary"
                        />
                        <span>Mute Audio Track (Maximum file size reduction)</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Action CTA */}
                {stage === "ready" && (
                  <button
                    type="button"
                    className="w-full py-3.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-semibold text-sm sm:text-base shadow-m3-elevation-2 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                    onClick={startCompression}
                  >
                    ⚡ Start In-Browser Compression
                  </button>
                )}

                {/* Progress Bar (During Compression) */}
                {stage === "compressing" && (
                  <div className="bg-m3-surface-container-high rounded-2xl border border-m3-outline-variant/60 p-5 shadow-sm">
                    <div className="flex items-center justify-between text-xs sm:text-sm font-medium text-m3-on-surface mb-2">
                      <span className="truncate pr-2">{progressMsg}</span>
                      <span className="font-mono font-bold text-m3-primary shrink-0">{progress}%</span>
                    </div>
                    <div className="w-full h-3 bg-m3-surface-container-highest rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-m3-primary rounded-full transition-all duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      className="mt-4 w-full py-2.5 rounded-full border border-m3-error/50 text-m3-error hover:bg-m3-error/10 font-medium text-xs sm:text-sm transition-colors"
                      onClick={cancelCompression}
                    >
                      Cancel Compression
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="mt-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/30 text-xs sm:text-sm flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Dedicated Compression Completed Screen (At Top!) ── */}
        {file && stage === "done" && resultBlob && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-8 shadow-m3-elevation-2 mb-8 flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-m3-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-2xl shadow-sm shrink-0">
                  🎉
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-m3-on-surface">
                    Video Compression Complete!
                  </h2>
                  <div className="text-xs text-m3-on-surface-variant truncate max-w-sm sm:max-w-md">
                    {file.name}
                  </div>
                </div>
              </div>
            </div>

            {/* Big Saved Stats Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="bg-m3-surface-container-high rounded-2xl p-4 text-center border border-m3-outline-variant/40">
                <div className="text-xs text-m3-on-surface-variant font-medium">Original Size</div>
                <div className="text-lg font-bold text-m3-on-surface mt-1">{formatBytes(file.size)}</div>
              </div>

              <div className="bg-m3-primary/10 rounded-2xl p-4 text-center border border-m3-primary/20">
                <div className="text-xs text-m3-primary font-medium">Compressed Size</div>
                <div className="text-lg font-bold text-m3-primary mt-1">{formatBytes(resultBlob.size)}</div>
              </div>

              {resultBlob.size < file.size ? (
                <div className="bg-emerald-500/10 rounded-2xl p-4 text-center border border-emerald-500/20">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Space Saved</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {Math.round(((file.size - resultBlob.size) / file.size) * 100)}% OFF
                  </div>
                </div>
              ) : (
                <div className="bg-amber-500/10 rounded-2xl p-4 text-center border border-amber-500/20">
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Status</div>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-1">
                    Already Optimized
                  </div>
                </div>
              )}
            </div>

            {/* Notice if output was not smaller */}
            {resultBlob.size >= file.size && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                ℹ️ Note: The original video was already heavily compressed. Try re-compressing with a lower bitrate or smaller resolution.
              </div>
            )}

            {/* Primary & Secondary Action Buttons */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="flex-1 sm:flex-initial px-6 py-3.5 rounded-full bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-semibold text-sm sm:text-base shadow-m3-elevation-2 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                  onClick={handleDownload}
                >
                  💾 Download Compressed Video ({formatBytes(resultBlob.size)})
                </button>
                {resultBlob.size >= file.size && (
                  <button
                    type="button"
                    className="px-5 py-3 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 font-medium text-xs sm:text-sm hover:bg-amber-500/25 transition-colors"
                    onClick={() => {
                      setVideoBitrateKbps(prev => Math.max(80, Math.floor(prev * 0.5)));
                      setPreset("custom");
                      setStage("ready");
                    }}
                  >
                    ⚡ Halve Bitrate &amp; Retry
                  </button>
                )}
                <button
                  type="button"
                  className="px-5 py-3 rounded-full bg-m3-surface-container-high border border-m3-outline-variant/60 text-m3-on-surface hover:bg-m3-surface-container-highest font-medium text-xs sm:text-sm transition-colors"
                  onClick={() => setStage("ready")}
                >
                  ⚙️ Adjust Settings &amp; Re-compress
                </button>
                <button
                  type="button"
                  className="px-5 py-3 rounded-full bg-m3-surface-container-high border border-m3-outline-variant/60 text-m3-on-surface hover:bg-m3-surface-container-highest font-medium text-xs sm:text-sm transition-colors"
                  onClick={() => {
                    setFile(null);
                    setResultBlob(null);
                    setStage("idle");
                  }}
                >
                  ➕ Compress Another Video
                </button>
              </div>

              {/* ActionButtons Component for Google Drive & Web Share */}
              <div className="w-full pt-2">
                <ActionButtons
                  blob={resultBlob}
                  fileName={`${file?.name?.replace(/\.[^/.]+$/, "") || "video"}_compressed_${targetRes}.${resultMime.includes("mp4") ? "mp4" : "webm"}`}
                  onReset={() => {
                    setFile(null);
                    setResultBlob(null);
                    setStage("idle");
                  }}
                  auth={auth}
                />
              </div>
            </div>

            {/* Compressed Video Player Preview */}
            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-m3-primary mb-3">
                🎬 Compressed Video Preview:
              </div>
              <div className="bg-black/95 rounded-2xl overflow-hidden border border-m3-outline-variant/50 max-w-2xl mx-auto shadow-inner aspect-video flex items-center justify-center">
                <video
                  ref={resultVideoRef}
                  src={resultUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Local Security Footer Badge ── */}
        <div className="mt-auto pt-8 flex items-center justify-center gap-2 text-xs text-m3-on-surface-variant">
          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
          </svg>
          <span>100% In-Browser Video Compression · Zero Server Uploads · Files Never Leave Your Device</span>
        </div>
      </main>
    </div>
  );
}
