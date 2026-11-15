/**
 * The explorer's "Convert to" engine: turns one file's content into another
 * format (see `convert-targets.ts` for what is offered). Loaded on demand
 * from the menu; the heavy parts — PDF layout, Word / Excel readers, image
 * codecs, Mermaid — are imported only by the conversion that needs them.
 */
import Papa from "papaparse";
import { stringify as stringifyYaml } from "yaml";
import { stringify as stringifyToml } from "smol-toml";

import type {
  ConvertTarget,
  ConvertTargetId,
  DataTargetId,
} from "@/lib/convert-targets";
import { parseCalendar, toMermaidTimeline } from "@/lib/calendar";
import { parseData, parseEnv } from "@/lib/data-formats";
import { parseKanban, toMermaidGantt } from "@/lib/kanban";
import { type FileKind, kindOf } from "@/lib/file-types";
import {
  IMAGE_FORMATS,
  type ImageFormat,
  sniffImageFormat,
} from "@/lib/image-formats";
import type { FileContent } from "@/lib/storage";
import type { Block } from "@/lib/unified-export/extract";

export type ConvertInput = {
  id: string;
  name: string;
  content: FileContent | null;
  /** "Folder / sub / file.md" — the PDF section subtitle. */
  path: string;
  /** Workspace path of a file id (a `.diff` names its two files by it). */
  pathOf?: (id: string) => string | undefined;
};

/**
 * Whether a target can be chosen. Eager targets carry their finished
 * `output`; the rest are converted when chosen.
 */
export type ConvertCheck =
  { ok: true; output?: FileContent } | { ok: false; message: string };

/** A conversion that cannot be done; its message is shown to the user. */
class ConvertError extends Error {}

const fail = (message: string): never => {
  throw new ConvertError(message);
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

const textOf = (content: FileContent | null) =>
  typeof content === "string" ? content : "";

const DATA_TARGETS: ReadonlySet<string> = new Set<DataTargetId>([
  "json",
  "yml",
  "yaml",
  "toml",
  "env",
]);

/* ───────────────────────────── Layout blocks ───────────────────────────── */

/**
 * The file as unified-export blocks. A file that yields only notes (empty,
 * unreadable) fails with the note's text.
 */
async function blocksOf(kind: FileKind, input: ConvertInput) {
  const { toBlocks } = await import("@/lib/unified-export/extract");
  const blocks = await toBlocks(kind, input.content, input.pathOf);
  if (blocks.every((b) => b.type === "note" || b.type === "gap")) {
    const note = blocks.find((b) => b.type === "note");
    fail(note && note.type === "note" ? note.text : "Nothing to convert.");
  }
  return blocks;
}

type Table = Extract<Block, { type: "table" }>;

/** Every table in the file; refuses a sheet the reader cut short. */
async function tablesOf(kind: FileKind, input: ConvertInput) {
  const blocks = await blocksOf(kind, input);
  const cut = blocks.find(
    (b) => b.type === "note" && /\bfirst \S+ (?:of|rows)\b/.test(b.text),
  );
  if (cut && cut.type === "note") {
    fail(`${cut.text} Too large to convert without losing rows.`);
  }
  const tables = blocks.filter((b): b is Table => b.type === "table");
  if (!tables.length) fail("There is no table to convert.");
  return tables;
}

/** Header row + rows → objects keyed by the header (blank → `column3`). */
function tableObjects(table: Table): unknown[] {
  if (!table.header) return table.rows;
  const keys = table.header.map((h, i) => h.trim() || `column${i + 1}`);
  return table.rows.map((row) =>
    Object.fromEntries(keys.map((k, i) => [k, row[i] ?? ""])),
  );
}

const sheetName = (table: Table, index: number) =>
  table.caption?.replace(/^Sheet:\s*/, "") || `Sheet ${index + 1}`;

/* ───────────────────────────── Markdown / text ───────────────────────────── */

function base64(data: Uint8Array) {
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const mdCell = (cell: string) =>
  cell.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

function markdownTable(header: string[] | null, rows: string[][]) {
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length), 1);
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => mdCell(row[i] ?? ""));
  const head = header ?? Array.from({ length: width }, () => "");
  return [
    `| ${pad(head).join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${pad(row).join(" | ")} |`),
  ].join("\n");
}

function tidy(parts: string[]) {
  const text = parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? `${text}\n` : "";
}

function blocksToMarkdown(blocks: Block[]) {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
      case "line":
        out.push(b.text, "");
        break;
      case "code":
        out.push("```" + (b.language ?? ""), ...b.lines, "```", "");
        break;
      case "gap":
        out.push("");
        break;
      case "table":
        if (b.caption) out.push(`**${b.caption}**`, "");
        out.push(markdownTable(b.header, b.rows), "");
        break;
      case "image": {
        const mime = b.format === "jpg" ? "image/jpeg" : "image/png";
        out.push(`![](data:${mime};base64,${base64(b.data)})`, "");
        break;
      }
      case "note":
        out.push(`_${b.text}_`, "");
        break;
      case "pdf":
        break;
    }
  }
  return tidy(out);
}

function blocksToText(blocks: Block[]) {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        out.push(b.text, "");
        break;
      case "line":
        out.push(b.text);
        break;
      case "code":
        out.push(...b.lines, "");
        break;
      case "gap":
        out.push("");
        break;
      case "table":
        if (b.caption) out.push(b.caption);
        if (b.header) out.push(b.header.join("\t"));
        out.push(...b.rows.map((r) => r.join("\t")), "");
        break;
      case "image":
        out.push("[image]", "");
        break;
      case "note":
        out.push(b.text, "");
        break;
      case "pdf":
        break;
    }
  }
  return tidy(out);
}

/* ───────────────────────────── Structured data ───────────────────────────── */

/** The file as a plain JS value (object, array, …). */
async function readValue(
  kind: FileKind,
  input: ConvertInput,
): Promise<unknown> {
  const text = textOf(input.content);
  if (kind === "env") {
    const { entries, problems } = parseEnv(text);
    const error = problems.find((p) => p.severity === "error");
    if (error) fail(`Line ${error.line}: ${error.message}`);
    // Later assignments win, as in every dotenv loader.
    return Object.fromEntries(entries.map((e) => [e.key, e.value]));
  }
  if (
    kind === "json" ||
    kind === "yaml" ||
    kind === "toml" ||
    kind === "schema"
  ) {
    const parsed = parseData(kind === "schema" ? "json" : kind, text);
    if (!parsed.ok) {
      const { line, column, message } = parsed.problem;
      fail(`Line ${line}:${column}: ${message}`);
    }
    return parsed.ok ? (parsed.value ?? {}) : {};
  }
  if (kind === "csv") {
    // Numbers and booleans become typed values; anything that would change
    // when retyped ("007", "1e3", "1.50") stays a string.
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transform: (cell) => {
        if (cell === "true" || cell === "false") return cell === "true";
        const n = Number(cell);
        return cell.trim() && String(n) === cell && Number.isFinite(n)
          ? n
          : cell;
      },
    });
    return parsed.data;
  }
  // Excel: one sheet → its rows; several → `{ "Sheet name": rows }`.
  const tables = await tablesOf(kind, input);
  if (tables.length === 1) return tableObjects(tables[0]);
  return Object.fromEntries(
    tables.map((t, i) => [sheetName(t, i), tableObjects(t)]),
  );
}

/** Dotted path of the first null / undefined in `value`, or null if none. */
function nullPath(value: unknown, path = ""): string | null {
  if (value === null || value === undefined) return path || "root";
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = nullPath(value[i], `${path}[${i}]`);
      if (found) return found;
    }
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      const found = nullPath(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
}

function envKey(path: string[]) {
  const key = path
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toUpperCase();
  return /^[0-9]/.test(key) ? `_${key}` : key;
}

function scalarText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function envValue(value: unknown) {
  const text = scalarText(value);
  if (text === "" || !/[\s#"'`\\=]/.test(text)) return text;
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/**
 * Flattens nested tables into `PARENT_CHILD=value` lines; array items get
 * their index (`HOSTS_0`, `HOSTS_1`).
 */
function toEnv(value: Record<string, unknown>) {
  const lines: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, String(i)]));
    } else if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    } else {
      lines.push(`${envKey(path)}=${envValue(node)}`);
    }
  };
  walk(value, []);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function writeData(target: DataTargetId, value: unknown): string {
  if (target === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (target === "yml" || target === "yaml") {
    return stringifyYaml(value, { lineWidth: 0 });
  }
  const label = target === "toml" ? "TOML" : ".env";
  if (!isPlainObject(value)) {
    fail(`${label} needs key/value pairs at the top level.`);
  }
  const record = value as Record<string, unknown>;
  if (target === "env") return toEnv(record);
  const at = nullPath(record);
  if (at) fail(`TOML has no null value (${at}).`);
  const text = stringifyToml(record);
  return text.endsWith("\n") ? text : `${text}\n`;
}

const csvText = (...args: Parameters<typeof Papa.unparse>) =>
  `${Papa.unparse(...args)}\n`;

/** A list of rows (objects, arrays or scalars) → CSV. */
function valueToCsv(value: unknown) {
  if (!Array.isArray(value)) {
    fail("CSV needs a list of rows (an array) at the top level.");
  }
  const rows = value as unknown[];
  if (rows.every(isPlainObject)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return csvText({
      fields,
      data: rows.map((r) => fields.map((f) => scalarText(r[f]))),
    });
  }
  if (rows.every(Array.isArray)) {
    return csvText(rows.map((r) => r.map(scalarText)));
  }
  if (rows.some((r) => typeof r === "object" && r !== null)) {
    fail(
      "CSV needs every row to be the same shape (all objects or all lists).",
    );
  }
  return csvText({
    fields: ["value"],
    data: rows.map((r) => [scalarText(r)]),
  });
}

/* ───────────────────────────── Binary outputs ───────────────────────────── */

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

async function toPdf(kind: FileKind, input: ConvertInput) {
  const { buildUnifiedPdf } = await import("@/lib/unified-export/pdf");
  const result = await buildUnifiedPdf(
    [{ id: input.id, name: input.name, path: input.path, kind }],
    {
      pageSize: "a4",
      contents: false,
      title: input.name,
      pathOf: input.pathOf,
    },
  );
  if (result.failures[0]) fail(result.failures[0].error);
  return toBuffer(result.bytes);
}

async function toImage(
  kind: FileKind,
  input: ConvertInput,
  format: ImageFormat,
): Promise<ArrayBuffer> {
  const text = textOf(input.content);
  if (kind === "mermaid") {
    if (!text.trim()) fail("The diagram is empty.");
    const { renderMermaidPng, renderMermaidSvg } =
      await import("@/lib/mermaid-render");
    if (format === "svg") {
      const svg = await renderMermaidSvg(text, {
        theme: "default",
        htmlLabels: false,
      });
      return toBuffer(new TextEncoder().encode(svg));
    }
    return toBuffer((await renderMermaidPng(text)).png);
  }
  if (kind === "qr") {
    const { parseQr, qrData, renderQrPng } = await import("@/lib/qr-doc");
    const doc = parseQr(text);
    if (!qrData(doc.content)) fail("This QR code encodes nothing yet.");
    return toBuffer(await renderQrPng(doc, 1024));
  }
  const bytes = input.content instanceof ArrayBuffer ? input.content : null;
  if (!bytes?.byteLength) fail("This image file is empty.");
  const source = sniffImageFormat(bytes!);
  if (!source) fail("The image format is not recognised.");
  if (source === format) return bytes!;
  const { decodeImage, encodeImage } = await import("@/lib/image-tools");
  const decoded = await decodeImage(bytes!, source!);
  return toBuffer(
    await encodeImage(decoded.canvas, format, {}, decoded.vectorScale),
  );
}

/* ─────────────────────────────── Public API ─────────────────────────────── */

/** Converts `input` to `target`. Throws with a user-facing message. */
export async function convertFile(
  input: ConvertInput,
  target: ConvertTargetId,
): Promise<FileContent> {
  const kind = kindOf(input.name);
  if (target === "pdf") return toPdf(kind, input);
  if (target.startsWith("img-")) {
    return toImage(kind, input, target.slice(4) as ImageFormat);
  }
  if (DATA_TARGETS.has(target)) {
    return writeData(target as DataTargetId, await readValue(kind, input));
  }
  if (target === "csv") {
    if (
      kind === "xlsx" ||
      kind === "kanban" ||
      kind === "calendar" ||
      kind === "timer"
    ) {
      // CSV holds one table: the first sheet / the file's table.
      const [table] = await tablesOf(kind, input);
      return csvText(table.header ? [table.header, ...table.rows] : table.rows);
    }
    return valueToCsv(await readValue(kind, input));
  }
  if (target === "mermaid-gantt") {
    if (kind !== "kanban") fail("Only boards convert to a Gantt chart.");
    let board;
    try {
      board = parseKanban(textOf(input.content));
    } catch (error) {
      fail(`Not a valid board (${errorMessage(error)}).`);
    }
    try {
      return toMermaidGantt(board!);
    } catch (error) {
      fail(errorMessage(error));
    }
  }
  if (target === "mermaid-timeline") {
    if (kind !== "calendar") fail("Only calendars convert to a timeline.");
    let doc;
    try {
      doc = parseCalendar(textOf(input.content));
    } catch (error) {
      fail(`Not a valid calendar (${errorMessage(error)}).`);
    }
    try {
      return toMermaidTimeline(doc!);
    } catch (error) {
      fail(errorMessage(error));
    }
  }
  if (target === "md") {
    if (kind === "text") return textOf(input.content);
    if (kind === "csv") {
      const rows = Papa.parse<string[]>(textOf(input.content), {
        skipEmptyLines: "greedy",
      }).data;
      if (!rows.length) fail("This file is empty.");
      return `${markdownTable(rows[0], rows.slice(1))}\n`;
    }
    return blocksToMarkdown(await blocksOf(kind, input));
  }
  return blocksToText(await blocksOf(kind, input));
}

/**
 * Readiness of every target, for the menu as it opens: eager targets are
 * converted now (their output is kept), image targets are checked against
 * what this browser can write, the rest are assumed possible.
 */
export async function checkTargets(
  input: ConvertInput,
  targets: ConvertTarget[],
): Promise<Record<string, ConvertCheck>> {
  const checks: Record<string, ConvertCheck> = {};
  await Promise.all(
    targets.map(async (target) => {
      try {
        if (target.eager) {
          checks[target.id] = {
            ok: true,
            output: await convertFile(input, target.id),
          };
        } else if (target.id.startsWith("img-")) {
          const format = target.id.slice(4) as ImageFormat;
          const { canEncode } = await import("@/lib/image-tools");
          const current =
            input.content instanceof ArrayBuffer
              ? sniffImageFormat(input.content)
              : null;
          checks[target.id] =
            current === format
              ? {
                  ok: false,
                  message: `Already a ${IMAGE_FORMATS[format].label} image.`,
                }
              : (await canEncode(format))
                ? { ok: true }
                : {
                    ok: false,
                    message: `This browser can't write ${IMAGE_FORMATS[format].label} images.`,
                  };
        } else {
          checks[target.id] = { ok: true };
        }
      } catch (error) {
        checks[target.id] = { ok: false, message: errorMessage(error) };
      }
    }),
  );
  return checks;
}
