/**
 * Which conversions the explorer's "Convert to" menu offers for a file, and
 * what the converted copy is called. Kept apart from `data-convert.ts` so
 * the menu can decide synchronously without loading any converter.
 */
import {
  baseNameLength,
  type FileKind,
  isEnvName,
  kindOf,
} from "@/lib/file-types";
import { IMAGE_FORMATS, type ImageFormat } from "@/lib/image-formats";

/** Text formats a structured value can be written as. */
export type DataTargetId = "json" | "yml" | "yaml" | "toml" | "env";

export type ConvertTargetId =
  | DataTargetId
  | "csv"
  | "md"
  | "txt"
  | "pdf"
  | "mermaid-timeline"
  | "mermaid-gantt"
  | `img-${ImageFormat}`;

export type ConvertGroup = "data" | "document" | "image" | "pdf";

export type ConvertTarget = {
  id: ConvertTargetId;
  /** Menu label. */
  label: string;
  /** Menu section; a separator sits between groups. */
  group: ConvertGroup;
  /**
   * Cheap text-to-text work: run as soon as the menu opens, so a target
   * that cannot hold the data shows disabled with its reason up front.
   * Others (PDF, images, Word / Excel sources) run when chosen.
   */
  eager: boolean;
};

const DATA_TARGETS: DataTargetId[] = ["json", "yml", "yaml", "toml", "env"];

/** Image formats the browser may be able to write (HEIC never). */
const IMAGE_TARGETS = (Object.keys(IMAGE_FORMATS) as ImageFormat[]).filter(
  (f) => f !== "heic",
);

/** Source kinds whose conversions are plain string work. */
const TEXT_SOURCES: ReadonlySet<FileKind> = new Set([
  "json",
  "yaml",
  "toml",
  "env",
  "csv",
  "text",
  "schema",
  "timer",
  "kanban",
  "calendar",
]);

/** What each kind converts to, in menu order. */
const TARGETS_BY_KIND: Partial<Record<FileKind, ConvertTargetId[]>> = {
  json: ["yml", "yaml", "toml", "env", "csv", "pdf"],
  yaml: ["json", "toml", "env", "csv", "pdf"],
  toml: ["json", "yml", "yaml", "env", "csv", "pdf"],
  env: ["json", "yml", "yaml", "toml", "pdf"],
  csv: ["json", "yml", "yaml", "md", "pdf"],
  xlsx: ["csv", "json", "md", "pdf"],
  docx: ["md", "txt", "pdf"],
  markdown: ["txt", "pdf"],
  text: ["md", "pdf"],
  schema: ["json", "pdf"],
  kanban: ["csv", "md", "mermaid-gantt", "pdf"],
  calendar: ["csv", "md", "mermaid-timeline", "pdf"],
  timer: ["csv", "md", "pdf"],
  chat: ["md", "txt", "pdf"],
  sql: ["pdf"],
  regex: ["pdf"],
  diff: ["pdf"],
  mermaid: ["img-png", "img-svg", "pdf"],
  qr: ["img-png", "pdf"],
  image: [...IMAGE_TARGETS.map((f) => `img-${f}` as const), "pdf"],
};

function describe(id: ConvertTargetId, source: FileKind): ConvertTarget {
  if (id.startsWith("img-")) {
    const format = id.slice(4) as ImageFormat;
    return {
      id,
      label: `${IMAGE_FORMATS[format].label} image`,
      group: "image",
      eager: false,
    };
  }
  if (id === "pdf") return { id, label: ".pdf", group: "pdf", eager: false };
  if (id === "mermaid-timeline" || id === "mermaid-gantt") {
    return {
      id,
      label: `.mermaid (${id.slice("mermaid-".length)})`,
      group: "document",
      eager: TEXT_SOURCES.has(source),
    };
  }
  return {
    id,
    label: `.${id}`,
    group: (DATA_TARGETS as string[]).includes(id) ? "data" : "document",
    eager: TEXT_SOURCES.has(source),
  };
}

/** Conversions offered for `name`; empty when it has none. */
export function convertTargetsOf(name: string): ConvertTarget[] {
  const kind = kindOf(name);
  return (TARGETS_BY_KIND[kind] ?? []).map((id) => describe(id, kind));
}

/**
 * Name of the converted copy: `config.json` → `config.yaml`. A dotenv file
 * drops its leading dot (`.env.local` → `env.local.json`) so the copy is not
 * mistaken for another dotenv file. Images stay `.img` files, named after
 * the format they now hold (`photo.img` → `photo-webp.img`), as the image
 * editor's own "Save a converted copy" does.
 */
export function convertedName(name: string, target: ConvertTargetId) {
  const trimmed = name.trim();
  const base =
    (isEnvName(trimmed)
      ? trimmed.slice(1)
      : trimmed.slice(0, baseNameLength(trimmed))) || "converted";
  if (target.startsWith("img-")) {
    const format = target.slice(4) as ImageFormat;
    return `${base}-${IMAGE_FORMATS[format].ext}.img`;
  }
  // Diagram conversions (timeline, gantt) are all .mermaid files.
  if (target.startsWith("mermaid-")) return `${base}.mermaid`;
  return `${base}.${target}`;
}
