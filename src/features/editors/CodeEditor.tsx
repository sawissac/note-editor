import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import * as React from "react";

import { APP_THEME, type ColorTheme } from "@/lib/color-themes";
import { type MermaidSnippet, MERMAID_SNIPPETS } from "@/features/editors/mermaid-snippets";

// Bundle Monaco locally (the wrapper would otherwise fetch it from a CDN).
// JSON gets its language-service worker (syntax errors, folding, format);
// everything else only needs the core editor worker.
self.MonacoEnvironment = {
  getWorker: (_id, label) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco });

export type CodeLanguage = "plaintext" | "mermaid" | "json" | "csv";

registerMermaid();
registerCsv();

/**
 * Monaco (the VS Code editor) themed from the active palette. Uncontrolled:
 * `defaultValue` seeds it once, edits flow out through `onChange`.
 */
export default function CodeEditor({
  path,
  defaultValue,
  onChange,
  language,
  placeholder,
  autoFocus = false,
  wordWrap = false,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  /** Model URI — one model per file. */
  path: string;
  defaultValue: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  autoFocus?: boolean;
  wordWrap?: boolean;
  "aria-label": string;
  "data-testid"?: string;
}) {
  React.useMemo(() => defineTheme(THEME_NAME, APP_THEME), []);

  const onMount: OnMount = (editor) => {
    // macOS: Control+S opens autocomplete (⌘S stays Save; Control+Space is
    // usually taken by the input-source switcher). Elsewhere Ctrl+S saves,
    // so autocomplete keeps Monaco's Ctrl+Space.
    if (navigator.platform.toLowerCase().includes("mac")) {
      editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyS, () =>
        editor.trigger("keyboard", "editor.action.triggerSuggest", {}),
      );
    }
    if (!autoFocus) return;
    const model = editor.getModel();
    if (model) {
      const line = model.getLineCount();
      editor.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) });
    }
    editor.focus();
  };

  return (
    <div data-testid={testId} className="h-full bg-app-bg">
      <Editor
        path={path}
        defaultValue={defaultValue}
        language={language}
        theme={THEME_NAME}
        onMount={onMount}
        onChange={(value) => onChange(value ?? "")}
        loading={null}
        options={{
          ariaLabel: ariaLabel,
          placeholder,
          automaticLayout: true,
          fontFamily: monoFont(),
          fontSize: 13,
          lineHeight: 1.7,
          // Off, as in VS Code: Mermaid arrows (`-->`) should read as typed.
          fontLigatures: false,
          minimap: { enabled: false },
          wordWrap: wordWrap ? "on" : "off",
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          tabSize: 2,
          unicodeHighlight: { ambiguousCharacters: false },
        }}
      />
    </div>
  );
}

const THEME_NAME = "app-light";

function monoFont() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-font-mono")
    .trim();
  return value || '"JetBrains Mono", ui-monospace, monospace';
}

/** Monaco theme colors must be `#rrggbb[aa]`; palettes also use `rgba()`. */
function hex(color: string) {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return color;
  const part = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const alpha = m[4] === undefined ? "" : part(Number(m[4]) * 255);
  return `#${part(+m[1])}${part(+m[2])}${part(+m[3])}${alpha}`;
}

/** Strip `#` and alpha — token rules take a bare 6-digit hex. */
function tokenColor(color: string) {
  return hex(color).slice(1, 7);
}

function defineTheme(name: string, t: ColorTheme) {
  monaco.editor.defineTheme(name, {
    base: t.isLight ? "vs" : "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: tokenColor(t.text) },
      { token: "keyword", foreground: tokenColor(t.accent), fontStyle: "bold" },
      { token: "type", foreground: tokenColor(t.warn) },
      { token: "comment", foreground: tokenColor(t.textDim), fontStyle: "italic" },
      { token: "string", foreground: tokenColor(t.success) },
      { token: "string.key.json", foreground: tokenColor(t.accent) },
      { token: "string.value.json", foreground: tokenColor(t.success) },
      { token: "keyword.json", foreground: tokenColor(t.warn) },
      { token: "number", foreground: tokenColor(t.warn) },
      { token: "operator", foreground: tokenColor(t.error) },
      { token: "delimiter", foreground: tokenColor(t.textBright) },
      { token: "variable", foreground: tokenColor(t.textBright) },
    ],
    colors: {
      "editor.background": hex(t.bg),
      "editor.foreground": hex(t.text),
      "editorGutter.background": hex(t.bg),
      "editorLineNumber.foreground": hex(t.textDim),
      "editorLineNumber.activeForeground": hex(t.textBright),
      "editorCursor.foreground": hex(t.accent),
      "editor.selectionBackground": hex(t.borderAccent),
      "editor.inactiveSelectionBackground": hex(t.accentFaint),
      "editor.lineHighlightBackground": hex(t.bgHover),
      "editor.lineHighlightBorder": "#00000000",
      "editorIndentGuide.background1": hex(t.border),
      "editorIndentGuide.activeBackground1": hex(t.borderMid),
      "editorWhitespace.foreground": hex(t.border),
      "editorWidget.background": hex(t.bgPanel),
      "editorWidget.border": hex(t.borderMid),
      "editorSuggestWidget.background": hex(t.bgPanel),
      "editorSuggestWidget.border": hex(t.borderMid),
      "editorSuggestWidget.foreground": hex(t.text),
      "editorSuggestWidget.selectedBackground": hex(t.bgSelected),
      "editorSuggestWidget.selectedForeground": hex(t.textBright),
      "editorSuggestWidget.selectedIconForeground": hex(t.accent),
      "editorSuggestWidget.highlightForeground": hex(t.accent),
      "editorSuggestWidget.focusHighlightForeground": hex(t.accent),
      "editorHoverWidget.background": hex(t.bgPanel),
      "editorHoverWidget.border": hex(t.borderMid),
      "editorHoverWidget.foreground": hex(t.text),
      "input.background": hex(t.bg),
      "input.border": hex(t.borderMid),
      focusBorder: hex(t.borderAccent),
      "scrollbarSlider.background": hex(t.borderMid),
      "scrollbarSlider.hoverBackground": hex(t.accentDim),
      "scrollbarSlider.activeBackground": hex(t.accent),
      "editorOverviewRuler.border": "#00000000",
    },
  });
}

/** Minimal Mermaid grammar: diagram keywords, arrows, labels, comments. */
function registerMermaid() {
  if (monaco.languages.getLanguages().some((l) => l.id === "mermaid")) return;
  monaco.languages.register({ id: "mermaid", extensions: [".mermaid", ".mmd"] });
  monaco.languages.registerCompletionItemProvider("mermaid", {
    provideCompletionItems: (model, position) => ({
      suggestions: mermaidSuggestions(model, position),
    }),
  });
  monaco.languages.setLanguageConfiguration("mermaid", {
    comments: { lineComment: "%%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "|", close: "|" },
    ],
  });
  monaco.languages.setMonarchTokensProvider("mermaid", {
    diagrams: [
      ...MERMAID_SNIPPETS.filter((s) => s.kind === "diagram").map((s) => s.prefix),
      // Older / alternate spellings Mermaid still accepts.
      "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "treemap-beta",
      "ishikawa-beta", "requirement",
    ],
    keywords: [
      "subgraph", "end", "participant", "actor", "note", "Note", "loop", "alt",
      "else", "opt", "par", "and", "critical", "option", "break", "rect", "box",
      "autonumber", "activate", "deactivate", "create", "destroy", "link",
      "title", "section", "dateFormat", "axisFormat", "tickInterval", "excludes",
      "weekday", "todayMarker", "milestone", "after", "class", "namespace",
      "state", "direction", "click", "call", "href", "style", "classDef",
      "linkStyle", "over", "left", "right", "of", "as", "in", "commit", "branch",
      "checkout", "switch", "merge", "cherry-pick", "showData", "accTitle",
      "accDescr", "columns", "space", "group", "service", "junction", "set",
      "union", "anchor", "component", "evolve", "pipeline", "systemBoundary",
      "axis", "curve", "max", "min", "bar", "line", "x-axis", "y-axis",
      "quadrant-1", "quadrant-2", "quadrant-3", "quadrant-4", "requirement",
      "element", "tf", "rf", "complex", "complicated", "clear", "chaotic",
    ],
    directions: ["TD", "TB", "BT", "RL", "LR"],
    tokenizer: {
      root: [
        [/%%.*$/, "comment"],
        [/"[^"]*"/, "string"],
        [/\|[^|]*\|/, "string"],
        [/(?:<?[-.=]{2,}[->ox]*|-\.+-?>?|[-=]+>>?|--[xo]|~~~)/, "operator"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [
          /[A-Za-z][\w-]*/,
          {
            cases: {
              "@diagrams": "keyword",
              "@keywords": "keyword",
              "@directions": "type",
              "@default": "variable",
            },
          },
        ],
        [/[[\](){}]/, "delimiter"],
        [/[:;,]/, "delimiter"],
      ],
    },
  });
}

/** CSV: quoted fields, numbers and the separators that split columns. */
function registerCsv() {
  if (monaco.languages.getLanguages().some((l) => l.id === "csv")) return;
  monaco.languages.register({ id: "csv", extensions: [".csv"] });
  monaco.languages.setMonarchTokensProvider("csv", {
    tokenizer: {
      root: [
        [/"/, { token: "string", next: "@quoted" }],
        [/[,;\t]/, "operator"],
        [/-?\d+(\.\d+)?(?=\s*(?:[,;\t]|$))/, "number"],
        [/[^,;\t"]+/, ""],
      ],
      quoted: [
        [/""/, "string"],
        [/"/, { token: "string", next: "@pop" }],
        [/[^"]+/, "string"],
      ],
    },
  });
}

/* ───────────────────────── Mermaid snippets ───────────────────────── */

/** Which snippet `scope` the diagram declared in `source` uses, if any. */
function mermaidScope(source: string): string | null {
  const body = source.replace(/^\s*---[\s\S]*?\n---\s*\n/, "");
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    const word = line.split(/\s/)[0];
    if (/^(flowchart|graph|swimlane)/.test(word)) return "flowchart";
    if (word.startsWith("stateDiagram")) return "stateDiagram";
    if (word.startsWith("classDiagram")) return "classDiagram";
    if (word.startsWith("xychart")) return "xychart";
    if (word.startsWith("block")) return "block";
    if (word.startsWith("architecture")) return "architecture";
    if (word.startsWith("requirement")) return "requirementDiagram";
    if (word.startsWith("C4")) return "C4";
    return word;
  }
  return null;
}

/** Snippet body with every tab stop filled in — the hover preview. */
function previewSnippet(body: string[]) {
  const values: Record<string, string> = {};
  return body
    .join("\n")
    .replace(/\$\{(\d+):((?:\\.|[^}\\])*)\}/g, (_, n: string, v: string) => (values[n] = v))
    .replace(/\$\{(\d+)\|([^|]*)\|\}/g, (_, n: string, v: string) => (values[n] = v.split(",")[0]))
    .replace(/(?<!\\)\$(\d+)/g, (_, n: string) => values[n] ?? "")
    .replace(/\\([$}\\])/g, "$1");
}

/**
 * Every snippet, ranked for where the caret is: in an empty document the
 * diagram starters come first; inside a diagram, its own statements come
 * first, then the general ones, then the starters. Statements for other
 * diagram types are left out.
 */
function mermaidSuggestions(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionItem[] {
  // Snippet prefixes contain `-` and `%`, which Monaco's default word
  // pattern splits on — measure the typed prefix ourselves.
  const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const typed = /[\w%-]*$/.exec(before)?.[0] ?? "";
  const range = new monaco.Range(
    position.lineNumber,
    position.column - typed.length,
    position.lineNumber,
    position.column,
  );
  const scope = mermaidScope(model.getValue());
  const rank = (s: MermaidSnippet) => {
    if (s.kind === "diagram") return scope ? 3 : 0;
    if (s.scope === scope) return 1;
    return 2; // "any"
  };
  return MERMAID_SNIPPETS.filter(
    (s) => s.kind === "diagram" || s.scope === "any" || s.scope === scope,
  ).map((s, i) => ({
    label: { label: s.prefix, description: s.detail },
    kind:
      s.kind === "diagram"
        ? monaco.languages.CompletionItemKind.Module
        : monaco.languages.CompletionItemKind.Snippet,
    detail: s.kind === "diagram" ? `New ${s.detail.toLowerCase()}` : s.detail,
    documentation: { value: "```mermaid\n" + previewSnippet(s.body) + "\n```" },
    insertText: s.body.join("\n"),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: `${rank(s)}${String(i).padStart(4, "0")}`,
  }));
}
