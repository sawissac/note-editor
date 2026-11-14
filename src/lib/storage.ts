import localforage from "localforage";

/**
 * Two IndexedDB stores (via localforage):
 * - `meta`: the workspace tree, open tabs and settings — small, saved often.
 * - `contents`: one entry per file id — a string for text files, an
 *   ArrayBuffer for PDF / DOCX / XLSX.
 */
const meta = localforage.createInstance({
  name: "note-editor",
  storeName: "meta",
});

const contents = localforage.createInstance({
  name: "note-editor",
  storeName: "contents",
});

export type FileContent = string | ArrayBuffer;

export const storage = {
  getMeta<T>(key: string) {
    return meta.getItem<T>(key);
  },
  setMeta<T>(key: string, value: T) {
    return meta.setItem<T>(key, value);
  },
  getContent(id: string) {
    return contents.getItem<FileContent>(id);
  },
  setContent(id: string, value: FileContent) {
    return contents.setItem<FileContent>(id, value);
  },
  removeContent(id: string) {
    return contents.removeItem(id);
  },
};

export function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function downloadFile(name: string, data: FileContent, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
