/**
 * Comment-preserving TOML formatter. Works line by line, keeps every comment
 * and the key order, and only touches layout: spacing around `=`,
 * indentation, trailing whitespace and blank lines. Multi-line string
 * contents are never changed. The output is re-parsed and null is returned
 * when its data would differ from the input's, so Format can never change
 * what a file means. (Comment-keeping libraries such as taplo ship a
 * multi-megabyte WASM build; this stays a few KB.)
 */
import { parse as parseToml } from "smol-toml";

/** Drops leading / trailing blank lines and collapses runs of them. */
export function tidyBlankLines(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && (out.length === 0 || out.at(-1) === "")) continue;
    out.push(line);
  }
  while (out.at(-1) === "") out.pop();
  return out.length ? `${out.join("\n")}\n` : "";
}

type TomlScan = {
  /** Open multi-line string delimiter, if a line ended inside one. */
  ml: '"""' | "'''" | null;
  /** Open `[` / `{` nesting of a value spanning several lines. */
  depth: number;
};

/**
 * Advances `state` over `text`. Returns the index where a `#` comment
 * starts (outside strings), or -1.
 */
function scanToml(text: string, state: TomlScan): number {
  let i = 0;
  while (i < text.length) {
    if (state.ml) {
      const close = findMlClose(text, i, state.ml);
      if (close < 0) return -1;
      // A closing run may be up to two quotes longer (`""""` ends `"…""`).
      i = close + 3;
      while (text[i] === state.ml[0] && i < close + 5) i++;
      state.ml = null;
      continue;
    }
    const c = text[i];
    if (c === "#") return i;
    if (c === '"' || c === "'") {
      const triple = c.repeat(3);
      if (text.startsWith(triple, i)) {
        state.ml = triple as TomlScan["ml"];
        i += 3;
        continue;
      }
      i = skipString(text, i + 1, c);
      continue;
    }
    if (c === "[" || c === "{") state.depth++;
    else if (c === "]" || c === "}") state.depth = Math.max(0, state.depth - 1);
    i++;
  }
  return -1;
}

function findMlClose(text: string, from: number, delim: string) {
  for (let i = from; i < text.length; i++) {
    if (delim === '"""' && text[i] === "\\") {
      i++;
      continue;
    }
    if (text.startsWith(delim, i)) return i;
  }
  return -1;
}

/** Index just past the single-line string that opened before `from`. */
function skipString(text: string, from: number, quote: string) {
  for (let i = from; i < text.length; i++) {
    if (quote === '"' && text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return i + 1;
  }
  return text.length;
}

/** Index of the first `=` outside a quoted key, or -1. */
function findEquals(line: string) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' || c === "'") i = skipString(line, i + 1, c) - 1;
    else if (c === "=") return i;
  }
  return -1;
}

/** `[ a.b ]  # x` → `[a.b] # x`; `[[ a ]]` → `[[a]]`. */
function formatHeader(line: string) {
  const comment = scanToml(line, { ml: null, depth: 0 });
  const head = (comment < 0 ? line : line.slice(0, comment)).trim();
  const note = comment < 0 ? "" : ` ${line.slice(comment).trim()}`;
  const double = head.startsWith("[[") && head.endsWith("]]");
  const inner = head.slice(double ? 2 : 1, double ? -2 : -1).trim();
  return `${double ? `[[${inner}]]` : `[${inner}]`}${note}`;
}

/** Keeps a header's own comment block attached: the blank goes above it. */
function blankBeforeBlock(out: string[]) {
  let k = out.length;
  while (k > 0 && out[k - 1].startsWith("#")) k--;
  if (k > 0 && out[k - 1] !== "") out.splice(k, 0, "");
}

function sameJson(a: unknown, b: unknown) {
  const plain = (_: string, v: unknown) =>
    typeof v === "bigint" ? `${v}n` : v;
  return JSON.stringify(a, plain) === JSON.stringify(b, plain);
}

/**
 * Formats a TOML document: `key = value` with single spaces, no indentation
 * at the top level, two-space indentation inside multi-line arrays and
 * inline tables, one blank line before each `[table]`, no trailing
 * whitespace. Returns null when `text` does not parse.
 */
export function formatToml(text: string): string | null {
  let before: unknown;
  try {
    before = parseToml(text);
  } catch {
    return null;
  }
  const out: string[] = [];
  const state: TomlScan = { ml: null, depth: 0 };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    // Inside a multi-line string every character is content: keep it.
    if (state.ml) {
      scanToml(raw, state);
      out.push(raw);
      continue;
    }
    const t = raw.trim();
    if (state.depth > 0) {
      const level = /^[\]}]/.test(t) ? state.depth - 1 : state.depth;
      const line = raw.trimStart();
      scanToml(line, state);
      // A line that opens a multi-line string keeps its trailing content.
      const kept = state.ml ? line : line.trimEnd();
      out.push(kept ? "  ".repeat(level) + kept : "");
      continue;
    }
    if (!t) out.push("");
    else if (t.startsWith("#")) out.push(t);
    else if (t.startsWith("[")) {
      blankBeforeBlock(out);
      out.push(formatHeader(t));
    } else {
      const eq = findEquals(t);
      if (eq < 0) {
        out.push(t);
        continue;
      }
      const line = raw.trimStart();
      const value = line.slice(findEquals(line) + 1).trimStart();
      scanToml(value, state);
      const kept = state.ml ? value : value.trimEnd();
      out.push(`${t.slice(0, eq).trim()} = ${kept}`);
    }
  }
  const formatted = tidyBlankLines(out);
  try {
    return sameJson(parseToml(formatted), before) ? formatted : null;
  } catch {
    return null;
  }
}
