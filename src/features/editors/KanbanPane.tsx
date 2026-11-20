import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconAlignLeft,
  IconCalendarCheck,
  IconCalendarDue,
  IconCalendarPlus,
  IconCheck,
  IconCircleCheck,
  IconCircleOff,
  IconDots,
  IconLayoutKanban,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useDragSensors } from "@/lib/dnd-sensors";
import { isCoarsePointer } from "@/lib/use-media-query";
import { COLOR_HEX, dateKey, EVENT_COLORS, parseLocal } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import {
  countCards,
  type KanbanCard,
  type KanbanColumn,
  newId,
  parseKanban,
  serializeKanban,
} from "@/lib/kanban";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

type Columns = KanbanColumn[];
type ActiveDrag =
  | { type: "card"; card: KanbanCard; done: boolean }
  | { type: "column"; column: KanbanColumn };

/** Column index holding `itemId` — a column id or one of its card ids. */
function columnIndexOf(columns: Columns, itemId: unknown) {
  return columns.findIndex(
    (c) => c.id === itemId || c.cards.some((k) => k.id === itemId),
  );
}

/**
 * Columns only collide with columns. A card prefers the card under the
 * pointer, then the column under it (dropping into empty space appends).
 */
const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "column") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.data.current?.type === "column",
      ),
    });
  }
  const pointer = pointerWithin(args);
  const hits = pointer.length ? pointer : rectIntersection(args);
  const card = hits.find(
    (h) => h.data?.droppableContainer?.data.current?.type === "card",
  );
  return card ? [card] : hits.slice(0, 1);
};

/**
 * `.kanban` files: a board of columns and cards over the file's JSON. Drag
 * cards within and between columns, drag columns by their header to reorder
 * them, click a card to edit it. Edits save automatically.
 */
export default function KanbanPane({ id, content, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    const text = typeof content === "string" ? content : "";
    try {
      return {
        columns: parseKanban(text).columns,
        error: null as string | null,
      };
    } catch (error) {
      return {
        columns: [] as Columns,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // Mounted per file (`key={id}` upstream) — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [columns, setColumns] = React.useState(initial.columns);
  const [parseError, setParseError] = React.useState(initial.error);
  const [active, setActive] = React.useState<ActiveDrag | null>(null);
  const [editing, setEditing] = React.useState<{
    cardId: string;
    rect: DOMRect;
  } | null>(null);

  // The ref is the source of truth (drag events outrun renders); state
  // mirrors it for drawing.
  const columnsRef = React.useRef(columns);
  const textRef = React.useRef(
    serializeKanban({ version: 1, columns: initial.columns }),
  );
  const beforeDrag = React.useRef<Columns | null>(null);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () =>
    dispatch(saveContent(id, textRef.current)),
  );

  const show = React.useCallback((next: Columns) => {
    columnsRef.current = next;
    setColumns(next);
  }, []);
  const commit = React.useCallback(
    (update: (columns: Columns) => Columns) => {
      const next = update(columnsRef.current);
      show(next);
      textRef.current = serializeKanban({ version: 1, columns: next });
      save(textRef.current);
    },
    [save, show],
  );

  /* ───────────── Mutations ───────────── */

  const addColumn = React.useCallback(
    (title: string) =>
      commit((cols) => [...cols, { id: newId(), title, cards: [] }]),
    [commit],
  );
  const patchColumn = React.useCallback(
    (columnId: string, patch: Partial<KanbanColumn>) =>
      commit((cols) =>
        cols.map((c) => (c.id === columnId ? { ...c, ...patch } : c)),
      ),
    [commit],
  );
  const deleteColumn = React.useCallback(
    (columnId: string) =>
      commit((cols) => cols.filter((c) => c.id !== columnId)),
    [commit],
  );
  const addCard = React.useCallback(
    (columnId: string, title: string) =>
      commit((cols) =>
        cols.map((c) =>
          c.id === columnId
            ? { ...c, cards: [...c.cards, { id: newId(), title }] }
            : c,
        ),
      ),
    [commit],
  );
  const patchCard = React.useCallback(
    (cardId: string, patch: Partial<KanbanCard>) =>
      commit((cols) =>
        cols.map((c) =>
          c.cards.some((k) => k.id === cardId)
            ? {
                ...c,
                cards: c.cards.map((k) =>
                  k.id === cardId ? { ...k, ...patch } : k,
                ),
              }
            : c,
        ),
      ),
    [commit],
  );
  const deleteCard = React.useCallback(
    (cardId: string) => {
      setEditing(null);
      commit((cols) =>
        cols.map((c) =>
          c.cards.some((k) => k.id === cardId)
            ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) }
            : c,
        ),
      );
    },
    [commit],
  );
  const openCard = React.useCallback((cardId: string, el: Element) => {
    setEditing({ cardId, rect: el.getBoundingClientRect() });
  }, []);

  /* ───────────── Drag and drop ───────────── */

  // Mouse: 5px of travel first, so clicks still open cards. Touch: press
  // and hold, so a swipe still scrolls the board.
  const sensors = useDragSensors({
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const onDragStart = ({ active: item }: DragStartEvent) => {
    const cols = columnsRef.current;
    beforeDrag.current = cols;
    setEditing(null);
    const index = columnIndexOf(cols, item.id);
    if (index < 0) return;
    if (item.data.current?.type === "column") {
      setActive({ type: "column", column: cols[index] });
    } else {
      const card = cols[index].cards.find((k) => k.id === item.id);
      if (card) {
        setActive({ type: "card", card, done: Boolean(cols[index].done) });
      }
    }
  };

  /** Moves a card into another column as soon as it is dragged over it. */
  const onDragOver = ({ active: item, over }: DragOverEvent) => {
    if (!over || item.data.current?.type !== "card") return;
    const cols = columnsRef.current;
    const from = columnIndexOf(cols, item.id);
    const to = columnIndexOf(cols, over.id);
    if (from < 0 || to < 0 || from === to) return;
    const card = cols[from].cards.find((k) => k.id === item.id);
    if (!card) return;
    let index = cols[to].cards.length;
    if (over.data.current?.type === "card") {
      index = cols[to].cards.findIndex((k) => k.id === over.id);
      const dragged = item.rect.current.translated;
      // Past the middle of the card under the pointer → insert after it.
      if (dragged && dragged.top > over.rect.top + over.rect.height / 2)
        index++;
    }
    show(
      cols.map((c, i) =>
        i === from
          ? { ...c, cards: c.cards.filter((k) => k.id !== item.id) }
          : i === to
            ? {
                ...c,
                cards: [
                  ...c.cards.slice(0, index),
                  card,
                  ...c.cards.slice(index),
                ],
              }
            : c,
      ),
    );
  };

  const onDragEnd = ({ active: item, over }: DragEndEvent) => {
    setActive(null);
    beforeDrag.current = null;
    commit((cols) => {
      if (!over) return cols;
      if (item.data.current?.type === "column") {
        const from = cols.findIndex((c) => c.id === item.id);
        const to = columnIndexOf(cols, over.id);
        return from >= 0 && to >= 0 && from !== to
          ? arrayMove(cols, from, to)
          : cols;
      }
      const at = columnIndexOf(cols, item.id);
      if (at < 0 || at !== columnIndexOf(cols, over.id)) return cols;
      const cards = cols[at].cards;
      const from = cards.findIndex((k) => k.id === item.id);
      const to = cards.findIndex((k) => k.id === over.id);
      if (from < 0 || to < 0 || from === to) return cols;
      return cols.map((c, i) =>
        i === at ? { ...c, cards: arrayMove(cards, from, to) } : c,
      );
    });
  };

  const onDragCancel = () => {
    setActive(null);
    if (beforeDrag.current) show(beforeDrag.current);
    beforeDrag.current = null;
  };

  const columnIds = React.useMemo(() => columns.map((c) => c.id), [columns]);
  const editingColumn = editing
    ? columns.find((c) => c.cards.some((k) => k.id === editing.cardId))
    : undefined;
  const editingCard = editingColumn?.cards.find(
    (k) => k.id === editing?.cardId,
  );
  const total = countCards(columns);

  if (parseError) {
    return (
      <div
        data-testid="kanban-pane-error-message"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <p className="font-title text-app-bright text-sm font-semibold">
          This board file could not be read
        </p>
        <p className={cn(ui.help, "max-w-md")}>
          It is not valid kanban JSON ({parseError}). Starting a new board
          replaces the file's contents.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="kanban-pane-reset-button"
          onClick={() => {
            setParseError(null);
            commit(() => parseKanban("").columns);
          }}
        >
          <IconLayoutKanban />
          Start a new board
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="kanban-pane"
      className="bg-app-panel flex h-full min-h-0 flex-col select-none"
    >
      <FileBarSlot>
        <span className={ui.meta} data-testid="kanban-pane-count-message">
          {columns.length} {columns.length === 1 ? "column" : "columns"} ·{" "}
          {total} {total === 1 ? "card" : "cards"}
        </span>
      </FileBarSlot>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div
          className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden p-4"
          data-testid="kanban-pane-column-list"
        >
          <SortableContext
            items={columnIds}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((column) => (
              <ColumnView
                key={column.id}
                column={column}
                onOpenCard={openCard}
                onAddCard={addCard}
                onPatch={patchColumn}
                onDelete={deleteColumn}
              />
            ))}
          </SortableContext>
          <AddColumn onAdd={addColumn} />
        </div>
        <DragOverlay>
          {active?.type === "card" ? (
            <div className="rotate-2 cursor-grabbing">
              <CardFace card={active.card} done={active.done} lifted />
            </div>
          ) : active?.type === "column" ? (
            <div className="border-app-border-accent bg-app-sidebar w-72 rotate-1 cursor-grabbing rounded-lg border p-2 opacity-95 shadow-lg">
              <div className="font-title text-app-bright px-1 py-1 text-sm font-semibold">
                {active.column.title || "Untitled"}
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                {active.column.cards.slice(0, 4).map((card) => (
                  <CardFace
                    key={card.id}
                    card={card}
                    done={Boolean(active.column.done)}
                  />
                ))}
                {active.column.cards.length > 4 ? (
                  <span className={cn(ui.meta, "px-1")}>
                    +{active.column.cards.length - 4} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CardEditor
        card={editingCard}
        rect={editing?.rect ?? null}
        onClose={() => setEditing(null)}
        onChange={(patch) => editingCard && patchCard(editingCard.id, patch)}
        onDelete={() => editingCard && deleteCard(editingCard.id)}
      />
    </div>
  );
}

/* ───────────────────────────── Column ───────────────────────────── */

const ColumnView = React.memo(function ColumnView({
  column,
  onOpenCard,
  onAddCard,
  onPatch,
  onDelete,
}: {
  column: KanbanColumn;
  onOpenCard: (cardId: string, el: Element) => void;
  onAddCard: (columnId: string, title: string) => void;
  onPatch: (columnId: string, patch: Partial<KanbanColumn>) => void;
  onDelete: (columnId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });
  const cardIds = React.useMemo(
    () => column.cards.map((k) => k.id),
    [column.cards],
  );
  const [renaming, setRenaming] = React.useState(false);
  const done = Boolean(column.done);
  const count = column.cards.length;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`kanban-pane-column-${column.id}`}
      aria-label={column.title || "Untitled column"}
      className={cn(
        "border-app-border bg-app-sidebar flex max-h-full w-72 shrink-0 flex-col rounded-lg border",
        isDragging && "opacity-40",
      )}
    >
      <header
        {...attributes}
        {...listeners}
        aria-roledescription="draggable column"
        className="flex shrink-0 cursor-grab items-center gap-1.5 px-3 pt-2.5 pb-1.5 active:cursor-grabbing"
      >
        {renaming ? (
          <Input
            autoFocus
            defaultValue={column.title}
            placeholder="Column name"
            aria-label="Column name"
            data-testid={`kanban-pane-column-${column.id}-title-input`}
            className="h-7 py-0.5 font-semibold"
            // Keep typing and text selection from starting a column drag.
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") {
                if (e.key === "Enter") {
                  onPatch(column.id, { title: e.currentTarget.value.trim() });
                }
                setRenaming(false);
              }
            }}
            onBlur={(e) => {
              onPatch(column.id, { title: e.currentTarget.value.trim() });
              setRenaming(false);
            }}
          />
        ) : (
          <h3
            className="font-title text-app-bright min-w-0 flex-1 truncate text-sm font-semibold"
            title="Double-click to rename"
            onDoubleClick={() => setRenaming(true)}
          >
            {done ? (
              <IconCheck className="text-app-success mr-1 inline size-3.5" />
            ) : null}
            {column.title || <span className="text-app-dim">Untitled</span>}
          </h3>
        )}
        <span
          className={cn(ui.meta, "tabular-nums")}
          data-testid={`kanban-pane-column-${column.id}-count-message`}
        >
          {count}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-app-dim"
              aria-label={`${column.title || "Column"} actions`}
              data-testid={`kanban-pane-column-${column.id}-menu-trigger`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              data-testid={`kanban-pane-column-${column.id}-rename-item`}
              onSelect={() => setRenaming(true)}
            >
              <IconPencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`kanban-pane-column-${column.id}-done-item`}
              onSelect={() =>
                onPatch(column.id, { done: done ? undefined : true })
              }
            >
              {done ? <IconCircleOff /> : <IconCircleCheck />}
              {done ? "Unmark as done column" : "Mark as done column"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              data-testid={`kanban-pane-column-${column.id}-delete-item`}
              onSelect={() => onDelete(column.id)}
            >
              <IconTrash />
              {count
                ? `Delete column and ${count} ${count === 1 ? "card" : "cards"}`
                : "Delete column"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div
        className="flex min-h-2 flex-col gap-1.5 overflow-y-auto px-2 pb-1"
        data-testid={`kanban-pane-column-${column.id}-card-list`}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              done={done}
              onOpen={onOpenCard}
            />
          ))}
        </SortableContext>
      </div>

      <AddCard columnId={column.id} onAdd={onAddCard} />
    </section>
  );
});

/* ───────────────────────────── Card ───────────────────────────── */

const SortableCard = React.memo(function SortableCard({
  card,
  done,
  onOpen,
}: {
  card: KanbanCard;
  done: boolean;
  onOpen: (cardId: string, el: Element) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: "card" } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      data-testid={`kanban-pane-card-${card.id}`}
      className={cn(
        "focus-visible:ring-app-accent shrink-0 cursor-grab rounded-md outline-none focus-visible:ring-2 active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
      onClick={(e) => onOpen(card.id, e.currentTarget)}
    >
      <CardFace card={card} done={done} />
    </div>
  );
});

function CardFace({
  card,
  done,
  lifted = false,
}: {
  card: KanbanCard;
  done: boolean;
  lifted?: boolean;
}) {
  const today = dateKey(new Date());
  // Finished cards (done column, or an end date) are never overdue.
  const overdue = Boolean(card.due) && !done && !card.end && card.due! < today;
  const late = Boolean(card.end && card.due && card.end > card.due);
  const short = (value: string) =>
    parseLocal(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  const hasDates = Boolean(card.initial || card.start || card.end || card.due);
  return (
    <div
      className={cn(
        "border-app-border bg-app-panel rounded-md border px-2.5 py-2 text-[13px] leading-snug",
        card.color && "border-l-[3px]",
        lifted && "border-app-border-accent w-[17rem] shadow-lg",
      )}
      style={
        card.color ? { borderLeftColor: COLOR_HEX[card.color] } : undefined
      }
    >
      <div
        className={cn(
          "break-words whitespace-pre-wrap",
          done ? "text-app-dim" : "text-app-bright",
        )}
      >
        {card.title || <span className="text-app-dim italic">Untitled</span>}
      </div>
      {hasDates || card.notes ? (
        <div className="text-app-dim mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {card.initial ? (
            <span
              className="flex items-center gap-1 tabular-nums"
              title="Initial date"
              data-testid={`kanban-pane-card-${card.id}-initial-message`}
            >
              <IconCalendarPlus className="size-3.5" aria-label="Initial" />
              {short(card.initial)}
            </span>
          ) : null}
          {card.start || card.due ? (
            <span
              className="flex items-center gap-1 tabular-nums"
              title={
                card.start && card.due
                  ? "Start – due"
                  : card.start
                    ? "Start date"
                    : "Due date"
              }
              data-testid={`kanban-pane-card-${card.id}-dates-message`}
            >
              <IconCalendarDue className="size-3.5" />
              {card.start && card.due ? (
                card.start === card.due ? null : (
                  <>{short(card.start)} –</>
                )
              ) : card.start ? (
                <>Starts {short(card.start)}</>
              ) : null}
              {card.due ? (
                <span className={cn(overdue && "text-app-error font-semibold")}>
                  {short(card.due)}
                </span>
              ) : null}
            </span>
          ) : null}
          {card.end ? (
            <span
              className={cn(
                "flex items-center gap-1 tabular-nums",
                late && "text-app-error font-semibold",
              )}
              title={late ? "Ended after the due date" : "End date"}
              data-testid={`kanban-pane-card-${card.id}-end-message`}
            >
              <IconCalendarCheck className="size-3.5" aria-label="Ended" />
              {short(card.end)}
            </span>
          ) : null}
          {card.notes ? (
            <IconAlignLeft className="size-3.5" aria-label="Has notes" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Composers ───────────────────────────── */

/** "+ Add card": Enter adds and stays open for the next one; Esc closes. */
function AddCard({
  columnId,
  onAdd,
}: {
  columnId: string;
  onAdd: (columnId: string, title: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const submit = () => {
    const title = value.trim();
    if (title) onAdd(columnId, title);
    setValue("");
    return Boolean(title);
  };
  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-app-dim m-1 justify-start px-2 text-xs"
        data-testid={`kanban-pane-column-${columnId}-add-card-button`}
        onClick={() => setOpen(true)}
      >
        <IconPlus className="size-3.5" />
        Add card
      </Button>
    );
  }
  return (
    <div className="shrink-0 p-2 pt-1">
      <textarea
        autoFocus
        rows={2}
        value={value}
        placeholder="Card title — Enter to add"
        aria-label="New card title"
        data-testid={`kanban-pane-column-${columnId}-add-card-input`}
        className={cn(ui.input, "resize-none text-[13px] select-text")}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          submit();
          setOpen(false);
        }}
      />
    </div>
  );
}

function AddColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="border-app-border-mid text-app-dim hover:border-app-border-accent w-72 justify-start rounded-lg border-dashed bg-transparent text-xs"
        data-testid="kanban-pane-add-column-button"
        onClick={() => setOpen(true)}
      >
        <IconPlus className="size-3.5" />
        Add column
      </Button>
    );
  }
  const finish = (value: string) => {
    const title = value.trim();
    if (title) onAdd(title);
    setOpen(false);
  };
  return (
    <div className="border-app-border bg-app-sidebar w-72 shrink-0 rounded-lg border p-2">
      <Input
        autoFocus
        placeholder="Column name — Enter to add"
        aria-label="New column name"
        data-testid="kanban-pane-add-column-input"
        className="select-text"
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(e.currentTarget.value);
          else if (e.key === "Escape") setOpen(false);
        }}
        onBlur={(e) => finish(e.currentTarget.value)}
      />
    </div>
  );
}

/* ───────────────────────────── Editor ───────────────────────────── */

function CardEditor({
  card,
  rect,
  onClose,
  onChange,
  onDelete,
}: {
  card: KanbanCard | undefined;
  rect: DOMRect | null;
  onClose: () => void;
  onChange: (patch: Partial<KanbanCard>) => void;
  onDelete: () => void;
}) {
  if (!card || !rect) return null;
  return (
    <Popover open onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor asChild>
        <div
          className="pointer-events-none fixed"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: Math.min(rect.height, 160),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        className="w-80 p-3 select-text"
        data-testid="kanban-card-editor"
        // A tap that opens the card should not also raise the on-screen
        // keyboard; the fields are a tap away.
        onOpenAutoFocus={(e) => {
          if (isCoarsePointer()) e.preventDefault();
        }}
      >
        <div className="flex flex-col gap-2.5">
          <textarea
            rows={2}
            className="font-title text-app-bright placeholder:text-app-dim w-full resize-none bg-transparent text-sm font-semibold outline-none"
            placeholder="Card title"
            aria-label="Card title"
            value={card.title}
            data-testid="kanban-card-editor-title-input"
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <textarea
            className={cn(ui.input, "min-h-20 resize-y")}
            placeholder="Add notes"
            aria-label="Notes"
            value={card.notes ?? ""}
            data-testid="kanban-card-editor-notes-input"
            onChange={(e) => onChange({ notes: e.target.value || undefined })}
          />
          <div className="text-app-text grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-xs">
            <CardDateField
              field="initial"
              label="Initial"
              card={card}
              onChange={(initial) => onChange({ initial })}
            />
            <CardDateField
              field="start"
              label="Start"
              card={card}
              disabled={card.due ? { after: parseLocal(card.due) } : undefined}
              onChange={(start) => {
                const patch: Partial<KanbanCard> = { start };
                // A start after the due date pushes the due date along; a
                // start after the end pushes the end along.
                if (start && card.due && start > card.due) patch.due = start;
                if (start && card.end && start > card.end) patch.end = start;
                onChange(patch);
              }}
            />
            <CardDateField
              field="end"
              label="End"
              card={card}
              disabled={
                card.start ? { before: parseLocal(card.start) } : undefined
              }
              onChange={(end) =>
                // An end before the start pulls the start back.
                onChange(
                  end && card.start && end < card.start
                    ? { end, start: end }
                    : { end },
                )
              }
            />
            <CardDateField
              field="due"
              label="Due"
              card={card}
              disabled={
                card.start ? { before: parseLocal(card.start) } : undefined
              }
              onChange={(due) =>
                // A due date before the start pulls the start back.
                onChange(
                  due && card.start && due < card.start
                    ? { due, start: due }
                    : { due },
                )
              }
            />
          </div>
          <div
            className="flex items-center gap-1.5 pointer-coarse:gap-2"
            role="radiogroup"
            aria-label="Label colour"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!card.color}
              aria-label="No label"
              title="No label"
              data-testid="kanban-card-editor-color-none-button"
              className={cn(
                "border-app-border-mid ring-app-dim ring-offset-app-panel size-5 rounded-full border border-dashed ring-offset-2 pointer-coarse:size-7",
                !card.color && "ring-2",
              )}
              onClick={() => onChange({ color: undefined })}
            />
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={card.color === c}
                aria-label={c}
                data-testid={`kanban-card-editor-color-${c}-button`}
                className={cn(
                  "ring-offset-app-panel size-5 rounded-full ring-offset-2 transition-transform hover:scale-110 pointer-coarse:size-7",
                  card.color === c && "ring-2",
                )}
                style={{
                  background: COLOR_HEX[c],
                  ["--tw-ring-color" as string]: COLOR_HEX[c],
                }}
                onClick={() => onChange({ color: c })}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              data-testid="kanban-card-editor-delete-button"
              onClick={onDelete}
            >
              <IconTrash className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type CardDateKey = "initial" | "start" | "end" | "due";

/** One labelled date row of the card editor; clearing it sends `undefined`. */
function CardDateField({
  field,
  label,
  card,
  disabled,
  onChange,
}: {
  field: CardDateKey;
  label: string;
  card: KanbanCard;
  disabled?: { before: Date } | { after: Date };
  onChange: (value: string | undefined) => void;
}) {
  const value = card[field];
  const id = `kanban-card-editor-${field}`;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <DatePicker
        id={id}
        variant="outline"
        size="sm"
        className="w-full min-w-0"
        placeholder={`No ${label.toLowerCase()} date`}
        value={value ? parseLocal(value) : undefined}
        calendarProps={{ disabled }}
        data-testid={`${id}-input`}
        onValueChange={(date) => onChange(date ? dateKey(date) : undefined)}
      />
    </>
  );
}
