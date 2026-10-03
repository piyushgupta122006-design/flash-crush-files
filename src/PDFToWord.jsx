// PDFToWord.jsx — 100% In-Browser PDF to Word (DOCX) Converter (Google Material Design 3)
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } from "docx";
import { addHistoryRecord } from "./historyDB";
import ActionButtons from "./ActionButtons";
import { consumePendingFile } from "./clipboardStore";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

const MAX_SIZE_MB = 100;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

// Load PDF.js from CDN dynamically on-demand
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF engine"));
    document.head.appendChild(s);
  });
}

export default function PDFToWord({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | ready | converting | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  // Settings
  const [preservePageBreaks, setPreservePageBreaks] = useState(true);
  const [detectHeadings, setDetectHeadings] = useState(true);
  const [smartDehyphenate, setSmartDehyphenate] = useState(true);

  // Metadata & Results
  const [pdfMeta, setPdfMeta] = useState(null); // { totalPages, firstPageThumbnail }
  const [resultDocx, setResultDocx] = useState(null); // { blob, url, fileName, size, pageCount, wordCount }

  const inputRef = useRef(null);

  // Check for pending clipboard file on mount
  useEffect(() => {
    const pending = consumePendingFile();
    if (pending && (pending.type === "application/pdf" || pending.name.toLowerCase().endsWith(".pdf"))) {
      handleFile(pending);
    }
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (resultDocx?.url) URL.revokeObjectURL(resultDocx.url);
      if (pdfMeta?.firstPageThumbnail) URL.revokeObjectURL(pdfMeta.firstPageThumbnail);
    };
  }, [resultDocx, pdfMeta]);

  const handleFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported.");
      setStage("error");
      return;
    }
    if (f.size > MAX_SIZE) {
      setErrorMsg(`File exceeds the ${MAX_SIZE_MB} MB limit.`);
      setStage("error");
      return;
    }

    setFile(f);
    setErrorMsg("");
    setStage("ready");

    // Generate quick preview thumbnail of cover page
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await f.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const firstPage = await pdfDoc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await firstPage.render({ canvasContext: ctx, viewport }).promise;

      setPdfMeta({
        totalPages: pdfDoc.numPages,
        firstPageThumbnail: canvas.toDataURL("image/jpeg", 0.8),
      });
    } catch (e) {
      console.warn("Could not generate first page preview:", e);
      setPdfMeta(null);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleDrivePick = async () => {
    setPickLoading(true);
    try {
      const token = await auth?.getToken();
      await auth?.ensurePickerReady();

      const view = new window.google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf");

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setAppId("564511509147")
        .setOAuthToken(token)
        .addView(view)
        .setCallback(async (data) => {
          if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const fileId = doc[window.google.picker.Document.ID];
            const fileName = doc[window.google.picker.Document.NAME] || "document.pdf";
            try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Google Drive download failed");
              const blob = await res.blob();
              handleFile(new File([blob], fileName, { type: "application/pdf" }));
            } catch (err) {
              setErrorMsg(err.message || "Failed to download from Google Drive.");
              setStage("error");
            }
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      setErrorMsg(err.message || "Google Drive picker failed.");
      setStage("error");
    } finally {
      setPickLoading(false);
    }
  };

  // ── Fluid Paragraph & Coordinate-based Reconstruction Algorithm ──
  const convertToWord = async () => {
    if (!file) return;
    setStage("converting");
    setProgress(5);
    setProgressMsg("Loading PDF engine...");
    setErrorMsg("");

    try {
      const pdfjs = await loadPdfJs();
      setProgress(12);
      setProgressMsg("Reading PDF document...");

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      const docParagraphs = [];
      let totalWordCount = 0;

      // Extract raw items across all pages to profile baseline typography
      const pagesData = [];
      const globalFontSizes = [];

      for (let p = 1; p <= totalPages; p++) {
        const stepProgress = 12 + Math.round((p / totalPages) * 35);
        setProgress(stepProgress);
        setProgressMsg(`Analyzing page ${p} of ${totalPages}...`);

        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent({ normalizeWhitespace: true });

        const rawItems = [];
        for (const item of textContent.items) {
          if (!item.str || item.str.trim() === "") continue;

          // In PDF transform: [scaleX, skewY, skewX, scaleY, tx, ty]
          const tx = item.transform[4];
          const ty = item.transform[5];
          // PDF coordinates have (0,0) at bottom-left; convert to top-down
          const yTop = viewport.height - ty;
          const fontSize = Math.round(
            Math.hypot(item.transform[2], item.transform[3]) || item.height || 12
          );

          const fontName = (item.fontName || "").toLowerCase();
          const isBold = /bold|black|heavy|semibold|medium|demi/i.test(fontName);
          const isItalic = /italic|oblique/i.test(fontName);

          rawItems.push({
            str: item.str,
            x: tx,
            y: yTop,
            width: item.width || (item.str.length * fontSize * 0.5),
            height: item.height || fontSize,
            fontSize,
            isBold,
            isItalic,
          });

          globalFontSizes.push(fontSize);
        }

        pagesData.push({ pageNum: p, rawItems, pageHeight: viewport.height });
      }

      // Compute modal (body) font size
      const fontCounts = {};
      let bodyFontSize = 11;
      let maxCount = 0;
      for (const fs of globalFontSizes) {
        fontCounts[fs] = (fontCounts[fs] || 0) + 1;
        if (fontCounts[fs] > maxCount) {
          maxCount = fontCounts[fs];
          bodyFontSize = fs;
        }
      }

      setProgress(50);
      setProgressMsg("Reconstructing fluid paragraphs & document flow...");

      // Process each page
      for (let pIdx = 0; pIdx < pagesData.length; pIdx++) {
        const { pageNum, rawItems } = pagesData[pIdx];

        if (rawItems.length === 0) {
          if (preservePageBreaks && pIdx < pagesData.length - 1) {
            docParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
          }
          continue;
        }

        // 1. Sort items primarily by Y (top to bottom), secondarily by X (left to right)
        rawItems.sort((a, b) => a.y - b.y || a.x - b.x);

        // 2. Cluster into Lines (group items with same baseline within tolerance)
        const lines = [];
        for (const item of rawItems) {
          let line = lines.find(
            (l) => Math.abs(l.y - item.y) <= Math.max(3, item.fontSize * 0.35)
          );
          if (line) {
            line.items.push(item);
            // Update line average baseline Y
            line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
            if (item.fontSize > line.maxFontSize) line.maxFontSize = item.fontSize;
          } else {
            lines.push({
              y: item.y,
              maxFontSize: item.fontSize,
              items: [item],
            });
          }
        }

        // Sort lines from top to bottom
        lines.sort((a, b) => a.y - b.y);

        // 3. Assemble words within each line and calculate line metrics
        const processedLines = lines.map((line) => {
          line.items.sort((a, b) => a.x - b.x);

          const runs = [];
          let lineText = "";
          let prevRight = null;

          for (let i = 0; i < line.items.length; i++) {
            const item = line.items[i];

            // Insert horizontal space if there is a gap between consecutive items
            if (prevRight !== null && item.x - prevRight > item.fontSize * 0.22) {
              if (!lineText.endsWith(" ") && !item.str.startsWith(" ")) {
                runs.push({ text: " ", isBold: false, isItalic: false, fontSize: item.fontSize });
                lineText += " ";
              }
            }

            runs.push({
              text: item.str,
              isBold: item.isBold,
              isItalic: item.isItalic,
              fontSize: item.fontSize,
            });
            lineText += item.str;
            prevRight = item.x + item.width;
          }

          const firstItem = line.items[0];
          const lastItem = line.items[line.items.length - 1];

          return {
            y: line.y,
            x: firstItem.x,
            width: lastItem.x + lastItem.width - firstItem.x,
            fontSize: line.maxFontSize,
            runs,
            text: lineText.trim(),
          };
        }).filter((l) => l.text.length > 0);

        if (processedLines.length === 0) continue;

        // 4. Calculate median vertical line-height for this page
        const lineDeltas = [];
        for (let i = 0; i < processedLines.length - 1; i++) {
          const dy = processedLines[i + 1].y - processedLines[i].y;
          if (dy > 0 && dy < bodyFontSize * 3.5) {
            lineDeltas.push(dy);
          }
        }
        lineDeltas.sort((a, b) => a - b);
        const medianLineHeight =
          lineDeltas.length > 0
            ? lineDeltas[Math.floor(lineDeltas.length / 2)]
            : bodyFontSize * 1.3;

        // 5. Reconstruct Fluid Paragraphs with Strict Structural Boundaries
        const paragraphs = [];
        let currentPara = null;

        const finalizeCurrentPara = () => {
          if (!currentPara || currentPara.runs.length === 0) return;
          // If paragraph is a heading, drop trailing spaces from the last run
          if (currentPara.headingLevel && currentPara.runs.length > 0) {
            const last = currentPara.runs[currentPara.runs.length - 1];
            last.text = last.text.trimEnd();
          }
          paragraphs.push(currentPara);
          currentPara = null;
        };

        const BULLET_REGEX =
          /^\s*[\u2022\u00b7\u25cf\u25cb\u25a0\u2023\u2219\u2043\-\*\uf0b7]/;
        const NUMBERED_REGEX = /^\s*(\d{1,3}[\.\)]|[a-zA-Z][\.\)])\s+/;
        const BULLET_STRIP_REGEX =
          /^\s*[\u2022\u00b7\u25cf\u25cb\u25a0\u2023\u2219\u2043\-\*\uf0b7]\s*/;
        const SECTION_KEYWORD_REGEX =
          /^(aim|theory|conclusion|objective|procedure|results?|discussion|abstract|introduction|summary|overview|methodology|references?|background|materials?|apparatus|observation|precautions?):?$/i;

        for (let i = 0; i < processedLines.length; i++) {
          const line = processedLines[i];
          const text = line.text;
          const cleanText = text.trim();
          if (!cleanText) continue;

          const lineIsBold =
            line.runs.length > 0 &&
            line.runs.every((r) => r.isBold || r.text.trim() === "");
          const lineFontSize = line.fontSize;

          // Check if line is a bullet or numbered list item (test both raw line.text and cleanText)
          const isBullet =
            BULLET_REGEX.test(line.text) || BULLET_REGEX.test(cleanText);
          const isNumbered =
            NUMBERED_REGEX.test(line.text) || NUMBERED_REGEX.test(cleanText);
          const isList = isBullet || isNumbered;

          // Check for isolated section headings (Aim, Theory, Conclusion, etc.)
          const isSectionKeyword = SECTION_KEYWORD_REGEX.test(cleanText);
          const isShortIsolatedTitle =
            cleanText.length < 65 &&
            (lineIsBold || lineFontSize >= bodyFontSize * 1.1) &&
            !/[.!?]$/.test(cleanText);

          // Determine if this line is a heading
          let headingLevel = null;
          if (detectHeadings) {
            if (lineFontSize >= bodyFontSize * 1.5) {
              headingLevel = HeadingLevel.HEADING_1;
            } else if (lineFontSize >= bodyFontSize * 1.25) {
              headingLevel = HeadingLevel.HEADING_2;
            } else if (
              isSectionKeyword ||
              isShortIsolatedTitle ||
              lineFontSize >= bodyFontSize * 1.1
            ) {
              headingLevel = HeadingLevel.HEADING_3;
            }
          }

          // Decide if we MUST start a new paragraph (Rule 1, 2, 3)
          let isNewParagraph = false;
          if (!currentPara) {
            isNewParagraph = true;
          } else if (isList) {
            // Rule 2: Jab bhi koi line is bullet regex se match kare, strictly ek naya paragraph/list item initialize karo
            isNewParagraph = true;
          } else if (currentPara.isList) {
            // Rule 2: Previous item was a bullet/list item. Never merge non-bullet or return to normal text into it
            const dy = line.y - currentPara.lastY;
            const isIndentedSubLine =
              dy <= medianLineHeight * 1.3 &&
              line.x > currentPara.firstX + 8 &&
              !/^[A-Z]/.test(cleanText);
            if (!isIndentedSubLine) {
              isNewParagraph = true;
            }
          } else if (headingLevel !== null || currentPara.headingLevel !== null) {
            // Rule 1 & 3: Never merge anything into a heading, or a heading into previous text
            isNewParagraph = true;
          } else {
            const dy = line.y - currentPara.lastY;
            // Rule 1: Vertical gap > 1.3x median line-height
            if (dy > medianLineHeight * 1.3) {
              isNewParagraph = true;
            } else if (lineIsBold !== currentPara.isBold) {
              // Rule 1: Sudden change in font weight (e.g. Bold titles vs normal body)
              isNewParagraph = true;
            } else if (Math.abs(lineFontSize - currentPara.fontSize) >= 1.5) {
              // Rule 1: Sudden change in font size
              isNewParagraph = true;
            }
          }

          if (isNewParagraph) {
            finalizeCurrentPara();
            currentPara = {
              headingLevel,
              isList,
              isBullet,
              isBold: lineIsBold,
              fontSize: lineFontSize,
              firstX: line.x,
              runs: line.runs.map((r) => ({ ...r })),
              lastY: line.y,
              lastText: cleanText,
            };
          } else {
            // Merge line into ongoing fluid paragraph
            let runsToAdd = line.runs.map((r) => ({ ...r }));

            // Smart de-hyphenation: check if previous line ended with hyphen and next line starts with lowercase
            let dehyphenated = false;
            if (smartDehyphenate && currentPara.runs.length > 0) {
              const lastRun = currentPara.runs[currentPara.runs.length - 1];
              if (lastRun.text.endsWith("-") && /^[a-z]/.test(runsToAdd[0]?.text || "")) {
                lastRun.text = lastRun.text.slice(0, -1);
                dehyphenated = true;
              }
            }

            // If not de-hyphenated, join lines with a single fluid space
            if (!dehyphenated) {
              const lastRun = currentPara.runs[currentPara.runs.length - 1];
              if (lastRun && !lastRun.text.endsWith(" ") && !runsToAdd[0]?.text.startsWith(" ")) {
                currentPara.runs.push({
                  text: " ",
                  isBold: currentPara.isBold,
                  isItalic: false,
                  fontSize: lineFontSize,
                });
              }
            }

            currentPara.runs.push(...runsToAdd);
            currentPara.lastY = line.y;
            currentPara.lastText = cleanText;
          }
        }
        finalizeCurrentPara();

        // Convert constructed paragraphs to docx Paragraph objects
        for (const p of paragraphs) {
          // If bullet item, strip leading bullet marker character from runs so native Word bullet doesn't duplicate
          if (p.isBullet && p.runs.length > 0) {
            if (BULLET_STRIP_REGEX.test(p.runs[0].text)) {
              p.runs[0].text = p.runs[0].text.replace(BULLET_STRIP_REGEX, "");
              if (!p.runs[0].text.trim() && p.runs.length > 1) {
                p.runs.shift();
              }
            }
          }

          // Merge adjacent runs with identical styling to optimize docx XML size
          const mergedRuns = [];
          for (const r of p.runs) {
            const prev = mergedRuns[mergedRuns.length - 1];
            if (
              prev &&
              prev.isBold === r.isBold &&
              prev.isItalic === r.isItalic &&
              prev.fontSize === r.fontSize
            ) {
              prev.text += r.text;
            } else {
              mergedRuns.push({ ...r });
            }
          }

          // If bullet item, ensure leading bullet symbol is completely stripped from mergedRuns[0]
          if (p.isBullet && mergedRuns.length > 0) {
            mergedRuns[0].text = mergedRuns[0].text.replace(BULLET_STRIP_REGEX, "");
          }

          // If heading, ensure trailing space is dropped
          if (p.headingLevel && mergedRuns.length > 0) {
            mergedRuns[mergedRuns.length - 1].text = mergedRuns[
              mergedRuns.length - 1
            ].text.trimEnd();
          }

          // Count words
          const paraText = mergedRuns.map((r) => r.text).join("");
          const words = paraText.trim().split(/\s+/).filter(Boolean);
          totalWordCount += words.length;

          // Map to docx TextRun elements (size in docx is half-points, e.g. 12pt = 24)
          const textRunElements = mergedRuns.map(
            (r) =>
              new TextRun({
                text: r.text,
                bold: r.isBold,
                italics: r.isItalic,
                size: Math.max(16, Math.min(72, Math.round(r.fontSize * 2))),
                font: "Calibri",
              })
          );

          const paraOptions = {
            children: textRunElements,
            spacing: {
              line: 276, // 1.15 line spacing
              before: p.headingLevel ? 240 : 0,
              after: p.headingLevel ? 120 : p.isList ? 60 : 120,
            },
          };

          if (p.headingLevel) {
            paraOptions.heading = p.headingLevel;
          }

          if (p.isBullet) {
            paraOptions.bullet = { level: 0 };
          }

          docParagraphs.push(new Paragraph(paraOptions));
        }

        // Page break if requested and not on last page
        if (preservePageBreaks && pIdx < pagesData.length - 1) {
          docParagraphs.push(
            new Paragraph({
              children: [new PageBreak()],
            })
          );
        }
      }

      setProgress(85);
      setProgressMsg("Generating Word document (.docx)...");

      // Build docx Document
      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "Calibri",
                size: Math.round(bodyFontSize * 2),
                color: "1A1A1A",
              },
              paragraph: {
                spacing: { line: 276, after: 120 },
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch = 1440 twips
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children: docParagraphs.length > 0
              ? docParagraphs
              : [new Paragraph({ children: [new TextRun("No extractable text found in PDF.")] })],
          },
        ],
      });

      // Package into Blob
      const docxBlob = await Packer.toBlob(doc);
      const downloadUrl = URL.createObjectURL(docxBlob);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const outputFileName = `${baseName}_converted.docx`;

      // Save record to local offline history (IndexedDB)
      try {
        await addHistoryRecord({
          tool: "PDF to Word",
          fileName: outputFileName,
          originalSize: file.size,
          resultSize: docxBlob.size,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn("History save warning:", err);
      }

      setResultDocx({
        blob: docxBlob,
        url: downloadUrl,
        fileName: outputFileName,
        size: docxBlob.size,
        pageCount: totalPages,
        wordCount: totalWordCount,
      });

      setProgress(100);
      setStage("done");
    } catch (err) {
      console.error("PDF to DOCX conversion error:", err);
      setErrorMsg(err.message || "Failed to convert PDF to Word document.");
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
    setPdfMeta(null);
    if (resultDocx?.url) URL.revokeObjectURL(resultDocx.url);
    setResultDocx(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-sans transition-colors">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-m3-secondary-container text-m3-on-secondary-container border border-m3-primary/20 mb-3 shadow-xs">
          <span>📝</span>
          <span>Document Super-Converter Suite</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-normal text-m3-on-surface tracking-tight leading-tight">
          PDF to <span className="text-m3-primary font-medium">Word (DOCX)</span>
        </h1>
        <p className="mt-2 text-sm sm:text-base text-m3-on-surface-variant max-w-xl mx-auto leading-relaxed">
          Convert PDF pages into editable Microsoft Word documents with fluid paragraphs, heading detection, and zero server uploads.
        </p>
      </div>

      {/* ── Error Banner ── */}
      {stage === "error" && (
        <div className="mb-6 p-4 rounded-2xl bg-m3-error-container text-m3-on-error-container border border-m3-error/30 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span>⚠️</span>
            <span>{errorMsg || "An error occurred during conversion."}</span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1 rounded-full bg-m3-error text-m3-on-error text-xs font-medium hover:opacity-90 transition-all cursor-pointer flex-shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Dropzone & Ingestion (Stage: idle) ── */}
      {stage === "idle" && (
        <div
          className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-m3-surface-container-low cursor-pointer ${
            dragging
              ? "border-m3-primary bg-m3-primary-container/20 scale-[0.99]"
              : "border-m3-outline-variant/60 hover:border-m3-primary hover:bg-m3-surface-container"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <div className="w-16 h-16 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center mx-auto mb-4 text-3xl shadow-xs">
            📄
          </div>

          <h3 className="text-lg font-medium text-m3-on-surface mb-1">
            Drop your PDF document here
          </h3>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md mx-auto mb-5">
            or click to browse from device. Supports multi-page PDFs up to {MAX_SIZE_MB} MB.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-6 py-2.5 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-2"
            >
              <span>📁</span> Choose PDF File
            </button>

            {auth?.isSignedIn && (
              <button
                type="button"
                onClick={handleDrivePick}
                disabled={pickLoading}
                className="px-5 py-2.5 rounded-full bg-m3-surface-container-highest text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high active:scale-95 transition-all border border-m3-outline-variant/40 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>☁️</span> {pickLoading ? "Opening Drive…" : "Google Drive"}
              </button>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-m3-on-surface-variant font-medium">
            <span>🔒 100% Client-Side Private</span>
            <span>•</span>
            <span>🌊 Fluid Paragraphs</span>
            <span>•</span>
            <span>✍️ Editable .DOCX</span>
          </div>
        </div>
      )}

      {/* ── Ready & Conversion Settings (Stage: ready) ── */}
      {stage === "ready" && file && (
        <div className="bg-m3-surface-container rounded-3xl p-6 sm:p-8 shadow-m3-elevation-2 border border-m3-outline-variant/60">
          {/* File summary */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 pb-6 border-b border-m3-outline-variant/40">
            <div className="flex items-center gap-4">
              {pdfMeta?.firstPageThumbnail ? (
                <div className="w-16 h-20 rounded-xl overflow-hidden bg-m3-surface-container-high border border-m3-outline-variant/60 shadow-xs flex-shrink-0">
                  <img src={pdfMeta.firstPageThumbnail} alt="PDF Cover" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-20 rounded-xl bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center text-2xl flex-shrink-0">
                  📑
                </div>
              )}
              <div>
                <h3 className="text-base sm:text-lg font-medium text-m3-on-surface break-all line-clamp-1">
                  {file.name}
                </h3>
                <div className="flex items-center gap-2.5 mt-1 text-xs text-m3-on-surface-variant">
                  <span>{formatBytes(file.size)}</span>
                  {pdfMeta?.totalPages && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-m3-primary">{pdfMeta.totalPages} Pages</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-m3-on-surface-variant hover:text-m3-error hover:bg-m3-error-container/30 transition-colors cursor-pointer"
            >
              ✕ Remove
            </button>
          </div>

          {/* Options & Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-m3-outline-variant/40">
            {/* Page Break Mode */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Document Layout Flow
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-m3-surface-container-high rounded-2xl border border-m3-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setPreservePageBreaks(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    preservePageBreaks
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <span className="font-semibold">Match Pages</span>
                  <span className="text-[10px] opacity-75">Page breaks preserved</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreservePageBreaks(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    !preservePageBreaks
                      ? "bg-m3-secondary-container text-m3-on-secondary-container font-semibold shadow-xs"
                      : "text-m3-on-surface-variant hover:text-m3-on-surface"
                  }`}
                >
                  <span className="font-semibold">Continuous</span>
                  <span className="text-[10px] opacity-75">Single continuous flow</span>
                </button>
              </div>
            </div>

            {/* Smart Typography Enhancements */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-m3-on-surface-variant mb-2">
                Formatting Engine
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-m3-surface-container-high/60 border border-m3-outline-variant/20 cursor-pointer text-xs text-m3-on-surface select-none">
                  <input
                    type="checkbox"
                    checked={detectHeadings}
                    onChange={(e) => setDetectHeadings(e.target.checked)}
                    className="rounded text-m3-primary focus:ring-m3-primary"
                  />
                  <span>Detect Headings & Hierarchy (H1, H2, H3)</span>
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-m3-surface-container-high/60 border border-m3-outline-variant/20 cursor-pointer text-xs text-m3-on-surface select-none">
                  <input
                    type="checkbox"
                    checked={smartDehyphenate}
                    onChange={(e) => setSmartDehyphenate(e.target.checked)}
                    className="rounded text-m3-primary focus:ring-m3-primary"
                  />
                  <span>Smart De-Hyphenation (Heal split line-ends)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-m3-on-surface-variant text-center sm:text-left">
              <span>Ready to transform {pdfMeta?.totalPages ? `${pdfMeta.totalPages} pages` : "document"} into editable Word document</span>
            </div>
            <button
              type="button"
              onClick={convertToWord}
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <span>📝</span> Convert to Word (.docx)
            </button>
          </div>
        </div>
      )}

      {/* ── Converting Progress Bar (Stage: converting) ── */}
      {stage === "converting" && (
        <div className="bg-m3-surface-container rounded-3xl p-8 sm:p-12 text-center shadow-m3-elevation-2 border border-m3-outline-variant/60">
          <div className="w-16 h-16 rounded-full border-4 border-m3-surface-container-high border-t-m3-primary animate-spin mx-auto mb-5" />

          <h3 className="text-xl font-medium text-m3-on-surface mb-2">
            Reconstructing Word Document
          </h3>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant mb-6 max-w-md mx-auto">
            {progressMsg || "Processing on-device..."}
          </p>

          <div className="max-w-md mx-auto">
            <div className="w-full bg-m3-surface-container-highest rounded-full h-3 overflow-hidden shadow-inner mb-2">
              <div
                className="bg-m3-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-mono text-m3-on-surface-variant">
              <span>Progress</span>
              <span className="font-semibold text-m3-primary">{progress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Conversion Success & Export (Stage: done) ── */}
      {stage === "done" && resultDocx && (
        <div className="bg-m3-surface-container rounded-3xl p-6 sm:p-10 shadow-m3-elevation-2 border border-m3-outline-variant/60 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center mx-auto mb-4 text-3xl shadow-xs">
            🎉
          </div>

          <h2 className="text-2xl font-normal text-m3-on-surface tracking-tight mb-1">
            Word Document Ready!
          </h2>
          <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md mx-auto mb-6">
            Your PDF has been converted into an editable Microsoft Word (.docx) document with fluid paragraphs.
          </p>

          {/* Result info card */}
          <div className="bg-m3-surface-container-high rounded-2xl p-4 sm:p-5 max-w-lg mx-auto mb-8 border border-m3-outline-variant/40 flex items-center justify-between gap-4 text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-m3-secondary-container text-m3-on-secondary-container flex items-center justify-center text-xl flex-shrink-0">
                📝
              </div>
              <div>
                <div className="text-sm font-semibold text-m3-on-surface truncate max-w-[200px] sm:max-w-xs">
                  {resultDocx.fileName}
                </div>
                <div className="text-xs text-m3-on-surface-variant mt-0.5 flex items-center gap-2">
                  <span>{formatBytes(resultDocx.size)}</span>
                  <span>•</span>
                  <span>{resultDocx.pageCount} Pages</span>
                  <span>•</span>
                  <span>~{resultDocx.wordCount} Words</span>
                  <span>•</span>
                  <span className="uppercase text-[10px] font-bold text-m3-primary">.DOCX</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
            <a
              href={resultDocx.url}
              download={resultDocx.fileName}
              className="w-full sm:flex-1 py-3 px-6 rounded-full bg-m3-primary text-m3-on-primary text-sm font-medium hover:opacity-95 active:scale-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📥</span> Download (.docx)
            </a>

            <button
              type="button"
              onClick={reset}
              className="w-full sm:w-auto py-3 px-5 rounded-full bg-m3-surface-container-highest text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high active:scale-95 transition-all border border-m3-outline-variant/40 cursor-pointer"
            >
              Convert Another PDF
            </button>
          </div>

          {/* Google Drive Upload Sync */}
          {auth?.isSignedIn && (
            <div className="mt-6 pt-6 border-t border-m3-outline-variant/40 flex justify-center">
              <ActionButtons
                file={new File([resultDocx.blob], resultDocx.fileName, {
                  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                })}
                auth={auth}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Feature Highlights Footer ── */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">🌊</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">Fluid Paragraph Flow</div>
          <div className="text-[11px] text-m3-on-surface-variant">No chopped sentences or hard breaks. Text wraps and edits naturally in Word.</div>
        </div>
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">🔒</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">100% Client-Side Privacy</div>
          <div className="text-[11px] text-m3-on-surface-variant">Documents are parsed and compiled in local browser memory. Zero server uploads.</div>
        </div>
        <div className="p-4 rounded-2xl bg-m3-surface-container-low border border-m3-outline-variant/30">
          <div className="text-2xl mb-1.5">📐</div>
          <div className="text-xs font-semibold text-m3-on-surface mb-0.5">Heading & Style Detection</div>
          <div className="text-[11px] text-m3-on-surface-variant">Automatically maps titles, subtitles, bold styles, and bullet points.</div>
        </div>
      </div>
    </div>
  );
}
