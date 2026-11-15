import {
  IconCommand,
  IconFilePlus,
  IconFileSearch,
  IconFolderPlus,
  IconHelp,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-react";
import * as React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Toggle } from "@/components/ui/toggle";
import { Kbd } from "@/components/ui/kbd";
import { FileIcon, FolderIcon } from "@/lib/file-icons";
import {
  extensionOf,
  KIND_LABEL,
  kindOf,
  suggestFileNames,
} from "@/lib/file-types";
import { fuzzyMatch } from "@/lib/fuzzy";
import {
  createAtPath,
  openFile,
  planCreate,
  revealInExplorer,
} from "@/store/actions";
import type { FsNode, NodeType } from "@/store/fs-slice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store";
import { getPath, getTargetFolderId } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";
import {
  buildCommands,
  type PaletteCommand,
} from "@/features/workspace/palette-commands";
import { useContentSearch } from "@/features/workspace/use-content-search";

type Mode = "files" | "commands" | "content" | "help";

const PREFIX: Record<Exclude<Mode, "files">, string> = {
  commands: ">",
  content: "#",
  help: "?",
};

const PLACEHOLDER: Record<Mode, string> = {
  files: "Go to file, or type a name / path to create it…",
  commands: "Run a command…",
  content: "Search inside files…",
  help: "Pick a mode…",
};

const MAX_FILES = 60;
const MAX_FOLDERS = 8;

function modeOf(query: string): { mode: Mode; term: string } {
  for (const [mode, prefix] of Object.entries(PREFIX)) {
    if (query.startsWith(prefix)) {
      return { mode: mode as Mode, term: query.slice(prefix.length).trim() };
    }
  }
  return { mode: "files", term: query.trim() };
}

/** `text` with the characters at `indices` wrapped in a highlight. */
function Highlight({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices?.length) return <>{text}</>;
  const hit = new Set(indices);
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const on = hit.has(i);
    let j = i;
    while (j < text.length && hit.has(j) === on) j++;
    const chunk = text.slice(i, j);
    parts.push(
      on ? (
        <mark key={i} className="quick-open__match">
          {chunk}
        </mark>
      ) : (
        chunk
      ),
    );
    i = j;
  }
  return <>{parts}</>;
}

/** `a/b/c.md` → `a/b`; a root entry shows nothing. */
function parentOf(path: string) {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

type Ranked<T> = {
  item: T;
  score: number;
  nameIdx?: number[];
  pathIdx?: number[];
};

/** Fuzzy-ranks nodes: a name hit outranks a path-only hit. */
function rankNodes(
  list: Array<{ node: FsNode; path: string }>,
  term: string,
  bonus: (node: FsNode) => number,
): Ranked<{ node: FsNode; path: string }>[] {
  const out: Ranked<{ node: FsNode; path: string }>[] = [];
  for (const entry of list) {
    const byName = fuzzyMatch(term, entry.node.name);
    if (byName) {
      out.push({
        item: entry,
        score: byName.score + 500 + bonus(entry.node),
        nameIdx: byName.indices,
      });
      continue;
    }
    const byPath = fuzzyMatch(term, entry.path);
    if (byPath)
      out.push({
        item: entry,
        score: byPath.score + bonus(entry.node),
        pathIdx: byPath.indices,
      });
  }
  return out.sort(
    (a, b) =>
      b.score - a.score || b.item.node.updatedAt - a.item.node.updatedAt,
  );
}

/**
 * ⌘/Ctrl+P quick open — one box, four modes picked by the first character:
 *
 * - (none) fuzzy-find files and folders by name or path; when nothing
 *   matches exactly, offers to create the typed name or path (missing
 *   folders included, `.md` when no extension is given).
 * - `>` run a workspace / file / tab command (also ⌘/Ctrl+Shift+P).
 * - `#` search the text inside every text file (also ⌘/Ctrl+Shift+F).
 * - `?` list the modes.
 *
 * Actions that move focus elsewhere (rename, create, dialogs) run once the
 * palette has closed, so its focus return does not steal it back.
 *
 * CSS: BEM block `quick-open` (`src/styles/quick-open.css`).
 */
export function QuickOpen() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const open = useAppSelector((s) => s.ui.quickOpen);
  const prefix = useAppSelector((s) => s.ui.quickOpenPrefix);
  const nodes = useAppSelector((s) => s.fs.nodes);
  const selectedId = useAppSelector((s) => s.fs.selectedId);
  const openIds = useAppSelector((s) => s.tabs.openIds);
  const [query, setQuery] = React.useState(prefix);
  const pending = React.useRef<(() => void) | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Each opening starts from its prefix. Reset during render (not in an
  // effect) so the first frame never shows the previous query.
  const [session, setSession] = React.useState({ open, prefix });
  if (session.open !== open || session.prefix !== prefix) {
    setSession({ open, prefix });
    if (open) setQuery(prefix);
  }

  /** Switches mode from a click, keeping the caret in the search field. */
  const switchTo = (next: string) => {
    setQuery(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const start =
        key === "p"
          ? e.shiftKey
            ? ">"
            : ""
          : key === "f" && e.shiftKey
            ? "#"
            : null;
      if (start === null) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch(uiActions.quickOpenStarted(start));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dispatch]);

  const { mode, term } = modeOf(query);
  const content = useContentSearch(nodes, term, open && mode === "content");

  const entries = React.useMemo(() => {
    if (!open) return [];
    return Object.values(nodes).map((node) => ({
      node,
      path: getPath(nodes, node.id).join("/"),
    }));
  }, [open, nodes]);

  // CommandDialog renders its sr-only title outside the panel; mount it only
  // while open so the hidden heading does not linger in the page.
  if (!open) return null;

  const close = () => dispatch(uiActions.quickOpenSet(false));

  /** Closes, then runs `fn` once the dialog has let go of focus. */
  const runAfterClose = (fn: () => void) => {
    pending.current = fn;
    close();
    // Fallback in case the close-focus hook never fires.
    setTimeout(() => {
      const next = pending.current;
      pending.current = null;
      next?.();
    }, 50);
  };

  const goTo = (id: string) => {
    dispatch(openFile(id));
    close();
  };

  const baseId = getTargetFolderId(nodes, selectedId);
  const body =
    mode === "commands" ? (
      <CommandsMode
        term={term}
        commands={buildCommands(store.getState(), dispatch)}
        onRun={runAfterClose}
      />
    ) : mode === "content" ? (
      <ContentMode
        term={term}
        hits={content.hits}
        busy={content.busy}
        nodes={nodes}
        onOpen={goTo}
      />
    ) : mode === "help" ? (
      <HelpMode onPick={switchTo} />
    ) : (
      <FilesMode
        term={term}
        entries={entries}
        nodes={nodes}
        openIds={openIds}
        baseId={baseId}
        onOpen={goTo}
        onReveal={(id) => runAfterClose(() => dispatch(revealInExplorer(id)))}
        onCreate={(path, type) =>
          runAfterClose(() => void dispatch(createAtPath(baseId, path, type)))
        }
      />
    );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => dispatch(uiActions.quickOpenSet(next))}
      title="Quick open"
      description="Go to a file, create one, run a command or search inside files"
      contentProps={{
        "data-testid": "quick-open-dialog",
        // Radix selects the field's text on open, so typing would wipe a
        // ">" / "#" prefix — put the caret after it instead.
        onOpenAutoFocus: (e) => {
          const input = inputRef.current;
          if (!input) return;
          e.preventDefault();
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        },
        onCloseAutoFocus: (e) => {
          const next = pending.current;
          if (!next) return;
          e.preventDefault();
          pending.current = null;
          next();
        },
      }}
      commandProps={{ shouldFilter: false, loop: true }}
      density="compact"
    >
      <CommandInput
        ref={inputRef}
        data-testid="quick-open-search-input"
        placeholder={PLACEHOLDER[mode]}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList data-testid="quick-open-result-list">{body}</CommandList>
      <footer className="quick-open__footer">
        <ModeHint
          testId="quick-open-files-button"
          label="Files"
          active={mode === "files"}
          onClick={() => switchTo("")}
        />
        <ModeHint
          testId="quick-open-commands-button"
          label="Commands"
          prefix=">"
          active={mode === "commands"}
          onClick={() => switchTo(">")}
        />
        <ModeHint
          testId="quick-open-search-button"
          label="Search in files"
          prefix="#"
          active={mode === "content"}
          onClick={() => switchTo("#")}
        />
        <ModeHint
          testId="quick-open-help-button"
          label="Help"
          prefix="?"
          active={mode === "help"}
          onClick={() => switchTo("?")}
        />
        {mode === "content" && content.busy ? (
          <span
            className="quick-open__status"
            data-testid="quick-open-busy-message"
          >
            <IconLoader2 aria-hidden className="quick-open__spinner" />
            Searching…
          </span>
        ) : null}
      </footer>
    </CommandDialog>
  );
}

function ModeHint({
  testId,
  label,
  prefix,
  active,
  onClick,
}: {
  testId: string;
  label: string;
  prefix?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Toggle
      size="sm"
      data-testid={testId}
      pressed={active}
      className="quick-open__hint"
      onPressedChange={onClick}
    >
      {prefix ? <Kbd className="quick-open__key">{prefix}</Kbd> : null}
      {label}
    </Toggle>
  );
}

/* ── Files ──────────────────────────────────────────────────────────── */

function FilesMode({
  term,
  entries,
  nodes,
  openIds,
  baseId,
  onOpen,
  onReveal,
  onCreate,
}: {
  term: string;
  entries: Array<{ node: FsNode; path: string }>;
  nodes: Record<string, FsNode>;
  openIds: string[];
  baseId: string | null;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onCreate: (path: string, type: NodeType) => void;
}) {
  const files = entries.filter((e) => e.node.type === "file");

  if (!term) {
    const recent = [...files].sort(
      (a, b) => b.node.updatedAt - a.node.updatedAt,
    );
    const tabs = openIds.flatMap((id) =>
      recent.filter((e) => e.node.id === id),
    );
    const rest = recent
      .filter((e) => !openIds.includes(e.node.id))
      .slice(0, MAX_FILES);
    return (
      <>
        <CommandEmpty>No files yet — type a name to create one.</CommandEmpty>
        {tabs.length ? (
          <CommandGroup heading="Open tabs">
            {tabs.map(({ node, path }) => (
              <FileItem
                key={node.id}
                node={node}
                path={path}
                isOpen
                onOpen={onOpen}
              />
            ))}
          </CommandGroup>
        ) : null}
        {rest.length ? (
          <CommandGroup heading="Recently edited">
            {rest.map(({ node, path }) => (
              <FileItem key={node.id} node={node} path={path} onOpen={onOpen} />
            ))}
          </CommandGroup>
        ) : null}
      </>
    );
  }

  const openBonus = (n: FsNode) => (openIds.includes(n.id) ? 50 : 0);
  const fileHits = rankNodes(files, term, openBonus).slice(0, MAX_FILES);
  const folderHits = rankNodes(
    entries.filter((e) => e.node.type === "folder"),
    term,
    () => 0,
  ).slice(0, MAX_FOLDERS);

  // A path already taken by the same kind of node is listed above — no row.
  const creates = createOptions(nodes, baseId, term).filter(
    (c) => !c.existingId,
  );
  const createGroup = creates.length ? (
    <CommandGroup
      heading={`Create in ${creates[0].location || "workspace root"}`}
    >
      {creates.map((c) => (
        <CreateItem
          key={`${c.type}:${c.path}`}
          option={c}
          onCreate={onCreate}
        />
      ))}
    </CommandGroup>
  ) : null;
  const nothingFound = !fileHits.length && !folderHits.length;

  return (
    <>
      <CommandEmpty>No matching files.</CommandEmpty>
      {/* With no match, Create goes first so Enter makes the file. */}
      {nothingFound ? createGroup : null}
      {fileHits.length ? (
        <CommandGroup heading="Files">
          {fileHits.map(({ item, nameIdx, pathIdx }) => (
            <FileItem
              key={item.node.id}
              node={item.node}
              path={item.path}
              nameIdx={nameIdx}
              pathIdx={pathIdx}
              isOpen={openIds.includes(item.node.id)}
              onOpen={onOpen}
            />
          ))}
        </CommandGroup>
      ) : null}
      {folderHits.length ? (
        <CommandGroup heading="Folders">
          {folderHits.map(({ item, nameIdx, pathIdx }) => (
            <CommandItem
              key={item.node.id}
              value={`folder:${item.node.id}`}
              data-testid={`quick-open-folder-item-${item.node.id}`}
              onSelect={() => onReveal(item.node.id)}
            >
              <FolderIcon open={false} />
              <span className="quick-open__label">
                <Highlight text={item.node.name} indices={nameIdx} />
              </span>
              <span className="quick-open__detail">
                {pathIdx ? (
                  <Highlight text={item.path} indices={pathIdx} />
                ) : (
                  parentOf(item.path)
                )}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {nothingFound ? null : createGroup}
    </>
  );
}

function FileItem({
  node,
  path,
  nameIdx,
  pathIdx,
  isOpen,
  onOpen,
}: {
  node: FsNode;
  path: string;
  nameIdx?: number[];
  pathIdx?: number[];
  isOpen?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <CommandItem
      value={`file:${node.id}`}
      data-testid={`quick-open-file-item-${node.id}`}
      onSelect={() => onOpen(node.id)}
    >
      <FileIcon name={node.name} />
      <span className="quick-open__label">
        <Highlight text={node.name} indices={nameIdx} />
      </span>
      {isOpen ? <span className="quick-open__badge">open</span> : null}
      <span className="quick-open__detail">
        {pathIdx ? <Highlight text={path} indices={pathIdx} /> : parentOf(path)}
      </span>
    </CommandItem>
  );
}

type CreateOption = {
  type: NodeType;
  path: string;
  name: string;
  location: string;
  newFolders: number;
  error: string | null;
  existingId: string | null;
};

/**
 * The create rows for a typed term: `notes` → `notes.md` + folder `notes`;
 * `notes.c` → `notes.csv`; `a/b/` → folder `a/b`. A path already taken by
 * the same kind of node gives an "open" row instead.
 */
function createOptions(
  nodes: Record<string, FsNode>,
  baseId: string | null,
  term: string,
): CreateOption[] {
  const folderOnly = term.endsWith("/");
  const slash = term.lastIndexOf("/", folderOnly ? term.length - 2 : undefined);
  const dir = term.slice(0, slash + 1);
  const leaf = term
    .slice(slash + 1)
    .replace(/\/$/, "")
    .trim();
  if (!leaf) return [];

  const make = (path: string, type: NodeType): CreateOption => {
    const plan = planCreate(nodes, baseId, path, type);
    return {
      type,
      path,
      name: plan.name,
      location: plan.location,
      newFolders: plan.folders.length,
      error: plan.error,
      existingId: plan.existingId,
    };
  };

  if (folderOnly) return [make(term, "folder")];

  // Every creatable format the typed name can still become: `notes` → all,
  // `notes.c` → `.csv`, `notes.md` (complete) → just itself.
  const completions = suggestFileNames(leaf);
  const files = completions.length
    ? completions.map((name) => make(dir + name, "file"))
    : [make(dir + leaf, "file")];
  // A dotted name is clearly a file; otherwise a folder is just as likely,
  // so it sits right under the default (.md) row.
  return leaf.includes(".")
    ? files
    : [files[0], make(dir + leaf, "folder"), ...files.slice(1)];
}

function CreateItem({
  option,
  onCreate,
}: {
  option: CreateOption;
  onCreate: (path: string, type: NodeType) => void;
}) {
  const isFile = option.type === "file";
  const qualifier = isFile
    ? `file-item-${extensionOf(option.name) || "none"}`
    : "folder-item";
  const extra = option.newFolders
    ? ` · +${option.newFolders} folder${option.newFolders > 1 ? "s" : ""}`
    : "";
  return (
    <CommandItem
      value={`create-${option.type}:${option.path}`}
      data-testid={`quick-open-create-${qualifier}`}
      disabled={Boolean(option.error)}
      onSelect={() => onCreate(option.path, option.type)}
    >
      {isFile ? (
        <FileIcon name={option.name} />
      ) : (
        <IconFolderPlus aria-hidden />
      )}
      <span className="quick-open__label">
        <strong className="quick-open__name">{option.name}</strong>
      </span>
      {option.error ? (
        <span
          className="quick-open__error"
          data-testid={`quick-open-create-${qualifier}-error-message`}
        >
          {option.error}
        </span>
      ) : (
        <span className="quick-open__detail">
          {isFile ? KIND_LABEL[kindOf(option.name)] : "Folder"}
          {extra}
        </span>
      )}
    </CommandItem>
  );
}

/* ── Commands ───────────────────────────────────────────────────────── */

function CommandsMode({
  term,
  commands,
  onRun,
}: {
  term: string;
  commands: PaletteCommand[];
  onRun: (fn: () => void) => void;
}) {
  const ranked = commands
    .flatMap((command) => {
      if (!term)
        return [{ command, score: 0, idx: undefined as number[] | undefined }];
      const byLabel = fuzzyMatch(term, command.label, { strict: true });
      if (byLabel)
        return [{ command, score: byLabel.score + 300, idx: byLabel.indices }];
      const byKeyword = command.keywords
        ? fuzzyMatch(term, command.keywords, { strict: true })
        : null;
      return byKeyword
        ? [{ command, score: byKeyword.score, idx: undefined }]
        : [];
    })
    .sort((a, b) => b.score - a.score);

  const groups = term
    ? [{ heading: "Commands", items: ranked }]
    : (["File", "Tabs", "Workspace"] as const).map((g) => ({
        heading: g,
        items: ranked.filter((r) => r.command.group === g),
      }));

  return (
    <>
      <CommandEmpty>No matching commands.</CommandEmpty>
      {groups.map((group) =>
        group.items.length ? (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.items.map(({ command, idx }) => (
              <CommandItem
                key={command.id}
                value={`cmd:${command.id}`}
                data-testid={`quick-open-command-item-${command.id}`}
                onSelect={() => onRun(command.run)}
              >
                <command.icon aria-hidden />
                <span className="quick-open__label">
                  <Highlight text={command.label} indices={idx} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null,
      )}
    </>
  );
}

/* ── Search in files ────────────────────────────────────────────────── */

function ContentMode({
  term,
  hits,
  busy,
  nodes,
  onOpen,
}: {
  term: string;
  hits: ReturnType<typeof useContentSearch>["hits"];
  busy: boolean;
  nodes: Record<string, FsNode>;
  onOpen: (id: string) => void;
}) {
  if (term.length < 2) {
    return (
      <div
        className="quick-open__notice"
        data-testid="quick-open-content-hint-message"
      >
        Type at least 2 characters to search inside your notes, code and data
        files. Word, Excel, PDF and secret files are skipped.
      </div>
    );
  }
  const files = new Set(hits.map((h) => h.fileId)).size;
  return (
    <>
      <CommandEmpty>
        {busy ? "Searching…" : "No matches inside files."}
      </CommandEmpty>
      {hits.length ? (
        <CommandGroup
          heading={`${hits.length} match${hits.length > 1 ? "es" : ""} in ${files} file${files > 1 ? "s" : ""}`}
        >
          {hits.map((hit) => {
            const node = nodes[hit.fileId];
            if (!node) return null;
            return (
              <CommandItem
                key={hit.id}
                value={`hit:${hit.id}`}
                data-testid={`quick-open-content-item-${hit.id}`}
                onSelect={() => onOpen(hit.fileId)}
              >
                <FileIcon name={node.name} />
                <span className="quick-open__label quick-open__label--fixed">
                  {node.name}
                  <span className="quick-open__line">:{hit.line}</span>
                </span>
                <span className="quick-open__snippet">
                  {hit.text.slice(0, hit.start)}
                  <mark className="quick-open__match">
                    {hit.text.slice(hit.start, hit.end)}
                  </mark>
                  {hit.text.slice(hit.end)}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}
    </>
  );
}

/* ── Help ───────────────────────────────────────────────────────────── */

const MOD =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl+";

const HELP = [
  {
    id: "files",
    prefix: "",
    icon: IconSearch,
    label: "Go to a file or folder",
    detail: `${MOD}P · type any part of a name or path`,
  },
  {
    id: "create",
    prefix: "",
    icon: IconFilePlus,
    label: "Create a file or folder",
    detail:
      "type notes/2026/todo — missing folders are made too; no extension = .md",
  },
  {
    id: "commands",
    prefix: ">",
    icon: IconCommand,
    label: "Run a command",
    detail: `${MOD}⇧P · rename, duplicate, download, close tabs…`,
  },
  {
    id: "content",
    prefix: "#",
    icon: IconFileSearch,
    label: "Search inside files",
    detail: `${MOD}⇧F · full-text across every text file`,
  },
] as const;

function HelpMode({ onPick }: { onPick: (query: string) => void }) {
  return (
    <CommandGroup heading="Modes">
      {HELP.map((h) => (
        <CommandItem
          key={h.id}
          value={`help:${h.id}`}
          data-testid={`quick-open-help-item-${h.id}`}
          onSelect={() => onPick(h.prefix)}
        >
          <h.icon aria-hidden />
          {h.prefix ? <Kbd className="quick-open__key">{h.prefix}</Kbd> : null}
          <span className="quick-open__label">{h.label}</span>
          <span className="quick-open__detail">{h.detail}</span>
        </CommandItem>
      ))}
      <CommandItem
        value="help:close"
        data-testid="quick-open-help-item-close"
        onSelect={() => onPick("")}
      >
        <IconHelp aria-hidden />
        <span className="quick-open__label">Back to files</span>
      </CommandItem>
    </CommandGroup>
  );
}
