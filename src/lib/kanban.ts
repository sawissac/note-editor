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
import { dateKey, EVENT_COLORS, type EventColor } from "@/lib/calendar";

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

/* ───────────────────────────── Mermaid Gantt ───────────────────────────── */

/**
 * Words the Gantt lexer reads as a statement when a line starts with them;
 * a task named "Title page" would otherwise become the chart title.
 */
const GANTT_KEYWORD =
  /^(?:gantt|title|section|click|call|href|dateformat|axisformat|tickinterval|includes|excludes|todaymarker|weekday|weekend|inclusiveenddates|topaxis|acctitle|accdescr|accdescription)\b|^%|^\d{4}-\d{2}-\d{2}\b/i;

/**
 * Text safe for a Gantt task name or section: a colon would end the name
 * (written as Mermaid's `#58;` entity instead), newlines fold to spaces, and
 * a leading keyword gets a zero-width space so it stays plain text.
 */
function ganttText(value: string, fallback: string) {
  const text = value.replace(/\s*\r?\n\s*/g, " ").trim() || fallback;
  const safe = text.replace(/:/g, "#58;");
  return GANTT_KEYWORD.test(safe) ? `​${safe}` : safe;
}

/**
 * The board as a Mermaid `gantt` chart: one section per column, one bar per
 * card in board order, running from `initial` (began doing the task) to
 * `due` (its deadline), end dates inclusive. The project timeline
 * (`start` / `end`) is not drawn as bars: its dates are vertical marker
 * lines ("Project start" / "Project end" when every card shares them,
 * otherwise "Start · RPB-101, RPB-102"), and the axis stretches to them.
 *
 * A card with only an initial date is a single day; one with only a due
 * date is a milestone on the deadline. Cards with neither are left out.
 *
 * Status: cards in a "done" column are `done`; otherwise a task past its
 * due date is `crit` (overdue) and one running today is `active`. The axis
 * ticks daily / weekly for short charts so dates never repeat. Throws when
 * no card has an initial or due date.
 */
export function toMermaidGantt(doc: KanbanDoc, today = dateKey(new Date())) {
  const tasks: string[] = [];
  const dates: string[] = [];
  let count = 0;
  for (const column of doc.columns) {
    const rows: string[] = [];
    for (const card of column.cards) {
      if (!card.initial && !card.due) continue;
      const name = ganttText(card.title, "Untitled");
      const id = `t${++count}`;
      const overdue = !column.done && Boolean(card.due) && card.due! < today;
      if (!card.initial) {
        const tags = [
          "milestone",
          ...(column.done ? ["done"] : []),
          ...(overdue ? ["crit"] : []),
        ];
        rows.push(`    ${name} :${tags.join(", ")}, ${id}, ${card.due}, 0d`);
        dates.push(card.due!);
        continue;
      }
      const from = card.initial;
      const to = card.due && card.due > from ? card.due : from;
      const tags: string[] = [];
      if (column.done) tags.push("done");
      else {
        if (overdue) tags.push("crit");
        if (from <= today && today <= to) tags.push("active");
      }
      rows.push(`    ${name} :${[...tags, id].join(", ")}, ${from}, ${to}`);
      dates.push(from, to);
    }
    if (!rows.length) continue;
    tasks.push(`    section ${ganttText(column.title, "Untitled")}`, ...rows);
  }
  // Project timeline: one vertical marker per distinct start / end date.
  const markers: string[] = [];
  const projectCards = doc.columns.flatMap((c) =>
    c.cards.filter((k) => k.start || k.end),
  );
  for (const [field, word] of [
    ["start", "start"],
    ["end", "end"],
  ] as const) {
    const byDate = new Map<string, string[]>();
    for (const card of projectCards) {
      const day = card[field];
      if (!day) continue;
      byDate.set(day, [
        ...(byDate.get(day) ?? []),
        card.title.trim() || "Untitled",
      ]);
    }
    for (const [day, titles] of [...byDate].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const label =
        byDate.size === 1 && titles.length === projectCards.length
          ? `Project ${word}`
          : `${word === "start" ? "Start" : "End"} · ${titles.join(", ")}`;
      markers.push(
        `    ${ganttText(label, "Project")} :vert, v${markers.length + 1}, ${day}, 0d`,
      );
      dates.push(day);
    }
  }

  if (!count && !markers.length) {
    throw new Error(
      "No card has a date yet — add an initial, due, start or end date to chart it.",
    );
  }

  // Mermaid picks sub-day ticks for short charts, printing each date twice.
  dates.sort();
  const span =
    (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000;
  const tick = span <= 21 ? "1day" : span <= 120 ? "1week" : undefined;

  return `${[
    "gantt",
    "    dateFormat YYYY-MM-DD",
    "    axisFormat %b %d",
    ...(tick ? [`    tickInterval ${tick}`] : []),
    "    inclusiveEndDates",
    ...tasks,
    ...markers,
  ].join("\n")}\n`;
}
