/**
 * File content → layout blocks for the unified PDF. Every text-like format
 * collapses to plain paragraphs (one font, one size, one weight); tabular
 * formats become tables; Mermaid becomes an image; PDFs are copied as pages.
 * Images inside Markdown and DOCX files are baked into the PDF.
 */
import Papa from "papaparse";

import { type FileContent, storage } from "@/lib/storage";
import type { FileKind } from "@/lib/file-types";
import {
  BOOKMARK_TABLE_HEADER,
  bookmarkRows,
  parseBookmarks,
} from "@/lib/bookmark-doc";
import { formatTime, parseCalendar, parseLocal } from "@/lib/calendar";
import { maskApiKeys } from "@/lib/api-keys";
import { maskEnv } from "@/lib/data-formats";
import { comparisonPatch, parseDiffFile } from "@/lib/diff-doc";
import { parseKanban } from "@/lib/kanban";
import { parseChat } from "@/lib/chat-doc";
import { parsePptx, SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/pptx-doc";
import { parseQr, qrData, renderQrPng } from "@/lib/qr-doc";
import { formatDuration, parseTimers } from "@/lib/timer-doc";
import { renderMermaidPng } from "@/lib/mermaid-render";
import {
  type BakedImage,
  bakeImage,
  bakeImageUrl,
  mimeFromName,
} from "@/lib/unified-export/images";
import { readZip } from "@/lib/unified-export/zip";
import { IMAGE_FORMATS, sniffImageFormat } from "@/lib/image-formats";

export type Block =
  /** Reflowed text. `indent` in points. */
  | { type: "paragraph"; text: string; indent?: number }
  /** One source line kept as a line (plain text, code); wraps if too long. */
  | { type: "line"; text: string }
  /** Fenced code: monospace, shaded box, indentation kept. */
  | { type: "code"; lines: string[]; language?: string }
  | { type: "gap" }
  | {
      type: "table";
      caption?: string;
      header: string[] | null;
      rows: string[][];
    }
  /** `width` / `height` are the display size in points (before fitting). */
  | {
      type: "image";
      data: Uint8Array;
      format: "png" | "jpg";
      width: number;
      height: number;
      /**
       * Share of the text column the source showed it at (DOCX). The PDF
       * maps it onto its own column, so a full-width Word picture stays
       * full width whatever the two page sizes and margins are.
       */
      widthFraction?: number;
    }
  /** Dim remark from the exporter (truncation, conversion failure). */
  | { type: "note"; text: string }
  | { type: "pdf"; bytes: ArrayBuffer };

const MAX_TABLE_ROWS = 5000;
/** CSS px → PDF points. */
const PX_TO_PT = 0.75;

/** An image still to be loaded, kept in reading order until resolved. */
type Deferred = { type: "deferred"; load: () => Promise<Block> };

async function resolveDeferred(items: Array<Block | Deferred>) {
  return Promise.all(
    items.map((item) => (item.type === "deferred" ? item.load() : item)),
  );
}

function imageBlock(
  image: BakedImage,
  width: number,
  height: number,
  widthFraction?: number,
): Block {
  return {
    type: "image",
    data: image.data,
    format: image.format,
    width,
    height,
    widthFraction,
  };
}

function missingImage(label: string, error: unknown): Block {
  const reason = error instanceof Error ? error.message : String(error);
  return { type: "note", text: `Image not included${label}: ${reason}.` };
}

export async function toBlocks(
  kind: FileKind,
  content: FileContent | null,
  pathOf?: (id: string) => string | undefined,
): Promise<Block[]> {
  const text = typeof content === "string" ? content : "";
  const bytes = typeof content === "string" || content == null ? null : content;
  switch (kind) {
    case "text":
    case "random":
      return textBlocks(text);
    case "markdown":
      return markdownBlocks(text);
    case "csv":
      return csvBlocks(text);
    case "schema":
      return schemaBlocks(text);
    case "mermaid":
      return mermaidBlocks(text);
    case "calendar":
      return calendarBlocks(text);
    case "kanban":
      return kanbanBlocks(text);
    case "qr":
      return qrBlocks(text);
    case "timer":
      return timerBlocks(text);
    case "bookmark":
      return bookmarkBlocks(text);
    case "pptx":
      return pptxBlocks(text);
    case "chat":
      return chatBlocks(text);
    case "json":
    case "yaml":
    case "toml":
    case "sql":
    case "regex":
      return codeFileBlocks(text, kind);
    case "prompt":
      return codeFileBlocks(text, "json");
    case "diff":
      return diffBlocks(text, pathOf);
    case "env":
      // Secrets stay out of shareable PDFs.
      return codeFileBlocks(maskEnv(text), "env");
    case "apikeys":
      return codeFileBlocks(maskApiKeys(text), "json");
    case "appinfo":
    case "appstate":
      // Not offered by the export dialog; the saved snapshot is plain JSON.
      return text.trim() ? codeFileBlocks(text, "json") : [emptyNote()];
    case "docx":
      return bytes ? docxBlocks(bytes) : [emptyNote()];
    case "xlsx":
      return bytes ? xlsxBlocks(bytes) : [emptyNote()];
    case "pdf":
      return bytes && bytes.byteLength
        ? [{ type: "pdf", bytes }]
        : [emptyNote()];
    case "image":
      return bytes && bytes.byteLength ? imageFileBlocks(bytes) : [emptyNote()];
  }
}

const emptyNote = (): Block => ({ type: "note", text: "This file is empty." });

/** An image file: one picture at its natural size (fitted by the layout). */
async function imageFileBlocks(bytes: ArrayBuffer): Promise<Block[]> {
  try {
    const format = sniffImageFormat(bytes);
    const image = await bakeImage(
      new Uint8Array(bytes),
      format ? IMAGE_FORMATS[format].mime : undefined,
    );
    return [imageBlock(image, image.width * PX_TO_PT, image.height * PX_TO_PT)];
  } catch (error) {
    return [missingImage("", error)];
  }
}

/* ───────────────────────────── Plain text ───────────────────────────── */

function textBlocks(text: string): Block[] {
  if (!text.trim()) return [emptyNote()];
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line): Block =>
      line.trim() ? { type: "line", text: line } : { type: "gap" },
    );
}

/* ───────────────────────────── Markdown ───────────────────────────── */

/** Inline Markdown → plain text: drop emphasis, code ticks, link targets, HTML. */
export function stripInlineMarkdown(s: string) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) =>
      alt ? `[Image: ${alt}]` : "[Image]",
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitTableRow(line: string) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => stripInlineMarkdown(cell.trim()));
}

const MD_IMAGE = String.raw`!\[((?:[^\]\\]|\\.)*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)`;
/** `![alt](src "title")` or `<img src=… alt=…>`. */
const INLINE_IMAGE = new RegExp(`${MD_IMAGE}|<img\\b([^>]*)>`, "gi");
/** `[![alt](src)](href)` — a linked image; the link is dropped. */
const LINKED_IMAGE = new RegExp(String.raw`\[(${MD_IMAGE})\]\([^)]*\)`, "g");

function htmlAttribute(attributes: string, name: string) {
  const match = new RegExp(
    String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`,
    "i",
  ).exec(attributes);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/** Splits a source line into text runs and the images inside it. */
function splitImages(line: string) {
  const parts: Array<string | { src: string; alt: string }> = [];
  const text = line.replace(LINKED_IMAGE, "$1");
  let last = 0;
  for (const match of text.matchAll(INLINE_IMAGE)) {
    let src: string | undefined;
    let alt = "";
    if (match[3] !== undefined) {
      src = htmlAttribute(match[3], "src");
      alt = htmlAttribute(match[3], "alt") ?? "";
    } else {
      src = match[2].replace(/^<|>$/g, "");
      alt = match[1].replace(/\\(.)/g, "$1");
    }
    if (!src) continue;
    parts.push(text.slice(last, match.index));
    parts.push({ src: src.replace(/&amp;/g, "&"), alt });
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function markdownImage(src: string, alt: string): Deferred {
  return {
    type: "deferred",
    load: async () => {
      try {
        const image = await bakeImageUrl(src);
        return imageBlock(
          image,
          image.width * PX_TO_PT,
          image.height * PX_TO_PT,
        );
      } catch (error) {
        const label = alt
          ? ` (${alt})`
          : src.startsWith("data:")
            ? ""
            : ` (${src.length > 80 ? `${src.slice(0, 77)}…` : src})`;
        return missingImage(label, error);
      }
    },
  };
}

async function markdownBlocks(source: string): Promise<Block[]> {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Array<Block | Deferred> = [];
  let buffer: string[] = [];
  let bufferIndent = 0;
  let i = 0;

  const flush = () => {
    if (buffer.length) {
      blocks.push({
        type: "paragraph",
        text: stripInlineMarkdown(buffer.join(" ")),
        indent: bufferIndent || undefined,
      });
    }
    buffer = [];
    bufferIndent = 0;
  };

  /** Adds paragraph text, breaking out any images onto their own blocks. */
  const addText = (text: string) => {
    const parts = splitImages(text);
    if (parts.length === 1) {
      buffer.push(text);
      return;
    }
    const indent = bufferIndent;
    for (const part of parts) {
      if (typeof part === "string") {
        if (part.trim()) {
          bufferIndent = indent;
          buffer.push(part.trim());
        }
      } else {
        flush();
        blocks.push(markdownImage(part.src, part.alt));
      }
    }
  };

  // Front matter.
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) i = end + 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (fence) {
      flush();
      const [, indent, marker, language] = fence;
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(marker); i++) {
        // Drop the fence's own indentation, keep the code's.
        code.push(
          lines[i].startsWith(indent)
            ? lines[i].slice(indent.length)
            : lines[i],
        );
      }
      blocks.push({
        type: "code",
        lines: code,
        language: language || undefined,
      });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "paragraph", text: stripInlineMarkdown(heading[1]) });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "gap" });
      continue;
    }
    if (line.includes("|") && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      flush();
      const header = splitTableRow(line);
      const rows: string[][] = [];
      for (
        i += 2;
        i < lines.length && lines[i].includes("|") && lines[i].trim();
        i++
      ) {
        rows.push(splitTableRow(lines[i]));
      }
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (item) {
      flush();
      const level = Math.floor(item[1].replace(/\t/g, "  ").length / 2);
      const marker = /\d/.test(item[2]) ? item[2] : "•";
      const task = item[3] ? (/x/i.test(item[3]) ? "[x] " : "[ ] ") : "";
      bufferIndent = 12 + level * 14;
      addText(`${marker} ${task}${item[4]}`);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (bufferIndent !== 14) flush();
      bufferIndent = 14;
      if (quote[1].trim()) addText(quote[1]);
      else flush();
      continue;
    }
    // Continuation of a list item, or ordinary paragraph text.
    addText(line.trim());
  }
  flush();
  return blocks.length ? resolveDeferred(blocks) : [emptyNote()];
}

/* ───────────────────────────── CSV ───────────────────────────── */

function csvBlocks(text: string): Block[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? "")));
  if (!rows.length) return [emptyNote()];
  return tableWithLimit(undefined, rows[0], rows.slice(1));
}

function tableWithLimit(
  caption: string | undefined,
  header: string[] | null,
  rows: string[][],
) {
  const blocks: Block[] = [
    { type: "table", caption, header, rows: rows.slice(0, MAX_TABLE_ROWS) },
  ];
  if (rows.length > MAX_TABLE_ROWS) {
    blocks.push({
      type: "note",
      text: `Showing the first ${MAX_TABLE_ROWS.toLocaleString()} of ${rows.length.toLocaleString()} rows.`,
    });
  }
  return blocks;
}

/* ───────────────────────────── JSON Schema ───────────────────────────── */

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function schemaType(node: Json): string {
  if (typeof node.$ref === "string") return `ref ${node.$ref}`;
  if (Array.isArray(node.enum)) return "enum";
  const type = Array.isArray(node.type) ? node.type.join(" | ") : node.type;
  if (type === "array" && isObject(node.items))
    return `array of ${schemaType(node.items)}`;
  if (typeof type === "string") return type;
  if (isObject(node.properties)) return "object";
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(node[key])) return key;
  }
  return "any";
}

function schemaDetails(node: Json) {
  const parts: string[] = [];
  const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  if (Array.isArray(node.enum))
    parts.push(`One of: ${node.enum.map(show).join(", ")}`);
  if (node.const !== undefined) parts.push(`Const: ${show(node.const)}`);
  if (typeof node.format === "string") parts.push(`Format: ${node.format}`);
  if (typeof node.pattern === "string") parts.push(`Pattern: ${node.pattern}`);
  const ranges: Array<[string, string]> = [
    ["minimum", "Min"],
    ["exclusiveMinimum", "Min (exclusive)"],
    ["maximum", "Max"],
    ["exclusiveMaximum", "Max (exclusive)"],
    ["minLength", "Min length"],
    ["maxLength", "Max length"],
    ["minItems", "Min items"],
    ["maxItems", "Max items"],
  ];
  for (const [key, label] of ranges) {
    if (node[key] !== undefined) parts.push(`${label}: ${show(node[key])}`);
  }
  if (node.default !== undefined) parts.push(`Default: ${show(node.default)}`);
  if (Array.isArray(node.examples) && node.examples.length) {
    parts.push(`Examples: ${node.examples.map(show).join(", ")}`);
  }
  return parts.join("; ");
}

function schemaRows(node: Json, prefix: string, rows: string[][]) {
  const required = new Set(
    Array.isArray(node.required) ? node.required.map(String) : [],
  );
  const properties = isObject(node.properties) ? node.properties : {};
  for (const [key, raw] of Object.entries(properties)) {
    const prop = isObject(raw) ? raw : {};
    const path = prefix + key;
    rows.push([
      path,
      schemaType(prop),
      required.has(key) ? "Yes" : "",
      typeof prop.description === "string" ? prop.description : "",
      schemaDetails(prop),
    ]);
    if (isObject(prop.properties)) schemaRows(prop, `${path}.`, rows);
    if (isObject(prop.items) && isObject(prop.items.properties)) {
      schemaRows(prop.items, `${path}[].`, rows);
    }
  }
}

function schemaBlocks(text: string): Block[] {
  if (!text.trim()) return [emptyNote()];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not valid JSON (${(error as Error).message}); showing the raw text.`,
      },
      ...textBlocks(text),
    ];
  }
  if (!isObject(root))
    return [{ type: "note", text: "The schema is not a JSON object." }];
  const blocks: Block[] = [];
  const intro = [root.title, root.description]
    .filter((v) => typeof v === "string")
    .join(" — ");
  if (intro) blocks.push({ type: "paragraph", text: intro });
  const rows: string[][] = [];
  schemaRows(root, "", rows);
  for (const defsKey of ["$defs", "definitions"]) {
    const defs = root[defsKey];
    if (!isObject(defs)) continue;
    for (const [name, def] of Object.entries(defs)) {
      if (isObject(def)) {
        rows.push([
          `${defsKey}/${name}`,
          schemaType(def),
          "",
          String(def.description ?? ""),
          schemaDetails(def),
        ]);
        schemaRows(def, `${defsKey}/${name}.`, rows);
      }
    }
  }
  if (!rows.length) {
    blocks.push({ type: "note", text: "This schema defines no properties." });
    return blocks;
  }
  blocks.push({
    type: "table",
    header: ["Property", "Type", "Required", "Description", "Constraints"],
    rows,
  });
  return blocks;
}

/* ───────────────────────────── Code files ───────────────────────────── */

function codeFileBlocks(text: string, language: string): Block[] {
  if (!text.trim()) return [emptyNote()];
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return [{ type: "code", lines, language }];
}

/* ───────────────────────────── Diff ───────────────────────────── */

/** A patch prints as-is; a comparison prints as the patch between its two
 *  files, read now so the PDF shows their current content. */
async function diffBlocks(
  text: string,
  pathOf?: (id: string) => string | undefined,
): Promise<Block[]> {
  const file = parseDiffFile(text);
  if (file.type === "patch") return codeFileBlocks(file.patch, "diff");
  const { left, right, ignoreWhitespace } = file.doc;
  const leftPath = left ? pathOf?.(left) : undefined;
  const rightPath = right ? pathOf?.(right) : undefined;
  if (!left || !right || !leftPath || !rightPath) {
    return [{ type: "note", text: "This comparison has no files picked." }];
  }
  const [a, b] = await Promise.all([
    storage.getContent(left),
    storage.getContent(right),
  ]);
  const patch = comparisonPatch(
    leftPath,
    rightPath,
    typeof a === "string" ? a : "",
    typeof b === "string" ? b : "",
    ignoreWhitespace,
  );
  return /^@@/m.test(patch)
    ? codeFileBlocks(patch, "diff")
    : [{ type: "note", text: `${leftPath} and ${rightPath} are identical.` }];
}

/* ───────────────────────────── Kanban ───────────────────────────── */

/* ───────────────────────── QR / timer / chat ───────────────────────── */

async function qrBlocks(text: string): Promise<Block[]> {
  let doc;
  try {
    doc = parseQr(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid QR design (${(error as Error).message}).`,
      },
    ];
  }
  const data = qrData(doc.content);
  if (!data)
    return [{ type: "note", text: "This QR code encodes nothing yet." }];
  try {
    const png = await renderQrPng(doc, 600);
    return [
      { type: "image", data: png, format: "png", width: 180, height: 180 },
      { type: "line", text: data },
    ];
  } catch (error) {
    return [missingImage(" (QR code)", error), { type: "line", text: data }];
  }
}

function timerBlocks(text: string): Block[] {
  let doc;
  try {
    doc = parseTimers(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid timer list (${(error as Error).message}).`,
      },
    ];
  }
  if (!doc.timers.length) return [{ type: "note", text: "No timers." }];
  return [
    {
      type: "table",
      header: ["#", "Timer", "Duration"],
      rows: doc.timers.map((t, i) => [
        String(i + 1),
        t.label || "Untitled",
        formatDuration(t.durationMs),
      ]),
    },
  ];
}

function bookmarkBlocks(text: string): Block[] {
  let doc;
  try {
    doc = parseBookmarks(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid bookmark file (${(error as Error).message}).`,
      },
    ];
  }
  if (!doc.bookmarks.length) return [{ type: "note", text: "No bookmarks." }];
  return [
    {
      type: "table",
      header: BOOKMARK_TABLE_HEADER,
      rows: bookmarkRows(doc).slice(0, MAX_TABLE_ROWS),
    },
  ];
}

/** One picture per slide, each followed by its speaker notes. */
async function pptxBlocks(text: string): Promise<Block[]> {
  let doc;
  try {
    doc = parsePptx(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid slide deck (${(error as Error).message}).`,
      },
    ];
  }
  try {
    // Konva loads only when a deck is actually exported.
    const { renderDeckPngs } = await import("@/lib/pptx-render");
    const pages = await renderDeckPngs(doc, 2);
    return pages.flatMap((data, i): Block[] => {
      const notes = doc.slides[i].notes.trim();
      return [
        {
          type: "image",
          data,
          format: "png",
          width: SLIDE_WIDTH * PX_TO_PT,
          height: SLIDE_HEIGHT * PX_TO_PT,
          widthFraction: 1,
        },
        ...(notes
          ? [{ type: "paragraph", text: `Notes: ${notes}` } as const]
          : []),
        { type: "gap" },
      ];
    });
  } catch (error) {
    return [missingImage(" (slides)", error)];
  }
}

async function chatBlocks(text: string): Promise<Block[]> {
  let doc;
  try {
    doc = parseChat(text);
  } catch (error) {
    return [
      { type: "note", text: `Not a valid chat (${(error as Error).message}).` },
    ];
  }
  const messages = doc.messages.filter((m) => !m.error && m.content.trim());
  if (!messages.length) return [{ type: "note", text: "No messages." }];
  const blocks: Block[] = [];
  if (doc.promptRef) {
    blocks.push(
      { type: "paragraph", text: `System prompt: ${doc.promptRef.name}` },
      { type: "gap" },
    );
  }
  for (const m of messages) {
    blocks.push({
      type: "paragraph",
      text:
        m.role === "user"
          ? "You"
          : `Assistant${m.model ? ` (${m.model})` : ""}`,
    });
    blocks.push(...(await markdownBlocks(m.content)), { type: "gap" });
  }
  return blocks;
}

function kanbanBlocks(text: string): Block[] {
  let columns;
  try {
    columns = parseKanban(text).columns;
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid board (${(error as Error).message}).`,
      },
    ];
  }
  const date = (value: string | undefined) =>
    value
      ? parseLocal(value).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";
  const rows = columns.flatMap((column) =>
    column.cards.map((card) => [
      column.title || "Untitled",
      card.title || "Untitled",
      date(card.initial),
      date(card.start),
      date(card.end),
      date(card.due),
      card.notes ?? "",
    ]),
  );
  if (!rows.length) return [{ type: "note", text: "No cards." }];
  return tableWithLimit(
    undefined,
    ["Column", "Card", "Initial", "Start", "End", "Due", "Notes"],
    rows,
  );
}

/* ───────────────────────────── Calendar ───────────────────────────── */

function calendarBlocks(text: string): Block[] {
  let doc;
  try {
    doc = parseCalendar(text);
  } catch (error) {
    return [
      {
        type: "note",
        text: `Not a valid calendar (${(error as Error).message}).`,
      },
    ];
  }
  if (!doc.events.length) return [{ type: "note", text: "No events." }];
  const day = (v: string) =>
    parseLocal(v).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  // All-day events carry dates only (end = last covered day); timed events
  // carry a date and a time at both ends.
  const moment = (v: string, allDay: boolean | undefined) =>
    allDay
      ? day(v.slice(0, 10))
      : `${day(v.slice(0, 10))} ${formatTime(parseLocal(v))}`;
  const rows = doc.events.map((e) => [
    e.title || "New Event",
    moment(e.start, e.allDay),
    moment(e.end, e.allDay),
    e.allDay ? "Yes" : "No",
    e.location ?? "",
    e.color,
    e.notes ?? "",
  ]);
  return tableWithLimit(
    undefined,
    ["Event", "Start", "End", "All-day", "Location", "Color", "Notes"],
    rows,
  );
}

/* ───────────────────────────── Mermaid ───────────────────────────── */

async function mermaidBlocks(source: string): Promise<Block[]> {
  if (!source.trim()) return [emptyNote()];
  const image = await renderMermaidPng(source, 3);
  return [
    {
      type: "image",
      data: image.png,
      format: "png",
      width: image.baseWidth,
      height: image.baseHeight,
    },
  ];
}

/* ───────────────────────────── DOCX ───────────────────────────── */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const VML = "urn:schemas-microsoft-com:vml";
const EMU_PER_PT = 12700;

/** A picture in a paragraph: its relationship id and display size (pt). */
type WordImage = { rid: string; width?: number; height?: number };
type WordPart = string | WordImage;

/** `w:drawing` → its embedded picture, if it is one (not a chart/shape). */
function drawingImage(drawing: Element): WordImage | null {
  const blip = drawing.getElementsByTagNameNS(A, "blip")[0];
  const rid = blip?.getAttributeNS(R, "embed") || blip?.getAttribute("r:embed");
  if (!rid) return null;
  const extent = drawing.getElementsByTagNameNS(WP, "extent")[0];
  const cx = Number(extent?.getAttribute("cx"));
  const cy = Number(extent?.getAttribute("cy"));
  return {
    rid,
    width: cx > 0 ? cx / EMU_PER_PT : undefined,
    height: cy > 0 ? cy / EMU_PER_PT : undefined,
  };
}

const CSS_UNIT_TO_PT: Record<string, number> = {
  pt: 1,
  px: PX_TO_PT,
  in: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pc: 12,
};

/** Legacy VML `w:pict` → its `v:imagedata` picture, sized from the style. */
function pictImage(pict: Element): WordImage | null {
  const data = pict.getElementsByTagNameNS(VML, "imagedata")[0];
  const rid = data?.getAttributeNS(R, "id") || data?.getAttribute("r:id");
  if (!rid) return null;
  const style =
    pict.getElementsByTagNameNS(VML, "shape")[0]?.getAttribute("style") ?? "";
  const size = (prop: string) => {
    const m = new RegExp(
      `(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)\\s*([a-z]*)`,
      "i",
    ).exec(style);
    if (!m) return undefined;
    const value =
      Number(m[1]) * (CSS_UNIT_TO_PT[m[2].toLowerCase() || "px"] ?? 1);
    return value > 0 ? value : undefined;
  };
  return { rid, width: size("width"), height: size("height") };
}

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error("Malformed XML.");
  return doc;
}

/**
 * Text and pictures of a `w:p` (or any container), in order, honouring tabs
 * and line breaks.
 */
function wordParts(node: Element) {
  const parts: WordPart[] = [];
  let out = "";
  const picture = (image: WordImage | null) => {
    if (!image) {
      out += "[Drawing]";
      return;
    }
    parts.push(out, image);
    out = "";
  };
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.namespaceURI !== W) {
        // Markup-compatibility wrapper: use its first (preferred) choice.
        if (child.localName === "AlternateContent") {
          const choice = Array.from(child.children).find(
            (c) => c.localName === "Choice" || c.localName === "Fallback",
          );
          if (choice) walk(choice);
        }
        continue;
      }
      switch (child.localName) {
        case "t":
          out += child.textContent ?? "";
          break;
        case "tab":
          out += "    ";
          break;
        case "br":
        case "cr":
          out += "\n";
          break;
        case "drawing":
          picture(drawingImage(child));
          break;
        case "pict":
        case "object":
          picture(pictImage(child));
          break;
        case "delText":
        case "instrText":
        case "del":
        case "rPr":
        case "pPr":
          break;
        default:
          walk(child);
      }
    }
  };
  walk(node);
  parts.push(out);
  return parts;
}

/** Plain text of a container; pictures become a placeholder (table cells). */
function wordText(node: Element) {
  return wordParts(node)
    .map((part) => (typeof part === "string" ? part : "[Image]"))
    .join("");
}

/** Loads the pictures a document references, once per media file. */
/**
 * Pictures at least this share of the text column are stretched to the full
 * column width in the PDF; smaller ones (icons, signatures, inline logos)
 * keep their proportion of it.
 */
const FILL_WIDTH_FROM = 1 / 3;

/** Text-column width (pt) of the document's main section, from `w:sectPr`. */
function wordColumnWidth(body: Element) {
  const sectPr = Array.from(body.children).findLast(
    (el) => el.namespaceURI === W && el.localName === "sectPr",
  );
  const twips = (el: Element | undefined, ...names: string[]) => {
    for (const name of names) {
      const raw = el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`);
      const value = Number(raw);
      if (raw && Number.isFinite(value)) return value;
    }
    return undefined;
  };
  const pgSz = sectPr?.getElementsByTagNameNS(W, "pgSz")[0];
  const pgMar = sectPr?.getElementsByTagNameNS(W, "pgMar")[0];
  // Word's defaults: Letter, 1" margins.
  const page = twips(pgSz, "w") ?? 12240;
  const left = twips(pgMar, "left", "start") ?? 1440;
  const right = twips(pgMar, "right", "end") ?? 1440;
  const width = (page - left - right) / 20;
  return width > 0 ? width : 468;
}

function wordImageLoader(
  zip: ReturnType<typeof readZip>,
  rels: Map<string, { target: string; external: boolean }>,
  columnWidth: number,
) {
  const cache = new Map<string, Promise<BakedImage>>();
  return (image: WordImage): Deferred => ({
    type: "deferred",
    load: async () => {
      const rel = rels.get(image.rid);
      const name = rel?.target.split("/").pop() ?? image.rid;
      try {
        if (!rel) throw new Error("its relationship is missing");
        if (rel.external) throw new Error("it is linked, not embedded");
        let baked = cache.get(rel.target);
        if (!baked) {
          baked = zip.bytes(rel.target).then((bytes) => {
            if (!bytes) throw new Error("the file is missing from the DOCX");
            return bakeImage(bytes, mimeFromName(rel.target));
          });
          cache.set(rel.target, baked);
        }
        const loaded = await baked;
        // Keep the size Word shows it at; fill a missing side from the ratio.
        const ratio = loaded.height / loaded.width;
        const width =
          image.width ??
          (image.height ? image.height / ratio : loaded.width * PX_TO_PT);
        const height = image.height ?? width * ratio;
        const share = width / columnWidth;
        return imageBlock(
          loaded,
          width,
          height,
          share >= FILL_WIDTH_FROM ? 1 : share,
        );
      } catch (error) {
        return missingImage(` (${name})`, error);
      }
    },
  });
}

function wordBodyBlocks(
  container: Element,
  blocks: Array<Block | Deferred>,
  loadImage: (image: WordImage) => Deferred,
) {
  for (const child of Array.from(container.children)) {
    if (child.namespaceURI !== W) continue;
    if (child.localName === "p") {
      const isListItem = child.getElementsByTagNameNS(W, "numPr").length > 0;
      const parts = wordParts(child);
      if (parts.every((part) => typeof part === "string" && !part.trim())) {
        blocks.push({ type: "gap" });
        continue;
      }
      let bullet = isListItem;
      for (const part of parts) {
        if (typeof part !== "string") {
          blocks.push(loadImage(part));
          continue;
        }
        if (!part.trim()) continue;
        part.split("\n").forEach((line) => {
          blocks.push({
            type: "paragraph",
            text: bullet ? `• ${line}` : line,
            indent: isListItem ? 12 : undefined,
          });
          bullet = false;
        });
      }
    } else if (child.localName === "tbl") {
      const rows = Array.from(child.children)
        .filter((el) => el.localName === "tr")
        .map((tr) =>
          Array.from(tr.children)
            .filter((el) => el.localName === "tc")
            .map((tc) =>
              Array.from(tc.getElementsByTagNameNS(W, "p"))
                .map(wordText)
                .filter((t) => t.trim())
                .join(" "),
            ),
        );
      if (rows.length)
        blocks.push({ type: "table", header: rows[0], rows: rows.slice(1) });
    } else if (child.localName === "sdt") {
      const content = child.getElementsByTagNameNS(W, "sdtContent")[0];
      if (content) wordBodyBlocks(content, blocks, loadImage);
    }
  }
}

async function docxBlocks(bytes: ArrayBuffer): Promise<Block[]> {
  const zip = readZip(bytes);
  const xml = await zip.text("word/document.xml");
  if (!xml) throw new Error("No word/document.xml in this file.");
  const body = parseXml(xml).getElementsByTagNameNS(W, "body")[0];

  // Relationship ids → media paths inside the archive (relative to word/).
  const rels = new Map<string, { target: string; external: boolean }>();
  const relsXml = await zip.text("word/_rels/document.xml.rels");
  if (relsXml) {
    for (const rel of Array.from(
      parseXml(relsXml).getElementsByTagName("Relationship"),
    )) {
      const target = rel.getAttribute("Target") ?? "";
      const external = rel.getAttribute("TargetMode") === "External";
      rels.set(rel.getAttribute("Id") ?? "", {
        target: external
          ? target
          : decodeURIComponent(
              new URL(target, "zip://docx/word/").pathname.slice(1),
            ),
        external,
      });
    }
  }

  const items: Array<Block | Deferred> = [];
  if (body) {
    wordBodyBlocks(
      body,
      items,
      wordImageLoader(zip, rels, wordColumnWidth(body)),
    );
  }
  const blocks = await resolveDeferred(items);
  // Trim leading/trailing blank paragraphs.
  while (blocks[0]?.type === "gap") blocks.shift();
  while (blocks.at(-1)?.type === "gap") blocks.pop();
  return blocks.length ? blocks : [emptyNote()];
}

/* ───────────────────────────── XLSX ───────────────────────────── */

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase())
    n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
]);

function isDateFormat(code: string) {
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}

function formatSerialDate(serial: number, date1904: boolean) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 86400000));
  const iso = date.toISOString();
  if (Number.isInteger(serial)) return iso.slice(0, 10);
  if (serial < 1) return iso.slice(11, 16);
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function formatNumber(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) ? String(parseFloat(n.toPrecision(15))) : raw;
}

async function xlsxBlocks(bytes: ArrayBuffer): Promise<Block[]> {
  const zip = readZip(bytes);
  const workbookXml = await zip.text("xl/workbook.xml");
  if (!workbookXml) throw new Error("No xl/workbook.xml in this file.");
  const workbook = parseXml(workbookXml);
  const date1904 =
    workbook
      .getElementsByTagNameNS(S, "workbookPr")[0]
      ?.getAttribute("date1904") === "1";

  const rels = new Map<string, string>();
  const relsXml = await zip.text("xl/_rels/workbook.xml.rels");
  if (relsXml) {
    for (const rel of Array.from(
      parseXml(relsXml).getElementsByTagName("Relationship"),
    )) {
      const target = rel.getAttribute("Target") ?? "";
      rels.set(
        rel.getAttribute("Id") ?? "",
        target.startsWith("/")
          ? target.slice(1)
          : `xl/${target.replace(/^\.\//, "")}`,
      );
    }
  }

  const shared: string[] = [];
  const sharedXml = await zip.text("xl/sharedStrings.xml");
  if (sharedXml) {
    for (const si of Array.from(
      parseXml(sharedXml).getElementsByTagNameNS(S, "si"),
    )) {
      shared.push(
        Array.from(si.getElementsByTagNameNS(S, "t"))
          .filter((t) => t.parentElement?.localName !== "rPh") // phonetic hints
          .map((t) => t.textContent ?? "")
          .join(""),
      );
    }
  }

  // Which cell styles are dates.
  const dateStyles = new Set<number>();
  const stylesXml = await zip.text("xl/styles.xml");
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map<number, string>();
    for (const fmt of Array.from(styles.getElementsByTagNameNS(S, "numFmt"))) {
      custom.set(
        Number(fmt.getAttribute("numFmtId")),
        fmt.getAttribute("formatCode") ?? "",
      );
    }
    const cellXfs = styles.getElementsByTagNameNS(S, "cellXfs")[0];
    Array.from(cellXfs?.getElementsByTagNameNS(S, "xf") ?? []).forEach(
      (xf, index) => {
        const id = Number(xf.getAttribute("numFmtId") ?? 0);
        if (BUILTIN_DATE_FORMATS.has(id) || isDateFormat(custom.get(id) ?? ""))
          dateStyles.add(index);
      },
    );
  }

  const blocks: Block[] = [];
  for (const sheet of Array.from(workbook.getElementsByTagNameNS(S, "sheet"))) {
    if (
      sheet.getAttribute("state") === "hidden" ||
      sheet.getAttribute("state") === "veryHidden"
    ) {
      continue;
    }
    const name = sheet.getAttribute("name") ?? "Sheet";
    const path = rels.get(
      sheet.getAttributeNS(R, "id") ?? sheet.getAttribute("r:id") ?? "",
    );
    const sheetXml = path ? await zip.text(path) : null;
    if (!sheetXml) continue;

    const grid: string[][] = [];
    let maxCol = -1;
    let truncated = false;
    for (const row of Array.from(
      parseXml(sheetXml).getElementsByTagNameNS(S, "row"),
    )) {
      const r = Number(row.getAttribute("r") ?? grid.length + 1) - 1;
      if (r >= MAX_TABLE_ROWS + 1) {
        truncated = true;
        break;
      }
      const cells: string[] = (grid[r] ??= []);
      Array.from(row.getElementsByTagNameNS(S, "c")).forEach((c, i) => {
        const ref = c.getAttribute("r");
        const col = ref ? columnIndex(ref) : i;
        const type = c.getAttribute("t");
        const v = c.getElementsByTagNameNS(S, "v")[0]?.textContent ?? "";
        let value: string;
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") {
          value = Array.from(c.getElementsByTagNameNS(S, "t"))
            .map((t) => t.textContent ?? "")
            .join("");
        } else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (type === "str" || type === "e") value = v;
        else if (v && dateStyles.has(Number(c.getAttribute("s") ?? -1))) {
          value = formatSerialDate(Number(v), date1904);
        } else value = v ? formatNumber(v) : "";
        if (value !== "") {
          cells[col] = value;
          maxCol = Math.max(maxCol, col);
        }
      });
    }

    const rows = Array.from({ length: grid.length }, (_, r) =>
      Array.from({ length: maxCol + 1 }, (_, c) => grid[r]?.[c] ?? ""),
    );
    // Drop leading/trailing empty rows.
    const isEmpty = (row: string[]) => row.every((cell) => !cell);
    while (rows.length && isEmpty(rows[0])) rows.shift();
    while (rows.length && isEmpty(rows[rows.length - 1])) rows.pop();

    if (!rows.length) {
      blocks.push({ type: "note", text: `Sheet "${name}" is empty.` });
      continue;
    }
    blocks.push(...tableWithLimit(`Sheet: ${name}`, rows[0], rows.slice(1)));
    if (truncated) {
      blocks.push({
        type: "note",
        text: `Sheet "${name}" is longer; only the first ${MAX_TABLE_ROWS.toLocaleString()} rows are included.`,
      });
    }
  }
  return blocks.length ? blocks : [emptyNote()];
}
