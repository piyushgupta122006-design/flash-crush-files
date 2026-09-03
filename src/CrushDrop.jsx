// CrushDrop.jsx — 100% P2P WebRTC File Transfer (Neo-Brutalism)
import { useState, useEffect, useRef, useCallback } from "react";
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
    // Basic human-readable ID generation
    const generateId = () => "crush-" + Math.random().toString(36).substring(2, 6) + "-" + Math.random().toString(36).substring(2, 6);
    const newId = isReceiver ? generateId() : generateId();
    
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
        QRCode.toDataURL(link, { width: 220, margin: 2, color: { dark: "#000", light: "#fff" } })
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
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <span className="tool-page-title">🌐 CrushDrop P2P</span>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "800px" }}>
        
        {/* Header */}
        <div className="comp-header" style={{ marginBottom: "20px" }}>
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ background: "var(--brutal-yellow)" }}>🌐</div>
            <h1 className="comp-title">CrushDrop</h1>
          </div>
          <p className="comp-sub">
            AirDrop files directly between any two devices. 100% P2P WebRTC transfer. Zero server limits.
          </p>
        </div>

        {/* Status Bar */}
        <div className="comp-card" style={{ padding: "16px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isConnected ? "var(--brutal-mint)" : "var(--bg-main)", transition: "all 0.3s", border: "3px solid #000" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{connStatus}</div>
          {myId && <div style={{ fontWeight: 700, fontSize: "0.85rem", opacity: 0.7 }}>My ID: {myId}</div>}
        </div>

        {/* Receiver Connecting State */}
        {isReceiver && !isConnected && (
          <div className="comp-card" style={{ padding: "32px", textAlign: "center", marginBottom: "24px" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: "8px" }}>Connecting to Sender...</h3>
            <p style={{ color: "var(--text-sub)", fontWeight: 600, marginBottom: "20px" }}>
              Pairing via WebRTC STUN/TURN direct channel ({targetPeerId})
            </p>
            <button
              className="btn-reset"
              style={{ padding: "10px 20px", background: "var(--brutal-yellow)", color: "#000", fontWeight: 800, border: "2px solid #000" }}
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
          <div className="comp-card" style={{ padding: "32px", textAlign: "center" }}>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: "16px" }}>Share this link or scan QR to connect</h3>
            
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" style={{ border: "4px solid #000", borderRadius: "12px", marginBottom: "20px" }} />
            )}
            
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <input 
                type="text" 
                readOnly 
                value={shareLink} 
                style={{ width: "100%", maxWidth: "400px", padding: "12px", border: "3px solid #000", borderRadius: "8px", fontWeight: 700 }}
              />
              <button className="btn-reset" style={{ padding: "0 20px", background: copied ? "var(--brutal-mint)" : "var(--brutal-yellow)", color: "#000", fontWeight: 800, border: "3px solid #000" }} onClick={copyLink}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p style={{ marginTop: "16px", fontWeight: 600, color: "var(--text-sub)" }}>
              Keep this window open. The receiver will connect instantly.
            </p>
          </div>
        )}

        {/* Connected UI (Sender & Receiver) */}
        {isConnected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Sending Dropzone */}
            <div
              className="comp-card drop-zone"
              style={{ minHeight: "200px" }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files[0]);
              }}
            >
              <span className="drop-icon">📤</span>
              <div className="drop-main">Drop file here to send</div>
              <div className="drop-sub">Transfer happens instantly over the local network / WebRTC</div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>

            {/* Outgoing File Progress */}
            {fileToSend && (
              <div className="comp-card" style={{ padding: "20px", background: "var(--brutal-sky)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontWeight: 800 }}>
                  <span>Sending: {fileToSend.name}</span>
                  <span>{formatBytes(fileToSend.size)}</span>
                </div>
                
                <div style={{ width: "100%", height: "16px", background: "#fff", border: "2px solid #000", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
                  <div style={{ width: `${transferProgress}%`, height: "100%", background: "var(--brutal-yellow)", transition: "width 0.1s" }}></div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.9rem" }}>
                  <span>{transferProgress}% Complete</span>
                  <span>{transferSpeed}</span>
                </div>

                {transferProgress === 0 && (
                  <button className="btn-compress" style={{ width: "100%", marginTop: "16px", padding: "12px", background: "#000", color: "#fff" }} onClick={sendFile}>
                    🚀 Send Now
                  </button>
                )}
              </div>
            )}

            {/* Incoming File Progress */}
            {incomingFile && (
              <div className="comp-card" style={{ padding: "20px", background: "var(--brutal-yellow)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontWeight: 800 }}>
                  <span>Receiving: {incomingFile.name}</span>
                  <span>{formatBytes(incomingFile.size)}</span>
                </div>
                
                <div style={{ width: "100%", height: "16px", background: "#fff", border: "2px solid #000", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
                  <div style={{ width: `${incomingFile.progress}%`, height: "100%", background: "var(--brutal-mint)", transition: "width 0.1s" }}></div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.9rem" }}>
                  <span>{incomingFile.progress}% Complete</span>
                  <span>{transferSpeed}</span>
                </div>

                {downloadReadyUrl && (
                  <a
                    href={downloadReadyUrl}
                    download={downloadReadyName}
                    className="btn-compress"
                    style={{ display: "block", textAlign: "center", width: "100%", marginTop: "16px", padding: "12px", background: "#000", color: "#fff", textDecoration: "none" }}
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
