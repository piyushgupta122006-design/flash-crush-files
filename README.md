# ⚡ FlashCrush — Extreme Client-Side File Studio

<div align="center">

![FlashCrush Banner](https://raw.githubusercontent.com/piyushgupta122006-design/flash-crush-files/main/public/favicon.svg)

### 100% In-Browser · Zero Server Latency · Complete Privacy · PWA & Offline Ready

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-4.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-6EE7B7?logo=pwa&logoColor=black)](https://web.dev/progressive-web-apps/)
[![Neo--Brutalism](https://img.shields.io/badge/UI-Neo--Brutalism-FF6B9D)](https://github.com/piyushgupta122006-design/flash-crush-files)
[![Vercel Deployment](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)](https://piyush-flash-crush-files.vercel.app/)

**[🚀 Live Demo](https://piyush-flash-crush-files.vercel.app/)** • **[✨ Features](#-complete-tool-suite)** • **[🔒 Privacy & Security](#-privacy--architecture)** • **[💻 Getting Started](#-getting-started)**

</div>

---

## 📖 About FlashCrush

**FlashCrush** is a high-performance, **100% client-side file manipulation powerhouse** built with **React, Vite, WebAssembly, and Canvas API**. 

Unlike traditional online conversion tools that upload your confidential documents and photos to remote cloud servers, **FlashCrush processes everything 100% locally inside your browser sandbox**. Your files never leave your device, ensuring maximum privacy, zero server latency, and limitless offline capability.

FlashCrush is wrapped in a distinctive **Neo-Brutalism design system** featuring bold typography, solid high-contrast borders, offset shadows, vibrant pastel palettes, and a **3-mode theme switcher (Light, Dark, and System Default)**.

---

## 🛠️ Complete Tool Suite

FlashCrush bundles **16 dedicated super-tools** divided into PDF, Image, and Utility suites:

### 📄 PDF Super-Tools

| Tool | Route | Description |
| :--- | :--- | :--- |
| **⚡ PDF Compressor** | `/pdf` | Shrink bulky PDF files by up to 80% with lossless clarity. Supports Low, Medium, High & Custom DPI compression with smart fallback. |
| **📑 PDF Merger** | `/merge-pdf` | Combine multiple PDF files into one clean document. Drag and reorder pages effortlessly before merging. |
| **✂️ Split & Extract PDF** | `/split-pdf` | Extract specific pages, split into individual PDFs, or chunk into groups with a visual page thumbnail selector and 1-click ZIP export. |
| **🖼️ PDF to Images** | `/pdf-to-img` | Extract every page of your PDF into high-resolution JPG, PNG, or WebP images (up to 300 DPI) with 1-click ZIP download. |
| **🔄 PDF Organizer & Rotator** | `/organize-pdf` | Visually drag-and-drop to reorder pages, rotate 90°/180°/270°, delete unwanted pages, and export clean PDFs. |
| **🔐 PDF Lock & Unlock** | `/pdf-security` | Protect sensitive PDFs with AES-256 passwords or cleanly remove passwords from unlocked PDFs. Auto-detects protected files. |
| **🏷️ Watermark & Remover** | `/pdf-watermark` | Stamp custom text watermarks and dynamic page numbers ("Page X of Y"), or cleanly erase unwanted stamps with live preview. |

---

### 🖼️ Image Power Tools

| Tool | Route | Description |
| :--- | :--- | :--- |
| **🗜️ Image Compressor** | `/image` | Compress JPG, PNG, and WebP images. Set custom target file sizes (e.g. exactly 50 KB) with interactive before/after comparison slider. |
| **📦 Bulk Image Compressor** | `/bulk-compress` | Batch compress 20–50+ images at once with target KB size mode, instant savings statistics, and 1-click .ZIP archive download. |
| **🔄 Image Converter** | `/convert` | Convert between JPG, PNG, WebP, AVIF, SVG, BMP, and GIF with adjustable quality slider and lossless mode. |
| **📄 Image to PDF** | `/img2pdf` | Convert single or multiple images into a clean PDF document. Custom margins, page orientation (Portrait/Landscape), and A4 / US Letter fit. |
| **🛂 Passport & Govt Exam Resizer** | `/passport-resizer` | Crop to official India Passport/PAN, US Visa, SSC & Govt Exam specs. Align with face oval guide and generate 4×6 print sheets. |
| **📐 Image Crop & Resize Studio** | `/image-crop` | Crop to 1:1, 9:16, 16:9, scale exact pixel dimensions, rotate, mirror flip, and export in WebP, PNG, or JPG. |
| **🤖 AI Background Remover** | `/bg-remover` | Erase photo backgrounds in 1-click using 100% on-device AI (ONNX WebAssembly). Replace with studio backdrops, solid colors & soft drop shadows. |

---

### 📱 Utilities & Offline Productivity

| Tool | Route | Description |
| :--- | :--- | :--- |
| **📱 Custom QR Studio** | `/qr-studio` | Generate high-res vector (SVG) and raster (PNG) QR codes with cyber/pastel gradients, custom dot patterns, Wi-Fi login, vCard & center logos. |
| **🕒 Offline Local History** | `/history` | View, re-download, or export past compressed PDFs, images, and QR codes stored 100% privately in browser IndexedDB. |

---

## 🎨 Neo-Brutalism Design & Theme System

FlashCrush features a crafted **Neo-Brutalism visual design system**:

- **Bold Contrast:** Solid `3px` / `2px` black borders on cards, buttons, inputs, and dialogs.
- **Hard Offset Shadows:** Crisp solid drop shadows (`5px 5px 0px #1a1a1a` on idle, shifting to `8px 8px 0px #1a1a1a` on hover).
- **Vibrant Pastel Palettes:** Harmonious pastel cards (Brutal Pink `#FF6B9D`, Brutal Yellow `#FFD93D`, Lavender `#D8B4FE`, Mint `#6EE7B7`, Sky `#7DD3FC`).
- **Chunky Typography:** **Space Grotesk** for display titles, **DM Sans** for body copy, and **JetBrains Mono** for technical metrics and file sizes.
- **3-Mode Theme Switcher:**
  - ☀️ **Light Mode:** Warm cream canvas (`#FFFBEB`), white card surfaces, black borders, and pastel accents.
  - 🌙 **Dark Mode (Dark Neo-Brutalism):** Deep dark canvas (`#121214`), charcoal card surfaces (`#18181b`), crisp white borders (`#F4F4F5`), and dark-tinted pastel cards.
  - 💻 **System Default (Auto):** Automatically synchronizes with your device/browser's OS dark/light mode preference in real time.
- **Mobile Responsive:** Ergonomically designed drawer menus, compact icon buttons on small viewports, and zero horizontal overflow.

---

## 🔒 Privacy & Architecture

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
Instant Download (.pdf / .zip / .png)    Google Drive Sync
```

1. **Zero Server Uploads:** All processing happens entirely within the browser using WebAssembly (`ort.wasm`), Canvas APIs, and `pdf-lib`.
2. **Offline-First PWA:** Powered by a custom Service Worker (`sw.js`), FlashCrush can be installed as a native app on Windows, macOS, Android, and iOS, functioning 100% without an internet connection.
3. **Private IndexedDB History:** File processing history and blobs are stored locally in the browser's IndexedDB and never transmitted to external analytics.
4. **Direct Google Drive Integration:** Users can optionally connect Google Drive to import files or export directly to their Drive folders via Google OAuth 2.0.

---

## 💻 Tech Stack

- **Frontend Core:** [React 18](https://reactjs.org/) + [React Router v6](https://reactrouter.com/)
- **Bundler & Build Tool:** [Vite 4](https://vitejs.dev/)
- **Styling:** Vanilla CSS (Custom Neo-Brutalism Design Tokens)
- **PDF Manipulation:** [`pdf-lib`](https://pdf-lib.js.org/) + [`pdfjs-dist`](https://mozilla.github.io/pdf.js/)
- **AI Background Segmentation:** [`onnxruntime-web`](https://onnxruntime.ai/) + WebAssembly
- **Compression & Archives:** [`jszip`](https://stuk.github.io/jszip/)
- **QR Code Engine:** [`qrcode`](https://www.npmjs.com/package/qrcode)
- **Offline Storage:** Browser [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- **Cloud Storage:** Google Drive API & Google Identity Services (GIS)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/piyushgupta122006-design/flash-crush-files.git
   cd flash-crush-files
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173/` in your browser.

4. **Build for production:**
   ```bash
   npm run build
   ```

---

## 📱 PWA & Native App Installation

FlashCrush is a fully compliant **Progressive Web App**:
- **On Desktop (Chrome/Edge/Brave):** Click the **"📲 Install App"** button in the navbar or the install icon in the address bar.
- **On Mobile (Android/iOS):** Tap **"Add to Home Screen"** to install FlashCrush as a full-screen standalone application with offline support.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ by [Piyush Gupta](https://github.com/piyushgupta122006-design)

</div>
