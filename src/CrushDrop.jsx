// CrushDrop.jsx — 100% P2P WebRTC File Transfer (Google Material 3 Architecture)
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Peer } from "peerjs";
import QRCode from "qrcode";

const CHUNK_SIZE = 64 * 1024; // 64KB chunks for stable WebRTC transfer

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function CrushDrop() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const targetPeerId = searchParams.get("peer");
  const isReceiver = !!targetPeerId;

  // PeerJS State
  const [peer, setPeer] = useState(null);
  const [myId, setMyId] = useState("");
  const [connection, setConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connStatus, setConnStatus] = useState("Initializing...");
  
  // Sender UI State
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinPeerId, setJoinPeerId] = useState("");

  // Transfer State
  const [fileToSend, setFileToSend] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0); // 0 to 100
  const [transferSpeed, setTransferSpeed] = useState(""); // e.g. "2.4 MB/s"
  const [incomingFile, setIncomingFile] = useState(null); // { name, size, mime, progress }
  const [downloadReadyUrl, setDownloadReadyUrl] = useState(null);
  const [downloadReadyName, setDownloadReadyName] = useState("");

  // Refs for tracking receiver buffers
  const incomingMetadata = useRef(null);
  const receivedBuffers = useRef([]);
  const receivedSize = useRef(0);
  const transferStartTime = useRef(Date.now());
  const lastChunkTime = useRef(Date.now());
  const lastChunkSize = useRef(0);

  // Initialize Peer
  useEffect(() => {
    const generateId = () => "crush-" + Math.random().toString(36).substring(2, 6) + "-" + Math.random().toString(36).substring(2, 6);
    const newId = generateId();
    
    const p = new Peer(newId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" }
        ]
      }
    });

    p.on("open", (id) => {
      setMyId(id);
      
      if (!isReceiver) {
        setConnStatus("Waiting for receiver to connect...");
        const link = `${window.location.origin}/drop?peer=${id}`;
        setShareLink(link);
        QRCode.toDataURL(link, { width: 220, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
          .then((url) => setQrCodeUrl(url));
      } else {
        setConnStatus(`Connecting to ${targetPeerId}...`);
        connectToPeer(p, targetPeerId);
      }
    });

    p.on("connection", (conn) => {
      setupConnection(conn);
    });

    p.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "peer-unavailable") {
        setConnStatus(`⚠️ Sender (${targetPeerId}) not found or offline.`);
      } else {
        setConnStatus(`Connection Error: ${err.type}`);
      }
    });

    setPeer(p);

    return () => {
      p.destroy();
    };
    // eslint-disable-next-line
  }, [isReceiver, targetPeerId]);

  const setupConnection = (conn) => {
    setConnection(conn);
    
    const markConnected = () => {
      setIsConnected(true);
      setConnStatus("🟢 Connected securely P2P!");
    };

    if (conn.open) {
      markConnected();
    } else {
      conn.on("open", markConnected);
    }

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      setConnStatus(`⚠️ Connection error: ${err.message || err.type || "failed"}`);
      setIsConnected(false);
    });

    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        const state = conn.peerConnection.iceConnectionState;
        console.log("[CrushDrop] ICE State:", state);
        if (state === "connected" || state === "completed") {
          markConnected();
        } else if (state === "failed") {
          setConnStatus("⚠️ Direct connection failed. Please tap Retry.");
          setIsConnected(false);
        } else if (state === "checking") {
          setConnStatus("🔄 Establishing secure P2P link...");
        }
      };
    }

    conn.on("data", (data) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "header") {
            // New incoming file
            incomingMetadata.current = msg;
            receivedBuffers.current = [];
            receivedSize.current = 0;
            transferStartTime.current = Date.now();
            setIncomingFile({ name: msg.name, size: msg.size, mime: msg.mime, progress: 0 });
            setDownloadReadyUrl(null);
          } else if (msg.type === "eof") {
            // File transfer complete
            const blob = new Blob(receivedBuffers.current, { type: incomingMetadata.current.mime });
            const url = URL.createObjectURL(blob);
            setDownloadReadyUrl(url);
            setDownloadReadyName(incomingMetadata.current.name);
            setIncomingFile(prev => ({ ...prev, progress: 100 }));
            
            // Auto download
            const a = document.createElement('a');
            a.href = url;
            a.download = incomingMetadata.current.name;
            a.click();
          }
        } catch(e) {
          console.error("Unknown string message", e);
        }
      } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        // Incoming chunk
        receivedBuffers.current.push(data);
        receivedSize.current += data.byteLength;
        
        const now = Date.now();
        const deltaMs = now - lastChunkTime.current;
        
        if (deltaMs > 250 || receivedSize.current === incomingMetadata.current.size) {
           // Update progress UI
           const pct = Math.round((receivedSize.current / incomingMetadata.current.size) * 100);
           setIncomingFile(prev => ({ ...prev, progress: pct }));
           
           // Calculate Speed
           const bytesSinceLast = receivedSize.current - lastChunkSize.current;
           const speedBps = (bytesSinceLast / deltaMs) * 1000;
           setTransferSpeed(`${formatBytes(speedBps)}/s`);
           
           lastChunkTime.current = now;
           lastChunkSize.current = receivedSize.current;
        }
      }
    });

    conn.on("close", () => {
      setConnStatus("🔴 Connection closed.");
      setIsConnected(false);
      setConnection(null);
    });
  };

  const connectToPeer = (p, targetId) => {
    const conn = p.connect(targetId);
    setupConnection(conn);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setFileToSend(file);
  };

  const sendFile = async () => {
    if (!fileToSend || !connection) return;

    // Send Header
    connection.send(JSON.stringify({
      type: "header",
      name: fileToSend.name,
      size: fileToSend.size,
      mime: fileToSend.type
    }));

    setTransferProgress(0);
    const startTime = Date.now();
    let offset = 0;

    const readSlice = (o) => {
      return new Promise((resolve) => {
        const slice = fileToSend.slice(o, o + CHUNK_SIZE);
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsArrayBuffer(slice);
      });
    };

    while (offset < fileToSend.size) {
      const chunk = await readSlice(offset);
      connection.send(chunk);
      offset += chunk.byteLength;
      
      const pct = Math.round((offset / fileToSend.size) * 100);
      setTransferProgress(pct);

      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      if (elapsed > 0.5) {
         setTransferSpeed(`${formatBytes(offset / elapsed)}/s`);
      }

      // Small throttle to prevent flooding WebRTC buffer
      await new Promise(r => setTimeout(r, 5));
    }

    // Send EOF
    connection.send(JSON.stringify({ type: "eof" }));
    setTransferProgress(100);
    setTransferSpeed("Complete!");
    setTimeout(() => {
      setFileToSend(null);
      setTransferProgress(0);
    }, 2000);
  };

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinPeer = (e) => {
    if (e) e.preventDefault();
    const cleanId = joinPeerId.trim();
    if (!cleanId || !peer) return;
    setConnStatus(`Connecting to ${cleanId}...`);
    connectToPeer(peer, cleanId);
  };

  // Determine status card theme style
  const getStatusStyle = () => {
    if (isConnected) {
      return "bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300";
    }
    if (connStatus.includes("Error") || connStatus.includes("⚠️") || connStatus.includes("🔴")) {
      return "bg-m3-error-container text-m3-on-error-container border-m3-error/30";
    }
    return "bg-m3-surface-container border-m3-outline-variant/60 text-m3-on-surface";
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-m3-surface text-m3-on-surface transition-colors duration-200">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-m3-surface/85 backdrop-blur-md border-b border-m3-outline-variant/40 px-4 lg:px-8 py-3.5 transition-colors">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button 
            type="button"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-all active:scale-[0.98] shadow-m3-elevation-1"
            onClick={() => navigate("/")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Tools
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-xl">🌐</span>
            <span className="font-semibold text-base sm:text-lg tracking-tight text-m3-on-surface">
              CrushDrop P2P
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-m3-secondary-container text-m3-on-secondary-container border border-m3-outline-variant/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              WebRTC Direct Sync
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col">
        
        {/* Header Hero Section */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-m3-primary/10 text-m3-primary border border-m3-primary/20 text-3xl mb-3 shadow-m3-elevation-1">
            🌐
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-m3-on-surface">
            CrushDrop P2P
          </h1>
          <p className="text-sm sm:text-base text-m3-on-surface-variant max-w-lg mx-auto mt-2 leading-relaxed">
            AirDrop files directly between any two devices. 100% P2P WebRTC transfer with zero server storage or limits.
          </p>
        </div>

        {/* Status Bar */}
        <div className={`rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 border shadow-m3-elevation-1 transition-all ${getStatusStyle()}`}>
          <div className="flex items-center gap-2.5 font-medium text-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-ping" : connStatus.includes("Error") || connStatus.includes("⚠️") ? "bg-m3-error" : "bg-m3-primary"}`} />
            <span>{connStatus}</span>
          </div>
          {myId && (
            <div className="text-xs font-mono px-3 py-1.5 rounded-xl bg-m3-surface-container-high border border-m3-outline-variant/50 text-m3-on-surface-variant flex items-center gap-2">
              <span>My Peer ID:</span>
              <span className="font-bold text-m3-on-surface select-all">{myId}</span>
            </div>
          )}
        </div>

        {/* Receiver Connecting State */}
        {isReceiver && !isConnected && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-8 sm:p-12 text-center shadow-m3-elevation-1 mb-6">
            <div className="w-12 h-12 border-3 border-m3-primary/20 border-t-m3-primary rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-m3-on-surface mb-2">Connecting to Sender...</h3>
            <p className="text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
              Pairing via WebRTC direct channel with peer <span className="font-mono font-medium text-m3-on-surface">{targetPeerId}</span>
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary transition-all shadow-m3-elevation-1 active:scale-[0.98]"
              onClick={() => {
                if (peer && targetPeerId) {
                  setConnStatus(`Retrying connection to ${targetPeerId}...`);
                  connectToPeer(peer, targetPeerId);
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry Connection
            </button>
          </div>
        )}

        {/* Sender Mode UI */}
        {!isReceiver && !isConnected && (
          <div className="bg-m3-surface-container rounded-3xl border border-m3-outline-variant/60 p-6 sm:p-10 shadow-m3-elevation-1 mb-6 flex flex-col items-center">
            <h3 className="text-xl font-semibold text-m3-on-surface mb-2 text-center">
              Share Link or Scan QR Code to Connect
            </h3>
            <p className="text-sm text-m3-on-surface-variant mb-8 max-w-lg text-center leading-relaxed">
              Open this link on your phone, tablet, or another device to instantly pair and transfer files directly without cloud uploads.
            </p>
            
            {qrCodeUrl && (
              <div className="p-4 bg-white rounded-3xl border border-m3-outline-variant/40 shadow-m3-elevation-1 mb-8 inline-block">
                <img 
                  src={qrCodeUrl} 
                  alt="CrushDrop Pairing QR Code" 
                  className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl object-contain"
                />
              </div>
            )}
            
            {/* Share Link Box */}
            <div className="w-full max-w-lg mb-8">
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Direct Pairing Link
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={shareLink} 
                  className="flex-1 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-mono bg-m3-surface-container-high border border-m3-outline-variant/60 text-m3-on-surface outline-none select-all focus:border-m3-primary"
                />
                <button 
                  type="button"
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-m3-elevation-1 flex items-center justify-center gap-2 flex-shrink-0 active:scale-[0.98] ${
                    copied 
                      ? "bg-emerald-500 text-white" 
                      : "bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary"
                  }`}
                  onClick={copyLink}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Manual Join Section */}
            <div className="w-full max-w-lg pt-6 border-t border-m3-outline-variant/40">
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Or Join with Peer ID
              </label>
              <form onSubmit={handleJoinPeer} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. crush-abc1-xyz2"
                  value={joinPeerId}
                  onChange={(e) => setJoinPeerId(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-mono bg-m3-surface-container-high border border-m3-outline-variant/60 text-m3-on-surface placeholder:text-m3-outline outline-none focus:border-m3-primary"
                />
                <button 
                  type="submit"
                  disabled={!joinPeerId.trim()}
                  className="px-6 py-2.5 rounded-full text-sm font-medium bg-m3-secondary-container hover:bg-m3-secondary-container/80 text-m3-on-secondary-container border border-m3-outline-variant/50 transition-all shadow-m3-elevation-1 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  Connect
                </button>
              </form>
            </div>

            <div className="mt-8 text-xs text-m3-on-surface-variant flex items-center justify-center gap-2 text-center">
              <span>⚡</span> Keep this tab open. Devices establish end-to-end encrypted direct WebRTC channel.
            </div>
          </div>
        )}

        {/* Connected UI (Sender & Receiver) */}
        {isConnected && (
          <div className="flex flex-col gap-6">
            
            {/* Sending Dropzone */}
            <div
              className="relative bg-m3-surface-container border-2 border-dashed border-m3-outline-variant hover:border-m3-primary rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all shadow-m3-elevation-1 group hover:bg-m3-surface-container-high/60"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files[0]);
              }}
            >
              <div className="w-16 h-16 rounded-2xl bg-m3-primary/10 text-m3-primary flex items-center justify-center mx-auto mb-4 text-3xl group-hover:scale-105 transition-transform shadow-m3-elevation-1">
                📤
              </div>
              <div className="text-lg sm:text-xl font-semibold text-m3-on-surface mb-1">
                Drop file here to send
              </div>
              <div className="text-xs sm:text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
                Fast peer-to-peer transmission over local network or direct WebRTC. Zero server limits.
              </div>
              <button 
                type="button" 
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary transition-all shadow-m3-elevation-1 active:scale-[0.98]"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Choose File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>

            {/* Outgoing File Progress */}
            {fileToSend && (
              <div className="bg-m3-surface-container border border-m3-outline-variant/60 rounded-3xl p-6 shadow-m3-elevation-1">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">📤</span>
                    <span className="text-sm font-medium text-m3-on-surface truncate">
                      Sending: <span className="font-semibold">{fileToSend.name}</span>
                    </span>
                  </div>
                  <span className="text-xs text-m3-on-surface-variant font-mono flex-shrink-0 ml-3">
                    {formatBytes(fileToSend.size)}
                  </span>
                </div>
                
                {/* M3 Linear Progress Bar */}
                <div className="w-full h-2.5 bg-m3-surface-container-highest rounded-full overflow-hidden mb-3 border border-m3-outline-variant/40">
                  <div 
                    className="h-full bg-m3-primary rounded-full transition-all duration-150"
                    style={{ width: `${transferProgress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-m3-on-surface-variant font-medium">
                  <span>{transferProgress}% Complete</span>
                  <span className="font-mono text-m3-on-surface">{transferSpeed}</span>
                </div>

                {transferProgress === 0 && (
                  <button 
                    type="button"
                    className="w-full mt-4 py-3 rounded-full text-sm font-medium bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary transition-all shadow-m3-elevation-1 flex items-center justify-center gap-2 active:scale-[0.98]"
                    onClick={sendFile}
                  >
                    🚀 Send Now
                  </button>
                )}
              </div>
            )}

            {/* Incoming File Progress */}
            {incomingFile && (
              <div className="bg-m3-surface-container border border-m3-outline-variant/60 rounded-3xl p-6 shadow-m3-elevation-1">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">📥</span>
                    <span className="text-sm font-medium text-m3-on-surface truncate">
                      Receiving: <span className="font-semibold">{incomingFile.name}</span>
                    </span>
                  </div>
                  <span className="text-xs text-m3-on-surface-variant font-mono flex-shrink-0 ml-3">
                    {formatBytes(incomingFile.size)}
                  </span>
                </div>
                
                {/* M3 Linear Progress Bar */}
                <div className="w-full h-2.5 bg-m3-surface-container-highest rounded-full overflow-hidden mb-3 border border-m3-outline-variant/40">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-150"
                    style={{ width: `${incomingFile.progress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-m3-on-surface-variant font-medium">
                  <span>{incomingFile.progress}% Complete</span>
                  <span className="font-mono text-m3-on-surface">{transferSpeed}</span>
                </div>

                {downloadReadyUrl && (
                  <a
                    href={downloadReadyUrl}
                    download={downloadReadyName}
                    className="w-full mt-4 py-3 rounded-full text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-m3-elevation-1 flex items-center justify-center gap-2 no-underline active:scale-[0.98]"
                  >
                    💾 Save Received File
                  </a>
                )}
              </div>
            )}

          </div>
        )}

        {/* Security & Privacy Notice */}
        <div className="mt-12 text-center text-xs text-m3-on-surface-variant/80 flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Direct browser-to-browser encrypted transfer via WebRTC. Files are never stored on any server.
        </div>

      </main>
    </div>
  );
}
