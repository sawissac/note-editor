import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronDown,
  IconDownload,
  IconEye,
  IconChevronUp,
  IconFileExport,
  IconGripVertical,
  IconLoader2,
} from "@tabler/icons-react";
import * as React from "react";

import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { FileIcon } from "@/lib/file-icons";
import { type FileKind, KIND_LABEL, kindOf } from "@/lib/file-types";
import { downloadFile } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import type {
  ExportOptions,
  ExportProgress,
  ExportResult,
} from "@/lib/unified-export/pdf";
import { useAppDispatch, useAppSelector } from "@/store";
import type { FsNode } from "@/store/fs-slice";
import { getPath, selectChildrenMap } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";
import { saveOpenEditors } from "@/features/editors/pane-context";

const PDFViewer = React.lazy(() =>
  import("@/components/extend/pdf-viewer").then((m) => ({
    default: m.PDFViewer,
  })),
);

/** A generated PDF, reused while the selection and options stay the same. */
type Built = {
  key: string;
  bytes: Uint8Array;
  url: string;
  fileName: string;
  failures: ExportResult["failures"];
};

/** Kinds the unified export can convert. */
const EXPORTABLE: ReadonlySet<FileKind> = new Set([
  "markdown",
  "text",
  "docx",
  "csv",
  "xlsx",
  "schema",
  "mermaid",
  "pdf",
]);

/** How each kind lands in the PDF — shown beside the file. */
const RESULT_LABEL: Record<FileKind, string> = {
  markdown: "Text",
  text: "Text",
  docx: "Text",
  csv: "Table",
  xlsx: "Tables",
  schema: "Table",
  mermaid: "Image",
  pdf: "Pages",
};

type Row = { node: FsNode; kind: FileKind; path: string };

type Status =
  | { state: "idle" }
  | { state: "running"; progress: ExportProgress }
  | { state: "done"; failures: ExportResult["failures"]; fileName: string }
  | { state: "error"; error: string };

/**
 * Unified export: pick files, drag them into order, and download them as one
 * PDF. Text formats share one font and size (Markdown and Word pictures are
 * embedded); CSV, Excel and JSON Schema
 * become tables; Mermaid diagrams become images; PDFs are appended as-is.
 */
export function UnifiedExportDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.unifiedExportOpen);
  const nodes = useAppSelector((s) => s.fs.nodes);
  const childrenMap = useAppSelector(selectChildrenMap);

  // Every exportable file, in explorer order (folders first, A→Z).
  const available = React.useMemo(() => {
    const out: Row[] = [];
    const walk = (key: string) => {
      for (const node of childrenMap.get(key) ?? []) {
        if (node.type === "folder") walk(node.id);
        else {
          const kind = kindOf(node.name);
          if (EXPORTABLE.has(kind)) {
            out.push({ node, kind, path: getPath(nodes, node.id).join(" / ") });
          }
        }
      }
    };
    walk("");
    return out;
  }, [childrenMap, nodes]);

  const [order, setOrder] = React.useState<string[]>([]);
  /** Once the user reorders, keep their order; until then follow the tree. */
  const [customOrder, setCustomOrder] = React.useState(false);
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set());
  const [pageSize, setPageSize] =
    React.useState<ExportOptions["pageSize"]>("a4");
  const [contents, setContents] = React.useState(true);
  const [title, setTitle] = React.useState("Unified export");
  const [status, setStatus] = React.useState<Status>({ state: "idle" });
  const [view, setView] = React.useState<"pick" | "preview">("pick");
  const [built, setBuilt] = React.useState<Built | null>(null);

  // Follow explorer order until the user sorts; after that keep their order,
  // appending new files and dropping deleted ones.
  React.useEffect(() => {
    const ids = new Set(available.map((r) => r.node.id));
    setOrder((prev) => {
      if (!customOrder) return available.map((r) => r.node.id);
      const kept = prev.filter((id) => ids.has(id));
      const keptSet = new Set(kept);
      const added = available
        .map((r) => r.node.id)
        .filter((id) => !keptSet.has(id));
      return [...kept, ...added];
    });
    setChecked((prev) => new Set([...prev].filter((id) => ids.has(id))));
  }, [available, customOrder]);

  const byId = React.useMemo(
    () => new Map(available.map((r) => [r.node.id, r])),
    [available],
  );
  const rows = order
    .map((id) => byId.get(id))
    .filter((r): r is Row => Boolean(r));
  const selected = rows.filter((r) => checked.has(r.node.id));
  const running = status.state === "running";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const move = (id: string, delta: number) => {
    setCustomOrder(true);
    setOrder((prev) => {
      const from = prev.indexOf(id);
      const to = from + delta;
      return to < 0 || to >= prev.length ? prev : arrayMove(prev, from, to);
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setCustomOrder(true);
    setOrder((prev) =>
      arrayMove(
        prev,
        prev.indexOf(String(active.id)),
        prev.indexOf(String(over.id)),
      ),
    );
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fileTitle = title.trim() || "Unified export";
  const buildKey = JSON.stringify([
    selected.map((r) => r.node.id),
    pageSize,
    contents,
    fileTitle,
  ]);

  // Drop the cached PDF (and its blob URL) when the dialog closes, so the next
  // export reads the files' latest contents.
  React.useEffect(() => {
    if (open || !built) return;
    URL.revokeObjectURL(built.url);
    setBuilt(null);
    setView("pick");
  }, [open, built]);

  /** Builds the PDF, or reuses the last one if nothing changed since. */
  const build = async (): Promise<Built | null> => {
    if (!selected.length) return null;
    if (built?.key === buildKey) return built;
    setStatus({
      state: "running",
      progress: {
        index: 0,
        total: selected.length,
        name: selected[0].node.name,
      },
    });
    try {
      // DOCX / XLSX / PDF editors only write to storage on Save — flush the
      // open one so unsaved edits (e.g. a just-inserted image) are exported.
      await saveOpenEditors(selected.map((r) => r.node.id));
      const { buildUnifiedPdf } = await import("@/lib/unified-export/pdf");
      const result = await buildUnifiedPdf(
        selected.map((r) => ({
          id: r.node.id,
          name: r.node.name,
          path: r.path,
          kind: r.kind,
        })),
        { pageSize, contents, title: fileTitle },
        (progress) => setStatus({ state: "running", progress }),
      );
      const next: Built = {
        key: buildKey,
        bytes: result.bytes,
        url: URL.createObjectURL(
          new Blob([result.bytes.slice()], { type: "application/pdf" }),
        ),
        fileName: `${fileTitle.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`,
        failures: result.failures,
      };
      setBuilt((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return next;
      });
      setStatus({ state: "idle" });
      return next;
    } catch (error) {
      console.error(error);
      setStatus({
        state: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const download = (pdf: Built) => {
    downloadFile(pdf.fileName, pdf.bytes.slice().buffer, "application/pdf");
    setStatus({
      state: "done",
      failures: pdf.failures,
      fileName: pdf.fileName,
    });
  };

  const runExport = async () => {
    const pdf = await build();
    if (pdf) download(pdf);
  };

  const runPreview = async () => {
    const pdf = await build();
    if (pdf) setView("preview");
  };

  const close = () => {
    dispatch(uiActions.unifiedExportSet(false));
    setStatus({ state: "idle" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (next) dispatch(uiActions.unifiedExportSet(true));
        else close();
      }}
    >
      <DialogContent
        className={cn(
          "flex flex-col",
          view === "preview"
            ? "h-[min(960px,92vh)] w-[min(1100px,96vw)]"
            : "max-h-[min(720px,90vh)] w-[min(640px,94vw)]",
        )}
        data-testid="unified-export-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {view === "preview" && built
              ? `Preview · ${built.fileName}`
              : "Unified export"}
          </DialogTitle>
        </DialogHeader>
        {view === "preview" && built ? (
          <>
            <DialogBody className="flex min-h-0 flex-1 flex-col gap-2 p-0">
              {built.failures.length ? (
                <ul
                  data-testid="unified-export-dialog-failure-list"
                  className="border-app-border font-description text-app-warn flex flex-col gap-0.5 border-b px-3 py-2 text-[11px]"
                >
                  {built.failures.map((f) => (
                    <li key={f.name}>
                      {f.name}: {f.error} — a note was added in its place.
                    </li>
                  ))}
                </ul>
              ) : null}
              <div
                data-testid="unified-export-dialog-preview-content"
                className="min-h-0 flex-1"
              >
                <React.Suspense
                  fallback={
                    <p className={cn(ui.help, "p-6 text-center")}>
                      Loading preview…
                    </p>
                  }
                >
                  <PDFViewer
                    key={built.url}
                    className="h-full"
                    src={built.url}
                    fileName={built.fileName}
                    showUpload={false}
                    showDownload={false}
                  />
                </React.Suspense>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="outline"
                data-testid="unified-export-dialog-back-button"
                onClick={() => setView("pick")}
              >
                <IconArrowLeft className="size-3.5" />
                Back
              </Button>
              <button
                type="button"
                data-testid="unified-export-dialog-download-button"
                className={ui.solidBtn}
                onClick={() => download(built)}
              >
                <IconDownload className="size-3.5" />
                Download PDF
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="flex min-h-0 flex-col gap-3">
              <DialogDescription className={ui.help}>
                Tick the files to include and drag them into order. They are
                joined into one PDF, each starting on a new page: Markdown, Word
                and text share one font and size, with their pictures kept; CSV,
                Excel and JSON Schema become tables; Mermaid diagrams become
                images; PDFs are appended as they are.
              </DialogDescription>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className={ui.fieldLabel}>Title</span>
                  <input
                    data-testid="unified-export-dialog-title-input"
                    className={ui.input}
                    value={title}
                    disabled={running}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className={ui.fieldLabel}>Page size</span>
                  <ButtonGroup role="radiogroup" aria-label="Page size">
                    {(["a4", "letter"] as const).map((size) => (
                      <Button
                        key={size}
                        variant="outline"
                        size="sm"
                        role="radio"
                        aria-checked={pageSize === size}
                        data-active={pageSize === size || undefined}
                        data-testid={`unified-export-dialog-page-size-${size}-button`}
                        disabled={running}
                        onClick={() => setPageSize(size)}
                        className={cn(ui.paneToolbarBtn, "h-8")}
                      >
                        {size === "a4" ? "A4" : "Letter"}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                <label className="font-description text-app-text flex h-8 items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    data-testid="unified-export-dialog-contents-checkbox"
                    className="size-3.5 accent-(--app-accent)"
                    checked={contents}
                    disabled={running}
                    onChange={(e) => setContents(e.target.checked)}
                  />
                  Contents page
                </label>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className={ui.meta}
                  data-testid="unified-export-dialog-count-message"
                >
                  {selected.length} of {rows.length} selected
                </span>
                <div className="flex gap-1.5">
                  {customOrder ? (
                    <button
                      type="button"
                      data-testid="unified-export-dialog-reset-order-button"
                      className={cn(ui.ghostBtn, "h-7")}
                      disabled={running}
                      title="Back to the explorer's order"
                      onClick={() => setCustomOrder(false)}
                    >
                      Reset order
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="unified-export-dialog-select-all-button"
                    className={cn(ui.ghostBtn, "h-7")}
                    disabled={running || !rows.length}
                    onClick={() =>
                      setChecked(new Set(rows.map((r) => r.node.id)))
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    data-testid="unified-export-dialog-clear-button"
                    className={cn(ui.ghostBtn, "h-7")}
                    disabled={running || !checked.size}
                    onClick={() => setChecked(new Set())}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {rows.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={order}
                    strategy={verticalListSortingStrategy}
                  >
                    <ol
                      data-testid="unified-export-dialog-list"
                      aria-label="Files to export, in order"
                      className="divide-app-border border-app-border min-h-0 flex-1 divide-y overflow-y-auto rounded-md border"
                    >
                      {rows.map((row, index) => (
                        <UnifiedExportRow
                          key={row.node.id}
                          row={row}
                          checked={checked.has(row.node.id)}
                          position={
                            checked.has(row.node.id)
                              ? selected.indexOf(row) + 1
                              : null
                          }
                          disabled={running}
                          isFirst={index === 0}
                          isLast={index === rows.length - 1}
                          onToggle={() => toggle(row.node.id)}
                          onMove={(delta) => move(row.node.id, delta)}
                        />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              ) : (
                <p
                  data-testid="unified-export-dialog-empty-message"
                  className={cn(
                    ui.help,
                    "border-app-border rounded-md border border-dashed p-6 text-center",
                  )}
                >
                  No exportable files yet — create or import Markdown, text,
                  Word, CSV, Excel, JSON Schema, Mermaid or PDF files.
                </p>
              )}

              <ExportStatus status={status} />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="outline"
                data-testid="unified-export-dialog-cancel-button"
                disabled={running}
                onClick={close}
              >
                Close
              </Button>
              <Button
                variant="outline"
                data-testid="unified-export-dialog-preview-button"
                disabled={running || !selected.length}
                onClick={() => void runPreview()}
              >
                <IconEye className="size-3.5" />
                Preview
              </Button>
              <button
                type="button"
                data-testid="unified-export-dialog-export-button"
                className={cn(
                  ui.solidBtn,
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
                disabled={running || !selected.length}
                onClick={() => void runExport()}
              >
                {running ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconFileExport className="size-3.5" />
                )}
                Export PDF
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportStatus({ status }: { status: Status }) {
  if (status.state === "running") {
    const { index, total, name } = status.progress;
    return (
      <Progress
        data-testid="unified-export-dialog-progress"
        size="sm"
        value={index}
        max={total}
        label={
          name
            ? `Converting ${Math.min(index + 1, total)} of ${total} · ${name}`
            : "Writing PDF…"
        }
      />
    );
  }
  if (status.state === "error") {
    return (
      <p
        role="alert"
        data-testid="unified-export-dialog-error-message"
        className="font-description text-app-error flex items-center gap-1.5 text-[12px]"
      >
        <IconAlertTriangle className="size-3.5 shrink-0" />
        Export failed: {status.error}
      </p>
    );
  }
  if (status.state === "done") {
    return (
      <div
        data-testid="unified-export-dialog-result-message"
        className="flex flex-col gap-1"
      >
        <p className="font-description text-app-success text-[12px]">
          Downloaded {status.fileName}.
        </p>
        {status.failures.length ? (
          <ul className="font-description text-app-warn flex flex-col gap-0.5 text-[11px]">
            {status.failures.map((f) => (
              <li key={f.name}>
                {f.name}: {f.error} — a note was added in its place.
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  return null;
}

function UnifiedExportRow({
  row,
  checked,
  position,
  disabled,
  isFirst,
  isLast,
  onToggle,
  onMove,
}: {
  row: Row;
  checked: boolean;
  /** 1-based position in the export, when ticked. */
  position: number | null;
  disabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMove: (delta: number) => void;
}) {
  const id = row.node.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <li
      ref={setNodeRef}
      data-testid={`unified-export-row-${id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group bg-app-panel flex items-center gap-2 px-2 py-1.5",
        isDragging && "ring-app-border-accent relative z-10 shadow-sm ring-1",
        !checked && "bg-app-bg",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-testid={`unified-export-row-drag-handle-${id}`}
        aria-label={`Reorder ${row.node.name}`}
        className="text-app-dim hover:text-app-bright flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical className="size-3.5" />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid={`unified-export-row-checkbox-${id}`}
          className="size-3.5 shrink-0 accent-(--app-accent)"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <FileIcon name={row.node.name} />
        <span className={cn("flex min-w-0 flex-col", !checked && "opacity-60")}>
          <span className="font-description text-app-bright truncate text-[12px]">
            {row.node.name}
          </span>
          <span className="text-app-dim truncate font-mono text-[10px]">
            {row.path}
          </span>
        </span>
      </label>
      <span
        className={cn(
          "border-app-border text-app-dim shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]",
          !checked && "opacity-60",
        )}
        title={`${KIND_LABEL[row.kind]} → ${RESULT_LABEL[row.kind]}`}
      >
        {RESULT_LABEL[row.kind]}
      </span>
      <span className="text-app-accent w-6 shrink-0 text-right font-mono text-[10px]">
        {position ?? ""}
      </span>
      <div className="flex shrink-0">
        <button
          type="button"
          data-testid={`unified-export-row-move-up-button-${id}`}
          aria-label={`Move ${row.node.name} up`}
          className={cn(ui.iconBtn, "size-6")}
          disabled={disabled || isFirst}
          onClick={() => onMove(-1)}
        >
          <IconChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          data-testid={`unified-export-row-move-down-button-${id}`}
          aria-label={`Move ${row.node.name} down`}
          className={cn(ui.iconBtn, "size-6")}
          disabled={disabled || isLast}
          onClick={() => onMove(1)}
        >
          <IconChevronDown className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
