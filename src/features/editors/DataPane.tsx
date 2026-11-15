import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFoldDown,
  IconFoldUp,
  IconTool,
  IconWand,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type DataKind,
  formatData,
  parseData,
  type ParseResult,
} from "@/lib/data-formats";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { type TabMode, tabsActions } from "@/store/tabs-slice";
import type {
  CodeEditorApi,
  EditorMarker,
} from "@/features/editors/CodeEditor";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

const LANGUAGE = { json: "json", yaml: "yaml", toml: "toml" } as const;

/** Re-parse at most this often while typing. */
const PARSE_DELAY = 150;

/**
 * JSON, YAML and TOML files. Edit: Monaco with the first parse error
 * underlined and a Format button (JSON / YAML). View: a collapsible tree of
 * the parsed data.
 */
export default function DataPane({
  id,
  content,
  mode,
  autoFocus,
  registerSave,
  kind,
}: PaneProps & { mode: TabMode; kind: DataKind }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const [focusOnMount] = React.useState(autoFocus);
  const apiRef = React.useRef<CodeEditorApi | null>(null);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  const parsed = useDeferredParse(kind, text);
  // Monaco's own JSON service already marks JSON errors.
  const markers = React.useMemo<EditorMarker[] | undefined>(
    () => (kind !== "json" && !parsed.ok ? [{ ...parsed.problem }] : undefined),
    [kind, parsed],
  );
  const canFormat = kind !== "toml";

  const bar = (
    <FileBarSlot>
      <ParseStatus result={parsed} testId="data-pane-status-message" />
      {mode === "edit" && canFormat ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!parsed.ok || !text.trim()}
          title="Reformat the whole file"
          data-testid="data-pane-format-button"
          onClick={() => {
            const next = formatData(kind, text);
            if (next !== null) apiRef.current?.replaceAll(next);
          }}
        >
          <IconWand className="size-3.5" />
          Format
        </Button>
      ) : null}
    </FileBarSlot>
  );

  if (mode === "view") {
    return (
      <>
        {bar}
        {parsed.ok ? (
          <DataTree value={parsed.value} />
        ) : (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
            data-testid="data-pane-error-message"
          >
            <p className="font-title text-app-bright text-sm font-semibold">
              This file has a syntax error
            </p>
            <p className={cn(ui.help, "max-w-md")}>
              Line {parsed.problem.line}, column {parsed.problem.column}:{" "}
              {parsed.problem.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              data-testid="data-pane-edit-button"
              onClick={() =>
                dispatch(tabsActions.modeSet({ id, mode: "edit" }))
              }
            >
              <IconTool />
              Fix in the editor
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {bar}
      <LazyCodeEditor
        path={`${id}.${kind}`}
        language={LANGUAGE[kind]}
        aria-label={`${kind.toUpperCase()} source`}
        data-testid="data-pane-source-input"
        autoFocus={focusOnMount}
        defaultValue={text}
        markers={markers}
        apiRef={apiRef}
        onChange={(value) => {
          setText(value);
          save(value);
        }}
      />
    </>
  );
}

/** Parses on a short delay so large files stay smooth while typing. */
function useDeferredParse(kind: DataKind, text: string) {
  const [result, setResult] = React.useState<ParseResult>(() =>
    parseData(kind, text),
  );
  React.useEffect(() => {
    const timer = setTimeout(
      () => setResult(parseData(kind, text)),
      PARSE_DELAY,
    );
    return () => clearTimeout(timer);
  }, [kind, text]);
  return result;
}

export function ParseStatus({
  result,
  testId,
}: {
  result: ParseResult;
  testId: string;
}) {
  return result.ok ? (
    <span
      className="text-app-success flex items-center gap-1 text-[11px]"
      data-testid={testId}
    >
      <IconCheck className="size-3.5" />
      Valid
    </span>
  ) : (
    <span
      className="text-app-error flex max-w-[22rem] items-center gap-1 truncate text-[11px]"
      title={result.problem.message}
      data-testid={testId}
    >
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span className="truncate">
        Line {result.problem.line}: {result.problem.message}
      </span>
    </span>
  );
}

/* ───────────────────────────── Tree ───────────────────────────── */

type Container = Record<string, unknown> | unknown[];
const isContainer = (v: unknown): v is Container =>
  typeof v === "object" && v !== null && !(v instanceof Date);

/** Children rendered per "show more" step — keeps huge arrays instant. */
const PAGE = 200;

function DataTree({ value }: { value: unknown }) {
  // Paths of expanded containers; the root and its children start open.
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(["$"]));
  const toggle = React.useCallback((path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expandAll = () => {
    const paths = new Set<string>();
    const walk = (v: unknown, path: string) => {
      if (!isContainer(v) || paths.size > 5000) return;
      paths.add(path);
      for (const [k, child] of entries(v).slice(0, PAGE))
        walk(child, childPath(path, k, v));
    };
    walk(value, "$");
    setOpen(paths);
  };

  if (value === undefined) {
    return (
      <p className={cn(ui.help, "p-6")} data-testid="data-tree-empty-message">
        This file is empty.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="data-tree">
      <div className="border-app-border flex shrink-0 gap-1 border-b px-3 py-1.5">
        <Button
          variant="ghost"
          size="xs"
          data-testid="data-tree-expand-button"
          title="Open every object and array"
          onClick={expandAll}
        >
          <IconFoldDown />
          Expand all
        </Button>
        <Button
          variant="ghost"
          size="xs"
          data-testid="data-tree-collapse-button"
          title="Close everything below the top level"
          onClick={() => setOpen(new Set(["$"]))}
        >
          <IconFoldUp />
          Collapse all
        </Button>
      </div>
      <div
        role="tree"
        className="min-h-0 flex-1 overflow-auto px-2 py-2 font-mono text-[12px] leading-[22px]"
      >
        <TreeNode
          name={null}
          value={value}
          path="$"
          depth={0}
          open={open}
          onToggle={toggle}
        />
      </div>
    </div>
  );
}

function entries(v: Container): Array<[string, unknown]> {
  return Array.isArray(v)
    ? v.map((item, i) => [String(i), item])
    : Object.entries(v);
}

function childPath(parent: string, key: string, container: Container) {
  return Array.isArray(container)
    ? `${parent}[${key}]`
    : /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${parent}.${key}`
      : `${parent}[${JSON.stringify(key)}]`;
}

const TreeNode = React.memo(function TreeNode({
  name,
  value,
  path,
  depth,
  open,
  onToggle,
}: {
  name: string | null;
  value: unknown;
  path: string;
  depth: number;
  open: Set<string>;
  onToggle: (path: string) => void;
}) {
  const [limit, setLimit] = React.useState(PAGE);
  const container = isContainer(value);
  const expanded = container && (open.has(path) || depth === 0);
  const list = container ? entries(value) : [];
  const indent = { paddingLeft: depth * 16 };

  return (
    <div role="treeitem" aria-expanded={container ? expanded : undefined}>
      <div
        className="group hover:bg-app-hover flex items-center gap-1 rounded px-1"
        style={indent}
        onClick={() => container && depth > 0 && onToggle(path)}
      >
        <span className="text-app-dim flex size-4 shrink-0 items-center justify-center">
          {container && depth > 0 ? (
            <IconChevronRight
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-90",
              )}
            />
          ) : null}
        </span>
        {name !== null ? (
          <>
            <span className="text-app-accent">{name}</span>
            <span className="text-app-dim">:</span>
          </>
        ) : null}
        {container ? (
          <span className="text-app-dim">
            {Array.isArray(value) ? `[${list.length}]` : `{${list.length}}`}
          </span>
        ) : (
          <ScalarValue value={value} />
        )}
        <CopyButton value={value} path={path} />
      </div>
      {expanded ? (
        <div role="group">
          {list.slice(0, limit).map(([key, child]) => (
            <TreeNode
              key={key}
              name={key}
              value={child}
              path={childPath(path, key, value as Container)}
              depth={depth + 1}
              open={open}
              onToggle={onToggle}
            />
          ))}
          {list.length > limit ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-app-accent h-5 px-1 text-[11px]"
              style={{ marginLeft: (depth + 1) * 16 + 20 }}
              onClick={() => setLimit((l) => l + PAGE)}
            >
              <IconChevronDown aria-hidden className="size-3" />
              Show {Math.min(PAGE, list.length - limit)} more of{" "}
              {list.length - limit}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function ScalarValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return (
      <span className="text-app-success truncate" title={value}>
        "{value}"
      </span>
    );
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return <span className="text-app-warn">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-fuchsia-600">{String(value)}</span>;
  }
  if (value instanceof Date) {
    return <span className="text-app-warn">{value.toISOString()}</span>;
  }
  return <span className="text-app-dim italic">null</span>;
}

function CopyButton({ value, path }: { value: unknown; path: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn("text-app-dim hover:text-app-accent ml-1 size-5", ui.reveal)}
      aria-label={`Copy value at ${path}`}
      title={`Copy value (${path})`}
      onClick={(e) => {
        e.stopPropagation();
        const text =
          typeof value === "string" ? value : JSON.stringify(value, null, 2);
        void navigator.clipboard.writeText(text ?? "").then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1000);
        });
      }}
    >
      {done ? (
        <IconCheck className="size-3" />
      ) : (
        <IconCopy className="size-3" />
      )}
    </Button>
  );
}
