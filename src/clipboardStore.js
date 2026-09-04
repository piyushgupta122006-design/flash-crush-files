// clipboardStore.js — In-memory transfer of pasted files across route transitions
let pendingFile = null;

export function setPendingFile(file) {
  pendingFile = file;
}

export function consumePendingFile() {
  const f = pendingFile;
  pendingFile = null;
  return f;
}
