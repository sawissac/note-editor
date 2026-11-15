import "@mdxeditor/editor/style.css";

import {
  BoldItalicUnderlineToggles,
  createRootEditorSubscription$,
  codeBlockPlugin,
  codeMirrorPlugin,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  realmPlugin,
  StrikeThroughSupSubToggles,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import { IconFileText } from "@tabler/icons-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

/** A workspace file that can be referenced with `@path`. */
export type MentionFile = { id: string; path: string };

type MentionQuery = { query: string; rect: DOMRect };

/** `@query` right before the caret (query has no spaces or `@`). */
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/;
const MAX_SUGGESTIONS = 8;

/**
 * Watches the Lexical editor inside MDXEditor for an `@query` before the
 * caret and reports it (with the caret's screen box) — or null. Callbacks
 * live in refs because MDXEditor plugins are created once.
 */
const mentionPlugin = realmPlugin<{
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  onQueryRef: React.MutableRefObject<(q: MentionQuery | null) => void>;
}>({
  init(realm, params) {
    realm.pub(createRootEditorSubscription$, (editor) => {
      params!.editorRef.current = editor;
      return editor.registerUpdateListener(({ editorState }) => {
        let query: string | null = null;
        editorState.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
          const node = sel.anchor.getNode();
          if (!$isTextNode(node)) return;
          const before = node.getTextContent().slice(0, sel.anchor.offset);
          query = before.match(MENTION_RE)?.[1] ?? null;
        });
        const dom = window.getSelection();
        const rect =
          query !== null && dom?.rangeCount
            ? dom.getRangeAt(0).getBoundingClientRect()
            : null;
        params!.onQueryRef.current(
          query !== null && rect ? { query, rect } : null,
        );
      });
    });
  },
});

/** Replaces the `@query` before the caret with `@path ` (keeps the caret after it). */
function insertMention(editor: LexicalEditor, path: string) {
  editor.update(() => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return;
    const node = sel.anchor.getNode();
    if (!$isTextNode(node)) return;
    const offset = sel.anchor.offset;
    const match = node
      .getTextContent()
      .slice(0, offset)
      .match(/@[^\s@]*$/);
    if (!match) return;
    node.spliceText(
      offset - match[0].length,
      match[0].length,
      `@${path} `,
      true,
    );
  });
}

/** Files whose path contains the query; name matches rank first. */
function suggestions(files: MentionFile[], query: string) {
  const q = query.toLowerCase();
  const scored = files.flatMap((f) => {
    const path = f.path.toLowerCase();
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!path.includes(q)) return [];
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    return [{ f, rank }];
  });
  scored.sort((a, b) => a.rank - b.rank || a.f.path.localeCompare(b.f.path));
  return scored.slice(0, MAX_SUGGESTIONS).map((s) => s.f);
}

const CODE_LANGUAGES = {
  "": "Plain text",
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  py: "Python",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  yaml: "YAML",
};

export type ChatComposerHandle = {
  clear: () => void;
  focus: () => void;
};

/**
 * The chat message box: a compact rich-text (Markdown) editor. Formatting
 * toolbar plus Markdown shortcuts (`**bold**`, `- list`, ``` fences). Enter
 * always breaks the line; ⌘/Ctrl + Enter (or the Send button) sends.
 */
export function ChatComposer({
  composerRef,
  isDark,
  disabled,
  autoFocus,
  placeholder,
  mentionFiles = [],
  onChange,
  onSubmit,
}: {
  composerRef: React.Ref<ChatComposerHandle>;
  isDark: boolean;
  disabled: boolean;
  autoFocus: boolean;
  placeholder: string;
  /** Files offered when the user types `@` (`.md` / `.txt`). */
  mentionFiles?: MentionFile[];
  onChange: (markdown: string) => void;
  /** ⌘/Ctrl + Enter. Plain Enter keeps breaking the line. */
  onSubmit?: () => void;
}) {
  const editorRef = React.useRef<MDXEditorMethods>(null);
  const [empty, setEmpty] = React.useState(true);

  // ── @-mention autocomplete ──
  const lexicalRef = React.useRef<LexicalEditor | null>(null);
  const [mention, setMention] = React.useState<MentionQuery | null>(null);
  const [active, setActive] = React.useState(0);
  /** Query the user closed with Escape — stays closed until it changes. */
  const dismissed = React.useRef<string | null>(null);
  const onQueryRef = React.useRef<(q: MentionQuery | null) => void>(() => {});
  onQueryRef.current = (q) => {
    if (!q || q.query !== dismissed.current) dismissed.current = null;
    setMention(!q || dismissed.current !== null ? null : q);
  };
  // A new query starts at the top suggestion.
  const query = mention?.query;
  React.useEffect(() => setActive(0), [query]);
  const matches = mention ? suggestions(mentionFiles, mention.query) : [];
  const open = mention !== null;

  const choose = (file: MentionFile) => {
    if (lexicalRef.current) insertMention(lexicalRef.current, file.path);
    setMention(null);
  };

  /** Capture phase: runs before Lexical sees the key. */
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      setMention(null);
      onSubmit?.();
      return;
    }
    if (!open) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Escape") {
      stop();
      dismissed.current = mention.query;
      setMention(null);
    } else if (!matches.length) {
      return;
    } else if (e.key === "ArrowDown") {
      stop();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      stop();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      stop();
      choose(matches[Math.min(active, matches.length - 1)]);
    }
  };

  React.useImperativeHandle(
    composerRef,
    () => ({
      clear: () => {
        editorRef.current?.setMarkdown("");
        setEmpty(true);
      },
      focus: () => editorRef.current?.focus(),
    }),
    [],
  );

  const plugins = React.useMemo(
    () => [
      listsPlugin(),
      quotePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_LANGUAGES }),
      markdownShortcutPlugin(),
      mentionPlugin({ editorRef: lexicalRef, onQueryRef }),
      toolbarPlugin({
        toolbarClassName: "chat-composer__toolbar",
        toolbarContents: () => (
          <>
            <div
              className="chat-composer__group"
              role="group"
              aria-label="Text format"
            >
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <StrikeThroughSupSubToggles options={["Strikethrough"]} />
              <CodeToggle />
            </div>
            <div
              className="chat-composer__group"
              role="group"
              aria-label="Lists"
            >
              <ListsToggle options={["bullet", "number"]} />
            </div>
            <div
              className="chat-composer__group"
              role="group"
              aria-label="Insert"
            >
              <CreateLink />
              <InsertCodeBlock />
            </div>
          </>
        ),
      }),
    ],
    [],
  );

  return (
    <div
      className={cn(
        // `--rich`: MDXEditor inside — see chat-pane.css for why it is scoped.
        "chat-composer chat-composer--rich",
        disabled && "chat-composer--disabled",
      )}
      data-testid="chat-composer"
      onKeyDownCapture={onKeyDownCapture}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setMention(null);
        }
      }}
    >
      <MDXEditor
        ref={editorRef}
        markdown=""
        plugins={plugins}
        readOnly={disabled}
        autoFocus={autoFocus}
        spellCheck
        className={cn("chat-composer__editor", isDark && "dark-theme")}
        contentEditableClassName="chat-composer__content"
        onChange={(next) => {
          setEmpty(!next.trim());
          onChange(next);
        }}
      />
      {/* Our own placeholder, aligned with the text (the toolbar sits below). */}
      {empty ? (
        <span className="chat-composer__placeholder" aria-hidden>
          {placeholder}
        </span>
      ) : null}
      {open
        ? createPortal(
            <div
              className="chat-mention"
              role="listbox"
              aria-label="Reference a file"
              data-testid="chat-composer-mention-list"
              style={{
                left: Math.min(mention.rect.left, window.innerWidth - 336),
                bottom: window.innerHeight - mention.rect.top + 6,
              }}
            >
              {matches.length ? (
                matches.map((file, i) => {
                  const slash = file.path.lastIndexOf("/");
                  return (
                    <button
                      key={file.id}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={cn(
                        "chat-mention__item",
                        i === active && "chat-mention__item--active",
                      )}
                      data-testid={`chat-composer-mention-${file.id}-item`}
                      // Keep focus (and the caret) in the editor.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(file)}
                    >
                      <IconFileText
                        aria-hidden
                        className="chat-mention__icon"
                      />
                      <span className="chat-mention__name">
                        {file.path.slice(slash + 1)}
                      </span>
                      {slash > 0 ? (
                        <span className="chat-mention__path">
                          {file.path.slice(0, slash)}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <p className="chat-mention__empty">
                  {mentionFiles.length
                    ? "No .md or .txt file matches"
                    : "No .md or .txt files in the workspace"}
                </p>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
