import {
  IMAGE_ACCEPT,
  IMAGE_FORMATS,
  imageFormatOf,
  sniffImageFormat,
} from "@/lib/image-formats";

/** Which editor surface a file opens in. */
export type FileKind =
  | "markdown"
  | "csv"
  | "pdf"
  | "docx"
  | "xlsx"
  | "schema"
  | "mermaid"
  | "calendar"
  | "kanban"
  | "json"
  | "yaml"
  | "toml"
  | "sql"
  | "env"
  | "apikeys"
  | "prompt"
  | "regex"
  | "diff"
  | "qr"
  | "timer"
  | "random"
  | "bookmark"
  | "pptx"
  | "chat"
  | "appinfo"
  | "appstate"
  | "image"
  | "text";

/**
 * Constant file names with a built-in, read-only view of the app itself:
 * `app.info` lists every supported extension, `app.state` draws the live
 * Redux store. Matched by full name, like `.env`.
 */
export const APP_FILES = {
  info: "app.info",
  state: "app.state",
} as const;

const APP_FILE_KIND: Record<string, FileKind> = {
  [APP_FILES.info]: "appinfo",
  [APP_FILES.state]: "appstate",
};

/** `app.info` / `app.state` (case-insensitive). */
export function isAppFileName(name: string) {
  return name.trim().toLowerCase() in APP_FILE_KIND;
}

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
  calendar: "calendar",
  kanban: "kanban",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sql: "sql",
  env: "env",
  gemini: "apikeys",
  openrouter: "apikeys",
  prompt: "prompt",
  regex: "regex",
  diff: "diff",
  patch: "diff",
  qr: "qr",
  timer: "timer",
  random: "random",
  bookmark: "bookmark",
  pptx: "pptx",
  chat: "chat",
  // Holds one image of any format (PNG, JPEG, WebP, SVG, HEIC, …).
  img: "image",
};

/** Every extension that opens in a dedicated editor, with its kind. */
export const EXTENSION_KINDS: ReadonlyArray<{ ext: string; kind: FileKind }> =
  Object.entries(EXT_KIND).map(([ext, kind]) => ({ ext, kind }));

/** `.env`, `.env.local`, `.env.production`, … — dotenv files by name. */
export function isEnvName(name: string) {
  return /^\.env(\.[^./\\]+)*$/i.test(name.trim());
}

/** Kinds whose content is stored as bytes rather than a string. */
export const BINARY_KINDS: ReadonlySet<FileKind> = new Set([
  "pdf",
  "docx",
  "xlsx",
  "image",
]);

/** Extensions a user may create from the explorer (blank files). */
export const CREATABLE_EXTENSIONS = [
  "md",
  "docx",
  "xlsx",
  "pdf",
  "csv",
  "json",
  "yaml",
  "yml",
  "toml",
  "sql",
  "env",
  "gemini",
  "openrouter",
  "prompt",
  "regex",
  "diff",
  "schema",
  "mermaid",
  "mmd",
  "calendar",
  "kanban",
  "qr",
  "timer",
  "random",
  "bookmark",
  "pptx",
  "chat",
  "img",
  "txt",
];

/**
 * Complete names to offer while a new file's name is typed: `hello_world`
 * → `hello_world.md`, `.docx`, `.xlsx`, …; `notes.c` → `notes.csv`. Empty once
 * the name already ends in a supported extension.
 */
export function suggestFileNames(rawName: string) {
  const typed = rawName.trim().toLowerCase();
  const appFiles =
    typed.length >= 3
      ? Object.values(APP_FILES).filter(
          (name) => name.startsWith(typed) && name !== typed,
        )
      : [];
  if (isAppFileName(typed)) return [];
  return [...appFiles, ...completeName(rawName, CREATABLE_EXTENSIONS)];
}

/**
 * Base + each extension that starts with what was typed after the last dot.
 * Empty once the name already ends in a known extension.
 */
function completeName(rawName: string, extensions: readonly string[]) {
  const name = rawName.trim();
  const dot = name.lastIndexOf(".");
  if (!name || dot === 0) return [];
  const base = dot > 0 ? name.slice(0, dot) : name;
  const typed = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!base || typed in EXT_KIND || extensions.includes(typed)) return [];
  return extensions
    .filter((ext) => ext.startsWith(typed))
    .map((ext) => `${base}.${ext}`);
}

/**
 * Extensions a file may take on rename without breaking what is stored: its
 * own first, then — for text files only — the other text types. Word, Excel
 * and PDF hold bytes, so they keep their own extension.
 */
export function renameExtensions(currentName: string) {
  const own = extensionOf(currentName);
  const known = own in EXT_KIND;
  if (BINARY_KINDS.has(kindOf(currentName))) return known ? [own] : [];
  const text = CREATABLE_EXTENSIONS.filter(
    (ext) => !BINARY_KINDS.has(EXT_KIND[ext] ?? "text"),
  );
  return known ? [own, ...text.filter((ext) => ext !== own)] : text;
}

/**
 * The rename counterpart of {@link suggestFileNames}: `report` while renaming
 * `notes.md` offers `report.md` first, then the other text types. Dotfiles
 * such as `.env` and the unchanged name get no list.
 */
export function suggestRenameNames(currentName: string) {
  const extensions = renameExtensions(currentName);
  return (rawName: string) =>
    rawName.trim() === currentName || isEnvName(currentName)
      ? []
      : completeName(rawName, extensions);
}

export const IMPORT_ACCEPT: Record<string, string[]> = {
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt", ".regex", ".random"],
  "text/csv": [".csv"],
  "application/schema+json": [".schema"],
  "text/vnd.mermaid": [".mermaid", ".mmd"],
  "application/vnd.note-editor.calendar+json": [".calendar"],
  "application/vnd.note-editor.kanban+json": [".kanban"],
  "application/vnd.note-editor.qr+json": [".qr"],
  "application/vnd.note-editor.timer+json": [".timer"],
  "application/vnd.note-editor.bookmark+json": [".bookmark"],
  "application/vnd.note-editor.pptx+json": [".pptx"],
  "application/vnd.note-editor.chat+json": [".chat"],
  "application/json": [".json"],
  "application/yaml": [".yaml", ".yml"],
  "application/toml": [".toml"],
  "application/sql": [".sql"],
  "text/x-diff": [".diff", ".patch"],
  "text/x-dotenv": [".env"],
  "application/vnd.note-editor.api-keys+json": [".gemini", ".openrouter"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.note-editor.image": [".img"],
  // Image files import as `.img` (see `importFiles`).
  ...IMAGE_ACCEPT,
};

const MIME: Record<FileKind, string> = {
  markdown: "text/markdown",
  csv: "text/csv",
  text: "text/plain",
  schema: "application/json",
  mermaid: "text/vnd.mermaid",
  calendar: "application/json",
  kanban: "application/json",
  json: "application/json",
  yaml: "application/yaml",
  toml: "application/toml",
  sql: "application/sql",
  env: "text/plain",
  apikeys: "application/json",
  prompt: "application/json",
  regex: "text/plain",
  diff: "text/x-diff",
  qr: "application/json",
  timer: "application/json",
  random: "text/plain",
  bookmark: "application/json",
  pptx: "application/json",
  chat: "application/json",
  appinfo: "application/json",
  appstate: "application/json",
  image: "application/octet-stream",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot > 0) return name.slice(dot + 1).toLowerCase();
  // A dotfile such as `.env` is its own type.
  return dot === 0 ? name.slice(1).toLowerCase() : "";
}

/** Name without its extension, used to pre-select text on rename. */
export function baseNameLength(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? dot : name.length;
}

export function kindOf(name: string): FileKind {
  if (isEnvName(name)) return "env";
  const appKind = APP_FILE_KIND[name.trim().toLowerCase()];
  if (appKind) return appKind;
  return EXT_KIND[extensionOf(name)] ?? "text";
}

export function isImportable(name: string) {
  return (
    isEnvName(name) ||
    extensionOf(name) in EXT_KIND ||
    imageFormatOf(name) !== null
  );
}

export function mimeOf(name: string) {
  return MIME[kindOf(name)];
}

/**
 * Name and type a file downloads under. An `.img` file downloads as the
 * image it holds — `photo.img` with PNG bytes → `photo.png`.
 */
export function downloadTarget(
  name: string,
  content: string | ArrayBuffer | null,
) {
  if (kindOf(name) === "image" && content instanceof ArrayBuffer) {
    const format = sniffImageFormat(content);
    if (format) {
      const base = name.slice(0, baseNameLength(name));
      return {
        name: `${base}.${IMAGE_FORMATS[format].ext}`,
        mime: IMAGE_FORMATS[format].mime,
      };
    }
  }
  return { name, mime: mimeOf(name) };
}

export const KIND_LABEL: Record<FileKind, string> = {
  markdown: "Markdown",
  csv: "CSV",
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  schema: "JSON Schema",
  mermaid: "Mermaid",
  calendar: "Calendar",
  kanban: "Kanban",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL",
  env: "Environment",
  apikeys: "API keys",
  prompt: "Prompts",
  regex: "Regex",
  diff: "Diff",
  qr: "QR code",
  timer: "Timer",
  random: "Random picker",
  bookmark: "Bookmarks",
  pptx: "Slides",
  chat: "Chat",
  appinfo: "App info",
  appstate: "App state",
  image: "Image",
  text: "Plain text",
};
