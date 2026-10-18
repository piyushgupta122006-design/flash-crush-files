// TextToPDF.jsx — 100% In-Browser Native Vector Markdown/Text to PDF Converter (Google Material Design 3)
// Architecture: Strict Dropzone-First -> AST Extraction -> Declarative pdfmake docDefinition -> 100% Vector PDF
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { addHistoryRecord } from "./historyDB";
import ActionButtons from "./ActionButtons";
import { consumePendingFile } from "./clipboardStore";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ── Dynamic Script Loaders (Zero Initial Bundle Impact) ──────────────────────
function loadMarked() {
  return new Promise((resolve, reject) => {
    if (window.marked) {
      resolve(window.marked);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js";
    s.onload = () => {
      if (window.marked) resolve(window.marked);
      else reject(new Error("marked library failed to initialize"));
    };
    s.onerror = () => reject(new Error("Failed to load marked from CDN"));
    document.head.appendChild(s);
  });
}

function loadPdfMake() {
  return new Promise((resolve, reject) => {
    if (window.pdfMake && window.pdfMake.vfs) {
      resolve(window.pdfMake);
      return;
    }

    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js";
      s2.onload = () => {
        if (window.pdfMake) resolve(window.pdfMake);
        else reject(new Error("pdfmake failed to initialize with fonts"));
      };
      s2.onerror = () => reject(new Error("Failed to load pdfmake fonts"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Failed to load pdfmake engine"));
    document.head.appendChild(s1);
  });
}

// ── Sample Markdown Presets ──────────────────────────────────────────────────
const SAMPLE_PRESETS = {
  spec: `# FlashCrush Core Engine Specification
*Confidential — Technical Architecture Documentation*

---

## 1. Executive Summary
FlashCrush is an ultra-fast, **100% client-side document processing suite** built for zero-server data privacy. All operations execute strictly within local browser memory (WebAssembly & Web Workers).

> **Core Invariant**: Not a single byte of user data is ever transmitted to an external backend server.

## 2. Benchmark & Throughput Comparison
The table below outlines performance metrics recorded on standard desktop hardware:

| Benchmark Pipeline | File Format | Engine Version | Latency (P99) | Status |
| :--- | :---: | :---: | :---: | :---: |
| Vector PDF Compiler | PDF / A4 | v2.4 Native | 280 ms | **Optimal** |
| SheetJS 2D Grid | XLSX / CSV | v0.20.3 | 410 ms | **Optimal** |
| Tesseract AI OCR | Multi-page | v5.1 WASM | 1.84 s | **Normal** |
| AES-256 Crypto Lock | PDF 2.0 | Native Lib | 95 ms | **Optimal** |

## 3. High-Integrity Code Architecture
Below is the core AST-to-vector transformation pipeline:

\`\`\`javascript
// Pure AST Token Transformation Pipeline
export async function compileMarkdownToVectorPDF(markdownSource) {
  const tokens = marked.lexer(markdownSource);
  const imageCache = await prefetchImages(tokens);
  const docDefinition = transformASTToDocDef(tokens, imageCache);
  return pdfMake.createPdf(docDefinition).getBlob();
}
\`\`\`

## 4. Architectural Guarantees
- [x] **Zero DOM Rasterization**: 100% vector text streams; no blurry canvases.
- [x] **Anti-Slicing Pagination**: Table rows and code blocks never cut in half.
- [x] **Accessible & Searchable**: Native text selection and \`Ctrl + F\` search.
- [x] **Fault-Tolerant Images**: Async CORS pre-fetching with graceful fallback.

<!-- pagebreak -->

## 5. Security & Cryptographic Boundaries
All cryptographic operations use native browser \`SubtleCrypto\` or in-memory workers. 

For additional inquiries, visit [FlashCrush Suite](https://nanocrush.vercel.app).
`,

  report: `# Annual Financial & Audit Summary
**Fiscal Year 2026 — Verified Report**

---

### Executive Overview
This report presents audited departmental budgets, operating expenditures, and quarter-over-quarter growth figures.

| Department | Q1 Allocation | Q2 Allocation | Total Spend | Budget Variance |
| :--- | :---: | :---: | :---: | :---: |
| Infrastructure & Cloud | $145,000 | $162,000 | $307,000 | +2.4% |
| Security Operations | $98,000 | $105,000 | $203,000 | -1.1% |
| Product Engineering | $310,000 | $335,000 | $645,000 | +0.8% |
| Compliance & Legal | $45,000 | $48,000 | $93,000 | -3.5% |

> *Notice: Figures are rounded to the nearest thousand. All expenditures have been validated by internal compliance.*

### Auditor Comments
1. All departmental expenditure requests were approved within allocated thresholds.
2. Cloud computing expenses experienced minor seasonal fluctuation during Q2.
3. Recommended action: Maintain standard reserve contingency for Q3.
`,

  changelog: `# Product Release Notes & Changelog
**Version 3.2.0 — Vector PDF Suite Release**

---

### Highlights & New Features
- **Native Vector PDF Engine**: Markdown files compile straight to searchable vector A4 documents.
- **Deep Inline Formatting**: Fully handles ***bold italic***, \`inline codespans\`, and ~~strikethrough~~ without layout degradation.
- **Header & Footer Customization**: Real-time running header title, timestamp, and \`Page X of Y\` counters.

### Bug Fixes & Refinements
- Fixed multi-page table row slicing with strict \`dontBreakRows: true\` constraints.
- Added automatic header row continuation across page splits.
- Prevented bottom-of-page orphan headings using \`keepWithNext: true\`.
`
};

// ── HTML & Badge Sanitizers ──────────────────────────────────────────────────
function stripHtmlTags(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Decode HTML entities that marked.lexer() emits in text tokens
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Strip unsupported emoji codepoints that cause tofu boxes in pdfmake's Roboto VFS
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
function stripEmoji(str) {
  if (!str) return "";
  return str.replace(EMOJI_RE, "").replace(/ {2,}/g, " ");
}

function isSvgOrBadgeUrl(url) {
  if (!url) return false;
  return (
    /\.svg(\?.*)?$/i.test(url) ||
    /shields\.io/i.test(url) ||
    /badgen\.net/i.test(url) ||
    url.startsWith("data:image/svg+xml")
  );
}

// ── Async Image Pre-fetching ─────────────────────────────────────────────────
async function prefetchImages(tokens) {
  const imageUrls = new Set();

  function scan(list) {
    if (!list || !Array.isArray(list)) return;
    for (const t of list) {
      if (t.type === "image" && t.href) {
        // Skip SVGs and badges from binary rasterization
        if (!isSvgOrBadgeUrl(t.href)) {
          imageUrls.add(t.href);
        }
      }
      if (t.type === "html" && t.text) {
        const mdImgMatches = t.text.matchAll(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g);
        for (const m of mdImgMatches) {
          if (!isSvgOrBadgeUrl(m[1])) imageUrls.add(m[1]);
        }
        const htmlImgMatches = t.text.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi);
        for (const m of htmlImgMatches) {
          if (!isSvgOrBadgeUrl(m[1])) imageUrls.add(m[1]);
        }
      }
      if (t.tokens) scan(t.tokens);
      if (t.items) {
        for (const item of t.items) {
          if (item.tokens) scan(item.tokens);
        }
      }
      if (t.rows) {
        for (const row of t.rows) {
          for (const cell of row) {
            if (cell.tokens) scan(cell.tokens);
          }
        }
      }
      if (t.header) {
        for (const h of t.header) {
          if (h.tokens) scan(h.tokens);
        }
      }
    }
  }

  scan(tokens);

  const imageMap = {};
  if (imageUrls.size === 0) return imageMap;

  const fetchPromises = Array.from(imageUrls).map(async (url) => {
    if (url.startsWith("data:image/")) {
      imageMap[url] = url;
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal, mode: "cors" });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      imageMap[url] = base64;
    } catch (err) {
      imageMap[url] = null;
    }
  });

  await Promise.allSettled(fetchPromises);
  return imageMap;
}

// ── Deep Recursive Inline Styling Walker ─────────────────────────────────────
function walkInlineTokens(tokens, inherited = {}, imageMap = {}) {
  if (!tokens || !Array.isArray(tokens)) return [];
  const result = [];

  function pushInlineRun(item) {
    if (!item) return;
    if (item._isBadge && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev._isBadge || (typeof prev.text === "string" && prev.text.endsWith("]"))) {
        result.push({ text: " " });
      }
    }
    result.push(item);
  }

  for (const token of tokens) {
    switch (token.type) {
      case "strong": {
        const sub = walkInlineTokens(token.tokens, { ...inherited, bold: true }, imageMap);
        for (const s of sub) pushInlineRun(s);
        break;
      }
      case "em": {
        const sub = walkInlineTokens(token.tokens, { ...inherited, italics: true }, imageMap);
        for (const s of sub) pushInlineRun(s);
        break;
      }
      case "codespan": {
        pushInlineRun({
          text: decodeHtmlEntities(token.text || ""),
          font: "Roboto",
          fontSize: (inherited.fontSize || 10) * 0.88,
          background: "#f1f5f9",
          color: "#0f172a",
          ...inherited,
          bold: false
        });
        break;
      }
      case "link": {
        const sub = walkInlineTokens(
          token.tokens,
          {
            ...inherited,
            color: "#0b57d0",
            decoration: "underline",
            link: token.href
          },
          imageMap
        );
        for (const s of sub) pushInlineRun(s);
        break;
      }
      case "del": {
        const sub = walkInlineTokens(
          token.tokens,
          { ...inherited, decoration: "lineThrough" },
          imageMap
        );
        for (const s of sub) pushInlineRun(s);
        break;
      }
      case "image": {
        // SVG or Shield badge fallback to prevent pdfmake format crash
        if (isSvgOrBadgeUrl(token.href)) {
          const badgeText = token.text ? `[Badge: ${token.text}]` : `[Badge: ${token.href}]`;
          pushInlineRun({
            text: badgeText,
            color: "#0284c7",
            background: "#e0f2fe",
            bold: true,
            fontSize: (inherited.fontSize || 10) * 0.82,
            _isBadge: true,
            ...inherited
          });
          break;
        }

        const base64 = imageMap[token.href];
        if (base64 && !base64.startsWith("data:image/svg+xml")) {
          pushInlineRun({
            image: base64,
            width: 140,
            margin: [2, 2, 2, 2]
          });
        } else {
          pushInlineRun({
            text: `[🖼️ ${token.text || "Image"}]`,
            color: "#64748b",
            italics: true,
            ...inherited
          });
        }
        break;
      }
      case "br": {
        pushInlineRun({ text: "\n", ...inherited });
        break;
      }
      case "html": {
        if (/<br\s*\/?>/i.test(token.text)) {
          pushInlineRun({ text: "\n", ...inherited });
        } else {
          const clean = stripHtmlTags(token.text);
          if (clean) {
            pushInlineRun({ text: clean, ...inherited });
          }
        }
        break;
      }
      case "escape":
      case "text":
      default: {
        if (token.tokens && token.tokens.length > 0) {
          const sub = walkInlineTokens(token.tokens, inherited, imageMap);
          for (const s of sub) pushInlineRun(s);
        } else if (token.text !== undefined) {
          const rawText = token.text === "\n" ? " " : token.text;
          const processed = stripEmoji(decodeHtmlEntities(rawText));
          if (processed !== "") {
            pushInlineRun({
              text: processed,
              ...inherited
            });
          }
        }
        break;
      }
    }
  }

  return result;
}

// ── AST-to-docDefinition Transformer ─────────────────────────────────────────
function transformASTToBlocks(tokens, imageMap, options = {}) {
  if (!tokens || !Array.isArray(tokens)) return [];
  const blocks = [];
  let currentAlignment = null; // tracks multi-block <div align="..."> state

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const inlineRuns = walkInlineTokens(token.tokens, {}, imageMap);
        const depth = Math.min(Math.max(token.depth || 1, 1), 6);
        blocks.push({
          text: inlineRuns,
          style: `h${depth}`,
          keepWithNext: true,
          ...(currentAlignment ? { alignment: currentAlignment } : {})
        });
        break;
      }

      case "paragraph": {
        // Standalone image check
        if (
          token.tokens &&
          token.tokens.length === 1 &&
          token.tokens[0].type === "image"
        ) {
          const imgToken = token.tokens[0];

          // SVG or Badge fallback
          if (isSvgOrBadgeUrl(imgToken.href)) {
            blocks.push({
              table: {
                widths: ["auto"],
                body: [
                  [
                    {
                      text: `🏷️ ${imgToken.text || "Badge: " + imgToken.href}`,
                      style: "badgePill",
                      fillColor: "#e0f2fe"
                    }
                  ]
                ]
              },
              layout: "noBorders",
              margin: [0, 4, 0, 6]
            });
            break;
          }

          const base64 = imageMap[imgToken.href];
          if (base64 && !base64.startsWith("data:image/svg+xml")) {
            blocks.push({
              image: base64,
              fit: [490, 360],
              alignment: "center",
              margin: [0, 8, 0, 10]
            });
          } else {
            blocks.push({
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      text: `⚠️ Image failed to load or CORS-restricted: ${imgToken.href}\nAlt: ${imgToken.text || "None"}`,
                      style: "imgWarning"
                    }
                  ]
                ]
              },
              layout: {
                hLineWidth: () => 0.5,
                vLineWidth: () => 0.5,
                hLineColor: () => "#fca5a5",
                vLineColor: () => "#fca5a5",
                paddingLeft: () => 8,
                paddingRight: () => 8,
                paddingTop: () => 6,
                paddingBottom: () => 6
              },
              margin: [0, 6, 0, 8]
            });
          }
          break;
        }

        const inlineRuns = walkInlineTokens(token.tokens, {}, imageMap);
        blocks.push({
          text: inlineRuns,
          style: "p",
          ...(currentAlignment ? { alignment: currentAlignment } : {})
        });
        break;
      }

      case "code": {
        blocks.push({
          table: {
            widths: ["*"],
            body: [
              [
                {
                  text: token.text || "",
                  style: "codeBlock",
                  fillColor: "#f8fafc"
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#e2e8f0",
            vLineColor: () => "#e2e8f0",
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 8,
            paddingBottom: () => 8
          },
          dontBreakRows: true,
          margin: [0, 4, 0, 8]
        });
        break;
      }

      case "table": {
        const headerCells = (token.header || []).map((cell, colIdx) => ({
          text: walkInlineTokens(
            cell.tokens || [{ type: "text", text: cell.text || "" }],
            { bold: true },
            imageMap
          ),
          style: "tableHeader",
          alignment: token.align && token.align[colIdx] ? token.align[colIdx] : "left"
        }));

        const bodyRows = (token.rows || []).map((row) =>
          row.map((cell, colIdx) => ({
            text: walkInlineTokens(
              cell.tokens || [{ type: "text", text: cell.text || "" }],
              {},
              imageMap
            ),
            style: "tableCell",
            alignment: token.align && token.align[colIdx] ? token.align[colIdx] : "left"
          }))
        );

        const colCount = Math.max(headerCells.length, 1);
        const colWidths = Array(colCount).fill("*");

        // Prevent orphan table headers:
        // Compact tables (<= 8 rows) are kept unbreakable so they don't split across pages
        // leaving an orphan header row at the page bottom.
        const isCompactTable = bodyRows.length <= 8;

        blocks.push({
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: colWidths,
            body: [headerCells, ...bodyRows]
          },
          ...(isCompactTable ? { unbreakable: true } : {}),
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
            vLineWidth: () => 0.5,
            hLineColor: (i) => (i === 1 ? "#cbd5e1" : "#e2e8f0"),
            vLineColor: () => "#e2e8f0",
            paddingLeft: () => 7,
            paddingRight: () => 7,
            paddingTop: () => 5,
            paddingBottom: () => 5
          },
          margin: [0, 6, 0, 10]
        });
        break;
      }

      case "blockquote": {
        // GitHub Alert syntax detection: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
        const ALERT_CONFIG = {
          NOTE: { label: "NOTE", color: "#0284c7", border: "#0284c7", bg: "#f0f9ff" },
          TIP: { label: "TIP", color: "#059669", border: "#059669", bg: "#f0fdf4" },
          IMPORTANT: { label: "IMPORTANT", color: "#7c3aed", border: "#7c3aed", bg: "#f5f3ff" },
          WARNING: { label: "WARNING", color: "#d97706", border: "#d97706", bg: "#fffbeb" },
          CAUTION: { label: "CAUTION", color: "#dc2626", border: "#dc2626", bg: "#fef2f2" }
        };

        let alertType = null;
        if (token.tokens && token.tokens.length > 0 && token.tokens[0].type === "paragraph") {
          const firstP = token.tokens[0];
          const alertMatch = (firstP.text || "").match(/^\[!(IMPORTANT|NOTE|WARNING|TIP|CAUTION)\](?:\s*\n|\s+)?/i);
          if (alertMatch) {
            alertType = alertMatch[1].toUpperCase();
            const matchedLen = alertMatch[0].length;
            firstP.text = firstP.text.slice(matchedLen);
            if (firstP.tokens && firstP.tokens.length > 0) {
              const firstInline = firstP.tokens[0];
              const inlineMatch = (firstInline.text || "").match(/^\[!(IMPORTANT|NOTE|WARNING|TIP|CAUTION)\](?:\s*\n|\s+)?/i);
              if (inlineMatch) {
                firstInline.text = firstInline.text.slice(inlineMatch[0].length);
                if (!firstInline.text && firstP.tokens.length > 1) {
                  firstP.tokens.shift();
                }
              }
            }
          }
        }

        const alertStyle = alertType ? ALERT_CONFIG[alertType] : null;
        const innerBlocks = transformASTToBlocks(token.tokens, imageMap, options);

        if (alertStyle) {
          if (innerBlocks.length > 0 && Array.isArray(innerBlocks[0].text)) {
            innerBlocks[0].text.unshift({
              text: `${alertStyle.label}: `,
              bold: true,
              color: alertStyle.color
            });
          } else {
            innerBlocks.unshift({
              text: `${alertStyle.label}: `,
              bold: true,
              color: alertStyle.color,
              margin: [0, 0, 0, 2]
            });
          }
        }

        blocks.push({
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: innerBlocks,
                  fillColor: alertStyle ? alertStyle.bg : "#f8fafc",
                  style: "blockquote"
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i) => (i === 0 ? 3.5 : 0),
            vLineColor: (i) => (i === 0 ? (alertStyle ? alertStyle.border : "#0b57d0") : "transparent"),
            paddingLeft: () => 10,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          },
          margin: [0, 4, 0, 8]
        });
        break;
      }

      case "list": {
        const listItems = (token.items || []).map((item) => {
          let prefix = "";
          if (item.task) {
            prefix = item.checked ? "[x] " : "[ ] ";
          }

          const inlineTokens = [];
          const subBlocks = [];

          if (item.tokens) {
            for (const sub of item.tokens) {
              if (sub.type === "text") {
                inlineTokens.push(
                  ...walkInlineTokens(
                    sub.tokens || [{ type: "text", text: sub.text || "" }],
                    {},
                    imageMap
                  )
                );
              } else if (sub.type === "paragraph") {
                inlineTokens.push(...walkInlineTokens(sub.tokens, {}, imageMap));
              } else if (sub.type === "list") {
                subBlocks.push(transformASTToBlocks([sub], imageMap, options)[0]);
              }
            }
          }

          const itemRuns = prefix
            ? [{ text: prefix, bold: true, color: "#0f172a" }, ...inlineTokens]
            : inlineTokens;

          if (subBlocks.length > 0) {
            return {
              stack: [
                { text: itemRuns, style: "listItem" },
                ...subBlocks
              ]
            };
          }
          return { text: itemRuns, style: "listItem" };
        });

        if (token.ordered) {
          blocks.push({ ol: listItems, margin: [0, 3, 0, 6] });
        } else {
          blocks.push({ ul: listItems, margin: [0, 3, 0, 6] });
        }
        break;
      }

      case "hr": {
        if (options.pageBreakOnDivider) {
          blocks.push({ text: "", pageBreak: "after" });
        } else {
          blocks.push({
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 4,
                x2: 515,
                y2: 4,
                lineWidth: 0.5,
                lineColor: "#cbd5e1"
              }
            ],
            margin: [0, 8, 0, 10]
          });
        }
        break;
      }

      case "html": {
        if (/<!--\s*(pagebreak|newpage)\s*-->/i.test(token.text)) {
          blocks.push({ text: "", pageBreak: "after" });
          break;
        }
        if (/<hr\s*\/?>/i.test(token.text)) {
          if (options.pageBreakOnDivider) {
            blocks.push({ text: "", pageBreak: "after" });
          } else {
            blocks.push({
              canvas: [
                {
                  type: "line",
                  x1: 0,
                  y1: 4,
                  x2: 515,
                  y2: 4,
                  lineWidth: 0.5,
                  lineColor: "#cbd5e1"
                }
              ],
              margin: [0, 8, 0, 10]
            });
          }
          break;
        }

        // Multi-block alignment state tracking for <div align="center">...</div>
        const hasOpenDiv = /<div[^>]*align=["'](center|right|left)["']/i.test(token.text);
        const hasCloseDiv = /<\/div\s*>/i.test(token.text);
        if (hasOpenDiv && !hasCloseDiv) {
          const m = token.text.match(/<div[^>]*align=["'](center|right|left)["']/i);
          currentAlignment = m[1].toLowerCase();
        } else if (hasCloseDiv && !hasOpenDiv) {
          currentAlignment = null;
        }

        const blockAlignMatch = token.text.match(/align=["'](center|right|left)["']/i);
        const blockAlignment = blockAlignMatch ? blockAlignMatch[1].toLowerCase() : (currentAlignment || "left");

        // Convert HTML formatting to markdown inside HTML block
        let innerMd = token.text
          .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
          .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
          .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
          .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
          .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
          .replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)")
          .replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi, "![$1]($2)")
          .replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, "![]($1)")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/?(div|p|span|section|header|footer)[^>]*>/gi, " ")
          .replace(/<[^>]+>/g, " ");

        const cleanMd = innerMd.trim();
        if (cleanMd) {
          const lexerObj = options.marked || (typeof window !== "undefined" ? window.marked : null);
          let innerTokens = null;
          if (lexerObj) {
            if (lexerObj.Lexer && typeof lexerObj.Lexer.lexInline === "function") {
              innerTokens = lexerObj.Lexer.lexInline(cleanMd);
            } else if (typeof lexerObj.lexer === "function") {
              const bList = lexerObj.lexer(cleanMd);
              innerTokens = [];
              for (const b of bList) {
                if (b.tokens) innerTokens.push(...b.tokens);
                else if (b.text) innerTokens.push({ type: "text", text: b.text });
              }
            }
          }

          if (innerTokens && innerTokens.length > 0) {
            const inlineRuns = walkInlineTokens(innerTokens, {}, imageMap);
            if (inlineRuns.length > 0) {
              blocks.push({
                text: inlineRuns,
                style: "p",
                alignment: blockAlignment
              });
            }
          } else {
            blocks.push({
              text: stripEmoji(decodeHtmlEntities(cleanMd)),
              style: "p",
              alignment: blockAlignment
            });
          }
        }
        break;
      }

      case "space":
      default:
        break;
    }
  }

  // Post-processing pass: Group heading with immediately following compact table, code block, or blockquote
  // This solves pdfmake's limitation where an unbreakable block ignores preceding heading's keepWithNext: true
  const groupedBlocks = [];
  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];

    const isEligibleNext =
      next &&
      (
        next.unbreakable ||
        (next.table && (
          next.unbreakable ||
          next.table.body?.[0]?.[0]?.style === "codeBlock" ||
          next.table.body?.[0]?.[0]?.style === "blockquote"
        ))
      );

    if (current && current.keepWithNext && isEligibleNext) {
      groupedBlocks.push({
        unbreakable: true,
        stack: [current, next]
      });
      i++; // Skip next node as it is grouped with current heading
    } else {
      groupedBlocks.push(current);
    }
  }

  return groupedBlocks;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function TextToPDF({ auth }) {
  const navigate = useNavigate();

  // State-Driven Mounting: Initial state is strictly Dropzone (hasContent === false)
  const [hasContent, setHasContent] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [docTitle, setDocTitle] = useState("FlashCrush Document");
  const [fileName, setFileName] = useState("document.pdf");
  const [sourceFile, setSourceFile] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Conversion & Engine Lifecycle
  const [stage, setStage] = useState("idle"); // idle | converting | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [outputFile, setOutputFile] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  // Layout & Formatting Options
  const [orientation, setOrientation] = useState("portrait"); // portrait | landscape
  const [marginPreset, setMarginPreset] = useState("normal"); // compact | normal | spacious
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [pageBreakOnDivider, setPageBreakOnDivider] = useState(false);
  const [fontSizePreset, setFontSizePreset] = useState("standard"); // compact | standard | large

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Keep previewUrlRef in sync with pdfPreviewUrl
  previewUrlRef.current = pdfPreviewUrl;

  // Strict Blob URL Memory Cleanup helper
  const revokeCurrentPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      revokeCurrentPreviewUrl();
    };
  }, [revokeCurrentPreviewUrl]);

  // Check for pending clipboard file on mount
  useEffect(() => {
    const pending = consumePendingFile();
    if (pending) {
      handleIncomingFile(pending, true);
    }
  }, []);

  // ── Core Vector PDF Generation Execution ──────────────────────────────────
  const compilePDF = async (contentToCompile, titleToUse, outFileName) => {
    if (!contentToCompile || !contentToCompile.trim()) {
      setErrorMsg("Please write or import Markdown/Text content before generating PDF.");
      setStage("error");
      return;
    }

    try {
      setStage("converting");
      setErrorMsg("");
      setProgressMsg("Loading high-speed vector typography engines...");

      // Memory cleanup: Revoke previous blob URL before new compilation
      revokeCurrentPreviewUrl();
      setPdfPreviewUrl(null);

      const [markedLib, pdfMakeLib] = await Promise.all([loadMarked(), loadPdfMake()]);

      setProgressMsg("Parsing Markdown Abstract Syntax Tree (AST)...");
      const tokens = markedLib.lexer(contentToCompile);

      setProgressMsg("Pre-fetching embedded graphics & images...");
      const imageMap = await prefetchImages(tokens);

      setProgressMsg("Applying Material Design 3 styles & A4 pagination constraints...");
      const blocks = transformASTToBlocks(tokens, imageMap, { pageBreakOnDivider, marked: markedLib });

      // Page Margins preset calculation
      const margins =
        marginPreset === "compact"
          ? [30, 38, 30, 36]
          : marginPreset === "spacious"
          ? [55, 60, 55, 55]
          : [40, 50, 40, 45];

      // Font size scaling
      const fontScale = fontSizePreset === "compact" ? 0.9 : fontSizePreset === "large" ? 1.12 : 1.0;

      const m3Styles = {
        h1: { font: "Roboto", fontSize: Math.round(22 * fontScale), bold: true, color: "#0f172a", margin: [0, 14, 0, 8] },
        h2: { font: "Roboto", fontSize: Math.round(16 * fontScale), bold: true, color: "#1e293b", margin: [0, 12, 0, 6] },
        h3: { font: "Roboto", fontSize: Math.round(13 * fontScale), bold: true, color: "#334155", margin: [0, 10, 0, 4] },
        h4: { font: "Roboto", fontSize: Math.round(11 * fontScale), bold: true, color: "#475569", margin: [0, 8, 0, 4] },
        h5: { font: "Roboto", fontSize: Math.round(10 * fontScale), bold: true, color: "#475569", margin: [0, 6, 0, 3] },
        h6: { font: "Roboto", fontSize: Math.round(9 * fontScale), bold: true, color: "#64748b", margin: [0, 4, 0, 2] },
        p: { font: "Roboto", fontSize: Math.round(10 * fontScale), lineHeight: 1.45, color: "#334155", margin: [0, 0, 0, 6] },
        listItem: { font: "Roboto", fontSize: Math.round(9.5 * fontScale), lineHeight: 1.4, color: "#334155", margin: [0, 1, 0, 2] },
        codeBlock: { font: "Roboto", fontSize: Math.round(8.5 * fontScale), color: "#0f172a", lineHeight: 1.35 },
        tableHeader: { font: "Roboto", fontSize: Math.round(9.5 * fontScale), bold: true, color: "#0f172a", fillColor: "#f1f5f9" },
        tableCell: { font: "Roboto", fontSize: Math.round(9 * fontScale), color: "#334155" },
        blockquote: { font: "Roboto", fontSize: Math.round(9.5 * fontScale), italics: true, color: "#475569" },
        headerStyle: { font: "Roboto", fontSize: 8, color: "#94a3b8" },
        footerStyle: { font: "Roboto", fontSize: 8, color: "#94a3b8" },
        badgePill: { font: "Roboto", fontSize: 8.5, bold: true, color: "#0369a1" },
        imgWarning: { font: "Roboto", fontSize: 8, color: "#dc2626", italics: true }
      };

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: orientation,
        pageMargins: margins,
        header: (currentPage, pageCount) => {
          if (!includeHeader) return null;
          return {
            columns: [
              { text: titleToUse || docTitle || "FlashCrush Document", alignment: "left", style: "headerStyle" },
              { text: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }), alignment: "right", style: "headerStyle" }
            ],
            margin: [margins[0], 16, margins[2], 0]
          };
        },
        footer: (currentPage, pageCount) => {
          if (!includeFooter) return null;
          return {
            columns: [
              { text: "FlashCrush Vector Document Suite", alignment: "left", style: "footerStyle" },
              { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", style: "footerStyle" }
            ],
            margin: [margins[0], 0, margins[2], 16]
          };
        },
        content: blocks,
        styles: m3Styles,
        defaultStyle: {
          font: "Roboto",
          fontSize: Math.round(10 * fontScale),
          color: "#334155"
        }
      };

      setProgressMsg("Compiling 100% Vector & Searchable PDF stream...");

      const pdfDoc = pdfMakeLib.createPdf(docDefinition);
      const blob = await new Promise((resolve) => pdfDoc.getBlob(resolve));

      const objectUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl(objectUrl);

      const targetName = outFileName || fileName;
      const generatedFile = {
        blob,
        name: targetName.endsWith(".pdf") ? targetName : `${targetName}.pdf`,
        size: blob.size,
        type: "application/pdf"
      };

      setOutputFile(generatedFile);

      // Save to local IndexedDB history
      try {
        await addHistoryRecord({
          tool: "txt2pdf",
          fileName: generatedFile.name,
          origSize: new Blob([contentToCompile]).size,
          newSize: blob.size,
          blob,
          mimeType: "application/pdf"
        });
      } catch (histErr) {
        console.warn("Could not save to historyDB:", histErr);
      }

      setStage("done");
      setProgressMsg("");
    } catch (err) {
      console.error("Text to PDF generation error:", err);
      setErrorMsg(`PDF compilation failed: ${err.message || "Unknown error"}`);
      setStage("error");
    }
  };

  // Handle incoming file with automatic compilation trigger
  const handleIncomingFile = (file, autoCompile = true) => {
    if (!file) return;
    setSourceFile(file);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const generatedPdfName = `${baseName}.pdf`;
    setDocTitle(baseName);
    setFileName(generatedPdfName);

    const reader = new FileReader();
    reader.onload = (e) => {
      const textContent = e.target.result || "";
      setMarkdown(textContent);
      setHasContent(true);

      if (autoCompile) {
        compilePDF(textContent, baseName, generatedPdfName);
      } else {
        setStage("idle");
        setOutputFile(null);
        revokeCurrentPreviewUrl();
        setPdfPreviewUrl(null);
      }
    };
    reader.readAsText(file);
  };

  // Load sample markdown with automatic compilation
  const handleLoadSample = (presetKey = "spec") => {
    const textContent = SAMPLE_PRESETS[presetKey] || SAMPLE_PRESETS.spec;
    const title =
      presetKey === "spec"
        ? "Engine Architecture Spec"
        : presetKey === "report"
        ? "Financial Audit Summary"
        : "Product Release Notes";
    const sampleFileName = `${presetKey}_document.pdf`;

    setDocTitle(title);
    setFileName(sampleFileName);
    setMarkdown(textContent);
    setSourceFile(new File([textContent], `${presetKey}.md`, { type: "text/markdown" }));
    setHasContent(true);

    compilePDF(textContent, title, sampleFileName);
  };

  // Start from scratch without auto-compiling (preview idle)
  const handleStartFromScratch = () => {
    revokeCurrentPreviewUrl();
    setPdfPreviewUrl(null);
    setOutputFile(null);
    setMarkdown("# Untitled Document\n\nStart writing your Markdown notes or document here...\n");
    setDocTitle("Untitled Document");
    setFileName("untitled.pdf");
    setSourceFile(null);
    setHasContent(true);
    setStage("idle");
  };

  // Reset to initial Dropzone-first state with strict memory cleanup
  const handleResetToDropzone = () => {
    revokeCurrentPreviewUrl();
    setPdfPreviewUrl(null);
    setOutputFile(null);
    setMarkdown("");
    setSourceFile(null);
    setHasContent(false);
    setStage("idle");
    setProgressMsg("");
    setErrorMsg("");
  };

  // Drag and Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.[0]) {
      handleIncomingFile(e.dataTransfer.files[0], true);
    }
  };

  // Insert markdown tag helper
  const insertFormatting = (prefix, suffix = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = markdown.substring(start, end);
    const replacement = `${prefix}${selected || "text"}${suffix}`;

    const newText =
      markdown.substring(0, start) +
      replacement +
      markdown.substring(end);

    setMarkdown(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected ? selected.length : 4)
      );
    }, 0);
  };

  const wordCount = (markdown.match(/\b\S+\b/g) || []).length;
  const charCount = markdown.length;

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans p-3 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full transition-colors">
      
      {/* ── Top Bar Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-m3-outline-variant/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl select-none">📄</span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-m3-on-surface">
              Text & Markdown to <span className="text-m3-primary font-medium">PDF</span>
            </h1>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30">
              100% Vector Text
            </span>
          </div>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant mt-1">
            Zero DOM rasterization. Direct AST-to-PDF compilation with selectable text, A4 pagination & code syntax blocks.
          </p>
        </div>

        {/* Back / Import buttons when active in workspace */}
        {hasContent && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="rounded-full px-4 py-2 text-xs font-medium bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface border border-m3-outline-variant/50 transition-colors flex items-center gap-1.5"
              onClick={handleResetToDropzone}
            >
              <span>←</span> Upload New File
            </button>
            <button
              type="button"
              disabled={stage === "converting"}
              onClick={() => compilePDF(markdown, docTitle, fileName)}
              className="rounded-full px-5 py-2 text-xs sm:text-sm font-semibold bg-m3-primary text-m3-on-primary hover:bg-m3-primary/90 shadow-m3-elevation-1 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {stage === "converting" ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  <span>Compiling...</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Re-Generate PDF (.pdf)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
           STATE 1: STRICT INITIAL DROPZONE (0 CPU/RAM AST PARSER OVERHEAD)
         ════════════════════════════════════════════════════════════════════════ */}
      {!hasContent && (
        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto w-full my-6 sm:my-10">
          
          <div
            className={`w-full relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-m3-surface-container-low cursor-pointer ${
              dragging
                ? "border-m3-primary bg-m3-primary/10 scale-[0.99]"
                : "border-m3-outline-variant/60 hover:border-m3-primary hover:bg-m3-surface-container"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleIncomingFile(e.target.files[0], true);
              }}
            />

            <div className="w-16 h-16 rounded-full bg-m3-primary/15 text-m3-primary flex items-center justify-center mx-auto mb-4 text-3xl shadow-xs">
              📄
            </div>

            <h3 className="text-lg font-medium text-m3-on-surface mb-1">
              Drop your Markdown or Text file here
            </h3>
            <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md mx-auto mb-6">
              Supports <strong>.md</strong>, <strong>.markdown</strong>, and <strong>.txt</strong> documentation. 100% vector-compiled locally in browser.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-2"
              >
                <span>📁</span> Choose File
              </button>
            </div>
          </div>

          {/* Secondary Actions: Load Sample Markdown & Start From Scratch */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 w-full text-xs">
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/40">
              <span className="text-[11px] font-semibold text-m3-on-surface-variant uppercase tracking-wider pl-2">
                Sample Presets:
              </span>
              <button
                type="button"
                onClick={() => handleLoadSample("spec")}
                className="px-3 py-1.5 rounded-xl bg-m3-surface hover:bg-m3-surface-container-high text-m3-on-surface font-medium border border-m3-outline-variant/40 shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>✨</span> Tech Spec
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample("report")}
                className="px-3 py-1.5 rounded-xl bg-m3-surface hover:bg-m3-surface-container-high text-m3-on-surface font-medium border border-m3-outline-variant/40 shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>📊</span> Audit Report
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample("changelog")}
                className="px-3 py-1.5 rounded-xl bg-m3-surface hover:bg-m3-surface-container-high text-m3-on-surface font-medium border border-m3-outline-variant/40 shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>🚀</span> Changelog
              </button>
            </div>

            <button
              type="button"
              onClick={handleStartFromScratch}
              className="text-xs text-m3-primary hover:underline font-medium py-1.5 px-3 flex items-center gap-1.5"
            >
              <span>✏️</span> Or start writing from scratch
            </button>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
           STATE 2: STATE-DRIVEN MOUNTED WORKSPACE (EDITOR + LIVE PREVIEW)
         ════════════════════════════════════════════════════════════════════════ */}
      {hasContent && (
        <>
          {/* ── Settings Bar (Chips & Controls) ── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/40 text-xs">
            {/* Document Title & File Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                Doc Title (Header)
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Document Title"
                className="rounded-lg px-2.5 py-1.5 bg-m3-surface text-m3-on-surface border border-m3-outline-variant/60 focus:outline-none focus:border-m3-primary text-xs"
              />
            </div>

            {/* Orientation & Margins */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                Layout & Margins
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 bg-m3-surface text-m3-on-surface border border-m3-outline-variant/60 focus:outline-none focus:border-m3-primary text-xs"
                >
                  <option value="portrait">Portrait (A4)</option>
                  <option value="landscape">Landscape (A4)</option>
                </select>
                <select
                  value={marginPreset}
                  onChange={(e) => setMarginPreset(e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 bg-m3-surface text-m3-on-surface border border-m3-outline-variant/60 focus:outline-none focus:border-m3-primary text-xs"
                >
                  <option value="compact">Compact Margins</option>
                  <option value="normal">Normal (40pt)</option>
                  <option value="spacious">Spacious (55pt)</option>
                </select>
              </div>
            </div>

            {/* Font Scaling & Presets */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                Typography Scale & Sample
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={fontSizePreset}
                  onChange={(e) => setFontSizePreset(e.target.value)}
                  className="flex-1 rounded-lg px-2 py-1.5 bg-m3-surface text-m3-on-surface border border-m3-outline-variant/60 focus:outline-none focus:border-m3-primary text-xs"
                >
                  <option value="compact">Compact (9pt)</option>
                  <option value="standard">Standard (10pt)</option>
                  <option value="large">Readable (11pt)</option>
                </select>
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) handleLoadSample(val);
                  }}
                  defaultValue=""
                  className="flex-1 rounded-lg px-2 py-1.5 bg-m3-surface text-m3-on-surface border border-m3-outline-variant/60 focus:outline-none focus:border-m3-primary text-xs"
                >
                  <option value="" disabled>Load Sample...</option>
                  <option value="spec">Architecture Spec</option>
                  <option value="report">Financial Audit</option>
                  <option value="changelog">Release Changelog</option>
                </select>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-1.5 justify-center">
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHeader}
                    onChange={(e) => setIncludeHeader(e.target.checked)}
                    className="rounded accent-m3-primary"
                  />
                  <span>Running Header</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFooter}
                    onChange={(e) => setIncludeFooter(e.target.checked)}
                    className="rounded accent-m3-primary"
                  />
                  <span>Page Numbers</span>
                </label>
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={pageBreakOnDivider}
                  onChange={(e) => setPageBreakOnDivider(e.target.checked)}
                  className="rounded accent-m3-primary"
                />
                <span>Page Break on `---`</span>
              </label>
            </div>
          </div>

          {/* ── Status / Progress Banner ── */}
          {stage === "converting" && (
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-blue-600/30 border-t-blue-600 animate-spin flex-shrink-0" />
              <div className="text-xs font-medium text-blue-900 dark:text-blue-200">
                {progressMsg || "Processing vector PDF stream..."}
              </div>
            </div>
          )}

          {stage === "error" && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-300">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                className="underline font-medium hover:text-red-900"
                onClick={() => setStage("idle")}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Split Screen: Editor & Live Native Preview ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[560px]">
            
            {/* LEFT PANE: Markdown Editor */}
            <div 
              className="flex flex-col rounded-2xl bg-m3-surface-container-lowest border border-m3-outline-variant/40 shadow-sm overflow-hidden"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* Quick Format Ribbon */}
              <div className="flex items-center gap-1 p-2 bg-m3-surface-container-low border-b border-m3-outline-variant/30 flex-wrap text-xs">
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high font-bold transition-colors"
                  onClick={() => insertFormatting("# ")}
                  title="Heading 1"
                >
                  H1
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high font-bold transition-colors"
                  onClick={() => insertFormatting("## ")}
                  title="Heading 2"
                >
                  H2
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high font-bold transition-colors"
                  onClick={() => insertFormatting("### ")}
                  title="Heading 3"
                >
                  H3
                </button>
                <span className="w-[1px] h-4 bg-m3-outline-variant/40 mx-0.5" />
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high font-bold transition-colors"
                  onClick={() => insertFormatting("**", "**")}
                  title="Bold"
                >
                  B
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high italic transition-colors"
                  onClick={() => insertFormatting("*", "*")}
                  title="Italic"
                >
                  I
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high font-mono text-[11px] transition-colors"
                  onClick={() => insertFormatting("`", "`")}
                  title="Inline Code"
                >
                  &lt;/&gt;
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high transition-colors"
                  onClick={() => insertFormatting("\n```javascript\n", "\n```\n")}
                  title="Code Box"
                >
                  Code Box
                </button>
                <span className="w-[1px] h-4 bg-m3-outline-variant/40 mx-0.5" />
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high transition-colors"
                  onClick={() => insertFormatting("> ")}
                  title="Blockquote"
                >
                  Quote
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high transition-colors"
                  onClick={() => insertFormatting("\n| Header 1 | Header 2 |\n| :--- | :--- |\n| Cell 1 | Cell 2 |\n")}
                  title="Table"
                >
                  Table
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high transition-colors"
                  onClick={() => insertFormatting("- ")}
                  title="Bullet List"
                >
                  • List
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded hover:bg-m3-surface-container-high transition-colors"
                  onClick={() => insertFormatting("\n<!-- pagebreak -->\n")}
                  title="Explicit Page Break"
                >
                  ✂️ Page Break
                </button>
              </div>

              {/* Text Area */}
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="Type or paste your Markdown here... You can also drag and drop a .md or .txt file directly."
                className="flex-1 w-full p-4 bg-transparent resize-none font-mono text-xs sm:text-sm text-m3-on-surface focus:outline-none leading-relaxed"
                style={{ minHeight: "420px" }}
              />

              {/* Bottom stats footer */}
              <div className="flex items-center justify-between px-3 py-2 bg-m3-surface-container-low border-t border-m3-outline-variant/30 text-[11px] text-m3-on-surface-variant font-mono">
                <span>{wordCount} words · {charCount} chars</span>
                <span>A4 Vector Target</span>
              </div>
            </div>

            {/* RIGHT PANE: Native Vector PDF Preview */}
            <div className="flex flex-col rounded-2xl bg-m3-surface-container-lowest border border-m3-outline-variant/40 shadow-sm overflow-hidden">
              
              <div className="flex items-center justify-between px-3 py-2 bg-m3-surface-container-low border-b border-m3-outline-variant/30 text-xs">
                <span className="font-semibold text-m3-on-surface flex items-center gap-1.5">
                  <span>🔍</span> Native PDF Vector Preview
                </span>
                {outputFile && (
                  <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Ready · {formatBytes(outputFile.size)}
                  </span>
                )}
              </div>

              <div className="flex-1 relative flex flex-col items-center justify-center min-h-[460px] bg-slate-100 dark:bg-zinc-900/60 p-2">
                {pdfPreviewUrl ? (
                  <iframe
                    title="Vector PDF Preview"
                    src={`${pdfPreviewUrl}#toolbar=0&navpanes=0`}
                    className="w-full h-full rounded-xl border border-m3-outline-variant/30 shadow-inner min-h-[460px]"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-m3-surface-container-high flex items-center justify-center text-3xl mb-4 text-m3-on-surface-variant select-none shadow-sm">
                      📄
                    </div>
                    <h3 className="text-sm font-semibold text-m3-on-surface mb-1">
                      Ready to Compile Vector PDF
                    </h3>
                    <p className="text-xs text-m3-on-surface-variant leading-relaxed mb-5">
                      Click the <strong>Re-Generate PDF</strong> button to compile your markdown notes into a vector A4 PDF.
                    </p>
                    <button
                      type="button"
                      onClick={() => compilePDF(markdown, docTitle, fileName)}
                      className="rounded-full px-5 py-2 text-xs font-semibold bg-m3-primary text-m3-on-primary hover:bg-m3-primary/90 shadow-sm transition-transform active:scale-95"
                    >
                      Generate Live Preview
                    </button>
                  </div>
                )}
              </div>

              {/* Result Actions strictly visible when stage === "done" */}
              {stage === "done" && outputFile && (
                <div className="p-4 bg-m3-surface-container-low border-t border-m3-outline-variant/30">
                  <ActionButtons
                    blob={outputFile.blob}
                    fileName={outputFile.name}
                    origSize={sourceFile?.size || new Blob([markdown]).size}
                    resultMime="application/pdf"
                    toolName="Text to PDF"
                    auth={auth}
                    onReset={handleResetToDropzone}
                  />
                </div>
              )}
            </div>

          </div>
        </>
      )}

    </div>
  );
}
