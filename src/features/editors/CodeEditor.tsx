import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import * as React from "react";

import { CODE_SELECTION_EVENT, type CodeSelection } from "@/lib/ask-ai";
import { APP_THEME, type ColorTheme } from "@/lib/color-themes";
import {
  type MermaidSnippet,
  MERMAID_SNIPPETS,
} from "@/features/editors/mermaid-snippets";
import {
  type RegexSnippetGroup,
  REGEX_SNIPPETS,
} from "@/features/editors/regex-snippets";

// Bundle Monaco locally (the wrapper would otherwise fetch it from a CDN).
// JSON gets its language-service worker (syntax errors, folding, format);
// everything else only needs the core editor worker.
self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === "json" ? new JsonWorker() : new EditorWorker(),
};
loader.config({ monaco });

export type CodeLanguage =
  | "plaintext"
  | "mermaid"
  | "json"
  | "csv"
  | "yaml"
  | "toml"
  | "sql"
  | "dotenv"
  | "regex";

/** A problem to underline in the editor (1-based line / column). */
export type EditorMarker = {
  line: number;
  column?: number;
  message: string;
  severity?: "error" | "warning";
};

/**
 * A stretch of text to paint (character offsets, `end` exclusive).
 * `className` is applied to the text itself — it must be a global CSS class.
 */
export type EditorDecoration = {
  start: number;
  end: number;
  className: string;
};

/** Imperative handle for panes that act on the text (format, run selection). */
export type CodeEditorApi = {
  /** Replaces the whole text as one undoable edit. */
  replaceAll: (text: string) => void;
  /** Selected text, or "" when the selection is empty. */
  selectedText: () => string;
  /** Selects the offsets `start`–`end`, scrolls them into view and focuses. */
  reveal: (start: number, end: number) => void;
  focus: () => void;
};

registerMermaid();
registerCsv();
registerToml();
registerDotenv();
registerRegex();

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
  markers,
  decorations,
  singleLine = false,
  apiRef,
  onRun,
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
  /** Parse errors etc., shown as squiggles and in the hover. */
  markers?: EditorMarker[];
  /** Highlights painted over the text (e.g. search or regex matches). */
  decorations?: EditorDecoration[];
  /**
   * A one-line field instead of a document: no gutter or scrollbars, Enter
   * does not break the line (it still accepts a suggestion) and pasted line
   * breaks are dropped. Size the parent — the editor fills it.
   */
  singleLine?: boolean;
  apiRef?: React.RefObject<CodeEditorApi | null>;
  /** Bound to ⌘/Ctrl+Enter. */
  onRun?: () => void;
}) {
  React.useMemo(() => defineTheme(THEME_NAME, APP_THEME), []);
  const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const onRunRef = React.useRef(onRun);
  onRunRef.current = onRun;
  const markersRef = React.useRef(markers);
  markersRef.current = markers;
  const decorationsRef = React.useRef(decorations);
  decorationsRef.current = decorations;
  const paintedRef =
    React.useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  React.useEffect(() => {
    applyMarkers(editorRef.current, markers);
  }, [markers]);

  React.useEffect(() => {
    applyDecorations(editorRef.current, paintedRef.current, decorations);
  }, [decorations]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    applyMarkers(editor, markersRef.current);
    paintedRef.current = editor.createDecorationsCollection();
    applyDecorations(editor, paintedRef.current, decorationsRef.current);
    if (apiRef) {
      apiRef.current = {
        replaceAll: (text) => {
          const model = editor.getModel();
          if (!model || model.getValue() === text) return;
          editor.pushUndoStop();
          editor.executeEdits("app", [
            { range: model.getFullModelRange(), text },
          ]);
          editor.pushUndoStop();
        },
        selectedText: () => {
          const model = editor.getModel();
          const selection = editor.getSelection();
          return model && selection ? model.getValueInRange(selection) : "";
        },
        reveal: (start, end) => {
          const model = editor.getModel();
          if (!model) return;
          const range = monaco.Range.fromPositions(
            model.getPositionAt(start),
            model.getPositionAt(end),
          );
          editor.setSelection(range);
          editor.revealRangeInCenterIfOutsideViewport(range);
          editor.focus();
        },
        focus: () => editor.focus(),
      };
    }
    // "Ask AI" on a selection: report it (text, line range, screen box) as a
    // bubbling DOM event; EditorArea shows the Ask AI button for it.
    const reportSelection = (ask = false) => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      const node = editor.getDomNode();
      if (!node) return;
      const text =
        model && sel && !sel.isEmpty() ? model.getValueInRange(sel) : "";
      if (!text.trim()) {
        node.dispatchEvent(
          new CustomEvent(CODE_SELECTION_EVENT, {
            bubbles: true,
            detail: null,
          }),
        );
        return;
      }
      // A selection ending at column 1 really ends on the line above.
      const lastLine =
        sel!.endColumn === 1 && sel!.endLineNumber > sel!.startLineNumber
          ? sel!.endLineNumber - 1
          : sel!.endLineNumber;
      // Anchor the button just past the end of the last selected line.
      const anchor = editor.getScrolledVisiblePosition({
        lineNumber: lastLine,
        column: model!.getLineMaxColumn(lastLine),
      });
      const box = node.getBoundingClientRect();
      const detail: CodeSelection = {
        text,
        where:
          sel!.startLineNumber === lastLine
            ? `line ${lastLine}`
            : `lines ${sel!.startLineNumber}–${lastLine}`,
        rect: new DOMRect(
          box.left + (anchor?.left ?? 0),
          box.top + (anchor?.top ?? 0),
          0,
          anchor?.height ?? 18,
        ),
        ask,
        replace: (next) => {
          editor.pushUndoStop();
          // Whole-line selections end in a line break; keep it so the
          // next line doesn't join the replacement.
          const body =
            text.endsWith("\n") && !next.endsWith("\n") ? `${next}\n` : next;
          editor.executeEdits("ai", [{ range: sel!, text: body }]);
          editor.pushUndoStop();
          editor.focus();
        },
      };
      node.dispatchEvent(
        new CustomEvent(CODE_SELECTION_EVENT, { bubbles: true, detail }),
      );
    };
    let selectionTimer: ReturnType<typeof setTimeout> | undefined;
    editor.onDidChangeCursorSelection(() => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => reportSelection(), 120);
    });
    editor.onDidScrollChange(() => reportSelection());
    editor.onDidBlurEditorWidget(() => clearTimeout(selectionTimer));
    editor.addAction({
      id: "app.askAi",
      label: "Ask AI about selection",
      precondition: "editorHasSelection",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 0,
      run: () => reportSelection(true),
    });
    // Actions, not `addCommand`: a command's keybinding is global to every
    // Monaco editor on the page (the last one mounted wins), an action's only
    // fires in the editor it was added to — panes can host two editors.
    editor.addAction({
      id: "app.run",
      label: "Run",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRunRef.current?.(),
    });
    // macOS: Control+S opens autocomplete (⌘S stays Save; Control+Space is
    // usually taken by the input-source switcher). Elsewhere Ctrl+S saves,
    // so autocomplete keeps Monaco's Ctrl+Space.
    if (navigator.platform.toLowerCase().includes("mac")) {
      editor.addAction({
        id: "app.suggest",
        label: "Show suggestions",
        keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyS],
        run: () =>
          editor.trigger("keyboard", "editor.action.triggerSuggest", {}),
      });
    }
    if (singleLine) {
      // Enter keeps its job of accepting a suggestion, and does nothing else.
      editor.addAction({
        id: "app.noLineBreak",
        label: "Stay on one line",
        keybindings: [monaco.KeyCode.Enter],
        keybindingContext: "!suggestWidgetVisible",
        run: () => {},
      });
      // The find widget does not fit a one-line field.
      editor.addAction({
        id: "app.noFind",
        label: "Find is off in a one-line field",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
        run: () => {},
      });
    }
    if (!autoFocus) return;
    const model = editor.getModel();
    if (model) {
      const line = model.getLineCount();
      editor.setPosition({
        lineNumber: line,
        column: model.getLineMaxColumn(line),
      });
    }
    editor.focus();
  };

  return (
    <div data-testid={testId} className="bg-app-bg h-full">
      <Editor
        path={path}
        defaultValue={defaultValue}
        language={language}
        theme={THEME_NAME}
        onMount={onMount}
        onChange={(value) => {
          const next = value ?? "";
          if (singleLine && /[\r\n]/.test(next)) {
            // Pasted line breaks: drop them (the edit re-enters onChange).
            const flat = next.replace(/\s*[\r\n]+\s*/g, "");
            queueMicrotask(() => {
              const editor = editorRef.current;
              const model = editor?.getModel();
              if (!editor || !model) return;
              editor.executeEdits("app", [
                { range: model.getFullModelRange(), text: flat },
              ]);
            });
            return;
          }
          onChange(next);
        }}
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
          ...(singleLine ? SINGLE_LINE_OPTIONS : null),
        }}
      />
    </div>
  );
}

const THEME_NAME = "app-light";

/**
 * Monaco as a text field. Sized for a 32px-tall parent (one 22px line plus
 * 5px above and below). Suggestions open on trigger characters and on demand
 * only, and render outside the editor box, which is too small to hold them.
 */
const SINGLE_LINE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions =
  {
    wordWrap: "off",
    padding: { top: 5, bottom: 5 },
    lineNumbers: "off",
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    renderLineHighlight: "none",
    guides: { indentation: false },
    stickyScroll: { enabled: false },
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    scrollBeyondLastColumn: 2,
    scrollbar: {
      vertical: "hidden",
      horizontal: "hidden",
      useShadows: false,
      alwaysConsumeMouseWheel: false,
    },
    contextmenu: false,
    links: false,
    occurrencesHighlight: "off",
    selectionHighlight: false,
    matchBrackets: "always",
    autoClosingBrackets: "never",
    autoClosingQuotes: "never",
    autoSurround: "never",
    quickSuggestions: false,
    wordBasedSuggestions: "off",
    fixedOverflowWidgets: true,
  };

function monoFont() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-font-mono")
    .trim();
  return value || '"JetBrains Mono", ui-monospace, monospace';
}

function applyMarkers(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  markers: EditorMarker[] | undefined,
) {
  const model = editor?.getModel();
  if (!model) return;
  const lines = model.getLineCount();
  monaco.editor.setModelMarkers(
    model,
    "app",
    (markers ?? []).map((m) => {
      const line = Math.min(Math.max(1, m.line), lines);
      return {
        startLineNumber: line,
        startColumn: m.column ?? 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
        message: m.message,
        severity:
          m.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Error,
      };
    }),
  );
}

function applyDecorations(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  collection: monaco.editor.IEditorDecorationsCollection | null,
  decorations: EditorDecoration[] | undefined,
) {
  const model = editor?.getModel();
  if (!model || !collection) return;
  collection.set(
    (decorations ?? []).map((d) => ({
      range: monaco.Range.fromPositions(
        model.getPositionAt(d.start),
        model.getPositionAt(d.end),
      ),
      options: {
        inlineClassName: d.className,
        // Typing at an edge of a highlight does not stretch it.
        stickiness:
          monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })),
  );
}

/** Monaco theme colors must be `#rrggbb[aa]`; palettes also use `rgba()`. */
function hex(color: string) {
  const m = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/,
  );
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
      {
        token: "comment",
        foreground: tokenColor(t.textDim),
        fontStyle: "italic",
      },
      { token: "string", foreground: tokenColor(t.success) },
      { token: "string.key.json", foreground: tokenColor(t.accent) },
      { token: "string.value.json", foreground: tokenColor(t.success) },
      { token: "keyword.json", foreground: tokenColor(t.warn) },
      { token: "number", foreground: tokenColor(t.warn) },
      { token: "operator", foreground: tokenColor(t.error) },
      { token: "delimiter", foreground: tokenColor(t.textBright) },
      { token: "variable", foreground: tokenColor(t.textBright) },
      { token: "predefined", foreground: tokenColor(t.warn) },
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
  monaco.languages.register({
    id: "mermaid",
    extensions: [".mermaid", ".mmd"],
  });
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
      ...MERMAID_SNIPPETS.filter((s) => s.kind === "diagram").map(
        (s) => s.prefix,
      ),
      // Older / alternate spellings Mermaid still accepts.
      "sankey-beta",
      "xychart-beta",
      "block-beta",
      "packet-beta",
      "treemap-beta",
      "ishikawa-beta",
      "requirement",
    ],
    keywords: [
      "subgraph",
      "end",
      "participant",
      "actor",
      "note",
      "Note",
      "loop",
      "alt",
      "else",
      "opt",
      "par",
      "and",
      "critical",
      "option",
      "break",
      "rect",
      "box",
      "autonumber",
      "activate",
      "deactivate",
      "create",
      "destroy",
      "link",
      "title",
      "section",
      "dateFormat",
      "axisFormat",
      "tickInterval",
      "excludes",
      "weekday",
      "todayMarker",
      "milestone",
      "after",
      "class",
      "namespace",
      "state",
      "direction",
      "click",
      "call",
      "href",
      "style",
      "classDef",
      "linkStyle",
      "over",
      "left",
      "right",
      "of",
      "as",
      "in",
      "commit",
      "branch",
      "checkout",
      "switch",
      "merge",
      "cherry-pick",
      "showData",
      "accTitle",
      "accDescr",
      "columns",
      "space",
      "group",
      "service",
      "junction",
      "set",
      "union",
      "anchor",
      "component",
      "evolve",
      "pipeline",
      "systemBoundary",
      "axis",
      "curve",
      "max",
      "min",
      "bar",
      "line",
      "x-axis",
      "y-axis",
      "quadrant-1",
      "quadrant-2",
      "quadrant-3",
      "quadrant-4",
      "requirement",
      "element",
      "tf",
      "rf",
      "complex",
      "complicated",
      "clear",
      "chaotic",
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

/** TOML: tables, keys, strings (basic, literal, multi-line), dates, numbers. */
function registerToml() {
  if (monaco.languages.getLanguages().some((l) => l.id === "toml")) return;
  monaco.languages.register({ id: "toml", extensions: [".toml"] });
  monaco.languages.setLanguageConfiguration("toml", {
    comments: { lineComment: "#" },
    brackets: [
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider("toml", {
    tokenizer: {
      root: [
        [/^\s*\[\[[^\]]*\]\]/, "keyword"],
        [/^\s*\[[^\]]*\]/, "keyword"],
        [/#.*$/, "comment"],
        [/^\s*[\w.\-"' ]+?(?=\s*=)/, "type"],
        [/"""/, { token: "string", next: "@basicMulti" }],
        [/'''/, { token: "string", next: "@literalMulti" }],
        [/"([^"\\]|\\.)*"/, "string"],
        [/'[^']*'/, "string"],
        [/\b(true|false)\b/, "keyword"],
        [
          /\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?/,
          "number",
        ],
        [/\d{2}:\d{2}:\d{2}(\.\d+)?/, "number"],
        [
          /[+-]?(0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+|inf|nan|\d[\d_]*(\.[\d_]+)?([eE][+-]?\d+)?)/,
          "number",
        ],
        [/[=,{}[\]]/, "delimiter"],
      ],
      basicMulti: [
        [/"""/, { token: "string", next: "@pop" }],
        [/[^"]+/, "string"],
        [/"/, "string"],
      ],
      literalMulti: [
        [/'''/, { token: "string", next: "@pop" }],
        [/[^']+/, "string"],
        [/'/, "string"],
      ],
    },
  });
}

/** dotenv: `KEY=value`, `export`, quotes, `${VAR}` references, comments. */
function registerDotenv() {
  if (monaco.languages.getLanguages().some((l) => l.id === "dotenv")) return;
  monaco.languages.register({ id: "dotenv" });
  monaco.languages.setLanguageConfiguration("dotenv", {
    comments: { lineComment: "#" },
    autoClosingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider("dotenv", {
    tokenizer: {
      root: [
        [/^\s*#.*$/, "comment"],
        [/^\s*export\b/, "keyword"],
        [/[A-Za-z_][\w.]*(?=\s*=)/, "type"],
        [/=/, "delimiter"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/'[^']*'/, "string"],
        [/\s#.*$/, "comment"],
        [/\$\{[^}]*\}|\$[A-Za-z_]\w*/, "variable"],
        [/[^\s#$"'=]+/, "string"],
      ],
    },
  });
}

/**
 * JavaScript regular expressions (the pattern only, no `/…/` delimiters):
 * escapes, classes, groups, quantifiers, anchors — and autocomplete for all
 * of them.
 */
function registerRegex() {
  if (monaco.languages.getLanguages().some((l) => l.id === "regex")) return;
  monaco.languages.register({ id: "regex", extensions: [".regex"] });
  monaco.languages.setLanguageConfiguration("regex", {
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
  });
  monaco.languages.registerCompletionItemProvider("regex", {
    // The characters that start something with a closed set of spellings.
    triggerCharacters: ["\\", "(", "[", "{"],
    provideCompletionItems: (model, position) => ({
      suggestions: regexSuggestions(model, position),
    }),
  });
  monaco.languages.setMonarchTokensProvider("regex", {
    tokenizer: {
      root: [
        [/\\[dDwWsS]/, "keyword"],
        [/\\[bB]/, "operator"],
        [/\\[pP]\{[^}]*\}/, "keyword"],
        [/\\k<[^>]*>|\\[1-9]\d*/, "type"],
        [
          /\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|.)/,
          "string",
        ],
        [/\(\?(?:<[=!]|[:=!]|<[A-Za-z_$][\w$]*>|[ims-]+:)/, "delimiter"],
        [/[()]/, "delimiter"],
        [/\[\^?/, { token: "type", next: "@class" }],
        [/(?:[*+?]|\{\d+(?:,\d*)?\})\??/, "number"],
        [/[\^$|]/, "operator"],
        [/\./, "keyword"],
      ],
      class: [
        [/\\[dDwWsS]/, "keyword"],
        [/\\./, "string"],
        [/\]/, { token: "type", next: "@pop" }],
        [/[^\\\]]+/, "type"],
      ],
    },
  });
}

const REGEX_GROUP_ORDER: RegexSnippetGroup[] = [
  "escape",
  "class",
  "group",
  "quantifier",
  "anchor",
  "pattern",
];

function regexKind(group: RegexSnippetGroup) {
  const kinds = monaco.languages.CompletionItemKind;
  switch (group) {
    case "escape":
      return kinds.Keyword;
    case "class":
      return kinds.Enum;
    case "group":
      return kinds.Struct;
    case "quantifier":
      return kinds.Operator;
    case "anchor":
      return kinds.Constant;
    case "pattern":
      return kinds.Snippet;
  }
}

/** True when the character at `index` is itself escaped by a backslash. */
function isEscaped(text: string, index: number) {
  let slashes = 0;
  while (index - 1 - slashes >= 0 && text[index - 1 - slashes] === "\\") {
    slashes++;
  }
  return slashes % 2 === 1;
}

/**
 * What can come next at the caret. Right after `\`, `(`, `[` or `{` only the
 * spellings that start that way are offered, and they replace what was typed
 * from that character on; anywhere else (on demand) everything is listed,
 * ready-made patterns included, filtered by the word being typed.
 */
function regexSuggestions(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionItem[] {
  const before = model
    .getLineContent(position.lineNumber)
    .slice(0, position.column - 1);
  const openers: Array<[RegexSnippetGroup, RegExp]> = [
    ["escape", /\\[A-Za-z]?$/],
    ["group", /\((?:\?[<:=!]?[=!]?)?$/],
    ["class", /\[\^?$/],
    ["quantifier", /\{\d*,?\d*$/],
  ];
  let scope: RegexSnippetGroup | null = null;
  let start = before.length - (/[A-Za-z]*$/.exec(before)?.[0].length ?? 0);
  for (const [group, opener] of openers) {
    const found = opener.exec(before);
    if (found && !isEscaped(before, found.index)) {
      scope = group;
      start = found.index;
      break;
    }
  }
  const range = new monaco.Range(
    position.lineNumber,
    start + 1,
    position.lineNumber,
    position.column,
  );
  return REGEX_SNIPPETS.filter(
    (s) =>
      !scope ||
      (s.group === scope &&
        // After `{` only the brace forms fit, not `*` or `+`.
        (scope !== "quantifier" || s.label.startsWith("{"))),
  ).map((s, i) => ({
    label: { label: s.label, description: s.detail },
    kind: regexKind(s.group),
    detail: s.detail,
    // In the open list a description word finds an item too ("digit").
    filterText: scope ? s.label : `${s.label} ${s.detail}`,
    insertText: s.insert,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: `${REGEX_GROUP_ORDER.indexOf(s.group)}${String(i).padStart(4, "0")}`,
  }));
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
    .replace(
      /\$\{(\d+):((?:\\.|[^}\\])*)\}/g,
      (_, n: string, v: string) => (values[n] = v),
    )
    .replace(
      /\$\{(\d+)\|([^|]*)\|\}/g,
      (_, n: string, v: string) => (values[n] = v.split(",")[0]),
    )
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
  const before = model
    .getLineContent(position.lineNumber)
    .slice(0, position.column - 1);
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
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: `${rank(s)}${String(i).padStart(4, "0")}`,
  }));
}
