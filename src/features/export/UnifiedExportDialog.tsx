import "@/styles/unified-export.css";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
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
  IconAlignLeft,
  IconArrowBackUp,
  IconArrowLeft,
  IconChecks,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
  IconCode,
  IconDownload,
  IconEye,
  IconFileExport,
  IconFilePlus,
  IconFiles,
  IconGripVertical,
  IconLoader2,
  IconPhoto,
  IconSettings,
  IconSquareOff,
  IconTable,
  IconUpload,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import * as React from "react";

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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useDragSensors } from "@/lib/dnd-sensors";
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
import { fsActions, type FsNode } from "@/store/fs-slice";
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
  "calendar",
  "kanban",
  "json",
  "yaml",
  "toml",
  "sql",
  "env",
  "apikeys",
  "prompt",
  "regex",
  "diff",
  "qr",
  "timer",
  "random",
  "bookmark",
  "pptx",
  "chat",
  "pdf",
  "image",
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
  calendar: "Table",
  kanban: "Table",
  json: "Code",
  yaml: "Code",
  toml: "Code",
  sql: "Code",
  env: "Code (masked)",
  apikeys: "Code (masked)",
  prompt: "Code",
  regex: "Code",
  diff: "Code",
  qr: "Image",
  timer: "Table",
  random: "Text",
  bookmark: "Table",
  pptx: "Images",
  chat: "Text",
  appinfo: "Not exported",
  appstate: "Not exported",
  pdf: "Pages",
  image: "Image",
};

/** Coarse result buckets for the summary and the empty-state legend. */
const RESULT_GROUPS = ["Text", "Table", "Image", "Code", "Pages"] as const;
type ResultGroup = (typeof RESULT_GROUPS)[number];

const GROUP_ICON: Record<ResultGroup, Icon> = {
  Text: IconAlignLeft,
  Table: IconTable,
  Image: IconPhoto,
  Code: IconCode,
  Pages: IconFiles,
};

function resultGroup(kind: FileKind): ResultGroup {
  const label = RESULT_LABEL[kind];
  if (label.startsWith("Table")) return "Table";
  if (label.startsWith("Code")) return "Code";
  if (label === "Image" || label === "Pages") return label;
  return "Text";
}

const EXPORTABLE_KINDS = [...EXPORTABLE];

const PAGE_SIZES: Array<{
  id: ExportOptions["pageSize"];
  label: string;
  dims: string;
  title: string;
}> = [
  { id: "a4", label: "A4", dims: "210 × 297 mm", title: "A4 — 210 × 297 mm" },
  {
    id: "letter",
    label: "Letter",
    dims: "8.5 × 11 in",
    title: "US Letter — 8.5 × 11 in",
  },
];

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

  const sensors = useDragSensors(
    { coordinateGetter: sortableKeyboardCoordinates },
    4,
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
        {
          pageSize,
          contents,
          title: fileTitle,
          pathOf: (id) =>
            nodes[id] ? getPath(nodes, id).join("/") : undefined,
        },
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

  /** What the ticked files turn into, e.g. 2 Text · 1 Table. */
  const outcome = React.useMemo(() => {
    const counts = new Map<ResultGroup, number>();
    for (const r of selected) {
      const g = resultGroup(r.kind);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return RESULT_GROUPS.filter((g) => counts.has(g)).map((g) => ({
      group: g,
      count: counts.get(g) ?? 0,
    }));
  }, [selected]);

  const startNote = () => {
    close();
    dispatch(uiActions.sidebarSet(true));
    dispatch(
      fsActions.draftStarted({
        mode: "create",
        nodeType: "file",
        parentId: null,
      }),
    );
  };
  const startImport = () => {
    close();
    dispatch(uiActions.importOpened(null));
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
            : "max-h-[min(780px,92vh)] w-[min(680px,94vw)]",
        )}
        data-testid="unified-export-dialog"
      >
        <DialogHeader>
          <div className="unified-export__heading">
            <span className="unified-export__heading-icon" aria-hidden>
              {view === "preview" ? <IconEye /> : <IconFileExport />}
            </span>
            <span className="unified-export__heading-text">
              <DialogTitle>
                {view === "preview" && built
                  ? `Preview · ${built.fileName}`
                  : "Unified export"}
              </DialogTitle>
              {view === "pick" ? (
                <DialogDescription className="unified-export__subtitle">
                  Merge files into one PDF — each starts on a new page.
                </DialogDescription>
              ) : null}
            </span>
          </div>
        </DialogHeader>
        {view === "preview" && built ? (
          <>
            <DialogBody className="flex min-h-0 flex-1 flex-col gap-2 p-0">
              {built.failures.length ? (
                <ul
                  data-testid="unified-export-dialog-failure-list"
                  className="unified-export__failures unified-export__failures--banner"
                >
                  {built.failures.map((f) => (
                    <li key={f.name} className="unified-export__failure">
                      <IconAlertTriangle
                        aria-hidden
                        className="unified-export__failure-icon"
                      />
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
              <Button
                data-testid="unified-export-dialog-download-button"
                onClick={() => download(built)}
              >
                <IconDownload className="size-3.5" />
                Download PDF
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="unified-export">
              {/* ── Settings (hidden until there is something to export) ── */}
              {rows.length ? (
                <section
                  className="unified-export__card"
                  aria-labelledby="unified-export-settings-heading"
                >
                  <h3
                    id="unified-export-settings-heading"
                    className="unified-export__section-title"
                  >
                    <IconSettings
                      aria-hidden
                      className="unified-export__section-icon"
                    />
                    Document
                  </h3>
                  <div className="unified-export__settings">
                    <label className="unified-export__field unified-export__field--wide">
                      <span className={ui.fieldLabel}>Title</span>
                      <Input
                        data-testid="unified-export-dialog-title-input"
                        value={title}
                        disabled={running}
                        placeholder="Unified export"
                        onChange={(e) => setTitle(e.target.value)}
                      />
                      <span className="unified-export__hint">
                        Saved as{" "}
                        <span className="unified-export__file-name">
                          {fileTitle.replace(/[\\/:*?"<>|]+/g, "-")}.pdf
                        </span>
                      </span>
                    </label>

                    <div className="unified-export__field">
                      <span
                        className={ui.fieldLabel}
                        id="unified-export-page-size"
                      >
                        Page size
                      </span>
                      <div
                        role="radiogroup"
                        aria-labelledby="unified-export-page-size"
                        className="unified-export__pages"
                      >
                        {PAGE_SIZES.map((size) => (
                          <button
                            key={size.id}
                            type="button"
                            role="radio"
                            aria-checked={pageSize === size.id}
                            data-testid={`unified-export-dialog-page-size-${size.id}-button`}
                            disabled={running}
                            title={size.title}
                            onClick={() => setPageSize(size.id)}
                            className={cn(
                              "unified-export__page",
                              pageSize === size.id &&
                                "unified-export__page--selected",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "unified-export__page-glyph",
                                `unified-export__page-glyph--${size.id}`,
                                pageSize === size.id &&
                                  "unified-export__page-glyph--selected",
                              )}
                            />
                            <span className="unified-export__page-text">
                              <span className="unified-export__page-name">
                                {size.label}
                              </span>
                              <span className="unified-export__page-dims">
                                {size.dims}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="unified-export__field unified-export__toggle">
                      <span className="unified-export__toggle-text">
                        <span className={ui.fieldLabel}>Contents page</span>
                        <span className="unified-export__hint">
                          A linked list of files up front
                        </span>
                      </span>
                      <Switch
                        size="sm"
                        data-testid="unified-export-dialog-contents-checkbox"
                        checked={contents}
                        disabled={running}
                        onCheckedChange={setContents}
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              {/* ── Files ────────────────────────────────────────────── */}
              <section
                className="unified-export__files"
                aria-labelledby="unified-export-files-heading"
              >
                <div className="unified-export__files-bar">
                  <h3
                    id="unified-export-files-heading"
                    className="unified-export__section-title"
                  >
                    <IconFiles
                      aria-hidden
                      className="unified-export__section-icon"
                    />
                    Files
                    {rows.length ? (
                      <span
                        className="unified-export__count"
                        data-testid="unified-export-dialog-count-message"
                      >
                        {selected.length} of {rows.length} selected
                      </span>
                    ) : null}
                  </h3>
                  {rows.length ? (
                    <div className="unified-export__files-actions">
                      {customOrder ? (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="unified-export-dialog-reset-order-button"
                          className={cn(ui.ghostBtn, "h-7")}
                          disabled={running}
                          title="Back to the explorer's order"
                          onClick={() => setCustomOrder(false)}
                        >
                          <IconArrowBackUp className="size-3.5" />
                          Reset order
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="unified-export-dialog-select-all-button"
                        className={cn(ui.ghostBtn, "h-7")}
                        disabled={running || selected.length === rows.length}
                        title="Include every file in the PDF"
                        onClick={() =>
                          setChecked(new Set(rows.map((r) => r.node.id)))
                        }
                      >
                        <IconChecks className="size-3.5" />
                        All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="unified-export-dialog-clear-button"
                        className={cn(ui.ghostBtn, "h-7")}
                        disabled={running || !checked.size}
                        title="Untick every file"
                        onClick={() => setChecked(new Set())}
                      >
                        <IconSquareOff className="size-3.5" />
                        None
                      </Button>
                    </div>
                  ) : null}
                </div>

                {rows.length ? (
                  <>
                    <p className="unified-export__hint">
                      Tick files to include · drag the handle or use the arrows
                      to set the page order.
                    </p>
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
                          className="unified-export__list"
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
                  </>
                ) : (
                  <div
                    data-testid="unified-export-dialog-empty-message"
                    className="unified-export__empty"
                  >
                    <span className="unified-export__empty-icon" aria-hidden>
                      <IconFileExport />
                    </span>
                    <p className="unified-export__empty-title">
                      Nothing to export yet
                    </p>
                    <p className="unified-export__empty-text">
                      Create or import a file — these types can go into the PDF:
                    </p>
                    <ul className="unified-export__groups">
                      {RESULT_GROUPS.map((group) => {
                        const Glyph = GROUP_ICON[group];
                        return (
                          <li key={group} className="unified-export__group">
                            <span className="unified-export__group-name">
                              <Glyph
                                aria-hidden
                                className="unified-export__group-icon"
                              />
                              {group}
                            </span>
                            <span className="unified-export__group-kinds">
                              {EXPORTABLE_KINDS.filter(
                                (k) => resultGroup(k) === group,
                              )
                                .map((k) => KIND_LABEL[k])
                                .join(", ")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="unified-export__empty-actions">
                      <Button
                        type="button"
                        size="sm"
                        className={ui.solidBtn}
                        data-testid="unified-export-dialog-new-note-button"
                        onClick={startNote}
                      >
                        <IconFilePlus className="size-3.5" />
                        New note
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={ui.ghostBtn}
                        data-testid="unified-export-dialog-import-button"
                        onClick={startImport}
                      >
                        <IconUpload className="size-3.5" />
                        Import files
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              <ExportStatus status={status} />
            </DialogBody>
            <DialogFooter>
              <p
                className="unified-export__summary"
                data-testid="unified-export-dialog-summary-message"
              >
                {outcome.length ? (
                  outcome.map(({ group, count }) => {
                    const Glyph = GROUP_ICON[group];
                    return (
                      <span
                        key={group}
                        className="unified-export__summary-item"
                      >
                        <Glyph
                          aria-hidden
                          className="unified-export__summary-icon"
                        />
                        {count} {group}
                      </span>
                    );
                  })
                ) : (
                  <span className="unified-export__summary-item">
                    No files ticked
                  </span>
                )}
              </p>
              <Button
                variant="outline"
                data-testid="unified-export-dialog-cancel-button"
                disabled={running}
                onClick={close}
              >
                <IconX />
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
              <Button
                data-testid="unified-export-dialog-export-button"
                disabled={running || !selected.length}
                onClick={() => void runExport()}
              >
                {running ? (
                  <IconLoader2 className="size-3.5 animate-spin" />
                ) : (
                  <IconFileExport className="size-3.5" />
                )}
                Export PDF
              </Button>
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
        className="unified-export__notice unified-export__notice--error"
      >
        <IconAlertTriangle
          aria-hidden
          className="unified-export__notice-icon"
        />
        Export failed: {status.error}
      </p>
    );
  }
  if (status.state === "done") {
    return (
      <div
        data-testid="unified-export-dialog-result-message"
        className="unified-export__result"
      >
        <p className="unified-export__notice unified-export__notice--success">
          <IconCircleCheck
            aria-hidden
            className="unified-export__notice-icon"
          />
          Downloaded {status.fileName}.
        </p>
        {status.failures.length ? (
          <ul className="unified-export__failures">
            {status.failures.map((f) => (
              <li key={f.name} className="unified-export__failure">
                <IconAlertTriangle
                  aria-hidden
                  className="unified-export__failure-icon"
                />
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
  const group = resultGroup(row.kind);
  const Glyph = GROUP_ICON[group];

  return (
    <li
      ref={setNodeRef}
      data-testid={`unified-export-row-${id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "unified-export-row",
        checked && "unified-export-row--checked",
        isDragging && "unified-export-row--dragging",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        data-testid={`unified-export-row-drag-handle-${id}`}
        aria-label={`Reorder ${row.node.name}`}
        title="Drag to change the page order"
        className="unified-export-row__handle"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden className="unified-export-row__glyph" />
      </button>
      <span
        aria-hidden
        className={cn(
          "unified-export-row__position",
          checked && "unified-export-row__position--checked",
        )}
      >
        {position ?? ""}
      </span>
      <label className="unified-export-row__main">
        <input
          type="checkbox"
          data-testid={`unified-export-row-checkbox-${id}`}
          className="unified-export-row__checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="unified-export-row__icon" aria-hidden>
          <FileIcon name={row.node.name} />
        </span>
        <span className="unified-export-row__text">
          <span className="unified-export-row__name">{row.node.name}</span>
          <span className="unified-export-row__path">{row.path}</span>
        </span>
      </label>
      <span
        className="unified-export-row__result"
        title={`${KIND_LABEL[row.kind]} → ${RESULT_LABEL[row.kind]}`}
      >
        <Glyph aria-hidden className="unified-export-row__glyph" />
        {RESULT_LABEL[row.kind]}
      </span>
      <span className="unified-export-row__moves">
        <button
          type="button"
          data-testid={`unified-export-row-move-up-button-${id}`}
          aria-label={`Move ${row.node.name} up`}
          className="unified-export-row__move"
          disabled={disabled || isFirst}
          onClick={() => onMove(-1)}
        >
          <IconChevronUp aria-hidden className="unified-export-row__glyph" />
        </button>
        <button
          type="button"
          data-testid={`unified-export-row-move-down-button-${id}`}
          aria-label={`Move ${row.node.name} down`}
          className="unified-export-row__move"
          disabled={disabled || isLast}
          onClick={() => onMove(1)}
        >
          <IconChevronDown aria-hidden className="unified-export-row__glyph" />
        </button>
      </span>
    </li>
  );
}
