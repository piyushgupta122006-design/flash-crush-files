// PDFToExcel.jsx — 100% In-Browser PDF to Excel/CSV Converter (Google Material Design 3)
// Features Strict Table Block Isolation + Local X-Projection 2D Grid Reconstruction
import { useState, useRef, useEffect } from "react";
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

// Load SheetJS (XLSX) from CDN dynamically on-demand
function loadSheetJs() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
      } else {
        reject(new Error("SheetJS failed to initialize"));
      }
    };
    s.onerror = () => {
      // Secondary fallback to cdnjs if primary CDN is blocked
      const fallback = document.createElement("script");
      fallback.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      fallback.onload = () => {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error("Failed to load SheetJS fallback"));
      };
      fallback.onerror = () => reject(new Error("Failed to load Excel engine"));
      document.head.appendChild(fallback);
    };
    document.head.appendChild(s);
  });
}

export default function PDFToExcel({ auth }) {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | ready | converting | done | error
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pickLoading, setPickLoading] = useState(false);

  // Settings
  const [outputFormat, setOutputFormat] = useState("xlsx"); // "xlsx" | "csv"
  const [sheetMode, setSheetMode] = useState("multi"); // "multi" (page per tab) | "combined" (unified sheet)
  const [autoColumnWidth, setAutoColumnWidth] = useState(true);
  const [firstRowHeader, setFirstRowHeader] = useState(true);

  // Metadata & Results
  const [pdfMeta, setPdfMeta] = useState(null); // { totalPages, firstPageThumbnail }
  const [resultSpreadsheet, setResultSpreadsheet] = useState(null); 
  // { blob, url, fileName, size, pageCount, totalRows, totalCols, previewMatrix: string[][] }

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
      if (resultSpreadsheet?.url) URL.revokeObjectURL(resultSpreadsheet.url);
      if (pdfMeta?.firstPageThumbnail) URL.revokeObjectURL(pdfMeta.firstPageThumbnail);
    };
  }, [resultSpreadsheet, pdfMeta]);

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

  // ── Strict Table Block Isolation + Local X-Projection 2D Grid Algorithm ──
  const convertToExcel = async () => {
    if (!file) return;
    setStage("converting");
    setProgress(5);
    setProgressMsg("Loading PDF & Excel engines...");
    setErrorMsg("");

    try {
      const [pdfjs, XLSX] = await Promise.all([loadPdfJs(), loadSheetJs()]);
      setProgress(15);
      setProgressMsg("Reading PDF document...");

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      const pageMatrices = []; // Array of { pageNum, matrix: string[][] }
      let grandTotalRows = 0;
      let maxColsFound = 1;

      // Process each page individually
      for (let p = 1; p <= totalPages; p++) {
        const stepProgress = 15 + Math.round((p / totalPages) * 65);
        setProgress(stepProgress);
        setProgressMsg(`Analyzing 2D table structures on page ${p} of ${totalPages}...`);

        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent({ normalizeWhitespace: true });

        const rawItems = [];
        for (const item of textContent.items) {
          if (!item.str || item.str.trim() === "") continue;

          const tx = item.transform[4];
          const ty = item.transform[5];
          // PDF coordinates have (0,0) at bottom-left; convert to top-down
          const yTop = viewport.height - ty;
          const fontSize = Math.round(
            Math.hypot(item.transform[2], item.transform[3]) || item.height || 12
          );

          rawItems.push({
            str: item.str,
            x: tx,
            y: yTop,
            width: item.width || (item.str.length * fontSize * 0.5),
            height: item.height || fontSize,
            fontSize,
          });
        }

        if (rawItems.length === 0) {
          pageMatrices.push({ pageNum: p, matrix: [[""]] });
          continue;
        }

        // 1. Sort items top-to-bottom, then left-to-right
        rawItems.sort((a, b) => a.y - b.y || a.x - b.x);

        // 2. Y-Axis Row Clustering (Group items into horizontal baseline rows)
        const rows = [];
        for (const item of rawItems) {
          let row = rows.find(
            (r) => Math.abs(r.y - item.y) <= Math.max(3.5, item.fontSize * 0.35)
          );
          if (row) {
            row.items.push(item);
            row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
            if (item.fontSize > row.maxFontSize) row.maxFontSize = item.fontSize;
          } else {
            rows.push({
              y: item.y,
              maxFontSize: item.fontSize,
              items: [item],
            });
          }
        }
        rows.sort((a, b) => a.y - b.y);

        // 3. Intra-row Cluster Formation (Group words while preserving large horizontal gutters)
        const processedRows = rows.map((row) => {
          row.items.sort((a, b) => a.x - b.x);

          const clusters = [];
          let currentCluster = null;

          for (let i = 0; i < row.items.length; i++) {
            const item = row.items[i];
            if (!currentCluster) {
              currentCluster = {
                x: item.x,
                right: item.x + item.width,
                text: item.str,
                fontSize: item.fontSize,
              };
            } else {
              const gap = item.x - currentCluster.right;
              // If gap is small (normal word spacing), merge into current cluster
              const maxWordGap = Math.max(5.5, item.fontSize * 0.42);
              if (gap <= maxWordGap) {
                if (!currentCluster.text.endsWith(" ") && !item.str.startsWith(" ") && gap > 1.2) {
                  currentCluster.text += " ";
                }
                currentCluster.text += item.str;
                currentCluster.right = Math.max(currentCluster.right, item.x + item.width);
              } else {
                // Significant gap: start a new cluster on this row
                clusters.push(currentCluster);
                currentCluster = {
                  x: item.x,
                  right: item.x + item.width,
                  text: item.str,
                  fontSize: item.fontSize,
                };
              }
            }
          }
          if (currentCluster) clusters.push(currentCluster);

          return {
            y: row.y,
            fontSize: row.maxFontSize,
            clusters,
            fullText: clusters.map((c) => c.text).join(" ").trim(),
          };
        }).filter((r) => r.clusters.length > 0);

        // 4. Row Classification (Table Row vs Paragraph/Header Row)
        // A row is a Table Row candidate if it contains >= 2 clusters separated by significant column gutters
        const classifiedRows = processedRows.map((row) => {
          let hasColumnGutter = false;
          if (row.clusters.length >= 2) {
            for (let i = 0; i < row.clusters.length - 1; i++) {
              const gutter = row.clusters[i + 1].x - row.clusters[i].right;
              // Column gutter threshold: typically >= 14pt or 1.25x font size
              if (gutter >= Math.max(14, row.fontSize * 1.25)) {
                hasColumnGutter = true;
                break;
              }
            }
          }
          const isTableRow = hasColumnGutter && row.clusters.length >= 2;
          return { ...row, isTableRow };
        });

        // 5. Table Block Isolation: Identify contiguous table rows
        const tableBlocks = [];
        let currentTBlock = null;

        for (let i = 0; i < classifiedRows.length; i++) {
          const row = classifiedRows[i];
          if (row.isTableRow) {
            if (!currentTBlock) {
              currentTBlock = {
                startIdx: i,
                endIdx: i,
                rows: [row],
              };
            } else {
              currentTBlock.endIdx = i;
              currentTBlock.rows.push(row);
            }
          } else {
            if (currentTBlock) {
              tableBlocks.push(currentTBlock);
              currentTBlock = null;
            }
          }
        }
        if (currentTBlock) tableBlocks.push(currentTBlock);

        // Pre-initialize structured blocks for Context Anchoring (Proximity Filter)
        const structuredBlocks = tableBlocks.map((tb) => ({
          headerContextRows: [],
          tableRows: tb.rows,
          footerContextRows: [],
          startIdx: tb.startIdx,
          endIdx: tb.endIdx,
        }));

        const usedTextIndices = new Set();

        // 5A. Preceding Context Anchoring (Table Titles & Subtitles, up to 3 strictly adjacent short lines)
        for (let b = 0; b < structuredBlocks.length; b++) {
          const sb = structuredBlocks[b];
          const prevTableEndIdx = b > 0 ? structuredBlocks[b - 1].endIdx : -1;

          let lookbackIdx = sb.startIdx - 1;
          let lastY = sb.tableRows[0].y;

          while (
            lookbackIdx > prevTableEndIdx &&
            sb.headerContextRows.length < 3 &&
            !usedTextIndices.has(lookbackIdx)
          ) {
            const candRow = classifiedRows[lookbackIdx];
            const gap = lastY - candRow.y;

            // Strict Proximity Threshold: only immediately adjacent header lines (<= 30pt; <= 26pt between headers)
            const maxAllowedGap = sb.headerContextRows.length === 0 ? 30 : 26;
            if (gap > 0 && gap <= maxAllowedGap && candRow.fullText.length <= 130) {
              sb.headerContextRows.unshift(candRow);
              usedTextIndices.add(lookbackIdx);
              lastY = candRow.y;
              lookbackIdx--;
            } else {
              // Any gap > 30pt or non-adjacent text: strictly break & drop
              break;
            }
          }
        }

        // 5B. Succeeding Context Anchoring (Table Footnotes & Summaries, up to 2 strictly adjacent short lines)
        for (let b = 0; b < structuredBlocks.length; b++) {
          const sb = structuredBlocks[b];
          const nextClaimedStart =
            b < structuredBlocks.length - 1
              ? structuredBlocks[b + 1].headerContextRows[0]
                ? classifiedRows.indexOf(structuredBlocks[b + 1].headerContextRows[0])
                : structuredBlocks[b + 1].startIdx
              : classifiedRows.length;

          let lookforwardIdx = sb.endIdx + 1;
          let lastY = sb.tableRows[sb.tableRows.length - 1].y;

          while (
            lookforwardIdx < nextClaimedStart &&
            sb.footerContextRows.length < 2 &&
            !usedTextIndices.has(lookforwardIdx)
          ) {
            const candRow = classifiedRows[lookforwardIdx];
            const gap = candRow.y - lastY;

            // Strict Proximity Threshold: only immediately adjacent footnote lines (<= 26pt; <= 22pt between footnotes)
            const maxAllowedGap = sb.footerContextRows.length === 0 ? 26 : 22;
            if (gap > 0 && gap <= maxAllowedGap && candRow.fullText.length <= 130) {
              sb.footerContextRows.push(candRow);
              usedTextIndices.add(lookforwardIdx);
              lastY = candRow.y;
              lookforwardIdx++;
            } else {
              // Any gap > 26pt: strictly break & drop
              break;
            }
          }
        }

        // 6. 2D Matrix Construction using Local X-Projection & SheetJS Merges
        const pageGrid = [];
        const pageMerges = [];
        const pageRowMeta = [];
        let currentRowIdx = 0;

        if (structuredBlocks.length === 0) {
          // If no tables on page, fallback to rows in Col A
          for (const row of classifiedRows) {
            if (row.fullText) {
              pageGrid.push([row.fullText]);
              pageRowMeta.push({ isBanner: false });
            }
          }
        } else {
          for (const sb of structuredBlocks) {
            const tRows = sb.tableRows;

            // Local X-Projection strictly on rows of this table block
            const xStarts = [];
            for (const r of tRows) {
              for (const c of r.clusters) {
                xStarts.push(c.x);
              }
            }
            xStarts.sort((a, b) => a - b);

            const colAnchors = [];
            for (const x of xStarts) {
              let anchor = colAnchors.find((a) => Math.abs(a.meanX - x) <= 18);
              if (anchor) {
                anchor.points.push(x);
                anchor.meanX = anchor.points.reduce((s, v) => s + v, 0) / anchor.points.length;
              } else {
                colAnchors.push({ meanX: x, points: [x] });
              }
            }
            colAnchors.sort((a, b) => a.meanX - b.meanX);
            const numCols = Math.max(1, colAnchors.length);
            if (numCols > maxColsFound) maxColsFound = numCols;

            const colDivisions = [];
            for (let i = 0; i < numCols - 1; i++) {
              colDivisions.push((colAnchors[i].meanX + colAnchors[i + 1].meanX) / 2);
            }

            // A. Preceding Header Context Rows as Merged Banners (Span cols 0 to numCols - 1)
            for (const hRow of sb.headerContextRows) {
              const bannerRow = Array(numCols).fill("");
              bannerRow[0] = hRow.fullText;
              pageGrid.push(bannerRow);

              if (numCols > 1) {
                pageMerges.push({
                  s: { r: currentRowIdx, c: 0 },
                  e: { r: currentRowIdx, c: numCols - 1 },
                });
              }
              pageRowMeta.push({
                isBanner: true,
                bannerType: "Table Title / Context",
                text: hRow.fullText,
              });
              currentRowIdx++;
            }

            // B. Table Data Rows mapped to local columns
            for (const r of tRows) {
              const tableRow = Array(numCols).fill("");
              for (const c of r.clusters) {
                let colIdx = 0;
                for (let d = 0; d < colDivisions.length; d++) {
                  if (c.x > colDivisions[d]) colIdx = d + 1;
                }
                colIdx = Math.min(numCols - 1, colIdx);
                tableRow[colIdx] = tableRow[colIdx] ? tableRow[colIdx] + " " + c.text : c.text;
              }
              pageGrid.push(tableRow);
              pageRowMeta.push({ isBanner: false });
              currentRowIdx++;
            }

            // C. Succeeding Footer Context Rows as Merged Banners
            for (const fRow of sb.footerContextRows) {
              const bannerRow = Array(numCols).fill("");
              bannerRow[0] = fRow.fullText;
              pageGrid.push(bannerRow);

              if (numCols > 1) {
                pageMerges.push({
                  s: { r: currentRowIdx, c: 0 },
                  e: { r: currentRowIdx, c: numCols - 1 },
                });
              }
              pageRowMeta.push({
                isBanner: true,
                bannerType: "Footnote / Note",
                text: fRow.fullText,
              });
              currentRowIdx++;
            }
          }
        }

        grandTotalRows += pageGrid.length;
        pageMatrices.push({
          pageNum: p,
          matrix: pageGrid,
          merges: pageMerges,
          rowMeta: pageRowMeta,
        });

        // Console Log 2D Matrix Structure & Context Blocks for verification
        console.log(`\n======================================================`);
        console.log(`[PDFToExcel Engine] Page ${p} Context Anchoring & Block Isolation`);
        console.log(`======================================================`);
        console.log(`[TableBlock Isolation] Tables Detected: ${structuredBlocks.length}`);
        structuredBlocks.forEach((sb, sbIdx) => {
          console.log(`  Table ${sbIdx + 1}: ${sb.tableRows.length} data rows`);
          if (sb.headerContextRows.length > 0) {
            console.log(
              `    Anchored Header Rows (${sb.headerContextRows.length}): ${sb.headerContextRows
                .map((r) => `"${r.fullText}"`)
                .join(" | ")}`
            );
          }
          if (sb.footerContextRows.length > 0) {
            console.log(
              `    Anchored Footer Rows (${sb.footerContextRows.length}): ${sb.footerContextRows
                .map((r) => `"${r.fullText}"`)
                .join(" | ")}`
            );
          }
        });

        console.log(
          `\n[Local X-Projection + Merges] Reconstructed 2D Matrix (${pageGrid.length} rows, ${maxColsFound} cols):`
        );
        pageGrid.forEach((row, rIdx) => {
          const meta = pageRowMeta[rIdx];
          console.log(
            `  Row ${String(rIdx + 1).padStart(2, " ")} [${
              meta?.isBanner ? meta.bannerType : "DATA"
            }] [Cols: ${row.length}]:`,
            JSON.stringify(row)
          );
        });
        console.log(`SheetJS !merges generated: ${pageMerges.length}`);
        console.log(`======================================================\n`);
      }

      setProgress(85);
      setProgressMsg("Assembling SheetJS workbook & formatting columns...");

      // 7. SheetJS Workbook Creation with Cell Merges & Anti-Distortion Auto-Width
      const wb = XLSX.utils.book_new();

      if (sheetMode === "multi" || totalPages === 1) {
        // Multi-Sheet Mode: One tab per PDF page
        pageMatrices.forEach(({ pageNum, matrix, merges, rowMeta }) => {
          const ws = XLSX.utils.aoa_to_sheet(matrix);

          if (autoColumnWidth) {
            // Anti-distortion column width: Skip merged banner rows so Column A isn't inflated
            const maxColLens = [];
            matrix.forEach((row, rIdx) => {
              if (rowMeta?.[rIdx]?.isBanner) return;
              row.forEach((cell, cIdx) => {
                const len = (cell || "").toString().length;
                maxColLens[cIdx] = Math.max(maxColLens[cIdx] || 10, Math.min(len + 3, 50));
              });
            });
            for (let c = 0; c < maxColsFound; c++) {
              if (!maxColLens[c]) maxColLens[c] = 12;
            }
            ws["!cols"] = maxColLens.map((w) => ({ wch: w }));
          }

          if (merges && merges.length > 0) {
            ws["!merges"] = merges;
          }

          XLSX.utils.book_append_sheet(wb, ws, `Page ${pageNum}`);
        });
      } else {
        // Combined Mode: Unified single continuous sheet
        const combinedMatrix = [];
        const combinedMerges = [];
        const combinedRowMeta = [];
        let runningRowIdx = 0;

        pageMatrices.forEach(({ pageNum, matrix, merges, rowMeta }, idx) => {
          if (idx > 0) {
            combinedMatrix.push([`--- [Page ${pageNum}] ---`]);
            combinedMerges.push({
              s: { r: runningRowIdx, c: 0 },
              e: { r: runningRowIdx, c: maxColsFound - 1 },
            });
            combinedRowMeta.push({ isBanner: true, bannerType: "Page Break" });
            runningRowIdx++;
          }

          const baseOffset = combinedMatrix.length;
          matrix.forEach((row, rIdx) => {
            combinedMatrix.push(row);
            combinedRowMeta.push(rowMeta?.[rIdx] || { isBanner: false });
            runningRowIdx++;
          });

          if (merges && merges.length > 0) {
            merges.forEach((m) => {
              combinedMerges.push({
                s: { r: m.s.r + baseOffset, c: m.s.c },
                e: { r: m.e.r + baseOffset, c: m.e.c },
              });
            });
          }
        });

        const ws = XLSX.utils.aoa_to_sheet(combinedMatrix);
        if (autoColumnWidth) {
          const maxColLens = [];
          combinedMatrix.forEach((row, rIdx) => {
            if (combinedRowMeta[rIdx]?.isBanner) return;
            row.forEach((cell, cIdx) => {
              const len = (cell || "").toString().length;
              maxColLens[cIdx] = Math.max(maxColLens[cIdx] || 10, Math.min(len + 3, 50));
            });
          });
          for (let c = 0; c < maxColsFound; c++) {
            if (!maxColLens[c]) maxColLens[c] = 12;
          }
          ws["!cols"] = maxColLens.map((w) => ({ wch: w }));
        }

        if (combinedMerges.length > 0) {
          ws["!merges"] = combinedMerges;
        }

        XLSX.utils.book_append_sheet(wb, ws, "Extracted Data");
      }

      setProgress(95);
      setProgressMsg("Finalizing download bundle...");

      // Generate binary file (XLSX or CSV)
      let outputBlob;
      let outputExt;
      let mimeType;

      if (outputFormat === "csv") {
        // Generate CSV from the primary sheet
        const firstSheetName = wb.SheetNames[0];
        const primarySheet = wb.Sheets[firstSheetName];
        const csvString = XLSX.utils.sheet_to_csv(primarySheet);
        outputBlob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        outputExt = "csv";
        mimeType = "text/csv";
      } else {
        // Generate XLSX
        const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        outputBlob = new Blob([wbOut], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        outputExt = "xlsx";
        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      }

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const finalFileName = `${baseName}_converted.${outputExt}`;
      const downloadUrl = URL.createObjectURL(outputBlob);

      // Collect initial preview matrix (first 15 rows from page 1)
      const previewMatrix = pageMatrices[0]?.matrix.slice(0, 15) || [];
      const previewRowMeta = pageMatrices[0]?.rowMeta?.slice(0, 15) || [];

      setResultSpreadsheet({
        blob: outputBlob,
        url: downloadUrl,
        fileName: finalFileName,
        size: outputBlob.size,
        pageCount: totalPages,
        totalRows: grandTotalRows,
        totalCols: maxColsFound,
        previewMatrix,
        previewRowMeta,
      });

      // Save to IndexedDB Local History
      try {
        await addHistoryRecord({
          type: "pdf-to-excel",
          title: finalFileName,
          originalName: file.name,
          inputSize: file.size,
          outputSize: outputBlob.size,
          format: outputExt.toUpperCase(),
          timestamp: Date.now(),
        });
      } catch (histErr) {
        console.warn("Failed to save history record:", histErr);
      }

      setProgress(100);
      setStage("done");
    } catch (err) {
      console.error("PDF to Excel conversion error:", err);
      setErrorMsg(err.message || "Failed to convert PDF to spreadsheet.");
      setStage("error");
    }
  };

  const resetAll = () => {
    if (resultSpreadsheet?.url) URL.revokeObjectURL(resultSpreadsheet.url);
    if (pdfMeta?.firstPageThumbnail) URL.revokeObjectURL(pdfMeta.firstPageThumbnail);
    setFile(null);
    setResultSpreadsheet(null);
    setPdfMeta(null);
    setStage("idle");
    setProgress(0);
    setProgressMsg("");
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans p-3 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full transition-colors">
      
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-m3-outline-variant/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl shadow-sm">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                DOCUMENT SUPER-CONVERTER SUITE
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-normal text-m3-on-surface font-display tracking-tight mt-0.5">
              PDF to <span className="text-emerald-600 dark:text-emerald-400 font-medium">Excel & CSV</span>
            </h1>
          </div>
        </div>
      </div>

      <p className="text-sm text-m3-on-surface-variant font-normal leading-relaxed -mt-2">
        Extract structured tables from PDF documents into organized Excel (.xlsx) and CSV sheets.
        Utilizes <strong>Table Block Isolation</strong> and <strong>Local X-Projection</strong> to guarantee accurate column alignment with 0% server uploads.
      </p>

      {/* ── ERROR STAGE ── */}
      {stage === "error" && (
        <div className="rounded-3xl bg-m3-error-container/20 border border-m3-error/40 p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left animate-fadeIn">
          <span className="text-4xl">⚠️</span>
          <div className="flex-1">
            <h3 className="text-base font-medium text-m3-error">Conversion Failed</h3>
            <p className="text-sm text-m3-on-surface-variant mt-1">{errorMsg}</p>
          </div>
          <button
            type="button"
            className="px-5 py-2.5 rounded-full bg-m3-primary text-m3-on-primary font-medium text-sm hover:opacity-95 transition-opacity"
            onClick={resetAll}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── IDLE / DROPZONE STAGE ── */}
      {stage === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-3xl border-2 border-dashed transition-all duration-200 p-8 sm:p-14 text-center flex flex-col items-center justify-center gap-4 cursor-pointer select-none ${
            dragging
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[0.99]"
              : "border-m3-outline-variant bg-m3-surface-container-lowest dark:bg-m3-surface-container hover:border-emerald-500/60"
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl shadow-sm">
            📊
          </div>
          <div>
            <h3 className="text-lg font-medium text-m3-on-surface font-display">
              Drop your PDF document here
            </h3>
            <p className="text-xs text-m3-on-surface-variant mt-1.5 font-sans">
              or click to browse from device. Supports multi-page tables & forms up to {MAX_SIZE_MB} MB.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="px-6 py-2.5 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white font-medium text-sm hover:bg-emerald-700 transition-colors shadow-sm"
              onClick={() => inputRef.current?.click()}
            >
              📁 Choose PDF File
            </button>
            <button
              type="button"
              disabled={pickLoading}
              className="px-5 py-2.5 rounded-full border border-m3-outline text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high transition-colors flex items-center gap-2"
              onClick={handleDrivePick}
            >
              <span>▲</span> {pickLoading ? "Opening Drive..." : "Google Drive"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-m3-on-surface-variant/80 mt-4 pt-4 border-t border-m3-outline-variant/40 w-full max-w-md">
            <span>🔒 100% Client-Side Private</span>
            <span>•</span>
            <span>📐 Local X-Projection Grid</span>
            <span>•</span>
            <span>📊 Multi-Sheet / CSV</span>
          </div>
        </div>
      )}

      {/* ── READY STAGE (Configuration & Options) ── */}
      {stage === "ready" && file && (
        <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-6 sm:p-8 border border-m3-outline-variant shadow-m3-elevation-1 flex flex-col gap-6 animate-fadeIn">
          {/* File Card Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-m3-outline-variant/60">
            <div className="flex items-center gap-4">
              {pdfMeta?.firstPageThumbnail ? (
                <img
                  src={pdfMeta.firstPageThumbnail}
                  alt="PDF Cover"
                  className="w-16 h-20 object-cover rounded-xl shadow-md border border-m3-outline-variant/80 bg-white"
                />
              ) : (
                <div className="w-16 h-20 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center text-3xl font-mono">
                  📊
                </div>
              )}
              <div>
                <h3 className="text-base font-medium text-m3-on-surface break-all">{file.name}</h3>
                <p className="text-xs text-m3-on-surface-variant mt-1">
                  {formatBytes(file.size)} • {pdfMeta?.totalPages ? `${pdfMeta.totalPages} Pages` : "Reading..."}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-full border border-m3-outline text-xs text-m3-on-surface hover:bg-m3-surface-container-high transition-colors"
              onClick={resetAll}
            >
              ✕ Remove
            </button>
          </div>

          {/* Settings Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Format Preset */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                OUTPUT SPREADSHEET FORMAT
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                    outputFormat === "xlsx"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                      : "border-m3-outline-variant hover:border-m3-outline text-m3-on-surface"
                  }`}
                  onClick={() => setOutputFormat("xlsx")}
                >
                  <span className="text-sm font-medium">📗 Excel (.xlsx)</span>
                  <span className="text-[11px] opacity-75">Full multi-column workbook with auto-fit widths</span>
                </button>
                <button
                  type="button"
                  className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                    outputFormat === "csv"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                      : "border-m3-outline-variant hover:border-m3-outline text-m3-on-surface"
                  }`}
                  onClick={() => setOutputFormat("csv")}
                >
                  <span className="text-sm font-medium">📄 CSV (.csv)</span>
                  <span className="text-[11px] opacity-75">Clean raw comma-separated text matrix</span>
                </button>
              </div>
            </div>

            {/* Multi-Page Handling */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-m3-on-surface-variant uppercase tracking-wider">
                PAGE STRUCTURING
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={outputFormat === "csv"}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                    outputFormat === "csv"
                      ? "opacity-50 cursor-not-allowed border-m3-outline-variant"
                      : sheetMode === "multi"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                      : "border-m3-outline-variant hover:border-m3-outline text-m3-on-surface"
                  }`}
                  onClick={() => setSheetMode("multi")}
                >
                  <span className="text-sm font-medium">📑 Multi-Sheet</span>
                  <span className="text-[11px] opacity-75">Page 1, Page 2 as separate tabs</span>
                </button>
                <button
                  type="button"
                  className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                    sheetMode === "combined" || outputFormat === "csv"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20"
                      : "border-m3-outline-variant hover:border-m3-outline text-m3-on-surface"
                  }`}
                  onClick={() => setSheetMode("combined")}
                >
                  <span className="text-sm font-medium">📜 Combined Sheet</span>
                  <span className="text-[11px] opacity-75">All pages stacked in one sheet</span>
                </button>
              </div>
            </div>
          </div>

          {/* Engine Switches */}
          <div className="flex flex-col gap-3 pt-4 border-t border-m3-outline-variant/60">
            <label className="text-xs font-semibold text-m3-on-surface-variant uppercase tracking-wider">
              2D MATRIX RECONSTRUCTION ENGINE
            </label>
            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoColumnWidth}
                  onChange={(e) => setAutoColumnWidth(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-m3-on-surface">Auto-Fit Column Widths (Prevent '###' truncation)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={firstRowHeader}
                  onChange={(e) => setFirstRowHeader(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-m3-on-surface">Table Block Isolation (Keep paragraphs in Col A)</span>
              </label>
            </div>
          </div>

          {/* CTA Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-m3-outline-variant/60">
            <span className="text-xs text-m3-on-surface-variant">
              Ready to parse <strong>{pdfMeta?.totalPages || 1} pages</strong> into 2D structured matrix
            </span>
            <button
              type="button"
              className="w-full sm:w-auto px-8 py-3 rounded-full bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white font-medium text-sm transition-all shadow-md flex items-center justify-center gap-2"
              onClick={convertToExcel}
            >
              <span>📊 Convert to {outputFormat.toUpperCase()}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── CONVERTING PROGRESS STAGE ── */}
      {stage === "converting" && (
        <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-8 sm:p-12 border border-m3-outline-variant text-center flex flex-col items-center justify-center gap-6 animate-fadeIn">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-m3-surface-container-high border-t-emerald-600 animate-spin" />
            <span className="absolute text-xl">📊</span>
          </div>

          <div className="max-w-md w-full">
            <h3 className="text-lg font-medium text-m3-on-surface font-display">
              Reconstructing 2D Table Matrix
            </h3>
            <p className="text-xs text-m3-on-surface-variant mt-1.5 h-4">
              {progressMsg}
            </p>

            <div className="w-full bg-m3-surface-container-high rounded-full h-2 mt-6 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-m3-on-surface-variant mt-2 block">
              {progress}%
            </span>
          </div>
        </div>
      )}

      {/* ── DONE STAGE: SUCCESS & INTERACTIVE PREVIEW ── */}
      {stage === "done" && resultSpreadsheet && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          {/* Success Download Card */}
          <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-6 sm:p-8 border border-m3-outline-variant shadow-m3-elevation-1 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl">
              🎉
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-normal text-m3-on-surface font-display">
                Spreadsheet Ready!
              </h2>
              <p className="text-xs sm:text-sm text-m3-on-surface-variant mt-1 max-w-md">
                Your PDF has been converted into a structured 2D spreadsheet with isolated table blocks and preserved cell alignment.
              </p>
            </div>

            <div className="rounded-2xl bg-m3-surface-container-high p-4 flex flex-wrap items-center justify-center gap-3 text-xs text-m3-on-surface font-mono">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{resultSpreadsheet.fileName}</span>
              <span>•</span>
              <span>{formatBytes(resultSpreadsheet.size)}</span>
              <span>•</span>
              <span>{resultSpreadsheet.totalRows} Rows</span>
              <span>•</span>
              <span>{resultSpreadsheet.totalCols} Max Cols</span>
              <span>•</span>
              <span className="uppercase font-bold text-emerald-600">{outputFormat}</span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
              <a
                href={resultSpreadsheet.url}
                download={resultSpreadsheet.fileName}
                className="flex-1 py-3 px-6 rounded-full bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 text-white font-medium text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>📥</span> Download (.{outputFormat})
              </a>
              <button
                type="button"
                className="px-5 py-3 rounded-full border border-m3-outline text-m3-on-surface text-sm font-medium hover:bg-m3-surface-container-high transition-colors"
                onClick={resetAll}
              >
                Convert Another PDF
              </button>
            </div>

            {/* Google Drive Upload & Share Actions */}
            <div className="w-full max-w-md pt-2 border-t border-m3-outline-variant/40">
              <ActionButtons
                blob={resultSpreadsheet.blob}
                fileName={resultSpreadsheet.fileName}
                origSize={file?.size}
                resultMime={resultSpreadsheet.mimeType}
                toolName="PDF to Excel"
                auth={auth}
                onReset={resetAll}
              />
            </div>
          </div>

          {/* Interactive Live 2D Grid Preview */}
          {resultSpreadsheet.previewMatrix && resultSpreadsheet.previewMatrix.length > 0 && (
            <div className="rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container p-6 border border-m3-outline-variant shadow-m3-elevation-1 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-m3-outline-variant/60">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👀</span>
                  <h3 className="text-sm font-medium text-m3-on-surface font-display">
                    Extracted 2D Grid Preview (First {resultSpreadsheet.previewMatrix.length} Rows)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-m3-on-surface-variant">
                  {resultSpreadsheet.totalCols} Columns detected
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-m3-outline-variant/60 max-h-96">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-m3-surface-container-high border-b border-m3-outline-variant sticky top-0">
                      <th className="p-2.5 w-12 text-center text-m3-on-surface-variant/70 border-r border-m3-outline-variant/40">
                        #
                      </th>
                      {Array.from({ length: resultSpreadsheet.totalCols }).map((_, cIdx) => (
                        <th
                          key={cIdx}
                          className="p-2.5 font-semibold text-m3-on-surface border-r border-m3-outline-variant/40 min-w-[120px]"
                        >
                          {String.fromCharCode(65 + (cIdx % 26))}
                          {cIdx >= 26 ? Math.floor(cIdx / 26) : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultSpreadsheet.previewMatrix.map((row, rIdx) => {
                      const meta = resultSpreadsheet.previewRowMeta?.[rIdx];
                      const isBanner = meta?.isBanner;
                      const bannerType = meta?.bannerType;

                      if (isBanner) {
                        return (
                          <tr
                            key={rIdx}
                            className="border-b border-m3-outline-variant/40 bg-emerald-500/10 dark:bg-emerald-500/15"
                          >
                            <td className="p-2 text-center text-[10px] text-m3-on-surface-variant/60 border-r border-m3-outline-variant/40">
                              {rIdx + 1}
                            </td>
                            <td
                              colSpan={resultSpreadsheet.totalCols}
                              className="p-2.5 text-xs text-m3-on-surface font-medium border-r border-m3-outline-variant/30"
                            >
                              <div className="flex items-center gap-2">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                                  {bannerType || "Context Banner"}
                                </span>
                                <span className="font-semibold text-emerald-950 dark:text-emerald-50">
                                  {row[0]}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr
                          key={rIdx}
                          className={`border-b border-m3-outline-variant/30 ${
                            rIdx % 2 === 0 ? "bg-transparent" : "bg-m3-surface-container-low/40"
                          }`}
                        >
                          <td className="p-2 text-center text-[10px] text-m3-on-surface-variant/60 border-r border-m3-outline-variant/40">
                            {rIdx + 1}
                          </td>
                          {Array.from({ length: resultSpreadsheet.totalCols }).map((_, cIdx) => {
                            const val = row[cIdx] || "";
                            const isSpecial = val.startsWith("--- [Page");
                            return (
                              <td
                                key={cIdx}
                                className={`p-2 border-r border-m3-outline-variant/30 truncate max-w-[280px] ${
                                  isSpecial
                                    ? "text-emerald-600 font-bold bg-emerald-500/10"
                                    : val
                                    ? "text-m3-on-surface"
                                    : "text-m3-on-surface-variant/30 italic"
                                }`}
                                title={val}
                              >
                                {val || "<empty>"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Feature Highlights Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
        <div className="p-5 rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant flex flex-col gap-2">
          <div className="text-2xl">📐</div>
          <h4 className="text-sm font-medium text-m3-on-surface">Table Block Isolation</h4>
          <p className="text-xs text-m3-on-surface-variant leading-relaxed">
            Distinguishes between multi-column data tables and paragraphs. Headings stay strictly in Column A.
          </p>
        </div>
        <div className="p-5 rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant flex flex-col gap-2">
          <div className="text-2xl">🔒</div>
          <h4 className="text-sm font-medium text-m3-on-surface">100% Client-Side Privacy</h4>
          <p className="text-xs text-m3-on-surface-variant leading-relaxed">
            PDFs never leave your device. All parsing and spreadsheet rendering happens directly inside browser memory.
          </p>
        </div>
        <div className="p-5 rounded-3xl bg-m3-surface-container-lowest dark:bg-m3-surface-container border border-m3-outline-variant flex flex-col gap-2">
          <div className="text-2xl">📑</div>
          <h4 className="text-sm font-medium text-m3-on-surface">Multi-Sheet & CSV</h4>
          <p className="text-xs text-m3-on-surface-variant leading-relaxed">
            Export multi-page documents as individual worksheet tabs or combine all pages into a unified matrix.
          </p>
        </div>
      </div>
    </div>
  );
}
