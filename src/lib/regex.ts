import { type AST, RegExpParser } from "@eslint-community/regexpp";

/**
 * `.regex` files: one JavaScript regular expression and the text it is tried
 * on. Stored as plain text — the first line is the expression as a literal
 * (`/pattern/flags`), everything after it is the test text:
 *
 * ```
 * /\d{4}-\d{2}/g
 * Released 2026-11, patched 2026-12.
 * ```
 *
 * Matching uses the browser's own `RegExp` engine (what the pattern will run
 * on in real code); parsing for the explanation uses regexpp, the parser
 * ESLint uses, so new syntax (`v` flag, modifiers) is read the same way the
 * spec does.
 */

/* ───────────────────────────── File format ───────────────────────────── */

export type RegexDoc = { pattern: string; flags: string; text: string };

const HEADER = /^\/(.*)\/([a-z]*)$/;

/** A file without a `/pattern/flags` first line is all test text. */
export function parseRegexFile(source: string): RegexDoc {
  const normalized = source.replace(/\r\n?/g, "\n");
  const nl = normalized.indexOf("\n");
  const first = nl < 0 ? normalized : normalized.slice(0, nl);
  const header = HEADER.exec(first);
  if (!header) return { pattern: "", flags: "g", text: normalized };
  return {
    pattern: header[1],
    flags: header[2],
    text: nl < 0 ? "" : normalized.slice(nl + 1),
  };
}

export function serializeRegexFile({ pattern, flags, text }: RegexDoc) {
  return `/${pattern}/${flags}\n${text}`;
}

/* ───────────────────────────── Flags ───────────────────────────── */

export const REGEX_FLAGS = [
  { flag: "g", name: "global", detail: "Find every match, not just the first" },
  { flag: "i", name: "ignore case", detail: "A matches a" },
  {
    flag: "m",
    name: "multiline",
    detail: "^ and $ match at every line, not only the whole text",
  },
  { flag: "s", name: "dot all", detail: ". also matches line breaks" },
  {
    flag: "u",
    name: "unicode",
    detail: "Full Unicode: \\p{…}, \\u{…}, astral characters as one",
  },
  {
    flag: "y",
    name: "sticky",
    detail: "Match only at the exact position, no searching ahead",
  },
] as const;

export function toggleFlag(flags: string, flag: string) {
  return flags.includes(flag) ? flags.replaceAll(flag, "") : flags + flag;
}

/* ───────────────────────────── Compile ───────────────────────────── */

export type Compiled =
  { ok: true; regex: RegExp } | { ok: false; error: string; column?: number };

const parser = new RegExpParser({ ecmaVersion: 2025 });

function parsePattern(pattern: string, flags: string) {
  return parser.parsePattern(pattern, 0, pattern.length, {
    unicode: flags.includes("u"),
    unicodeSets: flags.includes("v"),
  });
}

/**
 * Compiles with the native engine. On failure the message is the engine's
 * own, minus its `Invalid regular expression: /…/:` preamble, and `column`
 * (1-based) is where the parser gave up, when it can tell.
 */
export function compileRegex(pattern: string, flags: string): Compiled {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const preamble = `Invalid regular expression: /${pattern}/${flags}: `;
    const message = raw.startsWith(preamble) ? raw.slice(preamble.length) : raw;
    let column: number | undefined;
    try {
      parsePattern(pattern, flags);
    } catch (parseError) {
      const index = (parseError as { index?: unknown }).index;
      if (typeof index === "number") {
        column = Math.min(index, Math.max(0, pattern.length - 1)) + 1;
      }
    }
    return { ok: false, error: message, column };
  }
}

/* ───────────────────────────── Matching ───────────────────────────── */

/** Matches kept with their position and groups (highlighted and listed). */
export const MAX_MATCHES = 2000;
/** Counting stops here — the total is then shown as "100,000+". */
const COUNT_CAP = 100_000;
const CLIP = 200;

export type RegexGroup = { name: string; value: string | null };

export type RegexMatch = {
  /** Offsets into the test text; `end` is exclusive. */
  start: number;
  end: number;
  /** 1-based position of `start`. */
  line: number;
  column: number;
  /** The matched text, clipped for display. */
  text: string;
  groups: RegexGroup[];
};

export type RegexRun =
  | {
      ok: true;
      matches: RegexMatch[];
      /** All matches found, including those past {@link MAX_MATCHES}. */
      total: number;
      /** True when counting stopped at the cap. */
      capped: boolean;
      /** With no match: how many there would be with the `i` flag. */
      ignoreCaseTotal?: number;
      /** A shorter pattern that matched this text identically. */
      simpler?: string;
    }
  | { ok: false; error: string };

function clip(value: string) {
  return value.length > CLIP ? `${value.slice(0, CLIP)}…` : value;
}

/** Names of the capture groups, in the order their `(` appears. */
function captureNames(pattern: string, flags: string) {
  const names: Array<string | null> = [];
  try {
    const visit = (alternatives: AST.Alternative[]) => {
      for (const alternative of alternatives) {
        for (const element of alternative.elements) {
          const node =
            element.type === "Quantifier" ? element.element : element;
          if (node.type === "CapturingGroup") names.push(node.name);
          if ("alternatives" in node) visit(node.alternatives);
        }
      }
    };
    visit(parsePattern(pattern, flags).alternatives);
  } catch {
    // Unparseable here but accepted by the engine: fall back to numbers.
  }
  return names;
}

/**
 * Every match of `pattern` in `text`. Synchronous and unbounded in time — a
 * pattern that backtracks badly will hang, so the pane runs this in a worker
 * it can terminate.
 */
export function runRegex(
  pattern: string,
  flags: string,
  text: string,
): RegexRun {
  const compiled = compileRegex(pattern, flags);
  if (!compiled.ok) return { ok: false, error: compiled.error };
  const { regex } = compiled;
  const names = captureNames(pattern, flags);
  const matches: RegexMatch[] = [];
  let total = 0;
  let capped = false;

  // Matches arrive in text order, so line / column are tracked incrementally.
  let line = 1;
  let lineStart = 0;
  let scanned = 0;
  const locate = (offset: number) => {
    for (; scanned < offset; scanned++) {
      if (text.charCodeAt(scanned) === 10) {
        line++;
        lineStart = scanned + 1;
      }
    }
    return { line, column: offset - lineStart + 1 };
  };

  regex.lastIndex = 0;
  for (;;) {
    const found = regex.exec(text);
    if (!found) break;
    total++;
    if (matches.length < MAX_MATCHES) {
      matches.push({
        start: found.index,
        end: found.index + found[0].length,
        ...locate(found.index),
        text: clip(found[0]),
        groups: found.slice(1).map((value, i) => ({
          name: names[i] ?? String(i + 1),
          value: value === undefined ? null : clip(value),
        })),
      });
    }
    if (total >= COUNT_CAP) {
      capped = true;
      break;
    }
    if (!regex.global) break;
    // An empty match does not advance on its own — step past it.
    if (found[0] === "") {
      const code = text.codePointAt(regex.lastIndex) ?? 0;
      regex.lastIndex += regex.unicode && code > 0xffff ? 2 : 1;
    }
    if (regex.lastIndex > text.length) break;
  }

  const run: RegexRun = { ok: true, matches, total, capped };
  if (total === 0 && !flags.includes("i")) {
    try {
      const loose = new RegExp(pattern, `${flags.replace("g", "")}gi`);
      let count = 0;
      let found: RegExpExecArray | null;
      while (count < 1000 && (found = loose.exec(text))) {
        count++;
        if (found[0] === "") loose.lastIndex++;
        if (loose.lastIndex > text.length) break;
      }
      if (count) run.ignoreCaseTotal = count;
    } catch {
      // `i` cannot be combined with these flags — nothing to suggest.
    }
  }
  return run;
}

/* ───────────────────────────── Explanation ───────────────────────────── */

export type RegexPartKind =
  | "literal"
  | "any"
  | "set"
  | "class"
  | "group"
  | "group-end"
  | "quantifier"
  | "anchor"
  | "reference"
  | "or";

/** One row of the explanation: a slice of the pattern and what it does. */
export type RegexPart = {
  kind: RegexPartKind;
  /** The slice of the pattern, `pattern.slice(start, end)`. */
  text: string;
  description: string;
  /** Nesting inside groups — rows indent by this. */
  depth: number;
  start: number;
  end: number;
  /** Quantifiers: no upper bound (`*`, `+`, `{n,}`). */
  unbounded?: boolean;
  /** Quantifiers: as few as possible (`*?`). */
  lazy?: boolean;
};

const NAMED_CHARS: Record<string, string> = {
  "\n": "line break",
  "\r": "carriage return",
  "\t": "tab",
  " ": "space",
};

function quote(value: string) {
  return `“${value.replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/\r/g, "␍")}”`;
}

function charName(code: number) {
  const char = String.fromCodePoint(code);
  return NAMED_CHARS[char] ?? quote(char);
}

function describeSet(node: AST.CharacterSet, dotAll: boolean) {
  switch (node.kind) {
    case "any":
      return dotAll ? "Any character" : "Any character except a line break";
    case "digit":
      return node.negate ? "Any character that is not a digit" : "A digit, 0–9";
    case "space":
      return node.negate
        ? "Any character that is not whitespace"
        : "Whitespace — space, tab or line break";
    case "word":
      return node.negate
        ? "Any character that is not a letter, digit or _"
        : "A word character — letter, digit or _";
    case "property": {
      const property = node.value ? `${node.key}=${node.value}` : node.key;
      return `A character ${node.negate ? "without" : "with"} the Unicode property ${property}`;
    }
  }
}

function classItem(node: AST.CharacterClassElement): string {
  switch (node.type) {
    case "Character":
      return charName(node.value);
    case "CharacterClassRange":
      return `${String.fromCodePoint(node.min.value)}–${String.fromCodePoint(node.max.value)}`;
    case "CharacterSet":
      if (node.kind === "digit") return node.negate ? "non-digits" : "digits";
      if (node.kind === "space") {
        return node.negate ? "non-whitespace" : "whitespace";
      }
      if (node.kind === "word") {
        return node.negate ? "non-word characters" : "word characters";
      }
      return node.raw;
    default:
      return node.raw;
  }
}

function describeClass(node: AST.CharacterClass) {
  if (!node.elements.length) {
    return node.negate
      ? "Any character at all, line breaks included"
      : "An empty class — never matches";
  }
  const items = node.elements.map(classItem);
  const shown = items.length > 12 ? [...items.slice(0, 12), "…"] : items;
  return `${node.negate ? "Any character except" : "One of"}: ${shown.join(", ")}`;
}

function describeQuantifier({ min, max, greedy }: AST.Quantifier) {
  let amount: string;
  if (min === 0 && max === 1) amount = "optional";
  else if (max === Infinity) amount = `${min} or more times`;
  else if (min === max)
    amount = `exactly ${min} ${min === 1 ? "time" : "times"}`;
  else amount = `${min} to ${max} times`;
  const lazy = greedy ? "" : " — as few as possible";
  return amount === "optional"
    ? `The previous item is optional${lazy}`
    : `The previous item, ${amount}${lazy}`;
}

/**
 * The pattern as a flat, in-order list of parts. Returns `null` when the
 * pattern does not parse (the caller shows the compile error instead).
 */
export function explainRegex(
  pattern: string,
  flags: string,
): RegexPart[] | null {
  let ast: AST.Pattern;
  try {
    ast = parsePattern(pattern, flags);
  } catch {
    return null;
  }
  const multiline = flags.includes("m");
  const dotAll = flags.includes("s");
  const parts: RegexPart[] = [];
  let captures = 0;
  // Consecutive plain characters read as one piece of text.
  let run: AST.Character[] = [];
  let runDepth = 0;

  const flush = () => {
    if (!run.length) return;
    const start = run[0].start;
    const end = run[run.length - 1].end;
    const value = String.fromCodePoint(...run.map((c) => c.value));
    parts.push({
      kind: "literal",
      text: pattern.slice(start, end),
      description:
        run.length === 1
          ? `The character ${charName(run[0].value)}`
          : `The text ${quote(value)}`,
      depth: runDepth,
      start,
      end,
    });
    run = [];
  };
  const add = (
    kind: RegexPartKind,
    start: number,
    end: number,
    description: string,
    depth: number,
    extra?: Pick<RegexPart, "unbounded" | "lazy">,
  ) => {
    flush();
    parts.push({
      kind,
      text: pattern.slice(start, end),
      description,
      depth,
      start,
      end,
      ...extra,
    });
  };

  const alternatives = (list: AST.Alternative[], depth: number) => {
    list.forEach((alternative, i) => {
      if (i > 0)
        add("or", alternative.start - 1, alternative.start, "Or", depth);
      for (const item of alternative.elements) element(item, depth);
    });
  };
  const group = (
    node: { start: number; end: number; alternatives: AST.Alternative[] },
    label: string,
    closing: string,
    depth: number,
  ) => {
    add("group", node.start, node.alternatives[0].start, label, depth);
    alternatives(node.alternatives, depth + 1);
    add("group-end", node.end - 1, node.end, closing, depth);
  };
  const element = (node: AST.Element, depth: number) => {
    switch (node.type) {
      case "Character":
        if (run.length && runDepth !== depth) flush();
        runDepth = depth;
        run.push(node);
        return;
      case "CharacterSet":
        add(
          node.kind === "any" ? "any" : "set",
          node.start,
          node.end,
          describeSet(node, dotAll),
          depth,
        );
        return;
      case "CharacterClass":
        add("class", node.start, node.end, describeClass(node), depth);
        return;
      case "ExpressionCharacterClass":
        add(
          "class",
          node.start,
          node.end,
          "A character set built from set operations",
          depth,
        );
        return;
      case "Backreference":
        add(
          "reference",
          node.start,
          node.end,
          `The same text that group ${
            typeof node.ref === "number" ? node.ref : quote(node.ref)
          } matched`,
          depth,
        );
        return;
      case "Assertion":
        if (node.kind === "lookahead" || node.kind === "lookbehind") {
          const side = node.kind === "lookahead" ? "followed" : "preceded";
          group(
            node,
            `${node.negate ? `Not ${side}` : capitalize(side)} by… — checked, not part of the match`,
            `End of ${node.kind}`,
            depth,
          );
        } else if (node.kind === "word") {
          add(
            "anchor",
            node.start,
            node.end,
            node.negate
              ? "Not at a word boundary"
              : "A word boundary — where a word starts or ends",
            depth,
          );
        } else {
          add(
            "anchor",
            node.start,
            node.end,
            `${node.kind === "start" ? "Start" : "End"} of ${multiline ? "a line" : "the text"}`,
            depth,
          );
        }
        return;
      case "Group":
        group(
          node,
          node.modifiers
            ? `Group with flags ${node.modifiers.raw}`
            : "Group — not captured",
          "End of group",
          depth,
        );
        return;
      case "CapturingGroup": {
        const number = ++captures;
        group(
          node,
          node.name
            ? `Capture group ${number}, named ${quote(node.name)}`
            : `Capture group ${number}`,
          `End of capture group ${number}`,
          depth,
        );
        return;
      }
      case "Quantifier":
        // The quantified item stands alone: `abc+` repeats only the `c`.
        flush();
        element(node.element, depth);
        add(
          "quantifier",
          node.element.end,
          node.end,
          describeQuantifier(node),
          depth,
          { unbounded: node.max === Infinity, lazy: !node.greedy },
        );
        return;
    }
  };

  alternatives(ast.alternatives, 0);
  flush();
  return parts;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ───────────────────────────── Suggestions ───────────────────────────── */

export type RegexTip = {
  id: string;
  tone: "info" | "warn" | "error";
  /** A few words naming the hint. */
  title: string;
  /** What is going on and what to do about it. */
  text: string;
  /** A pattern to show verbatim under the text. */
  code?: string;
  /** One-click fix: flags to switch on and / or a replacement pattern. */
  action?: { label: string; flags?: string; pattern?: string };
};

/** Engine error text (V8, SpiderMonkey, JavaScriptCore) → what to do. */
const ERROR_HELP: Array<
  [RegExp, string, ((pattern: string) => string)?, string?]
> = [
  [
    /unterminated group|unterminated parenthetical|missing \)/i,
    "A ( is never closed. Close it with ), or write \\( to match a real parenthesis.",
    (pattern) => `${pattern})`,
    "Add )",
  ],
  [
    /unmatched '?\)|unmatched \) |unmatched parenthes/i,
    "A ) has no opening (. Write \\) to match a real parenthesis.",
  ],
  [
    /unterminated character class|missing terminating \]/i,
    "A [ is never closed. Close it with ], or write \\[ to match a real bracket.",
    (pattern) => `${pattern}]`,
    "Add ]",
  ],
  [
    /nothing to repeat/i,
    "A quantifier (* + ? {n}) has nothing in front of it. Put something before it, or escape it with \\ to match the character itself.",
  ],
  [
    /invalid group|invalid regexp group/i,
    "Unknown group syntax after (?. Valid forms: (?:…) (?=…) (?!…) (?<=…) (?<!…) (?<name>…).",
  ],
  [
    /capture group name|invalid named reference|invalid named capture/i,
    "Group names use letters, digits, _ and $, and cannot start with a digit. \\k<name> must point at a group that exists.",
  ],
  [
    /range out of order|invalid range|out of order in character class/i,
    "A range in [ ] runs backwards. Write it low to high (a-z), or put - first or last to match a hyphen.",
  ],
  [
    /incomplete quantifier|lone quantifier|numbers out of order/i,
    "A { } quantifier is malformed. Use {n}, {n,} or {n,m} with n ≤ m — or escape the braces as \\{ \\}.",
  ],
  [
    /invalid escape|invalid unicode escape|invalid property name|invalid identity escape/i,
    "With the u or v flag only real escapes are allowed. Remove the \\ before ordinary characters, and check \\p{…} / \\u{…} spelling.",
  ],
  [
    /invalid flags/i,
    "A flag is unknown, repeated, or clashes with another — u and v cannot be used together.",
  ],
];

function splice(pattern: string, edits: Array<[number, number, string]>) {
  let out = pattern;
  for (const [start, end, text] of [...edits].sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + text + out.slice(end);
  }
  return out;
}

/** Hints for the pattern as written, most pressing first. */
export function regexTips({
  pattern,
  flags,
  text,
  error,
  parts,
  run,
  timedOut,
}: {
  pattern: string;
  flags: string;
  text: string;
  /** Compile error, if the pattern is invalid. */
  error?: string;
  parts: RegexPart[] | null;
  /** The latest finished run for exactly this pattern, flags and text. */
  run?: RegexRun;
  timedOut?: boolean;
}): RegexTip[] {
  const tips: RegexTip[] = [];
  if (!pattern) return tips;

  if (error) {
    const help = ERROR_HELP.find(([test]) => test.test(error));
    if (help) {
      const [, message, fix, label] = help;
      tips.push({
        id: "syntax",
        tone: "error",
        title: "Syntax error",
        text: message,
        action: fix && label ? { label, pattern: fix(pattern) } : undefined,
      });
    }
    return tips;
  }

  const list = parts ?? [];
  const nested = list.some(
    (part, i) =>
      part.kind === "group-end" &&
      list[i + 1]?.kind === "quantifier" &&
      list[i + 1].unbounded &&
      list[i - 1]?.kind === "quantifier" &&
      list[i - 1].unbounded,
  );
  if (timedOut) {
    tips.push({
      id: "timeout",
      tone: "error",
      title: "Stopped — took too long",
      text: "Matching was stopped — it ran too long on this text. Repeats inside repeats, or several .* in a row, make the engine retry an enormous number of combinations.",
    });
  }
  if (nested) {
    tips.push({
      id: "nested-repeat",
      tone: "warn",
      title: "Repeat inside a repeat",
      text: "A repeated group ends in a repeat of its own, like (a+)+. On text that almost matches this can take exponentially long. Repeat only one of the two.",
    });
  }

  const ok = run?.ok ? run : undefined;
  if (ok && !flags.includes("g") && !flags.includes("y") && ok.total > 0) {
    tips.push({
      id: "global",
      tone: "info",
      title: "Only the first match is found",
      text: "Without the g flag the search stops at the first match. Turn g on to find them all.",
      action: { label: "Turn on g", flags: "g" },
    });
  }
  if (ok && ok.total === 0 && ok.ignoreCaseTotal) {
    const n = ok.ignoreCaseTotal;
    tips.push({
      id: "ignore-case",
      tone: "info",
      title: "Matches if case is ignored",
      text: `No match as written, but ${n === 1000 ? "1,000+" : n} ${n === 1 ? "match" : "matches"} when letter case is ignored.`,
      action: { label: "Turn on i", flags: "i" },
    });
  }
  if (
    !flags.includes("m") &&
    text.includes("\n") &&
    list.some((p) => p.kind === "anchor" && (p.text === "^" || p.text === "$"))
  ) {
    tips.push({
      id: "multiline",
      tone: "info",
      title: "^ and $ see the whole text as one line",
      text: "^ and $ match only the very start and end of the text. Turn on m to match at the start and end of every line.",
      action: { label: "Turn on m", flags: "m" },
    });
  }

  const dots = list.filter(
    (part, i) =>
      part.kind === "any" &&
      list[i - 1]?.kind === "literal" &&
      /\w$/.test(list[i - 1].text) &&
      list[i + 1]?.kind === "literal" &&
      /^\w/.test(list[i + 1].text),
  );
  if (dots.length) {
    tips.push({
      id: "literal-dot",
      tone: "warn",
      title: "Unescaped dot",
      text: "An unescaped . matches any character, so “a.b” also matches “axb”. Write \\. for a real dot.",
      action: {
        label: dots.length === 1 ? "Escape the dot" : "Escape the dots",
        pattern: splice(
          pattern,
          dots.map((d) => [d.start, d.end, "\\."]),
        ),
      },
    });
  }

  const greedy = list.filter(
    (part, i) =>
      part.kind === "quantifier" &&
      part.unbounded &&
      !part.lazy &&
      list[i - 1]?.kind === "any" &&
      list.slice(i + 1).some((next) => next.kind !== "group-end"),
  );
  if (greedy.length) {
    tips.push({
      id: "greedy",
      tone: "info",
      title: "Greedy repeat",
      text: `${greedy[0].text === "+" ? ".+" : ".*"} is greedy: it takes as much as it can and only then backs off, so it can run past the end you meant. Add ? to stop at the first possible end.`,
      action: {
        label: "Make it lazy",
        pattern: splice(
          pattern,
          greedy.map((q) => [q.end, q.end, "?"]),
        ),
      },
    });
  }

  if (
    !flags.includes("u") &&
    !flags.includes("v") &&
    /[^\p{ASCII}]/u.test(text) &&
    list.some((p) => p.kind === "set" && /^\\[wW]$/.test(p.text))
  ) {
    tips.push({
      id: "ascii-word",
      tone: "info",
      title: "\\w misses non-English letters",
      text: "\\w only knows A–Z, a–z, 0–9 and _. This text has other letters — use \\p{L} with the u flag to match letters in any script.",
    });
  }

  if (ok?.simpler) {
    tips.push({
      id: "simplify",
      tone: "info",
      title: "Shorter way to write it",
      text: ok.total
        ? "This shorter pattern finds exactly the same matches and groups in this text:"
        : "This shorter pattern means the same:",
      code: ok.simpler,
      action: { label: "Use this pattern", pattern: ok.simpler },
    });
  }

  if (ok && ok.total === 0 && !tips.length && text) {
    tips.push({
      id: "no-match",
      tone: "info",
      title: "No match",
      text: "Nothing in the text fits. Characters with a special meaning need a \\ in front to be matched as themselves: . * + ? ( ) [ ] { } ^ $ | \\",
    });
  }
  return tips;
}
