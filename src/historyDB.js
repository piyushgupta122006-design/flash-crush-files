// historyDB.js — 100% In-Browser Local IndexedDB Storage for Processed Files
const DB_NAME = "FlashCrushHistoryDB";
const DB_VERSION = 1;
const STORE_NAME = "processedFiles";
const MAX_SAVED_ITEMS = 25;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB not supported in this browser"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("tool", "tool", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Generate thumbnail preview if blob is an image
async function makeThumbnail(blob) {
  if (!blob || !blob.type || !blob.type.startsWith("image/")) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const maxDim = 80;
      const aspect = img.width / img.height;
      let w = maxDim, h = maxDim;
      if (aspect > 1) h = maxDim / aspect;
      else w = maxDim * aspect;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Add a processed file record
export async function addHistoryRecord({ tool, fileName, origSize, newSize, blob, mimeType }) {
  try {
    const db = await openDB();
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const timestamp = Date.now();

    let savingsPct = 0;
    if (origSize && newSize && origSize > newSize) {
      savingsPct = Math.round(((origSize - newSize) / origSize) * 100);
    }

    const thumbnail = await makeThumbnail(blob);

    const record = {
      id,
      tool: tool || "File Tool",
      fileName: fileName || "file",
      origSize: origSize || 0,
      newSize: newSize || blob?.size || 0,
      savingsPct,
      blob,
      mimeType: mimeType || blob?.type || "application/octet-stream",
      thumbnail,
      timestamp,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);

      tx.oncomplete = async () => {
        // Enforce max limit of MAX_SAVED_ITEMS
        await pruneHistoryRecords(db);
        // Dispatch custom event so navbar/drawer updates in real-time
        window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));
        resolve(record);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not save to history IndexedDB:", err);
    return null;
  }
}

// Prune old records beyond MAX_SAVED_ITEMS
async function pruneHistoryRecords(db) {
  try {
    const records = await getAllHistoryRecords();
    if (records.length > MAX_SAVED_ITEMS) {
      // Sort oldest first
      const toDelete = records.slice(MAX_SAVED_ITEMS);
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      toDelete.forEach((r) => store.delete(r.id));
    }
  } catch (e) {
    console.warn("Pruning error:", e);
  }
}

// Get all history records sorted by newest first
export async function getAllHistoryRecords() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => b.timestamp - a.timestamp);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

// Delete a single record
export async function deleteHistoryRecord(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);

      tx.oncomplete = () => {
        window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return false;
  }
}

// Clear all records
export async function clearAllHistory() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = () => {
        window.dispatchEvent(new CustomEvent("flashcrush:history-updated"));
        resolve(true);
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    return false;
  }
}

// Get total count & space saved
export async function getHistoryStats() {
  const list = await getAllHistoryRecords();
  let totalSavedBytes = 0;
  let totalProcessedBytes = 0;

  list.forEach((item) => {
    if (item.origSize && item.newSize && item.origSize > item.newSize) {
      totalSavedBytes += item.origSize - item.newSize;
    }
    totalProcessedBytes += item.newSize || 0;
  });

  return {
    count: list.length,
    totalSavedBytes,
    totalProcessedBytes,
  };
}
