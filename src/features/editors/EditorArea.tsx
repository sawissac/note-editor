import {
  IconCheck,
  IconDeviceFloppy,
  IconDownload,
  IconEdit,
  IconEye,
  IconFilePlus,
  IconFolderPlus,
  IconLoader2,
  IconNotebook,
  IconAlertTriangle,
  IconUpload,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { APP_THEME } from "@/lib/color-themes";
import { FileIcon } from "@/lib/file-icons";
import { type FileKind, KIND_LABEL, kindOf, mimeOf } from "@/lib/file-types";
import { downloadFile, storage } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { fsActions } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath, getTargetFolderId } from "@/store/selectors";
import { type TabMode, tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";
import { FileBarSlotProvider } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import { MarkdownEditor } from "@/features/editors/MarkdownEditor";
import type { PaneProps } from "@/features/editors/pane-context";
import {
  useOpenEditorSave,
  useSaveHandler,
} from "@/features/editors/pane-context";
import {
  useDebouncedSave,
  useFileContent,
} from "@/features/editors/use-file-content";

const PdfPane = React.lazy(() => import("@/features/editors/PdfPane"));
const DocxPane = React.lazy(() => import("@/features/editors/DocxPane"));
const XlsxPane = React.lazy(() => import("@/features/editors/XlsxPane"));
const CsvPane = React.lazy(() => import("@/features/editors/CsvPane"));
const SchemaPane = React.lazy(() => import("@/features/editors/SchemaPane"));
const MermaidPane = React.lazy(() => import("@/features/editors/MermaidPane"));

/** Kinds with both an editor and a viewer. */
const HAS_MODES: ReadonlySet<FileKind> = new Set([
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "schema",
  "mermaid",
]);
/** Kinds saved explicitly (bytes come from the editor on demand). */
const MANUAL_SAVE: ReadonlySet<FileKind> = new Set(["pdf", "docx", "xlsx"]);

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
  const dispatch = useAppDispatch();
  const kind = kindOf(name);
  const mode = useAppSelector((s) => s.tabs.modes[id]) ?? defaultMode(kind);
  // Binary editors save explicitly, so switching edit ⇄ view re-reads the
  // stored bytes to pick up what was just saved.
  const state = useFileContent(id, MANUAL_SAVE.has(kind) ? mode : undefined);
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
    downloadFile(name, content ?? "", mimeOf(name));
  };

  let body: React.ReactNode;
  if (state.status === "loading") {
    body = <PaneSkeleton />;
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
        body = <DocxPane {...props} mode={mode} />;
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
    }
  }

  return (
    <section
      aria-label={name}
      data-testid="editor-pane"
      className="flex min-h-0 flex-1 flex-col"
    >
      <PaneToolbar
        id={id}
        name={name}
        kind={kind}
        mode={mode}
        onMode={(next) => dispatch(tabsActions.modeSet({ id, mode: next }))}
        onSave={MANUAL_SAVE.has(kind) && mode === "edit" ? save : undefined}
        onDownload={download}
        slotRef={setBarSlot}
      />
      {/* Clip sideways only: Monaco mounts its hovers (e.g. the find widget's
          button tooltips) inside the editor and places them above its top
          edge, which a vertical clip here would cut off. Panes size to this
          box and scroll internally, so nothing else overflows vertically. */}
      <div className="bg-app-bg relative min-h-0 flex-1 overflow-x-clip">
        {/* Binary panes remount per mode (they re-read the saved bytes);
            CSV keeps its in-memory text across Raw ⇄ Table. */}
        <ErrorBoundary key={MANUAL_SAVE.has(kind) ? `${id}:${mode}` : id}>
          <FileBarSlotProvider slot={barSlot}>
            <React.Suspense fallback={<PaneSkeleton />}>{body}</React.Suspense>
          </FileBarSlotProvider>
        </ErrorBoundary>
      </div>
    </section>
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
    400,
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, latest.current)));

  return (
    <MarkdownEditor
      markdown={latest.current}
      isDark={isDark}
      autoFocus={focusOnMount}
      onChange={(value) => {
        latest.current = value;
        save(value);
      }}
    />
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
  onSave,
  onDownload,
  slotRef,
}: {
  id: string;
  name: string;
  kind: FileKind;
  mode: TabMode;
  onMode: (mode: TabMode) => void;
  onSave?: () => Promise<void>;
  onDownload: () => void;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const saveState = useAppSelector((s) => s.ui.saveState[id]);
  const path = getPath(nodes, id);

  return (
    <div className="border-app-border bg-app-bg flex h-9 shrink-0 items-center gap-2 border-b px-3">
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
                  className="text-app-dim hover:text-app-accent truncate"
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

      <SaveIndicator state={saveState} manual={Boolean(onSave)} />

      {HAS_MODES.has(kind) ? (
        <ButtonGroup role="radiogroup" aria-label="Mode">
          <ModeButton active={mode === "edit"} onClick={() => onMode("edit")}>
            <IconEdit />
            {kind === "csv" || kind === "schema" ? "Raw" : "Edit"}
          </ModeButton>
          <ModeButton active={mode === "view"} onClick={() => onMode("view")}>
            <IconEye />
            {kind === "csv" ? "Table" : kind === "schema" ? "Builder" : "View"}
          </ModeButton>
        </ButtonGroup>
      ) : null}

      <ButtonGroup aria-label="File">
        {onSave ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="pane-save-button"
            className={TOOLBAR_BTN}
            onClick={() => void onSave()}
            title="Save (⌘/Ctrl+S)"
          >
            <IconDeviceFloppy />
            Save
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          aria-label={`Download ${KIND_LABEL[kind]} file`}
          title="Download"
          className={cn(TOOLBAR_BTN, "w-7 px-0")}
          onClick={onDownload}
        >
          <IconDownload />
        </Button>
      </ButtonGroup>
    </div>
  );
}

const TOOLBAR_BTN = ui.paneToolbarBtn;

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
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

function SaveIndicator({
  state,
  manual,
}: {
  state: string | undefined;
  manual: boolean;
}) {
  if (state === "saving") {
    return (
      <span className={cn(ui.meta, "flex items-center gap-1")}>
        <IconLoader2 className="size-3 animate-spin" /> Saving
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="text-app-error flex items-center gap-1 font-mono text-[11px]">
        <IconAlertTriangle className="size-3" /> Not saved
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className={cn(ui.meta, "flex items-center gap-1")}>
        <IconCheck className="text-app-success size-3" /> Saved
      </span>
    );
  }
  return manual ? <span className={ui.meta}>⌘S to save</span> : null;
}

function PaneSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-8">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
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

function StartScreen() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selectedId = useAppSelector((s) => s.fs.selectedId);
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const mod = isMac ? "⌘" : "Ctrl";
  const shortcuts: Array<[string[], string]> = [
    [[mod, "P"], "Quick open a file"],
    [[mod, "S"], "Save the active editor"],
    [
      isMac ? ["⌃", "S"] : ["Ctrl", "Space"],
      "Show autocomplete in code editors",
    ],
    [["F2"], "Rename the selected item"],
    [["Del"], "Delete the selected item"],
    [["↑", "↓", "←", "→"], "Move around the explorer"],
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
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <span
            aria-hidden
            className="tint-current text-app-accent mb-1 flex size-12 items-center justify-center rounded-xl border"
          >
            <IconNotebook className="size-6" />
          </span>
          <h1 className="font-display text-app-bright text-[18px] font-semibold tracking-[-0.01em]">
            Nothing open
          </h1>
          <p className={ui.help}>
            Pick a file in the explorer, or start something new.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className={ui.solidBtn}
            onClick={() => create("file")}
          >
            <IconFilePlus className="size-3.5" />
            New note
          </button>
          <button
            type="button"
            className={ui.ghostBtn}
            onClick={() => create("folder")}
          >
            <IconFolderPlus className="size-3.5" />
            New folder
          </button>
          <button
            type="button"
            className={ui.ghostBtn}
            onClick={() =>
              dispatch(
                uiActions.importOpened(getTargetFolderId(nodes, selectedId)),
              )
            }
          >
            <IconUpload className="size-3.5" />
            Import
          </button>
        </div>

        <dl className="divide-app-border border-app-border bg-app-panel w-full divide-y overflow-hidden rounded-lg border text-left">
          {shortcuts.map(([keys, label]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 px-3 py-2"
            >
              <dt className="font-description text-app-text text-[12px]">
                {label}
              </dt>
              <dd className="flex shrink-0 items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="border-app-border-mid bg-app-bg text-app-bright inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1.5 font-mono text-[10px]"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
