/**
 * `.kanban` files: a board of columns, each holding ordered cards, stored as
 * a small JSON document.
 *
 * ```json
 * { "version": 1, "columns": [
 *   { "id": "c1", "title": "To Do", "cards": [
 *     { "id": "k1", "title": "Write spec", "notes": "…", "color": "blue",
 *       "initial": "2026-11-10", "start": "2026-11-16", "end": "2026-11-19",
 *       "due": "2026-11-20" }
 *   ] },
 *   { "id": "c2", "title": "Done", "done": true, "cards": [] }
 * ] }
 * ```
 * Order in the file is order on the board. `done` marks a column whose cards
 * are finished (they are dimmed and never flagged overdue).
 */
import { EVENT_COLORS, type EventColor } from "@/lib/calendar";

export interface KanbanCard {
  id: string;
  title: string;
  notes?: string;
  /** Label colour — the same palette calendar events use. */
  color?: EventColor;
  /** `YYYY-MM-DD` — when the card was first planned. */
  initial?: string;
  /** `YYYY-MM-DD` — when work begins. Never after {@link due} or {@link end}. */
  start?: string;
  /** `YYYY-MM-DD` — when work actually finished. Never before {@link start}. */
  end?: string;
  /** `YYYY-MM-DD` — the deadline. */
  due?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  /** Cards here are finished. */
  done?: boolean;
  cards: KanbanCard[];
}

export interface KanbanDoc {
  version: 1;
  columns: KanbanColumn[];
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** A new board: the three classic columns. */
export function starterBoard(): KanbanDoc {
  return {
    version: 1,
    columns: [
      { id: newId(), title: "To Do", cards: [] },
      { id: newId(), title: "In Progress", cards: [] },
      { id: newId(), title: "Done", done: true, cards: [] },
    ],
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses file text; an empty file is a starter board. Throws on bad JSON.
 * Ids are made unique across columns and cards — drag and drop keys on them.
 */
export function parseKanban(text: string): KanbanDoc {
  if (!text.trim()) return starterBoard();
  const raw = JSON.parse(text) as { columns?: unknown };
  const seen = new Set<string>();
  const uniqueId = (value: unknown) => {
    let id = typeof value === "string" && value ? value : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };
  const columns: KanbanColumn[] = [];
  for (const item of Array.isArray(raw?.columns) ? raw.columns : []) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const cards: KanbanCard[] = [];
    for (const entry of Array.isArray(c.cards) ? c.cards : []) {
      if (!entry || typeof entry !== "object") continue;
      const k = entry as Record<string, unknown>;
      cards.push({
        id: uniqueId(k.id),
        title: typeof k.title === "string" ? k.title : "",
        notes: typeof k.notes === "string" && k.notes ? k.notes : undefined,
        color: EVENT_COLORS.includes(k.color as EventColor)
          ? (k.color as EventColor)
          : undefined,
        ...cardDates(k),
      });
    }
    columns.push({
      id: uniqueId(c.id),
      title: typeof c.title === "string" ? c.title : "",
      done: c.done === true || undefined,
      cards,
    });
  }
  return { version: 1, columns };
}

const dateOf = (value: unknown) =>
  typeof value === "string" && DATE_RE.test(value) ? value : undefined;

/**
 * Valid card dates. A start after the due date moves to it; an end before
 * the start moves up to it.
 */
function cardDates(k: Record<string, unknown>) {
  const due = dateOf(k.due);
  let start = dateOf(k.start);
  if (start && due && start > due) start = due;
  let end = dateOf(k.end);
  if (end && start && end < start) end = start;
  return { initial: dateOf(k.initial), start, end, due };
}

export function serializeKanban(doc: KanbanDoc) {
  return `${JSON.stringify({ version: 1, columns: doc.columns }, null, 2)}\n`;
}

export const STARTER_KANBAN = serializeKanban(starterBoard());

export function countCards(columns: KanbanColumn[]) {
  return columns.reduce((n, c) => n + c.cards.length, 0);
}
