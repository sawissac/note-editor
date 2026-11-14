/** Which editor surface a file opens in. */
export type FileKind = "markdown" | "csv" | "pdf" | "docx" | "xlsx" | "schema" | "mermaid" | "text";

const EXT_KIND: Record<string, FileKind> = {
  md: "markdown",
  markdown: "markdown",
  csv: "csv",
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  xls: "xlsx",
  txt: "text",
  schema: "schema",
  mermaid: "mermaid",
  mmd: "mermaid",
};

/** Kinds whose content is stored as bytes rather than a string. */
export const BINARY_KINDS: ReadonlySet<FileKind> = new Set([
  "pdf",
  "docx",
  "xlsx",
]);

/** Extensions a user may create from the explorer (blank files). */
export const CREATABLE_EXTENSIONS = ["md", "docx", "xlsx", "pdf", "csv", "schema", "mermaid", "mmd", "txt"];

/**
 * Complete names to offer while a new file's name is typed: `hello_world`
 * → `hello_world.md`, `.docx`, `.xlsx`, …; `notes.c` → `notes.csv`. Empty once
 * the name already ends in a supported extension.
 */
export function suggestFileNames(rawName: string) {
  const name = rawName.trim();
  const dot = name.lastIndexOf(".");
  if (!name || dot === 0) return [];
  const base = dot > 0 ? name.slice(0, dot) : name;
  const typed = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!base || CREATABLE_EXTENSIONS.includes(typed)) return [];
  return CREATABLE_EXTENSIONS.filter((ext) => ext.startsWith(typed)).map(
    (ext) => `${base}.${ext}`,
  );
}

export const IMPORT_ACCEPT: Record<string, string[]> = {
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/schema+json": [".schema"],
  "text/vnd.mermaid": [".mermaid", ".mmd"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
};

const MIME: Record<FileKind, string> = {
  markdown: "text/markdown",
  csv: "text/csv",
  text: "text/plain",
  schema: "application/json",
  mermaid: "text/vnd.mermaid",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Name without its extension, used to pre-select text on rename. */
export function baseNameLength(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? dot : name.length;
}

export function kindOf(name: string): FileKind {
  return EXT_KIND[extensionOf(name)] ?? "text";
}

export function isImportable(name: string) {
  return extensionOf(name) in EXT_KIND;
}

export function mimeOf(name: string) {
  return MIME[kindOf(name)];
}

export const KIND_LABEL: Record<FileKind, string> = {
  markdown: "Markdown",
  csv: "CSV",
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  schema: "JSON Schema",
  mermaid: "Mermaid",
  text: "Plain text",
};
