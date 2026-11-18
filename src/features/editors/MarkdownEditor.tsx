import "@mdxeditor/editor/style.css";

import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CodeToggle,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  StrikeThroughSupSubToggles,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import { AnimatePresence } from "motion/react";
import * as React from "react";

import { ImageDialog } from "@/features/editors/ImageDialog";
import { MarkdownSkeleton } from "@/features/editors/MarkdownSkeleton";
import { cn } from "@/lib/cn";

const CODE_LANGUAGES = {
  "": "Plain text",
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  md: "Markdown",
  py: "Python",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  yaml: "YAML",
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * The main editor: MDXEditor with the full rich-text toolset plus a source /
 * diff toggle. Images are inlined as data URLs so a note stays one file.
 * Mounted with `key={fileId}` by the host — `markdown` is the initial value.
 */
export function MarkdownEditor({
  markdown,
  isDark,
  autoFocus = false,
  onChange,
}: {
  markdown: string;
  isDark: boolean;
  autoFocus?: boolean;
  onChange: (markdown: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const editorRef = React.useRef<MDXEditorMethods>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const ready = useEditableReady(rootRef);
  const plugins = React.useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      imagePlugin({ imageUploadHandler: readAsDataUrl, ImageDialog }),
      tablePlugin(),
      frontmatterPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
      codeMirrorPlugin({ codeBlockLanguages: CODE_LANGUAGES }),
      diffSourcePlugin({ viewMode: "rich-text", diffMarkdown: markdown }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: "md-toolbar",
        toolbarContents: () => (
          <DiffSourceToggleWrapper options={["rich-text", "source", "diff"]}>
            {/* Each cluster renders as one joined button group (index.css
                .md-group), matching compacto's ButtonGroup. */}
            <div className="md-group" role="group" aria-label="History">
              <UndoRedo />
            </div>
            <BlockTypeSelect />
            <div className="md-group" role="group" aria-label="Text format">
              <BoldItalicUnderlineToggles />
              <CodeToggle />
              <StrikeThroughSupSubToggles />
            </div>
            <div className="md-group" role="group" aria-label="Lists">
              <ListsToggle />
            </div>
            <div className="md-group" role="group" aria-label="Insert">
              <CreateLink />
              <InsertImage />
              <InsertTable />
              <InsertThematicBreak />
              <InsertCodeBlock />
            </div>
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    // `markdown` only seeds the diff baseline; the editor is keyed per file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-0 flex-col"
      // The editable block is only as tall as its text, so a click in the
      // empty space below it would otherwise do nothing. Send it to the end.
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        const inBody = target.closest(".mdxeditor-diff-source-wrapper");
        const inEditable = target.closest("[contenteditable=true], .cm-editor");
        if (!inBody || inEditable || e.button !== 0) return;
        e.preventDefault();
        editorRef.current?.focus(undefined, { defaultSelection: "rootEnd" });
      }}
    >
      {error ? (
        <div
          role="alert"
          className="shrink-0 border-b border-app-border bg-app-warn/10 px-4 py-1.5 font-description text-[11px] text-app-warn"
        >
          Part of this file could not be shown as rich text ({error}). Switch to
          source mode to edit it directly.
        </div>
      ) : null}
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        plugins={plugins}
        onChange={(next, initialNormalize) => {
          if (!initialNormalize) onChange(next);
        }}
        onError={({ error: message }) => setError(message)}
        className={cn("app-mdx min-h-0 flex-1", isDark && "dark-theme")}
        contentEditableClassName="md-content"
        placeholder="Start writing…"
        autoFocus={autoFocus}
        spellCheck
      />
      {/* MDXEditor paints its content a few frames after mounting; keep the
          loading skeleton over it until then, and fade it away. */}
      <AnimatePresence>
        {ready ? null : <MarkdownSkeleton key="skeleton" overlay />}
      </AnimatePresence>
    </div>
  );
}

/** Safety net: never leave the skeleton up if the editable never appears. */
const READY_TIMEOUT_MS = 3000;

/** True once MDXEditor's editable content (`.md-content`) is in the DOM. */
function useEditableReady(rootRef: React.RefObject<HTMLDivElement | null>) {
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || ready) return;
    const check = () => {
      if (root.querySelector(".md-content")) setReady(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(() => setReady(true), READY_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [rootRef, ready]);
  return ready;
}
