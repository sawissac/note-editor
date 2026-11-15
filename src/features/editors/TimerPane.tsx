import "@/styles/timer-pane.css";
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
  IconBell,
  IconCheck,
  IconGripVertical,
  IconPlayerPauseFilled,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerStopFilled,
  IconPlus,
  IconRepeat,
  IconTrash,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as ui from "@/lib/ui-styles";
import {
  formatClock,
  formatDuration,
  joinDuration,
  newTimerId,
  parseTimers,
  serializeTimers,
  splitDuration,
  type TimerDoc,
  type TimerItem,
} from "@/lib/timer-doc";
import {
  desktopAlertsState,
  enableDesktopAlerts,
  pauseRun,
  queueKey,
  remainingOf,
  resumeRun,
  runKey,
  skipQueueStep,
  startQueue,
  startTimer,
  stopQueue,
  stopRun,
  type TimerQueue,
  type TimerRun,
  updateQueueOptions,
  useTimerState,
} from "@/lib/timer-runtime";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

const PRESETS = [1, 5, 10, 15, 25, 45, 60];
/** Ring geometry (SVG user units). */
const RING_R = 92;
const RING_C = 2 * Math.PI * RING_R;

/** What the big countdown shows. */
type Hero =
  | { kind: "queue"; run: TimerRun; timer: TimerItem | undefined }
  | { kind: "solo"; run: TimerRun; timer: TimerItem }
  | { kind: "idle"; timer: TimerItem }
  | { kind: "empty" };

/**
 * `.timer` files: one big countdown with the queue listed under it. Play runs
 * the timers top to bottom starting from the selected one (optionally
 * looping); a row's own play button runs just that timer, alongside the
 * queue. Timers keep running when the tab closes — the timer dock shows them.
 */
export default function TimerPane({ id, content, registerSave }: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parseTimers(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return { doc: parseTimers(""), error: (error as Error).message };
    }
    // Mounted per file — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [doc, setDoc] = React.useState<TimerDoc>(initial.doc);
  const [parseError, setParseError] = React.useState(initial.error);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initial.doc.timers[0]?.id ?? null,
  );
  const [alerts, setAlerts] = React.useState(desktopAlertsState);
  const docRef = React.useRef(doc);
  docRef.current = doc;
  const runtime = useTimerState();

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => {
    if (!parseError) dispatch(saveContent(id, serializeTimers(docRef.current)));
  });

  const update = (fn: (d: TimerDoc) => TimerDoc) => {
    const next = fn(docRef.current);
    docRef.current = next;
    setDoc(next);
    setParseError(null);
    save(serializeTimers(next));
  };
  const patchTimer = (timerId: string, patch: Partial<TimerItem>) =>
    update((d) => ({
      ...d,
      timers: d.timers.map((t) => (t.id === timerId ? { ...t, ...patch } : t)),
    }));
  const addTimer = (minutes: number) => {
    const timer = {
      id: newTimerId(),
      label: `Timer ${docRef.current.timers.length + 1}`,
      durationMs: minutes * 60_000,
    };
    update((d) => ({ ...d, timers: [...d.timers, timer] }));
    if (!selectedId) setSelectedId(timer.id);
  };
  const sensors = useSensors(
    // A few px of travel first, so clicking the grip still focuses it.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  // True from drag start until just after the drop, so the Space key that
  // picks up / drops a row is not also read as play / pause.
  const draggingRef = React.useRef(false);
  const endDrag = () => {
    setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over || active.id === over.id) return;
    update((d) => {
      const from = d.timers.findIndex((t) => t.id === active.id);
      const to = d.timers.findIndex((t) => t.id === over.id);
      if (from < 0 || to < 0) return d;
      return { ...d, timers: arrayMove(d.timers, from, to) };
    });
  };
  const remove = (timer: TimerItem) => {
    stopRun(runKey(id, timer.id));
    const rest = docRef.current.timers.filter((t) => t.id !== timer.id);
    update((d) => ({ ...d, timers: rest }));
    if (selectedId === timer.id) setSelectedId(rest[0]?.id ?? null);
  };
  const setOption = (patch: Partial<Pick<TimerDoc, "loop" | "sound">>) => {
    update((d) => ({ ...d, ...patch }));
    const { loop, sound } = docRef.current;
    updateQueueOptions(id, { loop, sound });
  };

  const queue = runtime.queues[id];
  const queueRun = runtime.runs[queueKey(id)];
  const playable = doc.timers.filter((t) => t.durationMs > 0);
  const total = playable.reduce((sum, t) => sum + t.durationMs, 0);
  const selected = doc.timers.find((t) => t.id === selectedId) ?? doc.timers[0];
  const soloRun = selected ? runtime.runs[runKey(id, selected.id)] : undefined;

  const hero: Hero = queueRun
    ? {
        kind: "queue",
        run: queueRun,
        timer: doc.timers.find((t) => t.id === queueRun.timerId),
      }
    : soloRun && selected
      ? { kind: "solo", run: soloRun, timer: selected }
      : selected
        ? { kind: "idle", timer: selected }
        : { kind: "empty" };

  const runQueue = (fromTimerId?: string) =>
    startQueue(
      id,
      playable.map((t) => ({
        timerId: t.id,
        label: t.label,
        durationMs: t.durationMs,
      })),
      { loop: doc.loop, sound: doc.sound },
      fromTimerId,
    );

  /** The big play / pause button. */
  const togglePrimary = () => {
    if (hero.kind === "queue" || hero.kind === "solo") {
      const { run } = hero;
      if (run.status === "running") pauseRun(run.key);
      else if (run.status === "paused") resumeRun(run.key);
      else if (hero.kind === "solo") startTimer(id, hero.timer, doc.sound);
    } else if (hero.kind === "idle") {
      runQueue(hero.timer.durationMs > 0 ? hero.timer.id : undefined);
    }
  };

  // Space plays / pauses, unless typing in a field.
  const toggleRef = React.useRef(togglePrimary);
  toggleRef.current = togglePrimary;
  const paneRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || draggingRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, button")) return;
      e.preventDefault();
      toggleRef.current();
    };
    pane.addEventListener("keydown", onKey);
    return () => pane.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <FileBarSlot>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-active={doc.loop || undefined}
          aria-pressed={doc.loop}
          data-testid="timer-pane-loop-button"
          title="Start the queue over after the last timer"
          onClick={() => setOption({ loop: !doc.loop })}
        >
          <IconRepeat aria-hidden className="pane-icon" />
          Loop
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(ui.paneToolbarBtn, "w-7 px-0")}
          data-active={doc.sound || undefined}
          aria-pressed={doc.sound}
          aria-label={
            doc.sound ? "Mute chime" : "Play a chime when a timer ends"
          }
          data-testid="timer-pane-sound-button"
          onClick={() => setOption({ sound: !doc.sound })}
        >
          {doc.sound ? (
            <IconVolume aria-hidden className="pane-icon" />
          ) : (
            <IconVolumeOff aria-hidden className="pane-icon" />
          )}
        </Button>
      </FileBarSlot>

      <div
        ref={paneRef}
        className="timer-pane"
        tabIndex={-1}
        data-testid="timer-pane"
      >
        <div className="timer-pane__inner">
          {parseError ? (
            <p
              className="timer-pane__error"
              role="alert"
              data-testid="timer-pane-parse-error-message"
            >
              <IconAlertTriangle aria-hidden className="pane-icon" />
              This file is not a valid timer list ({parseError}). Any change
              replaces it.
            </p>
          ) : null}

          <Countdown
            hero={hero}
            now={runtime.now}
            queue={queue}
            onPrimary={togglePrimary}
            onReset={() => {
              if (hero.kind === "queue") stopQueue(id);
              else if (hero.kind === "solo") stopRun(hero.run.key);
            }}
            onSkip={() => skipQueueStep(id)}
          />

          <section className="timer-pane__queue" aria-label="Queue">
            <header className="timer-pane__queue-head">
              <h3 className="timer-pane__heading">Queue</h3>
              <span
                className="timer-pane__summary"
                data-testid="timer-pane-summary-message"
              >
                {doc.timers.length}{" "}
                {doc.timers.length === 1 ? "timer" : "timers"}
                {playable.length ? ` · ${formatDuration(total)}` : ""}
                {doc.loop ? " · loops" : ""}
              </span>
            </header>

            {doc.timers.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => {
                  draggingRef.current = true;
                }}
                onDragEnd={onDragEnd}
                onDragCancel={endDrag}
                accessibility={{ announcements: dragAnnouncements(doc.timers) }}
              >
                <SortableContext
                  items={doc.timers.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol
                    className="timer-pane__list"
                    data-testid="timer-pane-list"
                  >
                    {doc.timers.map((timer, index) => {
                      const playableIndex = playable.indexOf(timer);
                      const isCurrent = queueRun?.timerId === timer.id;
                      const isPast =
                        Boolean(queue) &&
                        !isCurrent &&
                        playableIndex >= 0 &&
                        playableIndex < queue!.index;
                      return (
                        <QueueRow
                          key={timer.id}
                          timer={timer}
                          index={index}
                          solo={runtime.runs[runKey(id, timer.id)]}
                          queueRun={isCurrent ? queueRun : undefined}
                          past={isPast}
                          selected={!queueRun && timer.id === selected?.id}
                          now={runtime.now}
                          onSelect={() => setSelectedId(timer.id)}
                          onPatch={(patch) => patchTimer(timer.id, patch)}
                          onSolo={() => {
                            setSelectedId(timer.id);
                            startTimer(id, timer, doc.sound);
                          }}
                          onDelete={() => remove(timer)}
                        />
                      );
                    })}
                  </ol>
                </SortableContext>
              </DndContext>
            ) : (
              <p
                className="timer-pane__empty"
                data-testid="timer-pane-empty-message"
              >
                No timers yet — add one below.
              </p>
            )}

            <div
              className="timer-pane__presets"
              role="group"
              aria-label="Add a timer"
            >
              {PRESETS.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`timer-pane-add-${minutes}-button`}
                  onClick={() => addTimer(minutes)}
                >
                  <IconPlus aria-hidden className="pane-icon" />
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </Button>
              ))}
            </div>
          </section>

          {alerts === "default" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="timer-pane__alerts"
              data-testid="timer-pane-alerts-button"
              onClick={() => void enableDesktopAlerts().then(setAlerts)}
            >
              <IconBell aria-hidden className="pane-icon" />
              Notify me when this browser tab is in the background
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Countdown({
  hero,
  now,
  queue,
  onPrimary,
  onReset,
  onSkip,
}: {
  hero: Hero;
  now: number;
  queue: TimerQueue | undefined;
  onPrimary: () => void;
  onReset: () => void;
  onSkip: () => void;
}) {
  if (hero.kind === "empty") {
    return (
      <div className="timer-pane__hero" data-testid="timer-pane-countdown">
        <p className="timer-pane__empty">Add a timer to start.</p>
      </div>
    );
  }
  const run = hero.kind === "idle" ? undefined : hero.run;
  const length = run?.durationMs ?? hero.timer?.durationMs ?? 0;
  const left = run ? remainingOf(run, now) : length;
  const progress = length ? Math.min(1, 1 - left / length) : 0;
  const status = run?.status;
  const label = run?.label || hero.timer?.label || "Untitled";

  let caption: string;
  if (hero.kind === "queue" && queue) {
    const next =
      queue.steps[queue.index + 1] ?? (queue.loop ? queue.steps[0] : undefined);
    caption = `Queue ${queue.index + 1} of ${queue.steps.length}${
      queue.loop ? ` · round ${queue.round + 1}` : ""
    }${next ? ` · next ${next.label || "Untitled"}` : " · last"}`;
  } else if (hero.kind === "solo") {
    caption = "Running on its own";
  } else {
    caption = length
      ? "Press play to run the queue from here"
      : "Set a duration";
  }

  return (
    <div
      className={cn(
        "timer-pane__hero",
        status === "running" && "timer-pane__hero--running",
        status === "paused" && "timer-pane__hero--paused",
        status === "done" && "timer-pane__hero--done",
      )}
      data-testid="timer-pane-countdown"
    >
      <div className="timer-pane__ring">
        <svg className="timer-pane__ring-svg" viewBox="0 0 200 200" aria-hidden>
          <circle
            className="timer-pane__ring-track"
            cx="100"
            cy="100"
            r={RING_R}
          />
          <circle
            className="timer-pane__ring-bar"
            cx="100"
            cy="100"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
          />
        </svg>
        <div className="timer-pane__ring-text">
          <span
            className="timer-pane__hero-label"
            data-testid="timer-pane-hero-label-message"
          >
            {label}
          </span>
          <span
            className="timer-pane__clock"
            role="timer"
            aria-live="off"
            data-testid="timer-pane-clock-message"
          >
            {formatClock(left)}
          </span>
          <span className="timer-pane__state">
            {status === "running"
              ? "Running"
              : status === "paused"
                ? "Paused"
                : status === "done"
                  ? "Done"
                  : "Ready"}
          </span>
        </div>
      </div>

      <p
        className="timer-pane__caption"
        data-testid="timer-pane-caption-message"
      >
        {caption}
      </p>

      <div className="timer-pane__controls">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="timer-pane__control"
          aria-label={hero.kind === "queue" ? "Stop queue" : "Reset"}
          data-testid="timer-pane-reset-button"
          disabled={!run}
          onClick={onReset}
        >
          <IconPlayerStopFilled
            aria-hidden
            className="timer-pane__control-icon"
          />
        </Button>
        <Button
          type="button"
          size="icon-lg"
          className="timer-pane__control timer-pane__control--primary"
          aria-label={status === "running" ? "Pause" : "Play"}
          title="Play / pause (Space)"
          data-testid="timer-pane-play-button"
          disabled={!length}
          onClick={onPrimary}
        >
          {status === "running" ? (
            <IconPlayerPauseFilled
              aria-hidden
              className="timer-pane__control-icon"
            />
          ) : (
            <IconPlayerPlayFilled
              aria-hidden
              className="timer-pane__control-icon"
            />
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="timer-pane__control"
          aria-label="Skip to the next timer"
          data-testid="timer-pane-skip-button"
          disabled={hero.kind !== "queue"}
          onClick={onSkip}
        >
          <IconPlayerSkipForwardFilled
            aria-hidden
            className="timer-pane__control-icon"
          />
        </Button>
      </div>
    </div>
  );
}

function QueueRow({
  timer,
  index,
  solo,
  queueRun,
  past,
  selected,
  now,
  onSelect,
  onPatch,
  onSolo,
  onDelete,
}: {
  timer: TimerItem;
  index: number;
  /** This timer running on its own. */
  solo: TimerRun | undefined;
  /** The queue's run, when this timer is the current step. */
  queueRun: TimerRun | undefined;
  /** Already played in the current queue round. */
  past: boolean;
  selected: boolean;
  now: number;
  onSelect: () => void;
  onPatch: (patch: Partial<TimerItem>) => void;
  onSolo: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: timer.id });
  const run = queueRun ?? solo;
  const active = run && run.status !== "done";
  const left = run ? remainingOf(run, now) : timer.durationMs;
  const progress =
    run && run.durationMs ? Math.min(1, 1 - left / run.durationMs) : 0;
  const testBase = `timer-pane-timer-${timer.id}`;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <li
      ref={setNodeRef}
      // Position while dragging is per-frame geometry, not a style choice.
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "timer-pane__row",
        isDragging && "timer-pane__row--dragging",
        queueRun && "timer-pane__row--current",
        selected && "timer-pane__row--selected",
        past && "timer-pane__row--past",
        run?.status === "paused" && "timer-pane__row--paused",
        run?.status === "done" && "timer-pane__row--done",
      )}
      data-testid={`${testBase}-item`}
      onClick={onSelect}
    >
      {run ? (
        <span
          className="timer-pane__row-fill"
          style={{ width: `${progress * 100}%` }}
          aria-hidden
        />
      ) : null}
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        className="timer-pane__row-handle"
        aria-label={`Reorder ${timer.label || "timer"}`}
        data-testid={`${testBase}-drag-button`}
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical aria-hidden className="timer-pane__row-icon" />
      </Button>
      <span className="timer-pane__row-index" aria-hidden>
        {past || run?.status === "done" ? (
          <IconCheck className="timer-pane__row-index-icon" />
        ) : (
          index + 1
        )}
      </span>
      <input
        className="timer-pane__row-label"
        aria-label="Timer name"
        data-testid={`${testBase}-label-input`}
        value={timer.label}
        placeholder="Untitled"
        onChange={(e) => onPatch({ label: e.target.value })}
      />
      {active ? (
        <span
          className="timer-pane__row-time"
          data-testid={`${testBase}-clock-message`}
        >
          {solo && !queueRun ? (
            <span className="timer-pane__row-tag">solo</span>
          ) : null}
          {formatClock(left)}
        </span>
      ) : (
        <DurationInput
          testBase={testBase}
          value={timer.durationMs}
          onChange={(durationMs) => onPatch({ durationMs })}
        />
      )}
      <span className="timer-pane__row-actions">
        {solo?.status === "running" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="timer-pane__row-button"
            aria-label={`Pause ${timer.label || "timer"}`}
            data-testid={`${testBase}-pause-button`}
            onClick={stop(() => pauseRun(solo.key))}
          >
            <IconPlayerPauseFilled
              aria-hidden
              className="timer-pane__row-icon"
            />
          </Button>
        ) : solo?.status === "paused" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="timer-pane__row-button"
            aria-label={`Resume ${timer.label || "timer"}`}
            data-testid={`${testBase}-resume-button`}
            onClick={stop(() => resumeRun(solo.key))}
          >
            <IconPlayerPlayFilled
              aria-hidden
              className="timer-pane__row-icon"
            />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="timer-pane__row-button"
            aria-label={`Run only ${timer.label || "this timer"}`}
            title="Run only this timer"
            data-testid={`${testBase}-start-button`}
            disabled={timer.durationMs <= 0}
            onClick={stop(onSolo)}
          >
            <IconPlayerPlay aria-hidden className="timer-pane__row-icon" />
          </Button>
        )}
        {solo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="timer-pane__row-button"
            aria-label={`Reset ${timer.label || "timer"}`}
            data-testid={`${testBase}-reset-button`}
            onClick={stop(() => stopRun(solo.key))}
          >
            <IconPlayerStopFilled
              aria-hidden
              className="timer-pane__row-icon"
            />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="timer-pane__row-button timer-pane__row-button--danger"
          aria-label={`Delete ${timer.label || "timer"}`}
          data-testid={`${testBase}-delete-button`}
          onClick={stop(onDelete)}
        >
          <IconTrash aria-hidden className="timer-pane__row-icon" />
        </Button>
      </span>
    </li>
  );
}

function DurationInput({
  testBase,
  value,
  onChange,
}: {
  testBase: string;
  value: number;
  onChange: (ms: number) => void;
}) {
  const { h, m, s } = splitDuration(value);
  const part = (
    label: string,
    unit: string,
    current: number,
    max: number,
    apply: (n: number) => number,
  ) => (
    <label className="timer-pane__part">
      <input
        type="number"
        inputMode="numeric"
        className="timer-pane__number"
        aria-label={label}
        data-testid={`${testBase}-${unit}-input`}
        min={0}
        max={max}
        value={current}
        onChange={(e) => {
          const n = Math.max(
            0,
            Math.min(max, Math.floor(Number(e.target.value) || 0)),
          );
          onChange(apply(n));
        }}
      />
      <span className="timer-pane__unit">{unit}</span>
    </label>
  );
  return (
    <span className="timer-pane__duration" role="group" aria-label="Duration">
      {part("Hours", "h", h, 99, (n) => joinDuration(n, m, s))}
      {part("Minutes", "m", m, 59, (n) => joinDuration(h, n, s))}
      {part("Seconds", "s", s, 59, (n) => joinDuration(h, m, n))}
    </span>
  );
}

/** Screen-reader messages for reordering, by timer name rather than id. */
function dragAnnouncements(timers: TimerItem[]) {
  const name = (id: unknown) =>
    timers.find((t) => t.id === id)?.label || "Untitled timer";
  const position = (id: unknown) => timers.findIndex((t) => t.id === id) + 1;
  return {
    onDragStart: ({ active }: { active: { id: unknown } }) =>
      `Picked up ${name(active.id)}, position ${position(active.id)} of ${timers.length}.`,
    onDragOver: ({
      active,
      over,
    }: {
      active: { id: unknown };
      over: { id: unknown } | null;
    }) =>
      over
        ? `${name(active.id)} moved to position ${position(over.id)} of ${timers.length}.`
        : `${name(active.id)} is outside the queue.`,
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: unknown };
      over: { id: unknown } | null;
    }) =>
      over
        ? `Dropped ${name(active.id)} at position ${position(over.id)} of ${timers.length}.`
        : `Dropped ${name(active.id)}.`,
    onDragCancel: ({ active }: { active: { id: unknown } }) =>
      `Cancelled. ${name(active.id)} stays where it was.`,
  };
}
