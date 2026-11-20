import {
  IconArrowsMove,
  IconCode,
  IconDeviceFloppy,
  IconDownload,
  IconSparkles,
  IconEdit,
  IconEye,
  IconFilePlus,
  IconFolderPlus,
  IconHierarchy2,
  IconAlertTriangle,
  IconPencil,
  IconSearch,
  IconSelectAll,
  IconTable,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { AnimatePresence, m, type Variants } from "motion/react";
import * as React from "react";

import { BentoLogo } from "@/components/bento-logo";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { APP_THEME } from "@/lib/color-themes";
import { FileIcon } from "@/lib/file-icons";
import {
  baseNameLength,
  downloadTarget,
  type FileKind,
  KIND_LABEL,
  kindOf,
} from "@/lib/file-types";
import { enter, exit, quick } from "@/lib/motion";
import { downloadFile, storage } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { fsActions } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store";
import { getPath, getTargetFolderId } from "@/store/selectors";
import { type TabMode, tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";
import { FileBarSlotProvider } from "@/features/editors/file-bar-slot";
import { AskAiSelection } from "@/features/editors/AskAiSelection";
import type { AskAiRequest } from "@/lib/ask-ai";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import { MarkdownSkeleton } from "@/features/editors/MarkdownSkeleton";
import { PaneSkeleton } from "@/features/editors/PaneSkeleton";
import type { PaneProps } from "@/features/editors/pane-context";
import {
  useOpenEditorSave,
  useSaveHandler,
} from "@/features/editors/pane-context";
import {
  useDebouncedSave,
  useFileContent,
} from "@/features/editors/use-file-content";

// MDXEditor is the heaviest editor — keep it out of the entry chunk so the
// app shell paints first (LCP); it loads under the pane's Suspense.
const MarkdownEditor = React.lazy(() =>
  import("@/features/editors/MarkdownEditor").then((m) => ({
    default: m.MarkdownEditor,
  })),
);
const PdfPane = React.lazy(() => import("@/features/editors/PdfPane"));
const AskAiPanel = React.lazy(() => import("@/features/editors/AskAiPanel"));
const DocxPane = React.lazy(() => import("@/features/editors/DocxPane"));
const XlsxPane = React.lazy(() => import("@/features/editors/XlsxPane"));
const CsvPane = React.lazy(() => import("@/features/editors/CsvPane"));
const SchemaPane = React.lazy(() => import("@/features/editors/SchemaPane"));
const MermaidPane = React.lazy(() => import("@/features/editors/MermaidPane"));
const CalendarPane = React.lazy(
  () => import("@/features/editors/CalendarPane"),
);
const KanbanPane = React.lazy(() => import("@/features/editors/KanbanPane"));
const DataPane = React.lazy(() => import("@/features/editors/DataPane"));
const SqlPane = React.lazy(() => import("@/features/editors/SqlPane"));
const EnvPane = React.lazy(() => import("@/features/editors/EnvPane"));
const RegexPane = React.lazy(() => import("@/features/editors/RegexPane"));
const DiffPane = React.lazy(() => import("@/features/editors/DiffPane"));
const QrPane = React.lazy(() => import("@/features/editors/QrPane"));
const TimerPane = React.lazy(() => import("@/features/editors/TimerPane"));
const RandomPane = React.lazy(() => import("@/features/editors/RandomPane"));
const BookmarkPane = React.lazy(
  () => import("@/features/editors/BookmarkPane"),
);
// Konva (the slide canvas) only loads with a `.pptx` file.
const PptxPane = React.lazy(() => import("@/features/editors/PptxPane"));
const ChatPane = React.lazy(() => import("@/features/editors/ChatPane"));
const ImagePane = React.lazy(() => import("@/features/editors/ImagePane"));
// d3 only loads with the app.info / app.state panes.
const AppInfoPane = React.lazy(() => import("@/features/editors/AppInfoPane"));
const AppStatePane = React.lazy(
  () => import("@/features/editors/AppStatePane"),
);

/** Kinds with both an editor and a viewer. */
const HAS_MODES: ReadonlySet<FileKind> = new Set([
  "pdf",
  "xlsx",
  "csv",
  "schema",
  "mermaid",
  "random",
]);
/**
 * Kinds whose bytes come from the editor on demand (autosaved through
 * `useBinaryAutosave`). They remount per mode and re-read the stored bytes.
 */
const BINARY_EDITORS: ReadonlySet<FileKind> = new Set(["pdf", "docx", "xlsx"]);

function defaultMode(kind: FileKind): TabMode {
  return kind === "csv" || kind === "schema" || kind === "mermaid"
    ? "view"
    : "edit";
}

/** The active tab's editor, or a start screen when nothing is open. */
export function EditorArea() {
  const activeId = useAppSelector((s) => s.tabs.activeId);
  const node = useAppSelector((s) =>
    activeId ? s.fs.nodes[activeId] : undefined,
  );
  if (!node) return <StartScreen />;
  return <FilePane key={node.id} id={node.id} name={node.name} />;
}

function FilePane({ id, name }: { id: string; name: string }) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const store = useAppStore();
  const [askAi, setAskAi] = React.useState<AskAiRequest | null>(null);
  const [askAiError, setAskAiError] = React.useState<string | null>(null);

  /** Ask AI about the whole file (toolbar button). */
  const askAboutFile = async () => {
    setAskAiError(null);
    try {
      await Promise.resolve(save()).catch(() => undefined);
      const [{ fileAsText }, content] = await Promise.all([
        import("@/lib/data-convert"),
        storage.getContent(id),
      ]);
      const text = await fileAsText({
        id,
        name,
        content,
        path: getPath(store.getState().fs.nodes, id).join(" / "),
      });
      if (!text.trim()) throw new Error("This file is empty.");
      setAskAi({
        context:
          text.length > 200_000
            ? `${text.slice(0, 200_000)}\n…(truncated)`
            : text,
        where: "whole file",
        anchor: null,
      });
    } catch (error) {
      setAskAiError(error instanceof Error ? error.message : String(error));
    }
  };
  const dispatch = useAppDispatch();
  const kind = kindOf(name);
  const savedMode = useAppSelector((s) => s.tabs.modes[id]);
  // Kinds without a viewer always edit, even if a mode was saved for them.
  const mode = HAS_MODES.has(kind) ? (savedMode ?? defaultMode(kind)) : "edit";
  // Binary editors save explicitly, so switching edit ⇄ view re-reads the
  // stored bytes to pick up what was just saved.
  const state = useFileContent(id, BINARY_EDITORS.has(kind) ? mode : undefined);
  const focusRequested = useAppSelector((s) => s.ui.focusRequestId === id);
  // Latched at mount: lazy panes (Mermaid, CSV, Schema) render their first
  // frame only after their chunk loads — after the request is consumed below.
  const [focusOnMount] = React.useState(focusRequested);
  // Consume the one-shot request once the pane has mounted with it (panes
  // read it into state on their first render).
  React.useEffect(() => {
    if (focusRequested && state.status === "ready") {
      dispatch(uiActions.focusRequested(null));
    }
  }, [focusRequested, state.status, dispatch]);
  const isDark = !APP_THEME.isLight;
  const saveRef = React.useRef<(() => Promise<void> | void) | null>(null);
  // Where an editor's own top bar is merged into the file bar.
  const [barSlot, setBarSlot] = React.useState<HTMLDivElement | null>(null);
  const registerSave = React.useCallback<PaneProps["registerSave"]>((fn) => {
    saveRef.current = fn;
  }, []);

  const save = React.useCallback(async () => {
    await saveRef.current?.();
  }, []);
  useOpenEditorSave(id, save);

  // ⌘/Ctrl+S saves the active pane instead of the browser's "Save page".
  // On macOS only ⌘ saves — Control+S opens the code editor's autocomplete.
  React.useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const onKey = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    // Capture phase: the Word/Excel editors stop keydown inside their inputs.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [save]);

  const download = async () => {
    // Save first so the download carries the latest edits.
    await save();
    const content = await storage.getContent(id);
    // A deck is stored as the app's JSON; hand out a real PowerPoint file.
    if (kind === "pptx" && typeof content === "string") {
      const [{ parsePptx }, { buildPptx, PPTX_MIME }] = await Promise.all([
        import("@/lib/pptx-doc"),
        import("@/lib/pptx-export"),
      ]);
      const title = name.slice(0, baseNameLength(name)) || "presentation";
      downloadFile(
        `${title}.pptx`,
        await buildPptx(parsePptx(content), title),
        PPTX_MIME,
      );
      return;
    }
    const target = downloadTarget(name, content);
    downloadFile(target.name, content ?? "", target.mime);
  };

  let body: React.ReactNode;
  if (state.status === "loading") {
    // Same skeleton the pane's Suspense shows while its chunk loads, so
    // reading the file and loading the editor read as one continuous state.
    body = <PaneSkeleton kind={kind} mode={mode} />;
  } else if (state.status === "error") {
    body = (
      <PaneMessage tone="error">
        Could not read this file: {state.error}
      </PaneMessage>
    );
  } else {
    const props: PaneProps = {
      id,
      name,
      content: state.content,
      isDark,
      autoFocus: focusOnMount || focusRequested,
      registerSave,
    };
    switch (kind) {
      case "markdown":
        body = <MarkdownPane {...props} />;
        break;
      case "text":
        body = <TextPane {...props} />;
        break;
      case "pdf":
        body = <PdfPane {...props} mode={mode} />;
        break;
      case "docx":
        body = <DocxPane {...props} />;
        break;
      case "xlsx":
        body = <XlsxPane {...props} mode={mode} />;
        break;
      case "csv":
        body = <CsvPane {...props} mode={mode} />;
        break;
      case "schema":
        body = <SchemaPane {...props} mode={mode} />;
        break;
      case "mermaid":
        body = <MermaidPane {...props} mode={mode} />;
        break;
      case "calendar":
        body = <CalendarPane {...props} />;
        break;
      case "kanban":
        body = <KanbanPane {...props} />;
        break;
      case "json":
      case "yaml":
      case "toml":
        body = <DataPane {...props} kind={kind} />;
        break;
      case "sql":
        body = <SqlPane {...props} />;
        break;
      case "env":
        body = <EnvPane {...props} />;
        break;
      case "apikeys":
        // `.gemini` / `.openrouter`: plain JSON — `{ "name": "api-key" }`.
        // No syntax-error badge.
        body = <DataPane {...props} kind="json" showStatus={false} />;
        break;
      case "prompt":
        // `{ "name": "system prompt" }` — chats pick one by name.
        body = <DataPane {...props} kind="json" showStatus={false} />;
        break;
      case "regex":
        body = <RegexPane {...props} />;
        break;
      case "diff":
        body = <DiffPane {...props} />;
        break;
      case "qr":
        body = <QrPane {...props} />;
        break;
      case "timer":
        body = <TimerPane {...props} />;
        break;
      case "random":
        body = <RandomPane {...props} mode={mode} />;
        break;
      case "bookmark":
        body = <BookmarkPane {...props} />;
        break;
      case "pptx":
        body = <PptxPane {...props} />;
        break;
      case "chat":
        body = <ChatPane {...props} />;
        break;
      case "appinfo":
        body = <AppInfoPane {...props} />;
        break;
      case "appstate":
        body = <AppStatePane {...props} />;
        break;
      case "image":
        body = <ImagePane {...props} />;
        break;
    }
  }

  return (
    // Keyed per file by EditorArea, so each tab switch eases the new file in.
    <m.section
      aria-label={name}
      data-testid="editor-pane"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={enter}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PaneToolbar
        id={id}
        name={name}
        kind={kind}
        mode={mode}
        onMode={async (next) => {
          // Store the latest edits before the other mode re-reads the bytes.
          if (BINARY_EDITORS.has(kind) && mode === "edit") {
            await Promise.resolve(save()).catch(() => undefined);
          }
          dispatch(tabsActions.modeSet({ id, mode: next }));
        }}
        onDownload={download}
        onAskAi={kind === "chat" ? undefined : () => void askAboutFile()}
        askAiError={askAiError}
        slotRef={setBarSlot}
      />
      {/* Clip sideways only: Monaco mounts its hovers (e.g. the find widget's
          button tooltips) inside the editor and places them above its top
          edge, which a vertical clip here would cut off. Panes size to this
          box and scroll internally, so nothing else overflows vertically. */}
      <div
        ref={bodyRef}
        className="bg-app-bg relative min-h-0 flex-1 overflow-x-clip"
      >
        {/* Binary panes remount per mode (they re-read the saved bytes);
            CSV keeps its in-memory text across Raw ⇄ Table. */}
        <ErrorBoundary key={BINARY_EDITORS.has(kind) ? `${id}:${mode}` : id}>
          <FileBarSlotProvider slot={barSlot}>
            <React.Suspense fallback={<PaneSkeleton kind={kind} mode={mode} />}>
              {body}
            </React.Suspense>
          </FileBarSlotProvider>
        </ErrorBoundary>
        {/* Chats take references themselves; every other editor can send
            selected text to one. */}
        {kind === "chat" ? null : (
          <AskAiSelection containerRef={bodyRef} onAsk={setAskAi} />
        )}
        {askAi ? (
          <React.Suspense fallback={null}>
            <AskAiPanel
              key={askAi.context.length + askAi.where}
              fileId={id}
              fileName={name}
              request={askAi}
              paneRect={bodyRef.current?.getBoundingClientRect()}
              onClose={() => setAskAi(null)}
            />
          </React.Suspense>
        ) : null}
      </div>
    </m.section>
  );
}

function MarkdownPane({
  id,
  content,
  isDark,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const latest = React.useRef(typeof content === "string" ? content : "");
  // Read once at mount — MDXEditor only honours autoFocus on its first render.
  const [focusOnMount] = React.useState(autoFocus);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, latest.current)));

  return (
    // Own boundary: an editor-shaped skeleton while MDXEditor (~400 kB)
    // loads, instead of flashing the note's raw Markdown source.
    <React.Suspense fallback={<MarkdownSkeleton />}>
      <MarkdownEditor
        markdown={latest.current}
        isDark={isDark}
        autoFocus={focusOnMount}
        onChange={(value) => {
          latest.current = value;
          save(value);
        }}
      />
    </React.Suspense>
  );
}

function TextPane({ id, content, autoFocus, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));
  const [focusOnMount] = React.useState(autoFocus);
  return (
    <LazyCodeEditor
      path={`${id}.txt`}
      language="plaintext"
      wordWrap
      aria-label="Text"
      data-testid="text-editor"
      placeholder="Start writing…"
      autoFocus={focusOnMount}
      defaultValue={text}
      onChange={(value) => {
        setText(value);
        save(value);
      }}
    />
  );
}

function PaneToolbar({
  id,
  name,
  kind,
  mode,
  onMode,
  onDownload,
  onAskAi,
  askAiError,
  slotRef,
}: {
  id: string;
  name: string;
  kind: FileKind;
  mode: TabMode;
  onMode: (mode: TabMode) => void;
  onDownload: () => void;
  /** Opens the inline Ask AI panel about the whole file. */
  onAskAi?: () => void;
  askAiError?: string | null;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const saveState = useAppSelector((s) => s.ui.saveState[id]);
  const path = getPath(nodes, id);

  return (
    // Touch: one step taller, so the finger-sized (36px) buttons get a margin.
    <div className="border-app-border bg-app-bg flex h-9 shrink-0 items-center gap-2 border-b px-3 pointer-coarse:h-11">
      <nav
        aria-label="Path"
        className="flex min-w-0 shrink items-center gap-1 text-[12px]"
      >
        {path.map((part, i) => {
          const last = i === path.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 ? <span className="text-app-dim">/</span> : null}
              {last ? (
                <span className="text-app-bright flex min-w-0 items-center gap-1.5 truncate font-semibold">
                  <FileIcon name={name} />
                  {part}
                </span>
              ) : (
                <button
                  type="button"
                  title={`Show “${part}” in the explorer`}
                  aria-label={`Show folder ${part} in the explorer`}
                  className="text-app-dim hover:text-app-accent truncate pointer-coarse:min-h-9 pointer-coarse:px-1"
                  onClick={() => {
                    // Reveal the folder in the explorer.
                    let cur = nodes[id];
                    for (let j = path.length - 1; j > i && cur?.parentId; j--) {
                      cur = nodes[cur.parentId];
                    }
                    if (cur) {
                      dispatch(uiActions.sidebarSet(true));
                      dispatch(fsActions.selected(cur.id));
                    }
                  }}
                >
                  {part}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Editors with their own top bar render it here (see FileBarSlot). */}
      <div
        ref={slotRef}
        data-slot="file-bar-slot"
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-center justify-end overflow-x-auto"
      />

      {/* Every editor autosaves silently; only a failed save is shown. */}
      <SaveError failed={saveState === "error"} />

      {HAS_MODES.has(kind) ? (
        <ButtonGroup role="radiogroup" aria-label="Mode">
          <ModeButton
            active={mode === "edit"}
            hint={
              kind === "csv" || kind === "schema"
                ? "Edit the raw text source"
                : "Edit this file"
            }
            onClick={() => onMode("edit")}
          >
            {kind === "csv" || kind === "schema" ? <IconCode /> : <IconEdit />}
            {kind === "csv" || kind === "schema" ? "Raw" : "Edit"}
          </ModeButton>
          <ModeButton
            active={mode === "view"}
            hint={
              kind === "csv"
                ? "Show as a sortable table"
                : kind === "schema"
                  ? "Edit visually with the schema builder"
                  : "Read-only preview"
            }
            onClick={() => onMode("view")}
          >
            {kind === "csv" ? (
              <IconTable />
            ) : kind === "schema" ? (
              <IconHierarchy2 />
            ) : (
              <IconEye />
            )}
            {kind === "csv" ? "Table" : kind === "schema" ? "Builder" : "View"}
          </ModeButton>
        </ButtonGroup>
      ) : null}

      {onAskAi ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="pane-ask-ai-button"
              aria-label="Ask AI about this file"
              className={cn(
                TOOLBAR_BTN,
                "w-7 px-0",
                askAiError && "text-app-error",
              )}
              onClick={onAskAi}
            >
              <IconSparkles />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {askAiError
              ? `Can't read this file for AI: ${askAiError}`
              : "Ask AI about this file — or select text to ask about just that"}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <ButtonGroup aria-label="File">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="pane-download-button"
              aria-label={`Download ${KIND_LABEL[kind]} file`}
              className={cn(TOOLBAR_BTN, "w-7 px-0")}
              onClick={onDownload}
            >
              <IconDownload />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Download {name} to your computer
          </TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}

const TOOLBAR_BTN = ui.paneToolbarBtn;

function ModeButton({
  active,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  /** Tooltip explaining what this mode shows. */
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      title={hint}
      variant="outline"
      size="sm"
      role="radio"
      aria-checked={active}
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        TOOLBAR_BTN,
        "data-active:bg-app-selected data-active:text-app-accent",
      )}
    >
      {children}
    </Button>
  );
}

/** "Not saved" warning, faded in when a save fails and out once one succeeds. */
function SaveError({ failed }: { failed: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {failed ? (
        <m.span
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0, transition: quick }}
          exit={{ opacity: 0, y: -3, transition: exit }}
          role="alert"
          data-testid="pane-save-error-message"
          className="text-app-error flex items-center gap-1 font-mono text-[11px]"
        >
          <IconAlertTriangle className="size-3" /> Not saved
        </m.span>
      ) : null}
    </AnimatePresence>
  );
}

function PaneMessage({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "font-description flex h-full items-center justify-center p-8 text-center text-[12px]",
        tone === "error" ? "text-app-error" : "text-app-dim",
      )}
    >
      {children}
    </div>
  );
}

/** Start screen: logo, actions, then shortcuts settle in one after another. */
const START_STAGGER: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};
const START_ITEM: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: enter },
};

function StartScreen() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selectedId = useAppSelector((s) => s.fs.selectedId);
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? "⌘" : "Ctrl";
  const shortcuts: Array<[string[], string, typeof IconSearch]> = [
    [[mod, "P"], "Quick open a file", IconSearch],
    [[mod, "S"], "Save the active editor", IconDeviceFloppy],
    [
      isMac ? ["⌃", "S"] : ["Ctrl", "Space"],
      "Show autocomplete in code editors",
      IconCode,
    ],
    [["Enter"], "Rename the selected item (or F2)", IconPencil],
    [
      [isMac ? "⌘" : "Ctrl", "Click"],
      "Select several items — Shift-click for a range",
      IconSelectAll,
    ],
    [["Del"], "Delete the selected items", IconTrash],
    [["↑", "↓", "←", "→"], "Move around the explorer", IconArrowsMove],
  ];
  const create = (nodeType: "file" | "folder") => {
    dispatch(uiActions.sidebarSet(true));
    dispatch(
      fsActions.draftStarted({
        mode: "create",
        nodeType,
        parentId: getTargetFolderId(nodes, selectedId),
      }),
    );
  };

  return (
    <div
      data-testid="start-screen"
      className="bg-app-bg flex min-h-0 flex-1 items-center justify-center overflow-auto p-8"
    >
      <m.div
        variants={START_STAGGER}
        initial="hidden"
        animate="shown"
        className="flex w-full max-w-md flex-col items-center gap-6 text-center"
      >
        <m.div
          variants={START_ITEM}
          className="flex flex-col items-center gap-2"
        >
          <BentoLogo className="mb-1 size-12 drop-shadow-sm" />
          <h1 className="font-display text-app-bright text-[18px] font-semibold tracking-[-0.01em]">
            Nothing open
          </h1>
          <p className={ui.help}>
            {Object.keys(nodes).length > 0
              ? "Pick a file in the explorer, or start something new."
              : "Your workspace is empty — start something new."}
          </p>
        </m.div>

        <m.div
          variants={START_ITEM}
          className="flex flex-wrap items-center justify-center gap-2"
        >
          <Button
            type="button"
            size="sm"
            className={ui.solidBtn}
            onClick={() => create("file")}
          >
            <IconFilePlus className="size-3.5" />
            New note
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.ghostBtn}
            onClick={() => create("folder")}
          >
            <IconFolderPlus className="size-3.5" />
            New folder
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ui.ghostBtn}
            onClick={() =>
              dispatch(
                uiActions.importOpened(getTargetFolderId(nodes, selectedId)),
              )
            }
          >
            <IconUpload className="size-3.5" />
            Import
          </Button>
        </m.div>

        <m.dl
          variants={START_ITEM}
          className="divide-app-border border-app-border bg-app-panel w-full divide-y overflow-hidden rounded-lg border text-left"
        >
          {shortcuts.map(([keys, label, Icon]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 px-3 py-2"
            >
              <dt className="font-description text-app-text flex items-center gap-2 text-[12px]">
                <Icon aria-hidden className="text-app-dim size-3.5 shrink-0" />
                {label}
              </dt>
              <dd className="flex shrink-0 items-center gap-1">
                {keys.map((key) => (
                  <Kbd
                    key={key}
                    className="border-app-border-mid bg-app-bg text-app-bright inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1.5 font-mono text-[10px]"
                  >
                    {key}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </m.dl>
      </m.div>
    </div>
  );
}
