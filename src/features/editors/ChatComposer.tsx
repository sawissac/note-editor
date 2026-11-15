import "@mdxeditor/editor/style.css";

import {
  BoldItalicUnderlineToggles,
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
  StrikeThroughSupSubToggles,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import * as React from "react";

import { cn } from "@/lib/cn";

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
 * always breaks the line — messages are sent only via the Send button.
 */
export function ChatComposer({
  composerRef,
  isDark,
  disabled,
  autoFocus,
  placeholder,
  onChange,
}: {
  composerRef: React.Ref<ChatComposerHandle>;
  isDark: boolean;
  disabled: boolean;
  autoFocus: boolean;
  placeholder: string;
  onChange: (markdown: string) => void;
}) {
  const editorRef = React.useRef<MDXEditorMethods>(null);
  const [empty, setEmpty] = React.useState(true);

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
      toolbarPlugin({
        toolbarClassName: "chat-composer__toolbar",
        toolbarContents: () => (
          <>
            <div className="chat-composer__group" role="group" aria-label="Text format">
              <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
              <StrikeThroughSupSubToggles options={["Strikethrough"]} />
              <CodeToggle />
            </div>
            <div className="chat-composer__group" role="group" aria-label="Lists">
              <ListsToggle options={["bullet", "number"]} />
            </div>
            <div className="chat-composer__group" role="group" aria-label="Insert">
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
    </div>
  );
}
