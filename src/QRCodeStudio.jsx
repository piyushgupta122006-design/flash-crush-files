// QRCodeStudio.jsx — Custom QR Code Generator with Colors, Gradients, Dot Shapes, Center Logo & vCard/Wi-Fi/UPI
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import ActionButtons from "./ActionButtons";

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

const QR_TYPES = [
  { id: "url", label: "URL Link", icon: "🔗" },
  { id: "wifi", label: "Wi-Fi Login", icon: "📶" },
  { id: "vcard", label: "vCard Contact", icon: "👤" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "upi", label: "UPI Payment", icon: "💳" },
  { id: "text", label: "Plain Text", icon: "📝" },
  { id: "email", label: "Email", icon: "✉️" },
];

const COLOR_THEMES = [
  { id: "cyber", label: "Cyber Neon", type: "gradient", c1: "#8b5cf6", c2: "#06b6d4", bg: "#0d1117" },
  { id: "sunset", label: "Sunset Glow", type: "gradient", c1: "#f43f5e", c2: "#fbbf24", bg: "#0d1117" },
  { id: "emerald", label: "Emerald Pro", type: "gradient", c1: "#10b981", c2: "#06b6d4", bg: "#0d1117" },
  { id: "mono-dark", label: "Dark Luxury", type: "solid", c1: "#ffffff", c2: "#ffffff", bg: "#0d1117" },
  { id: "mono-light", label: "Classic Black", type: "solid", c1: "#000000", c2: "#000000", bg: "#ffffff" },
  { id: "custom", label: "Custom Colors", type: "custom", c1: "#8b5cf6", c2: "#38bdf8", bg: "#ffffff" },
];

export default function QRCodeStudio({ auth }) {
  const navigate = useNavigate();

  // Content Type & Inputs
  const [qrType, setQrType] = useState("url");

  // URL
  const [urlText, setUrlText] = useState("https://flashcrush.vercel.app");

  // Wi-Fi
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPass, setWifiPass] = useState("");
  const [wifiAuth, setWifiAuth] = useState("WPA"); // "WPA" | "WEP" | "nopass"
  const [wifiHidden, setWifiHidden] = useState(false);

  // vCard Contact
  const [vcardName, setVcardName] = useState("");
  const [vcardPhone, setVcardPhone] = useState("");
  const [vcardEmail, setVcardEmail] = useState("");
  const [vcardOrg, setVcardOrg] = useState("");
  const [vcardJob, setVcardJob] = useState("");
  const [vcardWeb, setVcardWeb] = useState("");

  // WhatsApp
  const [waPhone, setWaPhone] = useState("");
  const [waMsg, setWaMsg] = useState("");

  // UPI Payment
  const [upiVpa, setUpiVpa] = useState("");
  const [upiName, setUpiName] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  // Plain Text & Email
  const [plainText, setPlainText] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailSub, setEmailSub] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Styling & Design
  const [selectedTheme, setSelectedTheme] = useState("cyber");
  const [dotColor1, setDotColor1] = useState("#8b5cf6");
  const [dotColor2, setDotColor2] = useState("#06b6d4");
  const [bgColor, setBgColor] = useState("#0d1117");
  const [dotShape, setDotShape] = useState("rounded"); // "square" | "rounded" | "dots" | "diamond"
  const [cornerShape, setCornerShape] = useState("rounded"); // "square" | "rounded" | "circle"

  // Center Logo
  const [logoType, setLogoType] = useState("none"); // "none" | "url" | "wifi" | "wa" | "upi" | "custom"
  const [customLogoImg, setCustomLogoImg] = useState(null);

  // Export Resolution
  const [resolution, setResolution] = useState(1024); // 512, 1024, 2048

  // Result Blob for ActionButtons
  const [resultBlob, setResultBlob] = useState(null);
  const [resultName, setResultName] = useState("");
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef(null);
  const logoInputRef = useRef(null);

  // Generate QR Raw String based on Content Type
  const getRawQRString = useCallback(() => {
    if (qrType === "url") {
      let u = urlText.trim() || "https://flashcrush.vercel.app";
      if (!/^https?:\/\//i.test(u) && !u.includes("@")) u = "https://" + u;
      return u;
    }
    if (qrType === "wifi") {
      return `WIFI:T:${wifiAuth};S:${wifiSsid};P:${wifiPass};H:${wifiHidden ? "true" : "false"};;`;
    }
    if (qrType === "vcard") {
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${vcardName}`,
        `TEL:${vcardPhone}`,
        `EMAIL:${vcardEmail}`,
        `ORG:${vcardOrg}`,
        `TITLE:${vcardJob}`,
        `URL:${vcardWeb}`,
        "END:VCARD",
      ].filter(l => !l.endsWith(":")).join("\n");
    }
    if (qrType === "whatsapp") {
      const cleanPhone = waPhone.replace(/[^\d]/g, "");
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`;
    }
    if (qrType === "upi") {
      let upiStr = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiName || "Payee")}`;
      if (upiAmount) upiStr += `&am=${encodeURIComponent(upiAmount)}&cu=INR`;
      return upiStr;
    }
    if (qrType === "email") {
      return `mailto:${emailTo}?subject=${encodeURIComponent(emailSub)}&body=${encodeURIComponent(emailBody)}`;
    }
    return plainText || "FlashCrush QR Code";
  }, [
    qrType, urlText, wifiSsid, wifiPass, wifiAuth, wifiHidden,
    vcardName, vcardPhone, vcardEmail, vcardOrg, vcardJob, vcardWeb,
    waPhone, waMsg, upiVpa, upiName, upiAmount, plainText, emailTo, emailSub, emailBody
  ]);

  // Handle Theme Selection
  const handleThemeSelect = (themeId) => {
    setSelectedTheme(themeId);
    const t = COLOR_THEMES.find(x => x.id === themeId);
    if (t) {
      setDotColor1(t.c1);
      setDotColor2(t.c2);
      setBgColor(t.bg);
    }
  };

  // Handle Custom Logo Upload
  const handleLogoUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      setCustomLogoImg(img);
      setLogoType("custom");
    };
    img.src = url;
  };

  // ── Render High-Resolution QR Canvas with Gradients & Shapes ──
  const renderQRCode = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rawStr = getRawQRString();
    const qrData = QRCode.create(rawStr, { errorCorrectionLevel: "H" });
    const modules = qrData.modules;
    const size = modules.size;

    const exportDim = resolution;
    canvas.width = exportDim;
    canvas.height = exportDim;
    const ctx = canvas.getContext("2d");

    // 1. Draw Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, exportDim, exportDim);

    // 2. Setup Gradient or Solid Pattern for Dots
    const marginModules = 3;
    const totalModules = size + marginModules * 2;
    const moduleSize = exportDim / totalModules;

    const grad = ctx.createLinearGradient(0, 0, exportDim, exportDim);
    grad.addColorStop(0, dotColor1);
    grad.addColorStop(1, dotColor2);
    ctx.fillStyle = grad;

    // Helper to check if a coordinate is in corner finder patterns (Eye areas)
    const isFinderPattern = (r, c) => {
      if (r < 7 && c < 7) return true; // Top-Left
      if (r < 7 && c >= size - 7) return true; // Top-Right
      if (r >= size - 7 && c < 7) return true; // Bottom-Left
      return false;
    };

    // Helper to check if a coordinate is in center logo cutout area
    const hasLogo = logoType !== "none";
    const centerStart = Math.floor(size / 2) - 4;
    const centerEnd = Math.floor(size / 2) + 4;
    const isLogoArea = (r, c) => {
      if (!hasLogo) return false;
      return r >= centerStart && r <= centerEnd && c >= centerStart && c <= centerEnd;
    };

    // 3. Draw QR Data Dots
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFinderPattern(r, c) || isLogoArea(r, c)) continue;

        if (modules.get(r, c)) {
          const x = (c + marginModules) * moduleSize;
          const y = (r + marginModules) * moduleSize;

          if (dotShape === "dots") {
            // Circle Dots
            ctx.beginPath();
            ctx.arc(x + moduleSize / 2, y + moduleSize / 2, moduleSize * 0.42, 0, 2 * Math.PI);
            ctx.fill();
          } else if (dotShape === "rounded") {
            // Rounded Squares
            const rad = moduleSize * 0.35;
            ctx.beginPath();
            ctx.roundRect(x + 0.5, y + 0.5, moduleSize - 1, moduleSize - 1, rad);
            ctx.fill();
          } else if (dotShape === "diamond") {
            // Diamond
            ctx.beginPath();
            ctx.moveTo(x + moduleSize / 2, y + 1);
            ctx.lineTo(x + moduleSize - 1, y + moduleSize / 2);
            ctx.lineTo(x + moduleSize / 2, y + moduleSize - 1);
            ctx.lineTo(x + 1, y + moduleSize / 2);
            ctx.closePath();
            ctx.fill();
          } else {
            // Standard Square
            ctx.fillRect(x, y, moduleSize + 0.2, moduleSize + 0.2);
          }
        }
      }
    }

    // 4. Draw Custom Finder Eye Patterns (Top-Left, Top-Right, Bottom-Left)
    const drawEye = (startR, startC) => {
      const eyeX = (startC + marginModules) * moduleSize;
      const eyeY = (startR + marginModules) * moduleSize;
      const eyeW = 7 * moduleSize;

      // Outer Frame
      ctx.fillStyle = grad;
      if (cornerShape === "circle") {
        ctx.beginPath();
        ctx.arc(eyeX + eyeW / 2, eyeY + eyeW / 2, eyeW / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(eyeX + eyeW / 2, eyeY + eyeW / 2, (eyeW / 2) - moduleSize, 0, 2 * Math.PI);
        ctx.fill();
      } else if (cornerShape === "rounded") {
        ctx.beginPath();
        ctx.roundRect(eyeX, eyeY, eyeW, eyeW, moduleSize * 1.8);
        ctx.fill();
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(eyeX + moduleSize, eyeY + moduleSize, eyeW - moduleSize * 2, eyeW - moduleSize * 2, moduleSize * 1.2);
        ctx.fill();
      } else {
        ctx.fillRect(eyeX, eyeY, eyeW, eyeW);
        ctx.fillStyle = bgColor;
        ctx.fillRect(eyeX + moduleSize, eyeY + moduleSize, eyeW - moduleSize * 2, eyeW - moduleSize * 2);
      }

      // Inner Eyeball
      ctx.fillStyle = grad;
      const innerX = eyeX + moduleSize * 2;
      const innerY = eyeY + moduleSize * 2;
      const innerW = moduleSize * 3;

      if (cornerShape === "circle") {
        ctx.beginPath();
        ctx.arc(innerX + innerW / 2, innerY + innerW / 2, innerW / 2, 0, 2 * Math.PI);
        ctx.fill();
      } else if (cornerShape === "rounded") {
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerW, innerW, moduleSize);
        ctx.fill();
      } else {
        ctx.fillRect(innerX, innerY, innerW, innerW);
      }
    };

    drawEye(0, 0); // Top-Left
    drawEye(0, size - 7); // Top-Right
    drawEye(size - 7, 0); // Bottom-Left

    // 5. Draw Center Logo / Badge (if enabled)
    if (hasLogo) {
      const logoBoxSize = (centerEnd - centerStart + 1) * moduleSize;
      const logoX = exportDim / 2 - logoBoxSize / 2;
      const logoY = exportDim / 2 - logoBoxSize / 2;

      // Clean White/Dark Circular Background Badge
      ctx.fillStyle = bgColor === "#ffffff" ? "#ffffff" : "#0d1117";
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(logoX, logoY, logoBoxSize, logoBoxSize, logoBoxSize * 0.28);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Logo Icon
      const innerIconPad = logoBoxSize * 0.18;
      const iconDrawX = logoX + innerIconPad;
      const iconDrawY = logoY + innerIconPad;
      const iconDrawSize = logoBoxSize - innerIconPad * 2;

      if (logoType === "custom" && customLogoImg) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(iconDrawX, iconDrawY, iconDrawSize, iconDrawSize, iconDrawSize * 0.2);
        ctx.clip();
        ctx.drawImage(customLogoImg, iconDrawX, iconDrawY, iconDrawSize, iconDrawSize);
        ctx.restore();
      } else {
        // Emoji Logo Presets
        const iconMap = {
          url: "🔗", wifi: "📶", wa: "💬", upi: "💳", contact: "👤", star: "⭐",
        };
        const iconChar = iconMap[logoType] || "⚡";
        ctx.font = `${Math.round(iconDrawSize * 0.75)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(iconChar, exportDim / 2, exportDim / 2);
      }
    }

    // Update Result Blob for ActionButtons
    canvas.toBlob((b) => {
      if (b) {
        setResultBlob(b);
        setResultName(`FlashCrush_QR_${qrType}_${resolution}px.png`);
      }
    }, "image/png");

  }, [getRawQRString, resolution, dotColor1, dotColor2, bgColor, dotShape, cornerShape, logoType, customLogoImg]);

  useEffect(() => {
    renderQRCode();
  }, [renderQRCode]);

  // Copy to Clipboard
  const copyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (b) => {
        if (!b) return;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Download SVG
  const downloadSVG = async () => {
    const rawStr = getRawQRString();
    try {
      const svgStr = await QRCode.toString(rawStr, {
        type: "svg",
        color: { dark: dotColor1, light: bgColor },
        errorCorrectionLevel: "H",
      });
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FlashCrush_QR_${qrType}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="compressor-page">
      <div className="tool-page-bar">
        <button className="back-btn" onClick={() => navigate("/")}>← Back</button>
        <div className="tool-page-title">QR Code Studio</div>
        <div className="tool-page-meta">Gradients · Shapes · Logos · Wi-Fi & vCard</div>
      </div>

      <div className="compressor-wrap" style={{ maxWidth: "1150px" }}>
        <div className="comp-header">
          <div className="comp-title-row">
            <div className="comp-icon-badge" style={{ borderColor: "rgba(139, 92, 246, 0.4)", boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>
              📱
            </div>
            <div className="comp-title">Custom QR Code Studio</div>
          </div>
          <p className="comp-sub">Create branded, high-resolution QR codes with vibrant gradients, custom dot shapes, and center logos.</p>
        </div>

        <div className="comp-card" style={{ padding: "20px" }}>

          {/* 1. QR Content Type Tabs */}
          <div style={{ marginBottom: "18px" }}>
            <span className="level-label" style={{ marginBottom: "8px", display: "block" }}>1. Choose QR Content Type</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px" }}>
              {QR_TYPES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`level-btn${qrType === t.id ? " active" : ""}`}
                  onClick={() => setQrType(t.id)}
                  style={{ padding: "8px 6px" }}
                >
                  <span style={{ fontSize: "1.1rem" }}>{t.icon}</span>
                  <span className="level-name" style={{ fontSize: "0.8rem" }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Two Column Layout: Editor (Left) vs Real-Time Canvas (Right) */}
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "24px", alignItems: "start" }}>

            {/* Left Column: Content Inputs & Customization */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Dynamic Content Input Box */}
              <div style={{
                padding: "16px", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px"
              }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", marginBottom: "10px" }}>
                  2. Enter Content ({qrType.toUpperCase()})
                </div>

                {/* URL */}
                {qrType === "url" && (
                  <div>
                    <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Website / Landing Page URL</label>
                    <input
                      type="url"
                      value={urlText}
                      onChange={(e) => setUrlText(e.target.value)}
                      placeholder="https://yourwebsite.com"
                      style={{
                        width: "100%", padding: "10px 14px", background: "#0f172a", border: "1.5px solid rgba(56,189,248,0.3)",
                        borderRadius: "8px", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", outline: "none", boxSizing: "border-box"
                      }}
                    />
                  </div>
                )}

                {/* Wi-Fi */}
                {qrType === "wifi" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Network Name (SSID)</label>
                      <input
                        type="text"
                        value={wifiSsid}
                        onChange={(e) => setWifiSsid(e.target.value)}
                        placeholder="Home / Office Wi-Fi"
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Password</label>
                      <input
                        type="text"
                        value={wifiPass}
                        onChange={(e) => setWifiPass(e.target.value)}
                        placeholder="Wi-Fi Password"
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <select
                        value={wifiAuth}
                        onChange={(e) => setWifiAuth(e.target.value)}
                        style={{ padding: "6px 10px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none" }}
                      >
                        <option value="WPA">WPA / WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">Open (No Password)</option>
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#cbd5e1", cursor: "pointer" }}>
                        <input type="checkbox" checked={wifiHidden} onChange={(e) => setWifiHidden(e.target.checked)} />
                        Hidden SSID
                      </label>
                    </div>
                  </div>
                )}

                {/* vCard */}
                {qrType === "vcard" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Full Name</label>
                      <input type="text" placeholder="Piyush Gupta" value={vcardName} onChange={(e) => setVcardName(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Phone Number</label>
                      <input type="tel" placeholder="+91 9876543210" value={vcardPhone} onChange={(e) => setVcardPhone(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Email</label>
                      <input type="email" placeholder="hello@company.com" value={vcardEmail} onChange={(e) => setVcardEmail(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Company / Org</label>
                      <input type="text" placeholder="Design Studio" value={vcardOrg} onChange={(e) => setVcardOrg(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}

                {/* WhatsApp */}
                {qrType === "whatsapp" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Phone Number (with country code)</label>
                      <input type="tel" placeholder="+919876543210" value={waPhone} onChange={(e) => setWaPhone(e.target.value)}
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Pre-filled Message (Optional)</label>
                      <input type="text" placeholder="Hi, I would like to inquire about..." value={waMsg} onChange={(e) => setWaMsg(e.target.value)}
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}

                {/* UPI Payment */}
                {qrType === "upi" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>UPI ID / VPA</label>
                      <input type="text" placeholder="username@okhdfcbank" value={upiVpa} onChange={(e) => setUpiVpa(e.target.value)}
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "10px", color: "#94a3b8" }}>Amount (Optional ₹)</label>
                      <input type="number" placeholder="500" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)}
                        style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}

                {/* Plain Text */}
                {qrType === "text" && (
                  <textarea
                    rows={3}
                    placeholder="Enter any text, note, crypto wallet address..."
                    value={plainText}
                    onChange={(e) => setPlainText(e.target.value)}
                    style={{ width: "100%", padding: "8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                  />
                )}
              </div>

              {/* 3. Color Themes & Gradients */}
              <div style={{
                padding: "16px", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px"
              }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#a855f7", textTransform: "uppercase", marginBottom: "10px" }}>
                  3. Color Themes & Gradients
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "12px" }}>
                  {COLOR_THEMES.map(th => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => handleThemeSelect(th.id)}
                      style={{
                        padding: "8px 6px",
                        background: selectedTheme === th.id ? "rgba(168,85,247,0.25)" : "rgba(255,255,255,0.04)",
                        border: selectedTheme === th.id ? "1.5px solid #a855f7" : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px", color: selectedTheme === th.id ? "#c084fc" : "#cbd5e1",
                        fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {th.label}
                    </button>
                  ))}
                </div>

                {/* Custom Color Pickers */}
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div>
                    <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Gradient Start</label>
                    <input type="color" value={dotColor1} onChange={(e) => { setDotColor1(e.target.value); setSelectedTheme("custom"); }} style={{ width: "32px", height: "32px", padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Gradient End</label>
                    <input type="color" value={dotColor2} onChange={(e) => { setDotColor2(e.target.value); setSelectedTheme("custom"); }} style={{ width: "32px", height: "32px", padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>Background</label>
                    <input type="color" value={bgColor} onChange={(e) => { setBgColor(e.target.value); setSelectedTheme("custom"); }} style={{ width: "32px", height: "32px", padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                  </div>
                </div>
              </div>

              {/* 4. Shapes & Center Logo */}
              <div style={{
                padding: "16px", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px"
              }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#10b981", textTransform: "uppercase", marginBottom: "10px" }}>
                  4. QR Dot Shapes & Center Logo
                </div>

                {/* Dot Shapes */}
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Module Dot Shape</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginBottom: "12px" }}>
                  {[
                    { id: "rounded", label: "Rounded" },
                    { id: "dots", label: "Dots (Circle)" },
                    { id: "square", label: "Square" },
                    { id: "diamond", label: "Diamond" },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDotShape(s.id)}
                      style={{
                        padding: "6px", fontSize: "10px", fontWeight: 700,
                        background: dotShape === s.id ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.04)",
                        border: dotShape === s.id ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "6px", color: dotShape === s.id ? "#34d399" : "#94a3b8", cursor: "pointer"
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Center Logo Presets */}
                <label style={{ fontSize: "10px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Center Badge / Logo</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {[
                    { id: "none", label: "None" },
                    { id: "url", label: "🔗 Link" },
                    { id: "wifi", label: "📶 Wi-Fi" },
                    { id: "wa", label: "💬 WA" },
                    { id: "upi", label: "💳 Pay" },
                    { id: "star", label: "⭐ Star" },
                  ].map(lg => (
                    <button
                      key={lg.id}
                      type="button"
                      onClick={() => setLogoType(lg.id)}
                      style={{
                        padding: "5px 10px", fontSize: "11px", fontWeight: 700,
                        background: logoType === lg.id ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                        border: logoType === lg.id ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "6px", color: logoType === lg.id ? "#38bdf8" : "#94a3b8", cursor: "pointer"
                      }}
                    >
                      {lg.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    style={{
                      padding: "5px 10px", fontSize: "11px", fontWeight: 700,
                      background: logoType === "custom" ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                      border: logoType === "custom" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "6px", color: logoType === "custom" ? "#38bdf8" : "#94a3b8", cursor: "pointer"
                    }}
                  >
                    <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoUpload} />
                    🖼️ Upload Custom Logo
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive QR Canvas Preview & Actions */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Live Real-Time Preview
                </span>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(Number(e.target.value))}
                  style={{ padding: "4px 8px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "6px", color: "#fff", fontSize: "11px", outline: "none" }}
                >
                  <option value={512}>512 × 512 px</option>
                  <option value={1024}>1024 × 1024 px (HD)</option>
                  <option value={2048}>2048 × 2048 px (Ultra HD)</option>
                </select>
              </div>

              {/* Canvas Container */}
              <div style={{
                width: "100%", minHeight: "360px", display: "flex", alignItems: "center", justifyContent: "center",
                background: "#080c16", borderRadius: "16px", border: "1.5px solid rgba(139, 92, 246, 0.35)",
                boxShadow: "0 15px 35px rgba(0,0,0,0.6)", padding: "20px", boxSizing: "border-box"
              }}>
                <canvas
                  ref={canvasRef}
                  style={{ maxWidth: "100%", maxHeight: "340px", objectFit: "contain", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.8)" }}
                />
              </div>

              {/* Quick Action Buttons */}
              <div style={{ display: "flex", gap: "8px", width: "100%", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  style={{
                    flex: 1, padding: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "10px", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer"
                  }}
                >
                  {copied ? "✅ Copied to Clipboard!" : "📋 Copy Image"}
                </button>
                <button
                  type="button"
                  onClick={downloadSVG}
                  style={{
                    flex: 1, padding: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "10px", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer"
                  }}
                >
                  📐 Download SVG (Vector)
                </button>
              </div>

              {/* Main ActionButtons (Download PNG & Save to Drive) */}
              {resultBlob && (
                <div style={{ width: "100%", marginTop: "14px" }}>
                  <ActionButtons
                    blob={resultBlob}
                    fileName={resultName}
                    onReset={() => setUrlText("")}
                    auth={auth}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="comp-footer" style={{ marginTop: "24px" }}>
            <span>FlashCrush · Custom QR Code Studio</span>
            <span>100% in-browser generation · Zero server tracking</span>
          </div>
        </div>
      </div>
    </div>
  );
}
