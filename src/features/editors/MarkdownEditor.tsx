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
import * as React from "react";

import { ImageDialog } from "@/features/editors/ImageDialog";
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
      className="flex h-full min-h-0 flex-col"
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
    </div>
  );
}
