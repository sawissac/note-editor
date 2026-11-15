/**
 * `.calendar` files: a small JSON document of events, plus the date maths the
 * calendar pane and the unified export share. No dependencies — every date is
 * a plain local `Date` (times are "floating": no time zone is stored, an event
 * at 09:00 is at 09:00 wherever the file is opened, like a paper diary).
 *
 * On disk:
 * ```json
 * { "version": 1, "events": [
 *   { "id": "k3x9", "title": "Standup", "start": "2026-11-16T09:00",
 *     "end": "2026-11-16T09:15", "color": "blue" },
 *   { "id": "p0q2", "title": "Offsite", "start": "2026-11-20",
 *     "end": "2026-11-21", "allDay": true, "color": "green" }
 * ] }
 * ```
 * Timed events use `YYYY-MM-DDTHH:mm` with an exclusive end; all-day events use
 * `YYYY-MM-DD` with an inclusive end (the last day they cover).
 */

export const EVENT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "brown",
] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

/** The calendar palette (Apple's system colours). */
export const COLOR_HEX: Record<EventColor, string> = {
  red: "#ff3b30",
  orange: "#ff9500",
  yellow: "#ffcc00",
  green: "#34c759",
  blue: "#007aff",
  purple: "#af52de",
  brown: "#a2845e",
};

export interface CalendarEvent {
  id: string;
  title: string;
  /** `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD` when {@link allDay}. */
  start: string;
  /** Exclusive for timed events; the last covered day for all-day ones. */
  end: string;
  allDay?: boolean;
  color: EventColor;
  location?: string;
  notes?: string;
}

export interface CalendarDoc {
  version: 1;
  events: CalendarEvent[];
}

export const EMPTY_CALENDAR = `${JSON.stringify({ version: 1, events: [] }, null, 2)}\n`;

/* ───────────────────────────── Parse / serialize ───────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Parses file text; an empty file is an empty calendar. Throws on bad JSON. */
export function parseCalendar(text: string): CalendarDoc {
  if (!text.trim()) return { version: 1, events: [] };
  const raw = JSON.parse(text) as { events?: unknown };
  const list = Array.isArray(raw?.events) ? raw.events : [];
  const events: CalendarEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const allDay = e.allDay === true;
    const start = String(e.start ?? "");
    let end = String(e.end ?? start);
    const valid = allDay
      ? DATE_RE.test(start) && DATE_RE.test(end)
      : DATE_TIME_RE.test(start) && DATE_TIME_RE.test(end);
    if (!valid) continue;
    if (end < start) end = start;
    events.push({
      id: typeof e.id === "string" && e.id ? e.id : newId(),
      title: typeof e.title === "string" ? e.title : "",
      start,
      end,
      allDay: allDay || undefined,
      color: EVENT_COLORS.includes(e.color as EventColor)
        ? (e.color as EventColor)
        : "blue",
      location:
        typeof e.location === "string" && e.location ? e.location : undefined,
      notes: typeof e.notes === "string" && e.notes ? e.notes : undefined,
    });
  }
  return { version: 1, events: sortEvents(events) };
}

export function serializeCalendar(doc: CalendarDoc) {
  return `${JSON.stringify({ version: 1, events: sortEvents(doc.events) }, null, 2)}\n`;
}

export function sortEvents(events: CalendarEvent[]) {
  return [...events].sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) ||
      a.end.localeCompare(b.end),
  );
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/* ───────────────────────────── Dates ───────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` for a local date. */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm` for a local date-time. */
export function dateTimeKey(d: Date) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local `Date` from `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
export function parseLocal(value: string) {
  const [y, m, d, hh = 0, mm = 0] = value.split(/[-T:]/).map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
  );
}

export function addMinutes(d: Date, n: number) {
  return new Date(d.getTime() + n * 60_000);
}

export function addMonths(d: Date, n: number) {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(d.getDate(), last),
  );
}

/** Sunday-first week start. */
export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -d.getDay());
}

export function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

/** Whole days from `a` to `b` (local midnights; DST-safe). */
export function dayDiff(a: Date, b: Date) {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** Minutes since local midnight. */
export function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

/** 6 × 7 Sunday-first grid covering `month`. */
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/* ───────────────────────────── Event geometry ───────────────────────────── */

/** First and last day an event touches (inclusive). */
export function eventDayRange(e: CalendarEvent): [Date, Date] {
  const start = startOfDay(parseLocal(e.start));
  if (e.allDay) return [start, startOfDay(parseLocal(e.end))];
  const end = parseLocal(e.end);
  // An event ending exactly at midnight does not touch the next day.
  const last =
    end > parseLocal(e.start) && minutesOfDay(end) === 0
      ? addDays(end, -1)
      : end;
  return [start, startOfDay(last)];
}

/** Index of events by `YYYY-MM-DD` of every day they touch. */
export function indexByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const [first, last] = eventDayRange(e);
    const span = Math.min(dayDiff(first, last), 366);
    for (let i = 0; i <= span; i++) {
      const key = dateKey(addDays(first, i));
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
  }
  return map;
}

export interface PlacedEvent {
  event: CalendarEvent;
  /** Minutes from midnight of this day (clipped to the day). */
  top: number;
  bottom: number;
  column: number;
  columns: number;
}

/**
 * Lays out one day's timed events side by side where they overlap: each
 * cluster of overlapping events shares its width between as many columns as
 * it needs at once.
 */
export function layoutDay(day: Date, events: CalendarEvent[]): PlacedEvent[] {
  const dayStart = startOfDay(day).getTime();
  const items = events
    .filter((e) => !e.allDay)
    .map((event) => {
      const s = (parseLocal(event.start).getTime() - dayStart) / 60_000;
      const en = (parseLocal(event.end).getTime() - dayStart) / 60_000;
      const top = Math.max(0, s);
      // At least 15 minutes tall so short events stay clickable.
      const bottom = Math.max(Math.min(1440, en), top + 15);
      return { event, top, bottom, column: 0, columns: 1 };
    })
    .filter((p) => p.top < 1440)
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let cluster: PlacedEvent[] = [];
  let clusterEnd = -1;
  const columnsEnd: number[] = [];
  const close = () => {
    for (const p of cluster) p.columns = columnsEnd.length;
    cluster = [];
    columnsEnd.length = 0;
  };
  for (const p of items) {
    if (p.top >= clusterEnd) close();
    let col = columnsEnd.findIndex((end) => end <= p.top);
    if (col < 0) col = columnsEnd.length;
    columnsEnd[col] = p.bottom;
    p.column = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.bottom);
  }
  close();
  return items;
}

/* ───────────────────────────── Text ───────────────────────────── */

export function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "9 AM" / "21:00" for an hour label, following the locale's clock. */
export function formatHour(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: "numeric",
  });
}

/** Human time range: "All day", "9:00 – 10:30 AM", or with dates when it spans days. */
export function describeEventTime(e: CalendarEvent) {
  const s = parseLocal(e.start);
  const en = parseLocal(e.end);
  const date = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  if (e.allDay) {
    return e.start === e.end
      ? `${date(s)} · All day`
      : `${date(s)} – ${date(en)} · All day`;
  }
  const [first, last] = eventDayRange(e);
  if (sameDay(first, last))
    return `${date(s)} · ${formatTime(s)} – ${formatTime(en)}`;
  return `${date(s)} ${formatTime(s)} – ${date(en)} ${formatTime(en)}`;
}

/* ───────────────────────────── iCalendar ───────────────────────────── */

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 75 octets (approximated by characters). */
function fold(line: string) {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74)
    out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
}

/** `.ics` text other calendar apps (Apple Calendar, Google, Outlook) import. */
export function toIcs(doc: CalendarDoc, name: string) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");
  const compact = (v: string) => v.replace(/[-:]/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bento//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(name)}`,
  ];
  for (const e of doc.events) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@note-editor`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${compact(e.start)}`,
        `DTEND;VALUE=DATE:${compact(dateKey(addDays(parseLocal(e.end), 1)))}`,
      );
    } else {
      lines.push(`DTSTART:${compact(e.start)}00`, `DTEND:${compact(e.end)}00`);
    }
    lines.push(`SUMMARY:${icsText(e.title || "New Event")}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsText(e.notes)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/* ───────────────────────────── Mermaid timeline ───────────────────────────── */

/**
 * Event text for a Mermaid timeline. The grammar ends an event at a colon
 * followed by whitespace (or the line end) and at a newline, and treats
 * `%%` as a comment. A zero-width space after such a colon keeps it a
 * plain, normally rendered colon (`\s` does not match U+200B); the same
 * invisible break splits `%%`. Newlines fold to spaces.
 */
function timelineText(value: string) {
  return value
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/:(?=\s|$)/g, ":\u200B")
    .replace(/%%/g, "%\u200B%")
    .trim();
}

/** Time period / section labels may not hold `:` or `#` at all. */
const timelineLabel = (value: string) =>
  value.replace(/[:#]/g, " ").replace(/\s+/g, " ").trim();

/** Longest span (in days) spread across the timeline one day at a time. */
const TIMELINE_MAX_SPREAD_DAYS = 62;

/**
 * The calendar as a Mermaid `timeline` diagram (no title): one section per month, one
 * time period per day that has something on it, that day's events in order.
 *
 * Every box carries exact dates and times: its title (and location), then
 * the date with the exact time window on that day. A multi-day event
 * appears on EVERY day it covers (Nov 15 → 20 shows on 15, 16, …, 20); each
 * box gives that day's slice ("Nov 16, 2026, 12:00 AM – 11:59 PM"). Spans
 * longer than {@link TIMELINE_MAX_SPREAD_DAYS} show on their first and last
 * day only, so the diagram stays readable. Throws when there is nothing to plot.
 */
export function toMermaidTimeline(doc: CalendarDoc) {
  if (!doc.events.length) {
    throw new Error("There are no events to put on a timeline.");
  }
  const monthOf = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dayOf = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  /** "Nov 16, 2026" — boxes carry the exact date, year included. */
  const fullDay = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  type Slice = {
    day: Date;
    /** Minutes into the day the slice starts; -1 = all day (sorts first). */
    from: number;
    text: string;
    seq: number;
  };
  const slices: Slice[] = [];

  sortEvents(doc.events).forEach((e, seq) => {
    const name = timelineText(
      `${e.title || "New Event"}${e.location ? ` (${e.location})` : ""}`,
    );
    const add = (day: Date, from: number, ...when: string[]) =>
      slices.push({
        day,
        from,
        seq,
        text: [name, ...when.map(timelineText)].join(" <br> "),
      });

    const [first, last] = eventDayRange(e);
    const s = parseLocal(e.start);
    const en = parseLocal(e.end);
    const total = dayDiff(first, last) + 1;
    const startOfDayTime = formatTime(startOfDay(s));
    const endOfDayTime = formatTime(addMinutes(startOfDay(s), 24 * 60 - 1));

    if (total === 1) {
      add(
        first,
        e.allDay ? -1 : minutesOfDay(s),
        e.allDay
          ? `${fullDay(first)} · All day`
          : `${fullDay(first)}, ${formatTime(s)} – ${formatTime(en)}`,
      );
      return;
    }
    // The whole span, exact at both ends (only for spans too long to spread).
    const range = e.allDay
      ? `${fullDay(first)} – ${fullDay(last)} · All day`
      : `${fullDay(s)}, ${formatTime(s)} – ${fullDay(en)}, ${formatTime(en)}`;
    if (total > TIMELINE_MAX_SPREAD_DAYS) {
      add(first, e.allDay ? -1 : minutesOfDay(s), `Starts: ${range}`);
      add(last, -1, `Ends: ${range}`);
      return;
    }
    for (let i = 0; i < total; i++) {
      const day = addDays(first, i);
      // This day's exact slice of the event.
      const from = e.allDay || i > 0 ? startOfDayTime : formatTime(s);
      const to = e.allDay || i < total - 1 ? endOfDayTime : formatTime(en);
      const today = e.allDay
        ? `${fullDay(day)} · All day`
        : `${fullDay(day)}, ${from} – ${to}`;
      add(day, !e.allDay && i === 0 ? minutesOfDay(s) : -1, today);
    }
  });

  slices.sort(
    (a, b) =>
      a.day.getTime() - b.day.getTime() || a.from - b.from || a.seq - b.seq,
  );

  const lines = ["timeline"];
  let month = "";
  let day = "";
  for (const slice of slices) {
    const m = timelineLabel(monthOf(slice.day));
    if (m !== month) {
      month = m;
      day = "";
      lines.push(`    section ${m}`);
    }
    const d = timelineLabel(dayOf(slice.day));
    if (d !== day) {
      day = d;
      lines.push(`        ${d} : ${slice.text}`);
    } else {
      lines.push(`             : ${slice.text}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
