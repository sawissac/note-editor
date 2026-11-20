import "@/styles/calendar-pane.css";

import {
  IconCalendarEvent,
  IconCalendarPlus,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { MapPin } from "lucide-react";
import { AnimatePresence, m, type Variants } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  addDays,
  addMinutes,
  addMonths,
  type CalendarDoc,
  type CalendarEvent,
  COLOR_HEX,
  dateKey,
  dateTimeKey,
  dayDiff,
  describeEventTime,
  EVENT_COLORS,
  type EventColor,
  formatHour,
  formatTime,
  indexByDay,
  layoutDay,
  minutesOfDay,
  monthGrid,
  newId,
  parseCalendar,
  parseLocal,
  sameDay,
  serializeCalendar,
  startOfDay,
  startOfWeek,
  toIcs,
} from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { enter, exit, glide, quick } from "@/lib/motion";
import { downloadFile } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import { isCoarsePointer, useCoarsePointer } from "@/lib/use-media-query";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

type View = "day" | "week" | "month" | "year";
const VIEWS: Array<{ id: View; label: string; key: string }> = [
  { id: "day", label: "Day", key: "d" },
  { id: "week", label: "Week", key: "w" },
  { id: "month", label: "Month", key: "m" },
  { id: "year", label: "Year", key: "y" },
];

/** Height of one hour in the day / week grid. */
const HOUR_PX = 48;
/** Drag and create snap to quarter hours. */
const SNAP_MIN = 15;
/** Pixels a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Touch: hold this long before a press can drag; moving sooner scrolls. */
const TOUCH_HOLD_MS = 300;
/** Finger travel during the hold that makes the press a scroll instead. */
const TOUCH_SLOP = 10;
const TODAY_RED = "#ff3b30";
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 10, 1 + i).toLocaleDateString(undefined, { weekday: "short" }),
);

/* ───────────────────────────── Colours ───────────────────────────── */

/** Apple-style event fill: tinted block, solid edge, dark same-hue text. */
function eventStyle(color: EventColor, selected: boolean): React.CSSProperties {
  const hex = COLOR_HEX[color];
  return selected
    ? { background: hex, color: "#fff", borderColor: hex }
    : {
        background: `color-mix(in srgb, ${hex} 16%, var(--app-panel))`,
        color: `color-mix(in srgb, ${hex} 72%, #000)`,
        borderColor: hex,
      };
}

/* ───────────────────────────── Press tracking ───────────────────────────── */

type Press = {
  /** Touch only: the finger held still long enough; it may now drag. */
  onHold?: (at: { x: number; y: number }) => void;
  /** The pointer moved while the press can drag. */
  onMove: (e: PointerEvent) => void;
  /**
   * Released — a tap, or the end of a drag. Return `true` when a touch tap
   * acted (opened a popover…) so the browser's emulated mouse events that
   * trail it cannot refocus the pane and dismiss what just opened.
   */
  onUp: (e: PointerEvent) => boolean | void;
  /** Abandoned: the finger scrolled instead, or the browser took over. */
  onCancel: () => void;
};

/**
 * Follows one press from `pointerdown` to release on window listeners, for
 * the calendar's drag-to-move / resize / create gestures.
 *
 * Mouse and pen can drag at once. A finger must first hold still for
 * {@link TOUCH_HOLD_MS}: moving sooner is a scroll, so the press is dropped
 * and the browser pans as usual. Once held, panning (and the long-press
 * callout) is blocked for the rest of the press, and the emulated
 * mousedown / click the browser fires after the release are swallowed (see
 * {@link swallowEmulatedMouse}). `immediate` skips the hold, for a surface
 * that claims the finger itself (`touch-action: none`).
 */
function trackPress(pe: React.PointerEvent, press: Press, immediate = false) {
  const touch = pe.pointerType === "touch";
  const pointerId = pe.pointerId;
  const origin = { x: pe.clientX, y: pe.clientY };
  let last = origin;
  let live = !touch || immediate;
  const holdTimer = live
    ? 0
    : window.setTimeout(() => {
        live = true;
        press.onHold?.(last);
      }, TOUCH_HOLD_MS);
  const blockWhileLive = (e: Event) => {
    if (live && e.cancelable) e.preventDefault();
  };
  const stop = () => {
    window.clearTimeout(holdTimer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("touchmove", blockWhileLive);
    window.removeEventListener("contextmenu", blockWhileLive, true);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    last = { x: e.clientX, y: e.clientY };
    if (!live) {
      if (Math.hypot(last.x - origin.x, last.y - origin.y) > TOUCH_SLOP) {
        stop();
        press.onCancel();
      }
      return;
    }
    press.onMove(e);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    const acted = press.onUp(e);
    if (touch && (live || acted)) swallowEmulatedMouse();
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    press.onCancel();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  if (touch) {
    window.addEventListener("touchmove", blockWhileLive, { passive: false });
    window.addEventListener("contextmenu", blockWhileLive, true);
  }
}

/**
 * After a touch release the browser replays it as mouse events (a tap) —
 * `mousedown` would move focus to the pane, which dismisses a popover the
 * release just opened, and `click` would select whatever lies under the
 * finger. Drops both for a moment.
 */
function swallowEmulatedMouse() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("mousedown", swallow, true);
  window.addEventListener("click", swallow, true);
  window.setTimeout(() => {
    window.removeEventListener("mousedown", swallow, true);
    window.removeEventListener("click", swallow, true);
  }, 400);
}

/* ───────────────────────────── Pane ───────────────────────────── */

type EditorState = { id: string; rect: DOMRect } | null;

/**
 * `.calendar` files: an Apple Calendar–style planner over the file's JSON
 * events. Day / Week / Month / Year views; drag events to move them, drag an
 * event's bottom edge to resize it, drag or double-click empty time to create
 * one. Edits save automatically. On a touch screen a swipe scrolls; press
 * and hold an event to lift it, or empty time / a month day to create one.
 *
 * Keys (when the calendar has focus): ← → previous / next, T today,
 * D W M Y switch view, N new event, Enter edit, Delete remove.
 */
export default function CalendarPane({
  id,
  name,
  content,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    const text = typeof content === "string" ? content : "";
    try {
      return { doc: parseCalendar(text), error: null as string | null };
    } catch (error) {
      return {
        doc: { version: 1, events: [] } as CalendarDoc,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // Mounted per file (`key={id}` upstream) — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const [view, setView] = React.useState<View>("month");
  const [cursor, setCursor] = React.useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<EditorState>(null);
  const now = useNow();
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Which way the visible period moved, so it slides in from that side
  // (0 = the view changed: zoom instead). Derived during render.
  const period = `${view}:${periodKey(view, cursor)}`;
  const [nav, setNav] = React.useState({
    period,
    view,
    time: cursor.getTime(),
    dir: 0,
  });
  if (nav.period !== period) {
    setNav({
      period,
      view,
      time: cursor.getTime(),
      dir: nav.view === view ? Math.sign(cursor.getTime() - nav.time) : 0,
    });
  }
  const lastColor = React.useRef<EventColor>("blue");

  const textRef = React.useRef(serializeCalendar(initial.doc));
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () =>
    dispatch(saveContent(id, textRef.current)),
  );

  const commit = React.useCallback(
    (update: (events: CalendarEvent[]) => CalendarEvent[]) => {
      setDoc((prev) => {
        const next: CalendarDoc = { version: 1, events: update(prev.events) };
        textRef.current = serializeCalendar(next);
        save(textRef.current);
        return next;
      });
    },
    [save],
  );

  const updateEvent = React.useCallback(
    (eventId: string, patch: Partial<CalendarEvent>) =>
      commit((events) =>
        events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)),
      ),
    [commit],
  );

  const deleteEvent = React.useCallback(
    (eventId: string) => {
      commit((events) => events.filter((e) => e.id !== eventId));
      setSelectedId((cur) => (cur === eventId ? null : cur));
      setEditor((cur) => (cur?.id === eventId ? null : cur));
      rootRef.current?.focus();
    },
    [commit],
  );

  /** Adds an event and opens its editor once it is on screen. */
  const createEvent = React.useCallback(
    (fields: Pick<CalendarEvent, "start" | "end"> & { allDay?: boolean }) => {
      const event: CalendarEvent = {
        id: newId(),
        title: "New Event",
        color: lastColor.current,
        ...fields,
      };
      commit((events) => [...events, event]);
      setSelectedId(event.id);
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector(
          `[data-event-id="${event.id}"]`,
        );
        if (el) setEditor({ id: event.id, rect: el.getBoundingClientRect() });
      });
    },
    [commit],
  );

  const openEditor = React.useCallback((eventId: string, el: Element) => {
    setSelectedId(eventId);
    setEditor({ id: eventId, rect: el.getBoundingClientRect() });
  }, []);

  const byDay = React.useMemo(() => indexByDay(doc.events), [doc.events]);
  const baseName = name.replace(/\.calendar$/i, "");
  const editingEvent = editor
    ? doc.events.find((e) => e.id === editor.id)
    : undefined;

  const step = (dir: 1 | -1) => {
    setEditor(null);
    setCursor((c) =>
      view === "day"
        ? addDays(c, dir)
        : view === "week"
          ? addDays(c, 7 * dir)
          : view === "month"
            ? addMonths(c, dir)
            : addMonths(c, 12 * dir),
    );
  };
  const goToday = () => {
    setEditor(null);
    setCursor(startOfDay(new Date()));
  };
  const openDay = (day: Date) => {
    setCursor(startOfDay(day));
    setView("day");
  };
  const newEventNow = () => {
    const base = sameDay(cursor, now) ? now : addMinutes(cursor, 9 * 60);
    const start = addMinutes(
      startOfDay(base),
      Math.ceil(minutesOfDay(base) / 30) * 30,
    );
    if (view === "year") setView("day");
    createEvent({
      start: dateTimeKey(start),
      end: dateTimeKey(addMinutes(start, 60)),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]"))
      return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const viewKey = VIEWS.find((v) => v.key === key);
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (key === "t") goToday();
    else if (key === "n") newEventNow();
    else if (viewKey) setView(viewKey.id);
    else if ((e.key === "Delete" || e.key === "Backspace") && selectedId)
      deleteEvent(selectedId);
    else if (e.key === "Enter" && selectedId) {
      const el = rootRef.current?.querySelector(
        `[data-event-id="${selectedId}"]`,
      );
      if (el) openEditor(selectedId, el);
      else return;
    } else if (e.key === "Escape") setSelectedId(null);
    else return;
    e.preventDefault();
  };

  if (parseError) {
    return (
      <div
        data-testid="calendar-pane-error-message"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <p className="font-title text-app-bright text-sm font-semibold">
          This calendar file could not be read
        </p>
        <p className={cn(ui.help, "max-w-md")}>
          It is not valid calendar JSON ({parseError}). Starting a new calendar
          replaces the file's contents.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="calendar-pane-reset-button"
          onClick={() => {
            setParseError(null);
            commit(() => []);
          }}
        >
          <IconCalendarPlus />
          Start an empty calendar
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="calendar-pane"
      className="calendar-pane"
    >
      <FileBarSlot>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          data-testid="calendar-pane-ics-button"
          title="Download as an .ics file for Apple Calendar, Google Calendar or Outlook"
          onClick={() =>
            downloadFile(
              `${baseName}.ics`,
              toIcs(doc, baseName),
              "text/calendar",
            )
          }
        >
          <IconCalendarEvent className="size-3.5" />
          .ics
        </Button>
      </FileBarSlot>

      <header className="border-app-border flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h2
          data-testid="calendar-pane-title"
          className="font-title text-app-bright mr-auto text-lg"
        >
          <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
            <m.span
              key={period}
              className="inline-block"
              custom={nav.dir}
              variants={titleVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <PeriodTitle view={view} cursor={cursor} />
            </m.span>
          </AnimatePresence>
        </h2>
        <ButtonGroup aria-label="View">
          {VIEWS.map((v) => (
            <Button
              key={v.id}
              variant="outline"
              size="sm"
              aria-pressed={view === v.id}
              title={`${v.label} (${v.key.toUpperCase()})`}
              data-testid={`calendar-pane-view-${v.id}-button`}
              className={cn(
                "relative isolate h-7 px-3 text-xs",
                view === v.id && "text-app-accent",
              )}
              onClick={() => {
                setEditor(null);
                setView(v.id);
              }}
            >
              {view === v.id ? (
                <m.span
                  layoutId={`calendar-view-pill-${id}`}
                  className="bg-app-selected pointer-events-none absolute inset-0 -z-10 rounded-[inherit]"
                  transition={glide}
                />
              ) : null}
              {v.label}
            </Button>
          ))}
        </ButtonGroup>
        <ButtonGroup aria-label="Navigate">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            aria-label="Previous"
            title="Previous (←)"
            data-testid="calendar-pane-prev-button"
            onClick={() => step(-1)}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            title="Today (T)"
            data-testid="calendar-pane-today-button"
            onClick={goToday}
          >
            <IconCalendarEvent className="size-3.5" />
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            aria-label="Next"
            title="Next (→)"
            data-testid="calendar-pane-next-button"
            onClick={() => step(1)}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          aria-label="New event"
          title="New event (N)"
          data-testid="calendar-pane-new-button"
          onClick={newEventNow}
        >
          <IconPlus className="size-4" />
        </Button>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={() => {
          // Keep keyboard shortcuts live after clicking into the calendar.
          if (!rootRef.current?.contains(document.activeElement))
            rootRef.current?.focus();
        }}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={nav.dir}>
          <m.div
            key={period}
            className="h-full"
            custom={nav.dir}
            variants={periodVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {view === "month" ? (
              <MonthView
                cursor={cursor}
                now={now}
                byDay={byDay}
                selectedId={selectedId}
                onSelectDay={(d) => {
                  setCursor(d);
                  setSelectedId(null);
                }}
                onOpenDay={openDay}
                onCreate={(d) => {
                  const start = addMinutes(startOfDay(d), 9 * 60);
                  createEvent({
                    start: dateTimeKey(start),
                    end: dateTimeKey(addMinutes(start, 60)),
                  });
                }}
                onEventOpen={openEditor}
                onEventMove={(e, days) =>
                  updateEvent(e.id, shiftEvent(e, days * 1440))
                }
              />
            ) : view === "year" ? (
              <YearView
                cursor={cursor}
                now={now}
                byDay={byDay}
                onOpenDay={openDay}
                onOpenMonth={(m) => {
                  setCursor(m);
                  setView("month");
                }}
              />
            ) : (
              <TimeGridView
                days={
                  view === "day"
                    ? [cursor]
                    : Array.from({ length: 7 }, (_, i) =>
                        addDays(startOfWeek(cursor), i),
                      )
                }
                now={now}
                byDay={byDay}
                selectedId={selectedId}
                onSelectDay={(d) => {
                  setCursor(d);
                  setSelectedId(null);
                }}
                onOpenDay={openDay}
                onEventOpen={openEditor}
                onEventChange={updateEvent}
                onCreate={createEvent}
              />
            )}
          </m.div>
        </AnimatePresence>
      </div>

      <EventEditor
        event={editingEvent}
        rect={editor?.rect ?? null}
        onClose={() => {
          setEditor(null);
          rootRef.current?.focus();
        }}
        onChange={(patch) => {
          if (!editingEvent) return;
          if (patch.color) lastColor.current = patch.color;
          updateEvent(editingEvent.id, patch);
        }}
        onDelete={() => editingEvent && deleteEvent(editingEvent.id)}
      />
    </div>
  );
}

/** Re-renders once a minute so "now" (today, the red time line) stays current. */
function useNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** Moves an event by `minutes`, keeping its length. */
function shiftEvent(e: CalendarEvent, minutes: number): Partial<CalendarEvent> {
  if (e.allDay) {
    const days = Math.round(minutes / 1440);
    return {
      start: dateKey(addDays(parseLocal(e.start), days)),
      end: dateKey(addDays(parseLocal(e.end), days)),
    };
  }
  return {
    start: dateTimeKey(addMinutes(parseLocal(e.start), minutes)),
    end: dateTimeKey(addMinutes(parseLocal(e.end), minutes)),
  };
}

/** Identity of the visible period: changes when the grid shows new days. */
function periodKey(view: View, cursor: Date) {
  switch (view) {
    case "day":
      return dateKey(cursor);
    case "week":
      return dateKey(startOfWeek(cursor));
    case "month":
      return `${cursor.getFullYear()}-${cursor.getMonth()}`;
    default:
      return String(cursor.getFullYear());
  }
}

/** Period grid: slides from the side it moved toward; zooms on a view change. */
const periodVariants: Variants = {
  enter: (dir: number) =>
    dir === 0 ? { opacity: 0, scale: 0.985 } : { opacity: 0, x: dir * 32 },
  center: { opacity: 1, x: 0, scale: 1, transition: enter },
  exit: (dir: number) =>
    dir === 0
      ? { opacity: 0, scale: 1.01, transition: exit }
      : { opacity: 0, x: dir * -32, transition: exit },
};

/** Header title: a short rise/fall matching the grid's direction. */
const titleVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, y: dir < 0 ? -6 : 6 }),
  center: { opacity: 1, y: 0, transition: quick },
  exit: (dir: number) => ({
    opacity: 0,
    y: dir < 0 ? 6 : -6,
    transition: exit,
  }),
};

function PeriodTitle({ view, cursor }: { view: View; cursor: Date }) {
  const year = cursor.getFullYear();
  if (view === "year") return <strong>{year}</strong>;
  if (view === "day") {
    return (
      <>
        <strong>
          {cursor.toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
          })}
        </strong>{" "}
        <span className="text-app-dim">
          {year} · {cursor.toLocaleDateString(undefined, { weekday: "long" })}
        </span>
      </>
    );
  }
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "long" });
  if (view === "week") {
    const first = startOfWeek(cursor);
    const last = addDays(first, 6);
    return (
      <>
        <strong>
          {first.getMonth() === last.getMonth()
            ? month(first)
            : `${month(first)} – ${month(last)}`}
        </strong>{" "}
        <span className="text-app-dim">{last.getFullYear()}</span>
      </>
    );
  }
  return (
    <>
      <strong>{month(cursor)}</strong>{" "}
      <span className="text-app-dim">{year}</span>
    </>
  );
}

/** Day number; today gets Apple's red disc. */
function DayNumber({
  day,
  today,
  large,
}: {
  day: Date;
  today: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full tabular-nums",
        large ? "size-8 text-lg" : "size-6 text-xs",
        today ? "font-semibold text-white" : "text-app-bright",
      )}
      style={today ? { background: TODAY_RED } : undefined}
    >
      {day.getDate()}
    </span>
  );
}

/* ───────────────────────────── Month ───────────────────────────── */

/** Row pitch of a month / all-day chip (19px, 24px on touch) plus a 1px gap. */
const chipHeight = (coarse: boolean) => (coarse ? 25 : 20);

function MonthView({
  cursor,
  now,
  byDay,
  selectedId,
  onSelectDay,
  onOpenDay,
  onCreate,
  onEventOpen,
  onEventMove,
}: {
  cursor: Date;
  now: Date;
  byDay: Map<string, CalendarEvent[]>;
  selectedId: string | null;
  onSelectDay: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  onCreate: (d: Date) => void;
  onEventOpen: (id: string, el: Element) => void;
  onEventMove: (e: CalendarEvent, days: number) => void;
}) {
  const days = React.useMemo(() => monthGrid(cursor), [cursor]);
  const coarse = useCoarsePointer();
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = React.useState(110);
  const [drag, setDrag] = React.useState<{
    event: CalendarEvent;
    overKey: string | null;
  } | null>(null);

  React.useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRowHeight(el.clientHeight / 6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Room for chips under the 28px date line; the last slot becomes "+N more".
  const capacity = Math.max(
    1,
    Math.floor((rowHeight - 30) / chipHeight(coarse)),
  );

  const startDrag = (pe: React.PointerEvent, event: CalendarEvent) => {
    if (pe.button !== 0) return;
    pe.stopPropagation();
    const el = pe.currentTarget;
    let origin = { x: pe.clientX, y: pe.clientY };
    const fromKey =
      (pe.currentTarget.closest("[data-day]") as HTMLElement | null)?.dataset
        .day ?? null;
    let moved = false;
    const keyAt = (x: number, y: number) =>
      (
        document
          .elementFromPoint(x, y)
          ?.closest("[data-day]") as HTMLElement | null
      )?.dataset.day ?? null;
    trackPress(pe, {
      // Touch: the held chip lifts in place, ready to move.
      onHold: (at) => {
        origin = at;
        setDrag({ event, overKey: fromKey });
      },
      onMove: (e) => {
        if (
          !moved &&
          Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <
            DRAG_THRESHOLD
        )
          return;
        moved = true;
        setDrag({ event, overKey: keyAt(e.clientX, e.clientY) });
      },
      onUp: (e) => {
        setDrag(null);
        if (!moved) {
          onEventOpen(event.id, el);
          return true;
        }
        const toKey = keyAt(e.clientX, e.clientY);
        if (toKey && fromKey && toKey !== fromKey) {
          onEventMove(event, dayDiff(parseLocal(fromKey), parseLocal(toKey)));
        }
      },
      onCancel: () => setDrag(null),
    });
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="calendar-month-view"
    >
      <div className="border-app-border grid shrink-0 grid-cols-7 border-b">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-app-dim px-2 py-1.5 text-right text-xs">
            {w}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6"
      >
        {days.map((day) => {
          const key = dateKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const list = byDay.get(key) ?? [];
          const overflow = list.length > capacity;
          const shown = overflow ? list.slice(0, capacity - 1) : list;
          const isCursor = sameDay(day, cursor);
          return (
            <div
              key={key}
              data-day={key}
              data-testid={`calendar-month-view-day-${key}`}
              className={cn(
                "border-app-border relative isolate flex min-h-0 flex-col overflow-hidden border-r border-b p-1",
                !inMonth && "bg-app-bg/60",
                drag?.overKey === key && "bg-app-accent-faint",
              )}
              data-selected={isCursor || undefined}
              onClick={() => onSelectDay(day)}
              // Touch has no double-click: press and hold a day instead.
              onPointerDown={(pe) => {
                if (pe.pointerType !== "touch") return;
                trackPress(pe, {
                  onHold: () => onCreate(day),
                  onMove: () => {},
                  onUp: () => {},
                  onCancel: () => {},
                });
              }}
              onDoubleClick={(e) => {
                if (
                  e.target === e.currentTarget ||
                  (e.target as HTMLElement).dataset.dayHead
                )
                  onCreate(day);
              }}
            >
              {/* Selected day: a tinted, outlined cell that fades in place
                  (the old one fades out), so it reads as selected even on
                  today's red disc. */}
              <AnimatePresence initial={false}>
                {isCursor ? (
                  <m.div
                    key="selection"
                    aria-hidden
                    className="bg-app-accent-faint ring-app-border-accent pointer-events-none absolute inset-0 -z-10 ring-1 ring-inset"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: quick }}
                    exit={{ opacity: 0, transition: exit }}
                  />
                ) : null}
              </AnimatePresence>
              <div data-day-head="1" className="flex shrink-0 justify-end">
                <button
                  type="button"
                  className={cn(
                    "calendar-month__day-button",
                    isCursor &&
                      !sameDay(day, now) &&
                      "calendar-month__day-button--selected",
                    !inMonth && "calendar-month__day-button--outside",
                  )}
                  data-testid={`calendar-month-view-day-${key}-button`}
                  aria-label={day.toDateString()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(day);
                  }}
                >
                  <DayNumber day={day} today={sameDay(day, now)} />
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-px">
                <AnimatePresence initial={false}>
                  {shown.map((event) => (
                    <MonthChip
                      key={event.id}
                      event={event}
                      day={day}
                      selected={event.id === selectedId}
                      dragging={drag?.event.id === event.id}
                      onPointerDown={(pe) => startDrag(pe, event)}
                    />
                  ))}
                </AnimatePresence>
                {overflow ? (
                  <button
                    type="button"
                    className="calendar-month__more"
                    data-testid={`calendar-month-view-more-${key}-button`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDay(day);
                    }}
                  >
                    {list.length - shown.length} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthChip({
  event,
  day,
  selected,
  dragging,
  onPointerDown,
}: {
  event: CalendarEvent;
  day: Date;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const hex = COLOR_HEX[event.color];
  const start = parseLocal(event.start);
  const startsToday = sameDay(start, day);
  const title = event.title || "New Event";
  return (
    <m.button
      type="button"
      data-event-id={event.id}
      data-testid={`calendar-month-view-event-${event.id}`}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      // Opacity lives here, not in a class: motion's inline style would win.
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: dragging ? 0.4 : 1, scale: 1, transition: quick }}
      exit={{ opacity: 0, scale: 0.92, transition: exit }}
      className="calendar-chip"
      style={
        event.allDay
          ? eventStyle(event.color, selected)
          : selected
            ? { background: hex, color: "#fff" }
            : undefined
      }
    >
      {event.allDay ? (
        <span className="truncate font-medium">{title}</span>
      ) : (
        <>
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: selected ? "#fff" : hex }}
          />
          <span
            className={cn(
              "truncate font-medium",
              !selected && "text-app-bright",
            )}
          >
            {title}
          </span>
          {startsToday ? (
            <span
              className={cn(
                "ml-auto shrink-0 tabular-nums",
                !selected && "text-app-dim",
              )}
            >
              {formatTime(start)}
            </span>
          ) : null}
        </>
      )}
    </m.button>
  );
}

/* ───────────────────────────── Day / Week ───────────────────────────── */

type GridDrag =
  | {
      kind: "move";
      event: CalendarEvent;
      /** Pointer offset from the event's start, in minutes. */
      grab: number;
      originDay: number;
      day: number;
      startMin: number;
      moved: boolean;
    }
  | {
      kind: "resize";
      event: CalendarEvent;
      endMin: number;
      day: number;
      moved: boolean;
    }
  | {
      kind: "create";
      day: number;
      anchor: number;
      current: number;
      moved: boolean;
    };

function TimeGridView({
  days,
  now,
  byDay,
  selectedId,
  onSelectDay,
  onOpenDay,
  onEventOpen,
  onEventChange,
  onCreate,
}: {
  days: Date[];
  now: Date;
  byDay: Map<string, CalendarEvent[]>;
  selectedId: string | null;
  onSelectDay: (d: Date) => void;
  onOpenDay: (d: Date) => void;
  onEventOpen: (id: string, el: Element) => void;
  onEventChange: (id: string, patch: Partial<CalendarEvent>) => void;
  onCreate: (fields: Pick<CalendarEvent, "start" | "end">) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const colsRef = React.useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();
  const [drag, setDrag] = React.useState<GridDrag | null>(null);
  const dragRef = React.useRef<GridDrag | null>(null);
  // The ref is the source of truth during a gesture (pointer events can
  // outrun React renders); state mirrors it for drawing.
  const setGridDrag = (next: GridDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const todayIndex = days.findIndex((d) => sameDay(d, now));
  const multi = days.length > 1;

  // Start scrolled to the working day (or just above "now" when it is visible).
  const firstKey = dateKey(days[0]);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hour = todayIndex >= 0 ? Math.max(0, now.getHours() - 2) : 7;
    el.scrollTop = hour * HOUR_PX;
    // Only when the visible range changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length]);

  const columns = React.useMemo(
    () =>
      days.map((day) => {
        const list = byDay.get(dateKey(day)) ?? [];
        return {
          day,
          allDay: list.filter((e) => e.allDay),
          placed: layoutDay(day, list),
        };
      }),
    [days, byDay],
  );
  const allDayRows = Math.max(1, ...columns.map((c) => c.allDay.length));

  /** Day index and snapped minute under a pointer. */
  const locate = (x: number, y: number) => {
    const rect = colsRef.current!.getBoundingClientRect();
    const day = Math.min(
      days.length - 1,
      Math.max(0, Math.floor(((x - rect.left) / rect.width) * days.length)),
    );
    const raw = ((y - rect.top) / HOUR_PX) * 60;
    const minute = Math.min(
      1440,
      Math.max(0, Math.round(raw / SNAP_MIN) * SNAP_MIN),
    );
    return { day, minute, raw };
  };

  /**
   * Starts a move / resize / create gesture. Mouse: travel past
   * {@link DRAG_THRESHOLD} starts it, a click is a tap. Touch (see
   * {@link trackPress}): hold first — the preview appears (a new event
   * previews an hour, which a release right there creates), then move.
   */
  const begin = (
    pe: React.PointerEvent,
    next: GridDrag,
    onTap?: (el: Element) => void,
    immediate = false,
  ) => {
    if (pe.button !== 0) return;
    pe.stopPropagation();
    const target = pe.currentTarget;
    let origin = { x: pe.clientX, y: pe.clientY };
    // The pointer has travelled since the gesture could start.
    let tracking = false;
    setGridDrag(next);
    trackPress(
      pe,
      {
        onHold: (at) => {
          origin = at;
          const cur = dragRef.current;
          if (!cur) return;
          setGridDrag(
            cur.kind === "create"
              ? { ...cur, current: Math.min(1440, cur.anchor + 60), moved: true }
              : { ...cur, moved: true },
          );
        },
        onMove: (e) => {
          const cur = dragRef.current;
          if (!cur) return;
          if (
            !tracking &&
            Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <
              DRAG_THRESHOLD
          )
            return;
          tracking = true;
          const { day, minute, raw } = locate(e.clientX, e.clientY);
          if (cur.kind === "move") {
            const start = Math.round((raw - cur.grab) / SNAP_MIN) * SNAP_MIN;
            setGridDrag({
              ...cur,
              day,
              startMin: Math.max(0, Math.min(1440 - SNAP_MIN, start)),
              moved: true,
            });
          } else if (cur.kind === "resize") {
            setGridDrag({ ...cur, endMin: minute, moved: true });
          } else {
            setGridDrag({ ...cur, current: minute, moved: true });
          }
          autoScroll(e.clientY);
        },
        onUp: () => {
          const cur = dragRef.current;
          setGridDrag(null);
          if (!cur) return;
          // Untravelled: a tap (or a held event let go where it was).
          if (!cur.moved || (cur.kind === "move" && !tracking)) {
            onTap?.(target);
            return true;
          }
          if (cur.kind === "resize" && !tracking) return;
          finish(cur);
        },
        onCancel: () => setGridDrag(null),
      },
      immediate,
    );
  };

  const autoScroll = (y: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (y < r.top + 24) el.scrollTop -= 12;
    else if (y > r.bottom - 24) el.scrollTop += 12;
  };

  const finish = (d: GridDrag) => {
    if (d.kind === "move") {
      const oldStart = parseLocal(d.event.start);
      const newStart = addMinutes(startOfDay(days[d.day]), d.startMin);
      const delta = Math.round(
        (newStart.getTime() - oldStart.getTime()) / 60_000,
      );
      if (delta) onEventChange(d.event.id, shiftEvent(d.event, delta));
    } else if (d.kind === "resize") {
      const start = parseLocal(d.event.start);
      let end = addMinutes(startOfDay(days[d.day]), d.endMin);
      if (end.getTime() - start.getTime() < SNAP_MIN * 60_000)
        end = addMinutes(start, SNAP_MIN);
      onEventChange(d.event.id, { end: dateTimeKey(end) });
    } else {
      const [a, b] = createRange(d);
      const base = startOfDay(days[d.day]);
      onCreate({
        start: dateTimeKey(addMinutes(base, a)),
        end: dateTimeKey(addMinutes(base, b)),
      });
    }
  };

  const nowTop = (minutesOfDay(now) / 60) * HOUR_PX;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="calendar-time-grid"
    >
      {/* Day headers */}
      <div className="border-app-border flex shrink-0 border-b pr-[var(--sbw,0px)]">
        <div className="w-14 shrink-0" />
        <div
          className="grid flex-1"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {days.map((day, i) => (
            <button
              key={dateKey(day)}
              type="button"
              data-testid={`calendar-time-grid-day-${dateKey(day)}-button`}
              className={cn(
                "border-app-border text-app-dim hover:bg-app-hover flex items-center gap-1.5 border-l px-2 py-1.5 text-sm",
                !multi && "justify-start",
                multi && "justify-center",
              )}
              onClick={() => (multi ? onOpenDay(day) : undefined)}
            >
              <span>
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <DayNumber day={day} today={i === todayIndex} />
            </button>
          ))}
        </div>
      </div>

      {/* All-day row */}
      <div className="border-app-border flex shrink-0 border-b">
        <div className="text-app-dim flex w-14 shrink-0 items-start justify-end px-1.5 pt-1 text-[10px]">
          all-day
        </div>
        <div
          className="grid flex-1"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {columns.map(({ day, allDay }) => (
            <div
              key={dateKey(day)}
              className="border-app-border flex flex-col gap-px border-l p-0.5"
              style={{
                minHeight: Math.min(allDayRows, 4) * chipHeight(coarse) + 6,
              }}
              onClick={() => onSelectDay(day)}
            >
              {allDay.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  data-event-id={event.id}
                  data-testid={`calendar-time-grid-allday-${event.id}-${dateKey(day)}`}
                  className="calendar-time-grid__allday-event"
                  style={eventStyle(event.color, event.id === selectedId)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventOpen(event.id, e.currentTarget);
                  }}
                >
                  {event.title || "New Event"}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_PX }}>
          <div className="relative w-14 shrink-0">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="text-app-dim absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums"
                style={{ top: h * HOUR_PX }}
              >
                {formatHour(h)}
              </span>
            ))}
            {todayIndex >= 0 ? (
              <span
                className="bg-app-panel absolute right-1 z-10 -translate-y-1/2 rounded px-0.5 text-[10px] font-semibold tabular-nums"
                style={{ top: nowTop, color: TODAY_RED }}
              >
                {formatTime(now)}
              </span>
            ) : null}
          </div>
          <div
            ref={colsRef}
            className="relative grid flex-1"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              // Hour lines painted, not rendered: 24 fewer elements per column.
              backgroundImage: `linear-gradient(to bottom, var(--app-border) 1px, transparent 1px)`,
              backgroundSize: `100% ${HOUR_PX}px`,
            }}
          >
            {columns.map(({ day, placed }, dayIndex) => (
              <div
                key={dateKey(day)}
                className="border-app-border relative border-l"
                data-testid={`calendar-time-grid-column-${dateKey(day)}`}
                onPointerDown={(pe) => {
                  const { minute } = locate(pe.clientX, pe.clientY);
                  const anchor = Math.min(
                    1440 - SNAP_MIN,
                    Math.floor(minute / SNAP_MIN) * SNAP_MIN,
                  );
                  begin(
                    pe,
                    {
                      kind: "create",
                      day: dayIndex,
                      anchor,
                      current: anchor + SNAP_MIN,
                      moved: false,
                    },
                    () => onSelectDay(day),
                  );
                }}
                onDoubleClick={(e) => {
                  const { raw } = locate(e.clientX, e.clientY);
                  const start = Math.min(1440 - 60, Math.floor(raw / 30) * 30);
                  const base = startOfDay(day);
                  onCreate({
                    start: dateTimeKey(addMinutes(base, start)),
                    end: dateTimeKey(addMinutes(base, start + 60)),
                  });
                }}
              >
                {placed.map((p) => {
                  const hidden =
                    drag &&
                    drag.kind !== "create" &&
                    drag.moved &&
                    drag.event.id === p.event.id;
                  return (
                    <TimedEvent
                      key={p.event.id}
                      event={p.event}
                      top={p.top}
                      bottom={p.bottom}
                      column={p.column}
                      columns={p.columns}
                      dayKey={dateKey(day)}
                      selected={p.event.id === selectedId}
                      faded={Boolean(hidden)}
                      onMoveStart={(pe) => {
                        const { raw } = locate(pe.clientX, pe.clientY);
                        begin(
                          pe,
                          {
                            kind: "move",
                            event: p.event,
                            grab: raw - p.top,
                            originDay: dayIndex,
                            day: dayIndex,
                            startMin: p.top,
                            moved: false,
                          },
                          (el) => onEventOpen(p.event.id, el),
                        );
                      }}
                      onResizeStart={(pe, immediate) =>
                        begin(
                          pe,
                          {
                            kind: "resize",
                            event: p.event,
                            endMin: p.bottom,
                            day: dayIndex,
                            moved: false,
                          },
                          undefined,
                          immediate,
                        )
                      }
                    />
                  );
                })}
                {drag?.moved && drag.day === dayIndex ? (
                  <DragPreview drag={drag} />
                ) : null}
                {dayIndex === todayIndex ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: nowTop }}
                  >
                    <div className="h-0.5" style={{ background: TODAY_RED }} />
                    <div
                      className="absolute -top-[3px] -left-1 size-2 rounded-full"
                      style={{ background: TODAY_RED }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function createRange(
  d: Extract<GridDrag, { kind: "create" }>,
): [number, number] {
  const a = Math.min(d.anchor, d.current);
  const b = Math.max(d.anchor + SNAP_MIN, d.current);
  return [a, Math.min(1440, b)];
}

function DragPreview({ drag }: { drag: GridDrag }) {
  let top: number;
  let bottom: number;
  let color: EventColor = "blue";
  let title = "New Event";
  if (drag.kind === "move") {
    const length =
      (parseLocal(drag.event.end).getTime() -
        parseLocal(drag.event.start).getTime()) /
      60_000;
    top = drag.startMin;
    bottom = Math.min(1440, drag.startMin + Math.max(SNAP_MIN, length));
    color = drag.event.color;
    title = drag.event.title || title;
  } else if (drag.kind === "resize") {
    const start = minutesOfDay(parseLocal(drag.event.start));
    top = sameDay(parseLocal(drag.event.start), parseLocal(drag.event.end))
      ? start
      : 0;
    bottom = Math.max(top + SNAP_MIN, drag.endMin);
    color = drag.event.color;
    title = drag.event.title || title;
  } else {
    [top, bottom] = createRange(drag);
  }
  const base = new Date(2000, 0, 1);
  return (
    <div
      className="pointer-events-none absolute inset-x-0.5 z-30 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight shadow-md"
      style={{
        ...eventStyle(color, true),
        top: (top / 60) * HOUR_PX,
        height: ((bottom - top) / 60) * HOUR_PX - 1,
      }}
    >
      <div className="truncate font-semibold">{title}</div>
      <div className="tabular-nums opacity-90">
        {formatTime(addMinutes(base, top))} –{" "}
        {formatTime(addMinutes(base, bottom))}
      </div>
    </div>
  );
}

const TimedEvent = React.memo(function TimedEvent({
  event,
  top,
  bottom,
  column,
  columns,
  dayKey,
  selected,
  faded,
  onMoveStart,
  onResizeStart,
}: {
  event: CalendarEvent;
  top: number;
  bottom: number;
  column: number;
  columns: number;
  dayKey: string;
  selected: boolean;
  faded: boolean;
  onMoveStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** `immediate`: the touch grip, which resizes without a hold. */
  onResizeStart: (
    e: React.PointerEvent<HTMLDivElement>,
    immediate: boolean,
  ) => void;
}) {
  const coarse = useCoarsePointer();
  // Touch: only the selected event gets a resize grip; elsewhere its bottom
  // edge is part of the block (hold to move).
  const grip = coarse && selected;
  const height = ((bottom - top) / 60) * HOUR_PX;
  const compact = height < 34;
  const start = parseLocal(event.start);
  return (
    <div
      role="button"
      tabIndex={-1}
      data-event-id={event.id}
      data-testid={`calendar-time-grid-event-${event.id}-${dayKey}`}
      onPointerDown={onMoveStart}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "calendar-event",
        selected && "calendar-event--selected",
        faded && "calendar-event--faded",
      )}
      style={{
        ...eventStyle(event.color, selected),
        top: (top / 60) * HOUR_PX + 1,
        height: Math.max(14, height - 2),
        left: `calc(${(column / columns) * 100}% + 2px)`,
        width: `calc(${100 / columns}% - 4px)`,
      }}
    >
      {compact ? (
        <div className="truncate">
          <span className="font-semibold">{event.title || "New Event"}</span>{" "}
          <span className="opacity-80">{formatTime(start)}</span>
        </div>
      ) : (
        <>
          <div className="line-clamp-2 font-semibold">
            {event.title || "New Event"}
          </div>
          {event.location ? (
            <div className="truncate opacity-80">{event.location}</div>
          ) : null}
          <div className="tabular-nums opacity-80">{formatTime(start)}</div>
        </>
      )}
      <div
        className={cn(
          "calendar-event__resize",
          grip && "calendar-event__resize--grip",
        )}
        data-testid={`calendar-time-grid-event-${event.id}-${dayKey}-resize`}
        onPointerDown={(pe) => {
          // An unselected event's edge on touch: let the block take it.
          if (pe.pointerType === "touch" && !grip) return;
          onResizeStart(pe, pe.pointerType === "touch");
        }}
      />
    </div>
  );
});

/* ───────────────────────────── Year ───────────────────────────── */

function YearView({
  cursor,
  now,
  byDay,
  onOpenDay,
  onOpenMonth,
}: {
  cursor: Date;
  now: Date;
  byDay: Map<string, CalendarEvent[]>;
  onOpenDay: (d: Date) => void;
  onOpenMonth: (m: Date) => void;
}) {
  const year = cursor.getFullYear();
  return (
    <div
      className="h-full overflow-y-auto p-5"
      data-testid="calendar-year-view"
    >
      <div className="calendar-year__months">
        {Array.from({ length: 12 }, (_, m) => {
          const month = new Date(year, m, 1);
          return (
            <div key={m}>
              <button
                type="button"
                className="font-title mb-1.5 text-sm font-semibold hover:underline"
                style={{
                  color:
                    m === now.getMonth() && year === now.getFullYear()
                      ? TODAY_RED
                      : undefined,
                }}
                data-testid={`calendar-year-view-month-${m + 1}-button`}
                onClick={() => onOpenMonth(month)}
              >
                {month.toLocaleDateString(undefined, { month: "long" })}
              </button>
              <div className="text-app-dim grid grid-cols-7 text-center text-[10px]">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w.slice(0, 1)}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 text-center">
                {monthGrid(month).map((day) => {
                  const inMonth = day.getMonth() === m;
                  if (!inMonth)
                    return (
                      <span key={dateKey(day)} className="calendar-year__blank" />
                    );
                  const today = sameDay(day, now);
                  const busy = byDay.has(dateKey(day));
                  return (
                    <button
                      key={dateKey(day)}
                      type="button"
                      onClick={() => onOpenDay(day)}
                      data-testid={`calendar-year-view-day-${dateKey(day)}-button`}
                      className={cn(
                        "calendar-year__day",
                        today && "calendar-year__day--today",
                      )}
                      style={today ? { background: TODAY_RED } : undefined}
                    >
                      {day.getDate()}
                      {busy && !today ? (
                        <span className="bg-app-dim absolute bottom-0.5 size-1 rounded-full" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── Editor ───────────────────────────── */

function EventEditor({
  event,
  rect,
  onClose,
  onChange,
  onDelete,
}: {
  event: CalendarEvent | undefined;
  rect: DOMRect | null;
  onClose: () => void;
  onChange: (patch: Partial<CalendarEvent>) => void;
  onDelete: () => void;
}) {
  const open = Boolean(event && rect);
  const titleRef = React.useRef<HTMLInputElement>(null);

  if (!event || !rect) return null;

  const start = parseLocal(event.start);
  const end = parseLocal(event.end);

  /** Moves the start, keeping the length, as Apple Calendar does. */
  const setStart = (next: Date) => {
    if (Number.isNaN(next.getTime())) return;
    if (event.allDay) {
      const span = dayDiff(start, end);
      onChange({ start: dateKey(next), end: dateKey(addDays(next, span)) });
    } else {
      const length = end.getTime() - start.getTime();
      onChange({
        start: dateTimeKey(next),
        end: dateTimeKey(new Date(next.getTime() + length)),
      });
    }
  };
  const setEnd = (next: Date) => {
    if (Number.isNaN(next.getTime())) return;
    if (event.allDay) onChange({ end: dateKey(next < start ? start : next) });
    else
      onChange({
        end: dateTimeKey(next <= start ? addMinutes(start, SNAP_MIN) : next),
      });
  };

  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor asChild>
        <div
          className="pointer-events-none fixed"
          style={{
            left: rect.left,
            top: rect.top,
            // Wide blocks (Day view) anchor by their left part so the panel
            // opens beside the block instead of being pushed off-pane.
            width: Math.min(rect.width, 180),
            height: Math.min(rect.height, 200),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        className="w-80 p-3"
        data-testid="calendar-event-editor"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const fresh = event.title === "New Event";
          // Touch: opening an existing event should not raise the keyboard.
          if (!fresh && isCoarsePointer()) return;
          titleRef.current?.focus();
          if (fresh) titleRef.current?.select();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2.5">
          <input
            ref={titleRef}
            className="font-title text-app-bright placeholder:text-app-dim w-full bg-transparent text-base font-semibold outline-none"
            placeholder="New Event"
            value={event.title}
            data-testid="calendar-event-editor-title-input"
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onClose();
            }}
          />
          <Input
            icon={MapPin}
            placeholder="Add Location"
            aria-label="Location"
            value={event.location ?? ""}
            data-testid="calendar-event-editor-location-input"
            onChange={(e) =>
              onChange({ location: e.target.value || undefined })
            }
          />
          <div
            className="text-app-dim text-[11px]"
            data-testid="calendar-event-editor-summary-message"
          >
            {describeEventTime(event)}
          </div>

          <div className="bg-app-border h-px" />

          <label className="text-app-text flex items-center justify-between text-xs">
            All-day
            <Switch
              size="sm"
              checked={Boolean(event.allDay)}
              data-testid="calendar-event-editor-allday-input"
              onCheckedChange={(checked) => {
                if (checked) {
                  const last =
                    end > start && minutesOfDay(end) === 0
                      ? addDays(end, -1)
                      : end;
                  onChange({
                    allDay: true,
                    start: dateKey(start),
                    end: dateKey(last < start ? start : last),
                  });
                } else {
                  const s = addMinutes(startOfDay(start), 9 * 60);
                  onChange({
                    allDay: undefined,
                    start: dateTimeKey(s),
                    end: dateTimeKey(addMinutes(s, 60)),
                  });
                }
              }}
            />
          </label>
          <div className="text-app-text grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-xs">
            <span>Starts</span>
            <DatePicker
              variant="outline"
              size="xs"
              className="w-full min-w-0"
              aria-label="Start date"
              value={start}
              data-testid="calendar-event-editor-start-date-input"
              onValueChange={(next) => next && setStart(next)}
            />
            {event.allDay ? (
              <span />
            ) : (
              <DatePicker
                granularity="time"
                variant="outline"
                size="xs"
                aria-label="Start time"
                value={start}
                calendarProps={{ timeStep: 5, timeEnd: "23:55" }}
                data-testid="calendar-event-editor-start-time-input"
                onValueChange={(next) => next && setStart(next)}
              />
            )}
            <span>Ends</span>
            <DatePicker
              variant="outline"
              size="xs"
              className="w-full min-w-0"
              aria-label="End date"
              value={end}
              calendarProps={{ disabled: { before: startOfDay(start) } }}
              data-testid="calendar-event-editor-end-date-input"
              onValueChange={(next) => next && setEnd(next)}
            />
            {event.allDay ? (
              <span />
            ) : (
              <DatePicker
                granularity="time"
                variant="outline"
                size="xs"
                aria-label="End time"
                value={end}
                calendarProps={{ timeStep: 5, timeEnd: "23:55" }}
                data-testid="calendar-event-editor-end-time-input"
                onValueChange={(next) => next && setEnd(next)}
              />
            )}
          </div>

          <div
            className="calendar-editor__swatches"
            role="radiogroup"
            aria-label="Colour"
          >
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={event.color === c}
                aria-label={c}
                data-testid={`calendar-event-editor-color-${c}-button`}
                className={cn(
                  "calendar-editor__swatch",
                  event.color === c && "calendar-editor__swatch--selected",
                )}
                style={{
                  background: COLOR_HEX[c],
                  ["--tw-ring-color" as string]: COLOR_HEX[c],
                }}
                onClick={() => onChange({ color: c })}
              />
            ))}
          </div>

          <textarea
            className={cn(ui.input, "min-h-16 resize-y")}
            placeholder="Add Notes"
            value={event.notes ?? ""}
            data-testid="calendar-event-editor-notes-input"
            onChange={(e) => onChange({ notes: e.target.value || undefined })}
          />

          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              data-testid="calendar-event-editor-delete-button"
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
