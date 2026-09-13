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

  // Determine status card theme style
  const getStatusStyle = () => {
    if (isConnected) {
      return "bg-[#e6f4ea] dark:bg-[#0f5223]/30 border-[#ceead6] dark:border-[#137333]/50 text-[#137333] dark:text-[#81c995]";
    }
    if (connStatus.includes("Error") || connStatus.includes("⚠️") || connStatus.includes("🔴")) {
      return "bg-[#ffdad6] dark:bg-[#93000a]/30 border-[#ffdad6] dark:border-[#93000a]/50 text-[#ba1a1a] dark:text-[#ffb4ab]";
    }
    return "bg-[#f0f4f9] dark:bg-[#28292a] border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3]";
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#f8fafd] dark:bg-[#131314]">
      {/* Top Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between p-4 sm:p-6 mb-2">
        <button 
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#28292a] transition-all shadow-sm"
          onClick={() => navigate("/")}
        >
          ← Back
        </button>
        <div className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">CrushDrop P2P</div>
        <div className="text-xs text-[#444746] dark:text-[#c4c7c5] hidden sm:block font-medium">WebRTC Direct Sync</div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-12 flex-1">
        
        {/* Header Section */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#c2e7ff] dark:bg-[#004a77] text-2xl text-[#001d35] dark:text-[#c2e7ff]">
              🌐
            </div>
            <h1 className="text-2xl sm:text-3xl font-normal text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              CrushDrop
            </h1>
          </div>
          <p className="text-sm text-[#444746] dark:text-[#c4c7c5] max-w-lg mx-auto">
            AirDrop files directly between any two devices. 100% P2P WebRTC transfer. Zero server limits.
          </p>
        </div>

        {/* Status Bar */}
        <div className={`rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-2 border shadow-xs transition-all ${getStatusStyle()}`}>
          <div className="flex items-center gap-2 font-medium text-sm">
            {connStatus}
          </div>
          {myId && (
            <div className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5]">
              My ID: <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{myId}</span>
            </div>
          )}
        </div>

        {/* Receiver Connecting State */}
        {isReceiver && !isConnected && (
          <div className="bg-[#ffffff] dark:bg-[#1e1f20] rounded-3xl border border-[#c7c7c7] dark:border-[#444746] p-8 text-center shadow-sm mb-6">
            <div className="w-10 h-10 border-3 border-[#c2e7ff] dark:border-[#004a77] border-t-[#0b57d0] dark:border-t-[#a8c7fa] rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">Connecting to Sender...</h3>
            <p className="text-sm text-[#444746] dark:text-[#c4c7c5] mb-6">
              Pairing via WebRTC direct channel ({targetPeerId})
            </p>
            <button
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm"
              onClick={() => {
                if (peer && targetPeerId) {
                  setConnStatus(`Retrying connection to ${targetPeerId}...`);
                  connectToPeer(peer, targetPeerId);
                }
              }}
            >
              🔄 Retry Connection
            </button>
          </div>
        )}

        {/* Sender Mode UI */}
        {!isReceiver && !isConnected && (
          <div className="bg-[#ffffff] dark:bg-[#1e1f20] rounded-3xl border border-[#c7c7c7] dark:border-[#444746] p-6 sm:p-8 text-center shadow-sm mb-6 flex flex-col items-center">
            <h3 className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-2">
              Share link or scan QR code to connect
            </h3>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mb-6 max-w-md">
              Open this link on your phone, tablet, or another laptop to instantly pair and transfer files without upload limits.
            </p>
            
            {qrCodeUrl && (
              <div className="p-3 bg-[#ffffff] rounded-2xl border border-[#c7c7c7] dark:border-[#444746] shadow-sm mb-6">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className="w-48 h-48 rounded-xl object-contain"
                />
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-md">
              <input 
                type="text" 
                readOnly 
                value={shareLink} 
                className="flex-1 w-full px-4 py-2.5 rounded-full text-sm font-mono bg-[#f0f4f9] dark:bg-[#28292a] border border-[#c7c7c7] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3] outline-none select-all"
              />
              <button 
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm flex items-center justify-center gap-2 flex-shrink-0 w-full sm:w-auto ${
                  copied 
                    ? "bg-[#e6f4ea] text-[#137333] dark:bg-[#0f5223] dark:text-[#81c995] border border-[#ceead6] dark:border-[#137333]" 
                    : "bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd]"
                }`}
                onClick={copyLink}
              >
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
            </div>
            
            <p className="mt-6 text-xs text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1.5">
              <span>⚡</span> Keep this tab open. Devices connect directly via encrypted P2P channel.
            </p>
          </div>
        )}

        {/* Connected UI (Sender & Receiver) */}
        {isConnected && (
          <div className="flex flex-col gap-6">
            
            {/* Sending Dropzone */}
            <div
              className="relative bg-[#ffffff] dark:bg-[#1e1f20] border-2 border-dashed border-[#c7c7c7] dark:border-[#444746] hover:border-[#0b57d0] dark:hover:border-[#a8c7fa] rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all shadow-sm group hover:bg-[#f0f4f9]/50 dark:hover:bg-[#28292a]/50"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files[0]);
              }}
            >
              <span className="text-4xl mb-3 block group-hover:scale-105 transition-transform">📤</span>
              <div className="text-lg font-medium text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
                Drop file here to send
              </div>
              <div className="text-xs text-[#444746] dark:text-[#c4c7c5] mb-4">
                Transfer happens instantly over the local network / WebRTC (no server limits)
              </div>
              <button 
                type="button" 
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                📁 Choose File
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
              <div className="bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3] truncate max-w-[70%]">
                    Sending: <span className="font-semibold">{fileToSend.name}</span>
                  </span>
                  <span className="text-xs text-[#444746] dark:text-[#c4c7c5] font-mono">
                    {formatBytes(fileToSend.size)}
                  </span>
                </div>
                
                {/* M3 Linear Progress */}
                <div className="w-full h-2.5 bg-[#f0f4f9] dark:bg-[#28292a] rounded-full overflow-hidden mb-3 border border-[#c7c7c7]/30 dark:border-[#444746]/50">
                  <div 
                    className="h-full bg-[#0b57d0] dark:bg-[#a8c7fa] rounded-full transition-all duration-150"
                    style={{ width: `${transferProgress}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-[#444746] dark:text-[#c4c7c5] font-medium">
                  <span>{transferProgress}% Complete</span>
                  <span className="font-mono">{transferSpeed}</span>
                </div>

                {transferProgress === 0 && (
                  <button 
                    className="w-full mt-4 py-3 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm flex items-center justify-center gap-2"
                    onClick={sendFile}
                  >
                    🚀 Send Now
                  </button>
                )}
              </div>
            )}

            {/* Incoming File Progress */}
            {incomingFile && (
              <div className="bg-[#ffffff] dark:bg-[#1e1f20] border border-[#c7c7c7] dark:border-[#444746] rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-[#1f1f1f] dark:text-[#e3e3e3] truncate max-w-[70%]">
                    Receiving: <span className="font-semibold">{incomingFile.name}</span>
                  </span>
                  <span className="text-xs text-[#444746] dark:text-[#c4c7c5] font-mono">
                    {formatBytes(incomingFile.size)}
                  </span>
                </div>
                
                {/* M3 Linear Progress */}
                <div className="w-full h-2.5 bg-[#f0f4f9] dark:bg-[#28292a] rounded-full overflow-hidden mb-3 border border-[#c7c7c7]/30 dark:border-[#444746]/50">
                  <div 
                    className="h-full bg-[#137333] dark:bg-[#81c995] rounded-full transition-all duration-150"
                    style={{ width: `${incomingFile.progress}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-[#444746] dark:text-[#c4c7c5] font-medium">
                  <span>{incomingFile.progress}% Complete</span>
                  <span className="font-mono">{transferSpeed}</span>
                </div>

                {downloadReadyUrl && (
                  <a
                    href={downloadReadyUrl}
                    download={downloadReadyName}
                    className="w-full mt-4 py-3 rounded-full text-sm font-medium bg-[#0b57d0] hover:bg-[#0842a0] text-white dark:bg-[#a8c7fa] dark:text-[#062e6f] dark:hover:bg-[#d3e3fd] transition-all shadow-sm flex items-center justify-center gap-2 no-underline"
                  >
                    💾 Save Received File
                  </a>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
