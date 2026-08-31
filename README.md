# ⚡ FlashCrush — Extreme Client-Side File Studio

<div align="center">

### 100% In-Browser · Zero Server Uploads · Complete Privacy · PWA & Offline Ready

[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-6EE7B7?logo=pwa&logoColor=black)](#-pwa--offline-native-app)
[![UI: Neo-Brutalism](https://img.shields.io/badge/UI-Neo--Brutalism-FF6B9D)](#-neo-brutalism-design--theme-system)
[![Client-Side Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-06B6D4)](#-privacy--client-side-architecture)
[![Zero Server Logs](https://img.shields.io/badge/Storage-Local%20IndexedDB-D8B4FE)](#-utilities--offline-productivity)

</div>

---

## 📖 Overview

**FlashCrush** is a high-performance, **100% client-side file studio** engineered for high-speed document and image processing directly inside the browser.

Unlike conventional online tools that upload sensitive files to remote servers, **FlashCrush executes all processing entirely within your browser sandbox**. Files never leave your local device, ensuring absolute confidentiality, zero server latency, and complete offline capability.

---

## 🛠️ Complete Feature Suite

FlashCrush provides **16 dedicated tools** across PDF, Image, and Utility categories:

### 📄 PDF Super-Tools

| Tool | Route | Key Capabilities |
| :--- | :--- | :--- |
| **⚡ PDF Compressor** | `/pdf` | Shrink PDF sizes by up to 80% with lossless clarity. Low, Medium, High presets + Custom DPI modes with smart fallback. |
| **📑 PDF Merger** | `/merge-pdf` | Merge multiple PDF documents with intuitive drag-and-drop page and file reordering. |
| **✂️ Split & Extract PDF** | `/split-pdf` | Extract custom page ranges or split every page into separate PDFs with 1-click ZIP export. |
| **🖼️ PDF to Images** | `/pdf-to-img` | Render every page into high-resolution JPG, PNG, or WebP (up to 300 DPI) with bulk ZIP download. |
| **🔄 PDF Organizer & Rotator** | `/organize-pdf` | Interactive visual grid to reorder pages, rotate 90°/180°/270°, and delete/restore pages. |
| **🔐 PDF Security** | `/pdf-security` | Encrypt PDFs with AES-256 password protection or unlock protected files. Auto-detects locked documents. |
| **🏷️ Watermark & Numbering** | `/pdf-watermark` | Apply custom text watermarks, stamp dynamic "Page X of Y" numbers, or erase unwanted stamps with live preview. |

---

### 🖼️ Image Power Tools

| Tool | Route | Key Capabilities |
| :--- | :--- | :--- |
| **🗜️ Image Compressor** | `/image` | Compress JPG, PNG, and WebP images. Supports exact Target File Size mode (e.g., target 50 KB) with live comparison slider. |
| **📦 Bulk Image Compressor** | `/bulk-compress` | Batch process 20–50+ images simultaneously with target size modes and 1-click .ZIP archive download. |
| **🔄 Image Converter** | `/convert` | Convert between JPG, PNG, WebP, AVIF, SVG, BMP, and GIF with adjustable quality and lossless mode. |
| **📄 Image to PDF** | `/img2pdf` | Convert single or multiple photos into a clean PDF document with A4/Letter page fit and margin controls. |
| **🛂 Passport & Exam Resizer** | `/passport-resizer` | Official specifications for Passports, Visas, and Govt Exams. Face oval guide and 4×6 print sheet generator. |
| **📐 Image Crop & Resize** | `/image-crop` | Custom aspect ratios (1:1, 9:16, 16:9), exact pixel dimension scaling, rotation, and mirror flipping. |
| **🤖 AI Background Remover** | `/bg-remover` | 100% on-device AI background erasure with transparent PNG export, solid color replacements, and soft drop shadows. |

---

### 📱 Utilities & Local Storage

| Tool | Route | Key Capabilities |
| :--- | :--- | :--- |
| **📱 Custom QR Studio** | `/qr-studio` | High-res vector (SVG) and PNG QR generator with gradients, custom dot patterns, Wi-Fi login, vCards, and center logos. |
| **🕒 Offline Local History** | `/history` | View, re-download, or export past processed files stored 100% privately in browser IndexedDB. Zero external logging. |

---

## 🔒 Privacy & Client-Side Architecture

```
User File (PDF / Image)
       │
       ▼
┌────────────────────────────────────────────────────────┐
│               BROWSER CLIENT SANDBOX                   │
│                                                        │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │   HTML5 Canvas Engine   │ │  WebAssembly (Wasm)  │  │
│  └─────────────────────────┘ └──────────────────────┘  │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │  pdf-lib & pdfjs-dist   │ │ ONNX AI Segmentation │  │
│  └─────────────────────────┘ └──────────────────────┘  │
│                                                        │
│                 IndexedDB Local Vault                  │
└────────────────────────────────────────────────────────┘
       │                                     ▲
       ▼                                     │ (Optional)
Instant Local Download                   Google Drive Sync
```

1. **Zero Remote Processing:** All processing operations execute directly in the browser runtime via WebAssembly and Canvas APIs.
2. **Confidentiality:** Source files and output documents never leave the client device unless explicitly exported to Google Drive.
3. **Local Vault (IndexedDB):** Processing records and output blobs reside strictly in local browser storage with instant clearing capabilities.

---

## 🎨 Neo-Brutalism Design & Theme System

- **High-Contrast Styling:** Bold solid borders, crisp offset drop shadows, and vibrant pastel accents.
- **Typography:** Space Grotesk for display headers, DM Sans for interface text, and JetBrains Mono for metrics.
- **3-Mode Theme Support:**
  - ☀️ **Light Mode:** Warm cream canvas with high-contrast surfaces and pastel highlights.
  - 🌙 **Dark Mode (Dark Neo-Brutalism):** Deep dark background with high-contrast borders and rich card tones.
  - 💻 **System Default (Auto):** Automatically synchronizes with the device's active color scheme in real time.

---

## 📲 PWA & Offline Native App

FlashCrush is a fully standalone **Progressive Web App**:
- **Desktop (Chrome / Edge / Brave):** Install via the browser address bar or the in-app Install button.
- **Mobile (Android / iOS):** Use "Add to Home Screen" for a full-screen, app-like experience.
- **100% Offline Capability:** All core tools, processing engines, and history features operate without an internet connection.
