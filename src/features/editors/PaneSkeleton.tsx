import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { FileKind } from "@/lib/file-types";
import type { TabMode } from "@/store/tabs-slice";
import { CodeSkeleton } from "@/features/editors/CodeSkeleton";
import { MarkdownSkeleton } from "@/features/editors/MarkdownSkeleton";

/** Uneven widths so repeated rows don't read as a stamped pattern. */
const ROW_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-2/5", "w-1/3"];
const NAME_WIDTHS = ["w-3/5", "w-1/2", "w-2/3", "w-2/5", "w-1/2", "w-3/5"];
const HEADING_WIDTHS = ["w-16", "w-12", "w-20", "w-14"];
const CELL_WIDTHS = ["w-3/5", "w-4/5", "w-1/2", "w-2/3", "w-2/5"];

/** `role="status"` and friends for a placeholder that stands alone. */
function statusProps(testId: string) {
  return {
    role: "status",
    "aria-busy": true,
    "aria-label": "Loading",
    "data-testid": testId,
  } as const;
}

/**
 * Loading placeholder for an editor pane, shaped like the pane it stands in
 * for, so the real one swaps in with little shift. Shown by `EditorArea`
 * while the file is read and while the pane's lazy chunk downloads.
 *
 * Every file kind has its own shape; kinds with an edit and a view mode
 * (CSV, Mermaid, JSON/YAML/TOML, PDF, …) pick the shape for `mode`, so the
 * placeholder matches what is about to open. Markdown hands off to
 * {@link MarkdownSkeleton}. Split layouts follow the panes' own breakpoint
 * (`md`): the side column stacks above (bookmarks) or below the main area.
 *
 * Styles: BEM block `pane-skeleton` (`src/styles/pane-skeleton.css`).
 *
 * @param props.kind - The file kind being loaded; picks the shape.
 * @param props.mode - The tab's edit / view mode. Default `"edit"`.
 *
 * @example
 * ```tsx
 * <React.Suspense fallback={<PaneSkeleton kind={kind} mode={mode} />}>
 *   …
 * </React.Suspense>
 * ```
 */
export function PaneSkeleton({
  kind,
  mode = "edit",
}: {
  kind: FileKind;
  mode?: TabMode;
}) {
  if (kind === "markdown") return <MarkdownSkeleton />;
  return (
    <div
      className="pane-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading editor"
      data-testid="pane-skeleton"
    >
      {SHAPES[kind](mode)}
    </div>
  );
}

/**
 * Placeholder for the rows of a diff while both files are read; sits under
 * the diff pane's file headers.
 */
export function DiffLinesSkeleton() {
  return (
    <div className="pane-skeleton__diff" {...statusProps("diff-lines-skeleton")}>
      <DiffLines />
    </div>
  );
}

/** Placeholder for a diagram while Mermaid loads and draws its first frame. */
export function DiagramSkeleton() {
  return (
    <div
      className="pane-skeleton__diagram"
      {...statusProps("diagram-skeleton")}
    >
      <Diagram />
    </div>
  );
}

/**
 * A pulsing placeholder whose radius comes from its BEM class. `Skeleton`'s
 * own `rounded-md` utility would outrank a component-layer radius.
 */
function Bone({ className }: { className: string }) {
  return <div aria-hidden className={cn("pane-skeleton__bone", className)} />;
}

type Shape = (mode: TabMode) => React.ReactNode;

const code: Shape = () => <CodeSkeleton embedded />;

const SHAPES: Record<Exclude<FileKind, "markdown">, Shape> = {
  text: code,
  env: code,
  json: code,
  yaml: code,
  toml: code,
  apikeys: code,
  prompt: code,
  csv: (mode) => (mode === "view" ? <TableShape /> : code(mode)),
  schema: (mode) => (mode === "view" ? <SchemaShape /> : code(mode)),
  mermaid: (mode) =>
    mode === "view" ? (
      <div className="pane-skeleton__diagram">
        <Diagram />
      </div>
    ) : (
      <div className="pane-skeleton__columns">
        <div className="pane-skeleton__code w-1/2">{code(mode)}</div>
        <div className="pane-skeleton__diagram">
          <Diagram />
        </div>
      </div>
    ),
  random: (mode) =>
    mode === "view" ? (
      <RandomStage />
    ) : (
      <div className="pane-skeleton__columns">
        <div className="pane-skeleton__code w-1/3">{code(mode)}</div>
        <RandomStage />
      </div>
    ),
  sql: SqlShape,
  regex: RegexShape,
  diff: DiffShape,
  pdf: (mode) => <DocumentShape tools={mode === "edit" ? 5 : 3} />,
  docx: () => <DocumentShape tools={6} />,
  xlsx: SheetShape,
  kanban: KanbanShape,
  qr: QrShape,
  image: ImageShape,
  pptx: PptxShape,
  chat: ChatShape,
  canvas: CanvasShape,
  appinfo: AppInfoShape,
  appstate: AppStateShape,
  timer: TimerShape,
  bookmark: BookmarkShape,
  calendar: CalendarShape,
};

/**
 * A settings column's sections: a heading over form fields. `sections` is the
 * number of field rows in each; every other row is a side-by-side pair.
 */
function Settings({ sections }: { sections: number[] }) {
  return (
    <>
      {sections.map((rows, s) => (
        <div key={s} className="pane-skeleton__section">
          <Skeleton
            className={cn(
              "pane-skeleton__line pane-skeleton__line--heading",
              HEADING_WIDTHS[s % HEADING_WIDTHS.length],
            )}
          />
          {Array.from({ length: rows }, (_, r) =>
            r % 2 ? (
              <div key={r} className="pane-skeleton__pair">
                <Skeleton className="pane-skeleton__field" />
                <Skeleton className="pane-skeleton__field" />
              </div>
            ) : (
              <Skeleton key={r} className="pane-skeleton__field" />
            ),
          )}
        </div>
      ))}
    </>
  );
}

/** CSV table view: search box over a header row and data rows. */
function TableShape() {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__strip">
        <Skeleton className="pane-skeleton__search" />
      </div>
      <div className="pane-skeleton__table">
        {Array.from({ length: 16 }, (_, r) => (
          <div
            key={r}
            className={cn(
              "pane-skeleton__table-row",
              r === 0 && "pane-skeleton__table-row--head",
            )}
          >
            {Array.from({ length: 5 }, (_, c) => (
              <div key={c} className="pane-skeleton__cell">
                <Skeleton
                  className={cn(
                    "pane-skeleton__line",
                    r === 0 && "pane-skeleton__line--small",
                    CELL_WIDTHS[(r + c) % CELL_WIDTHS.length],
                  )}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Schema builder: a list of properties with a type pill each. */
function SchemaShape() {
  return (
    <div className="pane-skeleton__column pane-skeleton__column--wide">
      <div className="pane-skeleton__header">
        <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-40" />
        <Skeleton className="pane-skeleton__line w-3/5" />
      </div>
      <div className="pane-skeleton__list">
        {ROW_WIDTHS.concat(ROW_WIDTHS.slice(0, 2)).map((width, i) => (
          <div key={i} className="pane-skeleton__row">
            <Skeleton className={cn("pane-skeleton__line", width)} />
            <div className="pane-skeleton__pills">
              <Bone className="pane-skeleton__pill w-16" />
            </div>
            <Bone className="pane-skeleton__switch" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Flowchart: a box, a fork of two, then a closing box. */
function Diagram() {
  return (
    <div className="pane-skeleton__flow">
      <Bone className="pane-skeleton__box w-32" />
      <span className="pane-skeleton__edge" />
      <div className="pane-skeleton__fork">
        <Bone className="pane-skeleton__box w-28" />
        <Bone className="pane-skeleton__box w-28" />
      </div>
      <span className="pane-skeleton__edge" />
      <Bone className="pane-skeleton__box w-36" />
    </div>
  );
}

/** Random picker stage: a cluster of value chips over the draw dock. */
function RandomStage() {
  const chips = [
    "w-20",
    "w-16",
    "w-24",
    "w-14",
    "w-20",
    "w-28",
    "w-16",
    "w-20",
    "w-12",
    "w-24",
  ];
  return (
    <div className="pane-skeleton__stage-area">
      <div className="pane-skeleton__chips">
        {chips.map((width, i) => (
          <Bone key={i} className={cn("pane-skeleton__token", width)} />
        ))}
      </div>
      <Bone className="pane-skeleton__dock" />
    </div>
  );
}

/** SQL: source on top, the results panel below. */
function SqlShape() {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__source">
        <CodeSkeleton embedded />
      </div>
      <div className="pane-skeleton__results">
        <Skeleton className="pane-skeleton__line w-72" />
        <Skeleton className="pane-skeleton__line w-48" />
      </div>
    </div>
  );
}

/** Regex: the test text on the left, pattern + match panels on the right. */
function RegexShape() {
  return (
    <div className="pane-skeleton__columns">
      <div className="pane-skeleton__code w-7/12">
        <CodeSkeleton embedded />
      </div>
      <div className="pane-skeleton__panels">
        <div className="pane-skeleton__section pane-skeleton__section--padded">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--heading w-32" />
          <Skeleton className="pane-skeleton__field" />
          <div className="pane-skeleton__pills">
            {["w-14", "w-16", "w-12", "w-16"].map((width, i) => (
              <Bone key={i} className={cn("pane-skeleton__pill", width)} />
            ))}
          </div>
        </div>
        {["w-20", "w-24", "w-16"].map((width, i) => (
          <div key={i} className="pane-skeleton__panel">
            <div className="pane-skeleton__panel-head">
              <Bone className="pane-skeleton__chevron" />
              <Skeleton className={cn("pane-skeleton__line", width)} />
            </div>
            <div className="pane-skeleton__panel-body">
              <Skeleton className="pane-skeleton__line w-4/5" />
              <Skeleton className="pane-skeleton__line w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Diff rows, side by side, with a few removed / added lines tinted. */
function DiffLines() {
  const rows: Array<[string, string, "removed" | "added" | null]> = [
    ["w-2/5", "w-2/5", null],
    ["w-3/5", "w-3/5", null],
    ["w-1/2", "w-2/3", "removed"],
    ["w-1/3", "w-1/2", "added"],
    ["w-2/3", "w-2/3", null],
    ["w-1/4", "w-1/4", null],
    ["w-1/2", "w-1/2", null],
    ["w-3/5", "w-2/5", "removed"],
    ["w-2/5", "w-3/5", null],
    ["w-1/3", "w-1/3", null],
    ["w-1/2", "w-3/5", "added"],
    ["w-2/3", "w-2/3", null],
  ];
  return (
    <>
      {rows.map(([left, right, change], i) => (
        <div key={i} className="pane-skeleton__diff-row">
          {[left, right].map((width, side) => (
            <div
              key={side}
              className={cn(
                "pane-skeleton__diff-side",
                change === "removed" &&
                  side === 0 &&
                  "pane-skeleton__diff-side--removed",
                change === "added" &&
                  side === 1 &&
                  "pane-skeleton__diff-side--added",
              )}
            >
              <Skeleton className="pane-skeleton__number" />
              <Skeleton className={cn("pane-skeleton__line", width)} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Diff: the two file headers over the diff rows. */
function DiffShape() {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__heads">
        {["w-40", "w-36"].map((width, i) => (
          <div key={i} className="pane-skeleton__head">
            <Skeleton className="pane-skeleton__badge" />
            <Skeleton className={cn("pane-skeleton__line", width)} />
          </div>
        ))}
      </div>
      <div className="pane-skeleton__diff">
        <DiffLines />
      </div>
    </div>
  );
}

/** PDF / Word: the viewer's toolbar over a page on the desk. */
function DocumentShape({ tools }: { tools: number }) {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__strip">
        {Array.from({ length: tools }, (_, i) => (
          <Skeleton
            key={i}
            className={cn("pane-skeleton__tool", i % 2 ? "w-20" : "w-14")}
          />
        ))}
      </div>
      <div className="pane-skeleton__desk">
        <div className="pane-skeleton__page">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-1/2" />
          {[
            "w-full",
            "w-11/12",
            "w-full",
            "w-3/4",
            null,
            "w-full",
            "w-10/12",
            "w-full",
            "w-2/3",
            null,
            "w-11/12",
            "w-full",
            "w-1/2",
          ].map((width, i) =>
            width ? (
              <Skeleton
                key={i}
                className={cn("pane-skeleton__line", width)}
              />
            ) : (
              <span key={i} className="pane-skeleton__gap" />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/** Excel: toolbar, formula bar, then the grid with row / column headers. */
function SheetShape() {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__strip">
        {["w-14", "w-20", "w-16", "w-24"].map((width, i) => (
          <Skeleton key={i} className={cn("pane-skeleton__tool", width)} />
        ))}
      </div>
      <div className="pane-skeleton__strip">
        <Skeleton className="pane-skeleton__tool w-16" />
        <Skeleton className="pane-skeleton__tool pane-skeleton__tool--grow" />
      </div>
      <div className="pane-skeleton__table">
        {Array.from({ length: 20 }, (_, r) => (
          <div key={r} className="pane-skeleton__sheet-row">
            {Array.from({ length: 7 }, (_, c) => (
              <div
                key={c}
                className={cn(
                  "pane-skeleton__sheet-cell",
                  (r === 0 || c === 0) && "pane-skeleton__sheet-cell--head",
                )}
              >
                {r === 0 || c === 0 ? (
                  r + c > 0 ? (
                    <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-3" />
                  ) : null
                ) : r < 9 && c < 5 ? (
                  <Skeleton
                    className={cn(
                      "pane-skeleton__line pane-skeleton__line--small",
                      CELL_WIDTHS[(r + c) % CELL_WIDTHS.length],
                    )}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kanban: columns of cards, then the "add column" slot. */
function KanbanShape() {
  return (
    <div className="pane-skeleton__board">
      {[4, 2, 3].map((cards, l) => (
        <div key={l} className="pane-skeleton__lane">
          <Skeleton
            className={cn(
              "pane-skeleton__line",
              HEADING_WIDTHS[l % HEADING_WIDTHS.length],
            )}
          />
          {Array.from({ length: cards }, (_, c) => (
            <div key={c} className="pane-skeleton__ticket">
              <Skeleton
                className={cn(
                  "pane-skeleton__line",
                  NAME_WIDTHS[(l + c) % NAME_WIDTHS.length],
                )}
              />
              <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-1/3" />
            </div>
          ))}
        </div>
      ))}
      <Bone className="pane-skeleton__lane-slot" />
    </div>
  );
}

/** QR: the code on its stage, settings on the right. */
function QrShape() {
  return (
    <div className="pane-skeleton__split">
      <div className="pane-skeleton__stage-area">
        <Bone className="pane-skeleton__qr" />
        <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-48" />
      </div>
      <div className="pane-skeleton__side pane-skeleton__side--end">
        <Settings sections={[1, 2, 2, 1]} />
      </div>
    </div>
  );
}

/** Image: canvas and status bar, tool tabs and settings on the right. */
function ImageShape() {
  return (
    <div className="pane-skeleton__split">
      <div className="pane-skeleton__area">
        <div className="pane-skeleton__canvas">
          <Bone className="pane-skeleton__picture" />
        </div>
        <div className="pane-skeleton__status">
          {["w-16", "w-20", "w-12"].map((width, i) => (
            <Skeleton
              key={i}
              className={cn("pane-skeleton__line pane-skeleton__line--small", width)}
            />
          ))}
        </div>
      </div>
      <div className="pane-skeleton__side pane-skeleton__side--end">
        <div className="pane-skeleton__tabs">
          {["w-14", "w-16", "w-12"].map((width, i) => (
            <Skeleton key={i} className={cn("pane-skeleton__tool", width)} />
          ))}
        </div>
        <Settings sections={[2, 1, 2]} />
      </div>
    </div>
  );
}

/** Canvas: the tool bar top centre, history / zoom bottom left. */
function CanvasShape() {
  return (
    <div className="pane-skeleton__sketchpad">
      <Bone className="pane-skeleton__sketch-tools" />
      <Bone className="pane-skeleton__sketch-view" />
    </div>
  );
}

/** Slides: thumbnails, the slide on its canvas, settings. */
function PptxShape() {
  return (
    <div className="pane-skeleton__split">
      <div className="pane-skeleton__thumbs">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="pane-skeleton__thumb-row">
            <Skeleton className="pane-skeleton__number" />
            <Bone className="pane-skeleton__thumb" />
          </div>
        ))}
      </div>
      <div className="pane-skeleton__workspace">
        <div className="pane-skeleton__slide">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-1/2" />
          <Skeleton className="pane-skeleton__line w-2/3" />
          <Skeleton className="pane-skeleton__line w-1/2" />
          <Skeleton className="pane-skeleton__line w-3/5" />
        </div>
      </div>
      <div className="pane-skeleton__side pane-skeleton__side--end">
        <Settings sections={[2, 1, 2]} />
      </div>
    </div>
  );
}

/** Chat: alternating messages over the composer. */
function ChatShape() {
  return (
    <div className="pane-skeleton__stack">
      <div className="pane-skeleton__messages">
        <Bone className="pane-skeleton__bubble w-2/5" />
        <div className="pane-skeleton__reply">
          <Skeleton className="pane-skeleton__line w-11/12" />
          <Skeleton className="pane-skeleton__line w-4/5" />
          <Skeleton className="pane-skeleton__line w-1/2" />
        </div>
        <Bone className="pane-skeleton__bubble w-1/3" />
        <div className="pane-skeleton__reply">
          <Skeleton className="pane-skeleton__line w-full" />
          <Skeleton className="pane-skeleton__line w-3/5" />
        </div>
      </div>
      <div className="pane-skeleton__composer">
        <Skeleton className="pane-skeleton__field pane-skeleton__field--grow" />
        <Bone className="pane-skeleton__send" />
      </div>
    </div>
  );
}

/** app.info: heading + lead, then a card of file-type rows with library pills. */
function AppInfoShape() {
  return (
    <div className="pane-skeleton__column pane-skeleton__column--wide">
      <div className="pane-skeleton__header">
        <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-56" />
        <Skeleton className="pane-skeleton__line w-4/5" />
      </div>
      <div className="pane-skeleton__list">
        {ROW_WIDTHS.concat(ROW_WIDTHS).map((width, i) => (
          <div key={i} className="pane-skeleton__row">
            <Bone className="pane-skeleton__icon" />
            <div className="pane-skeleton__row-text">
              <Skeleton className={cn("pane-skeleton__line", width)} />
              <Skeleton
                className={cn(
                  "pane-skeleton__line pane-skeleton__line--small",
                  NAME_WIDTHS[i % NAME_WIDTHS.length],
                )}
              />
            </div>
            <div className="pane-skeleton__pills">
              <Bone className="pane-skeleton__pill w-16" />
              {i % 3 !== 2 ? (
                <Bone className="pane-skeleton__pill w-20" />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** app.state: dotted graph stage with a few nodes, details column on the right. */
function AppStateShape() {
  return (
    <div className="pane-skeleton__split">
      <div className="pane-skeleton__stage">
        <div className="pane-skeleton__tree">
          <Bone className="pane-skeleton__node" />
          <div className="pane-skeleton__branch">
            {["w-16", "w-12", "w-20", "w-14"].map((width, i) => (
              <div key={i} className="pane-skeleton__leaf">
                <Bone className="pane-skeleton__node" />
                <Skeleton className={cn("pane-skeleton__line", width)} />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="pane-skeleton__hint" />
      </div>
      <div className="pane-skeleton__side pane-skeleton__side--end">
        <div className="pane-skeleton__section">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--heading w-14" />
          <div className="pane-skeleton__counts">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="pane-skeleton__count" />
            ))}
          </div>
        </div>
        <div className="pane-skeleton__section pane-skeleton__section--grow">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--heading w-16" />
          <Skeleton className="pane-skeleton__line w-2/3" />
          <Skeleton className="pane-skeleton__block" />
        </div>
      </div>
    </div>
  );
}

/** Timer: countdown ring + controls, then the queue list. */
function TimerShape() {
  return (
    <div className="pane-skeleton__column">
      <div className="pane-skeleton__hero">
        <div className="pane-skeleton__ring">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-16" />
          <Bone className="pane-skeleton__clock" />
          <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-12" />
        </div>
        <div className="pane-skeleton__controls">
          <Bone className="pane-skeleton__control" />
          <Bone className="pane-skeleton__control pane-skeleton__control--primary" />
          <Bone className="pane-skeleton__control" />
        </div>
      </div>
      <div className="pane-skeleton__section">
        <Skeleton className="pane-skeleton__line pane-skeleton__line--heading w-14" />
        <div className="pane-skeleton__list">
          {ROW_WIDTHS.slice(0, 4).map((width, i) => (
            <div
              key={i}
              className="pane-skeleton__row pane-skeleton__row--short"
            >
              <Skeleton className={cn("pane-skeleton__line", width)} />
              <Skeleton className="pane-skeleton__line w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Calendar: title + view / navigate controls, then the month grid. */
function CalendarShape() {
  return (
    <div className="pane-skeleton__calendar">
      <div className="pane-skeleton__calendar-head">
        <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-40" />
        <div className="pane-skeleton__calendar-tools">
          <Skeleton className="pane-skeleton__tool w-44" />
          <Skeleton className="pane-skeleton__tool w-28" />
          <Skeleton className="pane-skeleton__tool w-7" />
        </div>
      </div>
      <div className="pane-skeleton__weekdays">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="pane-skeleton__weekday">
            <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-6" />
          </div>
        ))}
      </div>
      <div className="pane-skeleton__month">
        {Array.from({ length: 42 }, (_, i) => (
          <div key={i} className="pane-skeleton__day">
            <Bone className="pane-skeleton__day-number" />
            {/* A sprinkling of event chips, so the grid isn't uniform. */}
            {i % 5 === 1 || i % 7 === 3 ? (
              <Skeleton
                className={cn("pane-skeleton__chip", i % 2 ? "w-4/5" : "w-3/5")}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bookmarks: collections column on the left, a grid of preview cards. */
function BookmarkShape() {
  return (
    <div className="pane-skeleton__split">
      <div className="pane-skeleton__side pane-skeleton__side--start">
        <div className="pane-skeleton__nav">
          {["w-10", "w-16", "w-14"].map((width, i) => (
            <div key={i} className="pane-skeleton__nav-item">
              <Skeleton className="pane-skeleton__nav-icon" />
              <Skeleton className={cn("pane-skeleton__line", width)} />
            </div>
          ))}
        </div>
        <div className="pane-skeleton__nav">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--heading w-16" />
          {["w-20", "w-14"].map((width, i) => (
            <div key={i} className="pane-skeleton__nav-item">
              <Skeleton className="pane-skeleton__nav-icon" />
              <Skeleton className={cn("pane-skeleton__line", width)} />
            </div>
          ))}
        </div>
      </div>
      <div className="pane-skeleton__main">
        <div className="pane-skeleton__toolbar">
          <Skeleton className="pane-skeleton__line pane-skeleton__line--title w-24" />
          <Skeleton className="pane-skeleton__search" />
        </div>
        <div className="pane-skeleton__cards">
          {ROW_WIDTHS.map((width, i) => (
            <div key={i} className="pane-skeleton__card">
              <Bone className="pane-skeleton__media" />
              <div className="pane-skeleton__card-body">
                <Skeleton className={cn("pane-skeleton__line", width)} />
                <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-4/5" />
                <Skeleton className="pane-skeleton__line pane-skeleton__line--small w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
