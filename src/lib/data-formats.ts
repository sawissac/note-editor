/**
 * Parse / format helpers for the developer file types: JSON, YAML, TOML and
 * dotenv. Every parse reports the first problem with a 1-based line and
 * column so the editor can underline it.
 */
import { parseAllDocuments } from "yaml";
import { parse as parseToml, TomlError } from "smol-toml";

import { formatToml, tidyBlankLines } from "@/lib/toml-format";

export type DataKind = "json" | "yaml" | "toml";

export type ParseProblem = { message: string; line: number; column: number };

export type ParseResult =
  { ok: true; value: unknown } | { ok: false; problem: ParseProblem };

/** 1-based line / column of a character offset. */
function position(text: string, offset: number) {
  const before = text.slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

export function parseData(kind: DataKind, text: string): ParseResult {
  if (!text.trim())
    return { ok: true, value: kind === "json" ? undefined : {} };
  try {
    if (kind === "json") return { ok: true, value: JSON.parse(text) };
    if (kind === "toml") return { ok: true, value: parseToml(text) };
    const docs = parseAllDocuments(text);
    if (!Array.isArray(docs)) {
      // An empty stream comes back as an EmptyStream object.
      return { ok: true, value: {} };
    }
    for (const doc of docs) {
      const error = doc.errors[0];
      if (error) {
        const at = error.linePos?.[0];
        return {
          ok: false,
          problem: {
            message: error.message
              .split("\n")[0]
              .replace(/\s*at line \d+, column \d+:?\s*$/, ""),
            line: at?.line ?? 1,
            column: at?.col ?? 1,
          },
        };
      }
    }
    const values = docs.map((d) => d.toJS());
    return { ok: true, value: values.length === 1 ? values[0] : values };
  } catch (error) {
    if (error instanceof TomlError) {
      return {
        ok: false,
        problem: {
          message: error.message.split("\n")[0],
          line: error.line,
          column: error.column,
        },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (kind === "json") {
      // Engines differ (and newer V8 omits the position) — find it ourselves.
      const offset = jsonErrorOffset(text);
      const at = position(text, Math.max(0, offset));
      const found =
        offset >= text.length
          ? "Unexpected end of JSON"
          : offset >= 0
            ? `Unexpected ${JSON.stringify(text[offset])}`
            : message;
      return { ok: false, problem: { message: found, ...at } };
    }
    return { ok: false, problem: { message, line: 1, column: 1 } };
  }
}

/**
 * Offset of the first character that makes `s` invalid JSON, `s.length` when
 * it ends too early, or -1 when it is valid. A small recursive-descent scan —
 * only run after `JSON.parse` has already failed.
 */
function jsonErrorOffset(s: string): number {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const ws = () => {
    while (i < s.length && " \t\n\r".includes(s[i])) i++;
  };
  const string = () => {
    i++;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\\") i += 2;
      else if (ch === '"') {
        i++;
        return;
      } else if (ch === "\n") fail();
      else i++;
    }
    fail();
  };
  const value = (): void => {
    ws();
    const c = s[i];
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i++;
      ws();
      if (s[i] === close) {
        i++;
        return;
      }
      for (;;) {
        if (c === "{") {
          ws();
          if (s[i] !== '"') fail();
          string();
          ws();
          if (s[i] !== ":") fail();
          i++;
        }
        value();
        ws();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === close) {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '"') return string();
    const m =
      /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
        s.slice(i, i + 512),
      );
    if (!m) fail();
    i += m![0].length;
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
    return -1;
  } catch (at) {
    return typeof at === "number" ? at : 0;
  }
}

/**
 * Reformats JSON (2-space indent) or YAML (normalised, comments kept).
 * Returns null when the text does not parse. TOML is not reformatted: the
 * parser drops comments, which would lose part of the file.
 */
export function formatData(kind: DataKind, text: string): string | null {
  if (kind === "json") {
    try {
      return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    } catch {
      return null;
    }
  }
  if (kind === "yaml") {
    const docs = parseAllDocuments(text);
    if (!Array.isArray(docs) || docs.some((d) => d.errors.length)) return null;
    return docs.map((d) => d.toString({ lineWidth: 0 })).join("---\n");
  }
  return formatToml(text);
}

/* ───────────────────────────── dotenv ───────────────────────────── */

export type EnvEntry = { key: string; value: string; line: number };
export type EnvProblem = {
  line: number;
  message: string;
  severity: "error" | "warning";
};

const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

/**
 * Parses a dotenv file the way the common loaders (dotenv, Vite, Next) do:
 * `KEY=value`, optional `export`, `#` comments, single quotes literal, double
 * quotes with `\n` escapes and multi-line values, inline ` #` comments after
 * unquoted values.
 */
export function parseEnv(text: string) {
  const entries: EnvEntry[] = [];
  const problems: EnvProblem[] = [];
  const seen = new Map<string, number>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const m = ENV_LINE.exec(raw);
    if (!m) {
      problems.push({
        line: lineNo,
        message: "Not a KEY=value line.",
        severity: "error",
      });
      continue;
    }
    const key = m[1];
    let rest = m[2];
    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      // Find the closing quote, possibly on a later line.
      let body = rest.slice(1);
      let end = findClose(body, quote);
      let j = i;
      while (end < 0 && j + 1 < lines.length) {
        j++;
        body += `\n${lines[j]}`;
        end = findClose(body, quote);
      }
      if (end < 0) {
        problems.push({
          line: lineNo,
          message: `Unterminated ${quote} quote.`,
          severity: "error",
        });
        value = body;
      } else {
        value = body.slice(0, end);
        i = j;
      }
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    } else {
      rest = rest.replace(/\s+#.*$/, "");
      value = rest.trim();
    }
    const first = seen.get(key);
    if (first !== undefined) {
      problems.push({
        line: lineNo,
        message: `${key} is already set on line ${first}; this value wins.`,
        severity: "warning",
      });
    } else {
      seen.set(key, lineNo);
    }
    entries.push({ key, value, line: lineNo });
  }
  return { entries, problems };
}

function findClose(body: string, quote: string) {
  for (let k = 0; k < body.length; k++) {
    if (body[k] === "\\" && quote === '"') {
      k++;
      continue;
    }
    if (body[k] === quote) return k;
  }
  return -1;
}

/** The file with every value replaced by bullets — safe to print or share. */
export function maskEnv(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const m = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*)(.*)$/.exec(
        line,
      );
      if (!m || line.trim().startsWith("#")) return line;
      return m[2].trim() ? `${m[1]}••••••••` : line;
    })
    .join("\n");
}

/** `KEY=value` with its parts: `export ` prefix, key, raw value. */
const ENV_ASSIGN = /^\s*(export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

function envSignature(text: string) {
  return JSON.stringify(parseEnv(text).entries.map((e) => [e.key, e.value]));
}

/**
 * Formats a dotenv file: `KEY=value` with no spaces around `=`, comments
 * flush left, single blank lines between groups, no trailing whitespace.
 * Multi-line quoted values are kept as written. Returns null when the file
 * has syntax errors (duplicate-key warnings are fine).
 */
export function formatEnv(text: string): string | null {
  if (parseEnv(text).problems.some((p) => p.severity === "error")) return null;
  const out: string[] = [];
  let open: string | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (open) {
      // Continuation of a multi-line quoted value: content, keep as is.
      out.push(raw);
      if (findClose(raw, open) >= 0) open = null;
      continue;
    }
    const t = raw.trim();
    const m = ENV_ASSIGN.exec(raw);
    if (!t || t.startsWith("#") || !m) {
      out.push(t);
      continue;
    }
    const [, exported, key, rest] = m;
    const quote = rest[0];
    let value = rest.trimEnd();
    if (quote === '"' || quote === "'" || quote === "`") {
      if (findClose(rest.slice(1), quote) < 0) {
        open = quote;
        value = rest; // trailing spaces are part of the value
      }
    }
    out.push(`${exported ? "export " : ""}${key}=${value}`);
  }
  const formatted = tidyBlankLines(out);
  return envSignature(formatted) === envSignature(text) ? formatted : null;
}
