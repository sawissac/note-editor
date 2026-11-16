import { createTwoFilesPatch, diffLines, FILE_HEADERS_ONLY } from "diff";

import {
  BINARY_KINDS,
  extensionOf,
  type FileKind,
  isEnvName,
  kindOf,
} from "@/lib/file-types";

/**
 * A `.diff` file is one of two things:
 * - a **comparison** this app made — JSON naming two workspace files by id,
 *   shown side by side like a GitHub diff and re-read whenever they change;
 * - a **patch** imported from elsewhere (`git diff > x.diff`) — unified-diff
 *   text, shown read-only.
 */
export type DiffLayout = "split" | "unified";

export type DiffComparison = {
  /** File id of the original (left / old) side. */
  left: string | null;
  /** File id of the changed (right / new) side. */
  right: string | null;
  layout: DiffLayout;
  /** Treat lines differing only in spaces / indentation as unchanged. */
  ignoreWhitespace: boolean;
};

export type DiffFile =
  | { type: "comparison"; doc: DiffComparison }
  | { type: "patch"; patch: string };

export const EMPTY_COMPARISON: DiffComparison = {
  left: null,
  right: null,
  layout: "split",
  ignoreWhitespace: false,
};

/** Starter content for a new `.diff` file: an unpicked comparison. */
export function serializeComparison(doc: DiffComparison) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export const BLANK_DIFF = serializeComparison(EMPTY_COMPARISON);

/** Reads a stored `.diff`; empty or unknown JSON starts a new comparison. */
export function parseDiffFile(text: string): DiffFile {
  const trimmed = text.trim();
  if (!trimmed) return { type: "comparison", doc: { ...EMPTY_COMPARISON } };
  if (trimmed.startsWith("{")) {
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      if (raw && typeof raw === "object" && ("left" in raw || "right" in raw)) {
        return {
          type: "comparison",
          doc: {
            left: typeof raw.left === "string" ? raw.left : null,
            right: typeof raw.right === "string" ? raw.right : null,
            layout: raw.layout === "unified" ? "unified" : "split",
            ignoreWhitespace: raw.ignoreWhitespace === true,
          },
        };
      }
    } catch {
      // Not JSON — fall through and treat it as patch text.
    }
  }
  return { type: "patch", patch: text };
}

/** Extension two files must share to be compared (`.env.local` → `env`). */
export function compareExtension(name: string) {
  return isEnvName(name) ? "env" : extensionOf(name);
}

/** Text files only: binary documents and other `.diff` files are left out. */
export function isComparable(name: string) {
  const kind = kindOf(name);
  return !BINARY_KINDS.has(kind) && kind !== "diff";
}

/** Shiki grammar for each kind; app-only formats are JSON underneath. */
const KIND_LANG: Partial<Record<FileKind, string>> = {
  markdown: "markdown",
  csv: "csv",
  schema: "json",
  calendar: "json",
  kanban: "json",
  json: "json",
  yaml: "yaml",
  toml: "toml",
  sql: "sql",
  env: "dotenv",
  apikeys: "json",
  mermaid: "mermaid",
  regex: "regexp",
  qr: "json",
  timer: "json",
  random: "csv",
  chat: "json",
  text: "text",
};

export function diffLanguage(name: string) {
  return KIND_LANG[kindOf(name)] ?? "text";
}

/**
 * The comparison as standard unified-diff text (`git apply`-compatible
 * headers), for copying, downloading and the PDF export.
 */
export function comparisonPatch(
  leftPath: string,
  rightPath: string,
  left: string,
  right: string,
  ignoreWhitespace = false,
) {
  return createTwoFilesPatch(
    `a/${leftPath}`,
    `b/${rightPath}`,
    left,
    right,
    undefined,
    undefined,
    { ignoreWhitespace, headerOptions: FILE_HEADERS_ONLY },
  );
}

/** Lines added / removed going from `left` to `right` — no hunks built. */
export function countLineChanges(
  left: string,
  right: string,
  ignoreWhitespace = false,
) {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(left, right, { ignoreWhitespace })) {
    if (part.added) added += part.count;
    else if (part.removed) removed += part.count;
  }
  return { added, removed };
}
