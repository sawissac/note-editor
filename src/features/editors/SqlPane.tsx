import {
  IconAlertTriangle,
  IconLoader2,
  IconPlayerPlay,
  IconTable,
  IconTableOff,
} from "@tabler/icons-react";
import * as React from "react";
import type { QueryExecResult, SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { Button } from "@/components/ui/button";
import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { CodeEditorApi } from "@/features/editors/CodeEditor";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/** Rows drawn per result set; the rest are counted, not rendered. */
const MAX_ROWS = 1000;

let sqlite: Promise<SqlJsStatic> | null = null;
/** SQLite (sql.js, WebAssembly) — fetched on the first Run only. */
function loadSqlite() {
  sqlite ??= import("sql.js").then((m) =>
    m.default({ locateFile: () => wasmUrl }),
  );
  return sqlite;
}

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      results: QueryExecResult[];
      changes: number;
      ms: number;
      scope: "selection" | "file";
    }
  | { status: "error"; message: string; scope: "selection" | "file" };

/**
 * SQL scratchpad: Monaco SQL editor above, results below. Run (⌘/Ctrl+Enter)
 * executes the selection — or the whole file — in a fresh in-memory SQLite
 * database, so each run is reproducible: create, fill and query in one go.
 */
export default function SqlPane({
  id,
  content,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const textRef = React.useRef(text);
  const [focusOnMount] = React.useState(autoFocus);
  const [run, setRun] = React.useState<RunState>({ status: "idle" });
  // Results panel starts hidden; Run reveals it, the toggle hides it again.
  const [showResults, setShowResults] = React.useState(false);
  const apiRef = React.useRef<CodeEditorApi | null>(null);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  const execute = React.useCallback(async () => {
    const selected = apiRef.current?.selectedText().trim() ?? "";
    const scope = selected ? "selection" : "file";
    const sql = selected || textRef.current;
    if (!sql.trim()) return;
    setShowResults(true);
    setRun({ status: "running" });
    try {
      const SQL = await loadSqlite();
      const db = new SQL.Database();
      try {
        const started = performance.now();
        const results = db.exec(sql);
        const ms = performance.now() - started;
        setRun({
          status: "done",
          results,
          changes: db.getRowsModified(),
          ms,
          scope,
        });
      } finally {
        db.close();
      }
    } catch (error) {
      setRun({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        scope,
      });
    }
  }, []);

  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";

  return (
    <>
      <FileBarSlot>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          title={`Run the selection, or the whole file (${mod}Enter)`}
          disabled={run.status === "running"}
          data-testid="sql-pane-run-button"
          onClick={() => void execute()}
        >
          {run.status === "running" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconPlayerPlay className="size-3.5" />
          )}
          Run
          <span className="text-app-dim">{mod}↵</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0")}
          data-active={showResults || undefined}
          aria-pressed={showResults}
          aria-label={showResults ? "Hide results" : "Show results"}
          title={showResults ? "Hide results" : "Show results"}
          data-testid="sql-pane-results-toggle-button"
          onClick={() => setShowResults((v) => !v)}
        >
          {showResults ? (
            <IconTable aria-hidden className="pane-icon" />
          ) : (
            <IconTableOff aria-hidden className="pane-icon" />
          )}
        </Button>
      </FileBarSlot>
      <ResizableGroup orientation="vertical">
        <ResizablePanel id="sql-source" defaultSize="60%" minSize="120px">
          <LazyCodeEditor
            path={`${id}.sql`}
            language="sql"
            aria-label="SQL source"
            data-testid="sql-pane-source-input"
            autoFocus={focusOnMount}
            defaultValue={text}
            apiRef={apiRef}
            onRun={() => void execute()}
            onChange={(value) => {
              textRef.current = value;
              setText(value);
              save(value);
            }}
          />
        </ResizablePanel>
        {showResults ? (
          <>
            <ResizableHandle />
            <ResizablePanel id="sql-results" defaultSize="40%" minSize="80px">
              <SqlResults run={run} mod={mod} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizableGroup>
    </>
  );
}

function SqlResults({ run, mod }: { run: RunState; mod: string }) {
  if (run.status === "idle" || run.status === "running") {
    return (
      <div
        className="bg-app-panel flex h-full items-center justify-center p-4"
        data-testid="sql-pane-idle-message"
      >
        <p className={cn(ui.help, "max-w-sm text-center")}>
          {run.status === "running"
            ? "Running…"
            : `Press ${mod}Enter or Run. The selection — or the whole file — runs in a fresh in-memory SQLite database.`}
        </p>
      </div>
    );
  }
  if (run.status === "error") {
    return (
      <div className="bg-app-panel h-full overflow-auto p-4">
        <p
          className="text-app-error flex items-start gap-2 font-mono text-[12px]"
          data-testid="sql-pane-error-message"
        >
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          {run.message}
        </p>
      </div>
    );
  }
  const summary = `${run.scope === "selection" ? "Selection" : "File"} ran in ${
    run.ms < 1 ? "<1" : Math.round(run.ms)
  } ms · ${run.results.length} result ${run.results.length === 1 ? "set" : "sets"} · ${
    run.changes
  } ${run.changes === 1 ? "row" : "rows"} changed`;
  return (
    <div
      className="bg-app-panel flex h-full min-h-0 flex-col"
      data-testid="sql-pane-results"
    >
      <div
        className={cn(
          ui.meta,
          "border-app-border shrink-0 border-b px-3 py-1.5",
        )}
        data-testid="sql-pane-summary-message"
      >
        {summary}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {run.results.length === 0 ? (
          <p className={ui.help}>No statement returned rows.</p>
        ) : (
          run.results.map((result, i) => (
            <ResultTable key={i} result={result} index={i} />
          ))
        )}
      </div>
    </div>
  );
}

function ResultTable({
  result,
  index,
}: {
  result: QueryExecResult;
  index: number;
}) {
  const rows = result.values;
  return (
    <div data-testid={`sql-pane-result-${index + 1}-table`}>
      <div className={cn(ui.meta, "mb-1")}>
        Result {index + 1} · {rows.length} {rows.length === 1 ? "row" : "rows"}
        {rows.length > MAX_ROWS ? ` (showing ${MAX_ROWS})` : ""}
      </div>
      <div className="border-app-border overflow-auto rounded-md border">
        <table className="w-full border-collapse font-mono text-[12px]">
          <thead className="bg-app-sidebar sticky top-0">
            <tr>
              {result.columns.map((c, ci) => (
                <th
                  key={ci}
                  className="border-app-border text-app-bright border-b px-2 py-1 text-left font-semibold"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, MAX_ROWS).map((row, ri) => (
              <tr key={ri} className="odd:bg-app-bg/50">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "border-app-border max-w-[28rem] truncate border-b px-2 py-1",
                      cell === null
                        ? "text-app-dim italic"
                        : typeof cell === "number"
                          ? "text-app-warn text-right tabular-nums"
                          : "text-app-text",
                    )}
                  >
                    {cell === null
                      ? "NULL"
                      : cell instanceof Uint8Array
                        ? `<blob ${cell.byteLength} B>`
                        : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
