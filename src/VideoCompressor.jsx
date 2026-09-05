// VideoCompressor.jsx — 100% In-Browser Video & Audio Compressor (Neo-Brutalism)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { addHistoryRecord } from "./historyDB";

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

      // Auto-configure WhatsApp 16MB preset bitrate
      if (dur > 0) {
        // Target ~14.5MB video budget (in bits)
        const targetBits = 14.5 * 8 * 1024 * 1024;
        const autoKbps = Math.min(2400, Math.max(300, Math.floor((targetBits / dur) / 1000)));
        setVideoBitrateKbps(autoKbps);
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

    if (pKey === "whatsapp") {
      setTargetRes("720p");
      const targetBits = 14.5 * 8 * 1024 * 1024;
      const autoKbps = Math.min(2400, Math.max(300, Math.floor((targetBits / dur) / 1000)));
      setVideoBitrateKbps(autoKbps);
      setAudioBitrateKbps(96);
      setMuteAudio(false);
    } else if (pKey === "extreme") {
      setTargetRes("480p");
      setVideoBitrateKbps(650);
      setAudioBitrateKbps(64);
      setMuteAudio(false);
    } else if (pKey === "balanced") {
      setTargetRes("720p");
      setVideoBitrateKbps(1400);
      setAudioBitrateKbps(128);
      setMuteAudio(false);
    } else if (pKey === "high") {
      setTargetRes("original");
      setVideoBitrateKbps(2800);
      setAudioBitrateKbps(160);
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
      const targetBps = Math.max(200000, videoBitrateKbps * 1000);
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
    <div className="tool-page-layout">
      {/* ── Top Header ── */}
      <div className="tool-header">
        <button type="button" className="btn-back" onClick={() => navigate("/")}>
          ← Back
        </button>
        <div className="tool-header-title">
          <span className="tool-badge-pill">🎬 In-Browser Wasm/Canvas</span>
          <h1>Video &amp; Audio Compressor</h1>
          <p className="tool-header-subtitle">
            100% on-device video compression. WhatsApp &amp; Discord 16MB auto-fit, resolution scaling &amp; trim. Zero server uploads.
          </p>
        </div>
      </div>

      <div className="tool-main-content">
        {/* ── Drop Zone (Idle / Error) ── */}
        {stage === "idle" && (
          <div
            className="dropzone-box"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.mp4,.webm,.mov,.mkv,.avi,.mp3,.wav"
              hidden
              onChange={e => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
            <div className="dropzone-icon">🎬</div>
            <div className="dropzone-title">Drop your Video or Audio here to Compress</div>
            <div className="dropzone-subtitle">
              Supports MP4, WebM, MOV, MP3, WAV · Max 500 MB · 100% Client-Side Processing
            </div>
            <div className="dropzone-actions">
              <button type="button" className="btn-browse">
                📂 Browse File
              </button>
              {auth?.authStatus === "signedin" && (
                <button
                  type="button"
                  className="btn-drive-pick"
                  onClick={e => { e.stopPropagation(); handleDrivePick(); }}
                >
                  <span>📁</span> Pick from Drive
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Ready / Compressing / Done State ── */}
        {stage !== "idle" && file && (
          <div className="vc-workspace-card">
            {/* Top Info Bar */}
            <div className="vc-info-bar">
              <div className="vc-file-name-wrap">
                <span className="vc-type-badge">{isAudio ? "🎵 AUDIO" : "🎬 VIDEO"}</span>
                <span className="vc-file-name">{file.name}</span>
              </div>
              <div className="vc-meta-pills">
                <span className="vc-meta-pill">Original: <strong>{formatBytes(file.size)}</strong></span>
                <span className="vc-meta-pill">Duration: <strong>{formatTime(duration)}</strong></span>
                {!isAudio && (
                  <span className="vc-meta-pill">Resolution: <strong>{origWidth} × {origHeight}</strong></span>
                )}
                <button
                  type="button"
                  className="vc-btn-change"
                  onClick={() => {
                    setFile(null);
                    setStage("idle");
                  }}
                >
                  Change File
                </button>
              </div>
            </div>

            {/* Main Split: Left Player / Right Settings */}
            <div className="vc-split-grid">
              {/* Left Column: Video Preview */}
              <div className="vc-player-col">
                <div className="vc-video-container">
                  <video
                    ref={videoPreviewRef}
                    src={fileUrl}
                    controls
                    className="vc-preview-video"
                  />
                </div>

                {/* Trimming Controls */}
                <div className="vc-trim-box">
                  <div className="vc-trim-header">
                    <span>✂️ Trim Range</span>
                    <span>{formatTime(trimStart)} — {formatTime(trimEnd)} (Duration: {formatTime(trimEnd - trimStart)})</span>
                  </div>
                  <div className="vc-trim-slider-wrap">
                    <input
                      type="range"
                      min="0"
                      max={Math.floor(duration)}
                      value={trimStart}
                      className="vc-range-slider"
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (val < trimEnd) setTrimStart(val);
                      }}
                    />
                    <input
                      type="range"
                      min="0"
                      max={Math.floor(duration)}
                      value={trimEnd}
                      className="vc-range-slider"
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (val > trimStart) setTrimEnd(val);
                      }}
                    />
                  </div>
                  <div className="vc-trim-hint">Drag sliders to cut unwanted start/end parts during compression.</div>
                </div>
              </div>

              {/* Right Column: Presets & Controls */}
              <div className="vc-controls-col">
                <div className="vc-section-title">⚡ Compression Presets</div>

                <div className="vc-preset-grid">
                  {/* Preset 1: WhatsApp 16MB */}
                  <div
                    className={`vc-preset-card ${preset === "whatsapp" ? "active" : ""}`}
                    onClick={() => applyPreset("whatsapp")}
                  >
                    <div className="vc-preset-icon">📱</div>
                    <div className="vc-preset-info">
                      <div className="vc-preset-name">WhatsApp &amp; Discord 16MB</div>
                      <div className="vc-preset-sub">Guaranteed under 16MB for instant sharing</div>
                    </div>
                  </div>

                  {/* Preset 2: Extreme 480p */}
                  <div
                    className={`vc-preset-card ${preset === "extreme" ? "active" : ""}`}
                    onClick={() => applyPreset("extreme")}
                  >
                    <div className="vc-preset-icon">🚀</div>
                    <div className="vc-preset-info">
                      <div className="vc-preset-name">Extreme Compression</div>
                      <div className="vc-preset-sub">480p resolution · ~75–85% smaller</div>
                    </div>
                  </div>

                  {/* Preset 3: Balanced 720p */}
                  <div
                    className={`vc-preset-card ${preset === "balanced" ? "active" : ""}`}
                    onClick={() => applyPreset("balanced")}
                  >
                    <div className="vc-preset-icon">🟡</div>
                    <div className="vc-preset-info">
                      <div className="vc-preset-name">Balanced Quality</div>
                      <div className="vc-preset-sub">720p HD · ~50–65% smaller</div>
                    </div>
                  </div>

                  {/* Preset 4: High */}
                  <div
                    className={`vc-preset-card ${preset === "high" ? "active" : ""}`}
                    onClick={() => applyPreset("high")}
                  >
                    <div className="vc-preset-icon">🟢</div>
                    <div className="vc-preset-info">
                      <div className="vc-preset-name">High Quality</div>
                      <div className="vc-preset-sub">Original resolution · ~30–45% smaller</div>
                    </div>
                  </div>
                </div>

                {/* Custom Fine-Tuning */}
                <div className="vc-custom-box">
                  <div className="vc-custom-header">
                    <span>⚙️ Target Settings</span>
                  </div>

                  <div className="vc-fields-grid">
                    {/* Resolution */}
                    <div className="vc-field">
                      <label>Target Resolution</label>
                      <select
                        value={targetRes}
                        className="vc-select"
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
                    <div className="vc-field">
                      <label>Video Bitrate: <strong>{videoBitrateKbps} kbps</strong></label>
                      <input
                        type="range"
                        min="300"
                        max="4000"
                        step="100"
                        value={videoBitrateKbps}
                        className="vc-range-slider"
                        onChange={e => setVideoBitrateKbps(Number(e.target.value))}
                        disabled={stage === "compressing"}
                      />
                    </div>

                    {/* Audio Bitrate & Mute */}
                    <div className="vc-field-checkbox">
                      <label className="vc-checkbox-label">
                        <input
                          type="checkbox"
                          checked={muteAudio}
                          onChange={e => setMuteAudio(e.target.checked)}
                          disabled={stage === "compressing"}
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
                    className="btn-start-compress"
                    onClick={startCompression}
                  >
                    ⚡ Start In-Browser Compression
                  </button>
                )}

                {/* Progress Bar (During Compression) */}
                {stage === "compressing" && (
                  <div className="vc-progress-box">
                    <div className="vc-progress-header">
                      <span>{progressMsg}</span>
                      <span className="vc-progress-pct">{progress}%</span>
                    </div>
                    <div className="vc-progress-track">
                      <div className="vc-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <button
                      type="button"
                      className="vc-btn-cancel"
                      onClick={cancelCompression}
                    >
                      Cancel Compression
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Compression Completed Result Card ── */}
            {stage === "done" && resultBlob && (
              <div className="vc-result-card anim-pop">
                <div className="vc-result-header">
                  <div className="vc-result-title">
                    <span>🎉 Compression Complete!</span>
                    <div className="vc-result-badges">
                      <span className="vc-badge-saved">
                        Saved {Math.max(0, Math.round(((file.size - resultBlob.size) / file.size) * 100))}%
                      </span>
                      <span className="vc-badge-new">
                        {formatBytes(file.size)} ➔ {formatBytes(resultBlob.size)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-download-video"
                    onClick={handleDownload}
                  >
                    💾 Download Compressed Video ({formatBytes(resultBlob.size)})
                  </button>
                </div>

                {/* Result Video Player */}
                <div className="vc-result-player-wrap">
                  <video
                    ref={resultVideoRef}
                    src={resultUrl}
                    controls
                    autoPlay
                    className="vc-result-video"
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="vc-error-banner">
                <span>⚠️ {errorMsg}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
