import {
  IconAlarm,
  IconChevronDown,
  IconExternalLink,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, m, type Variants } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import {
  DURATION,
  EASE_ACCELERATE,
  enter,
  exit,
  glide,
} from "@/lib/motion";
import { formatClock } from "@/lib/timer-doc";
import {
  dismissNotice,
  pauseRun,
  remainingOf,
  resumeRun,
  stopRun,
  type TimerNotice,
  type TimerRun,
  useTimerState,
} from "@/lib/timer-runtime";
import { openFile } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";

/**
 * Toast exits read the dock's `custom` value: `true` while minimising, so
 * the cards drop from where they sit down toward the corner; otherwise a
 * dismissed toast slides out to the left.
 */
const TOAST_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1, transition: enter },
  gone: (minimising: boolean) =>
    minimising
      ? {
          opacity: 0,
          y: 56,
          scale: 0.98,
          transition: { duration: DURATION.base, ease: EASE_ACCELERATE },
        }
      : { opacity: 0, x: -24, transition: exit },
};

/**
 * Shared toast motion: rise in, leave per {@link TOAST_VARIANTS}, and the
 * toasts left behind glide into the gap instead of jumping.
 */
const TOAST_MOTION = {
  layout: "position",
  variants: TOAST_VARIANTS,
  initial: "hidden",
  animate: "shown",
  exit: "gone",
  transition: { layout: glide },
} as const;

/** How long a "time's up" toast stays before it dismisses itself. */
const NOTICE_MS = 12_000;
const COLLAPSED_KEY = "note-editor.timer-dock.collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Bottom-left toasts for `.timer` files: a live card for each timer that is
 * running or paused while its file is not the active tab, and a "time's up"
 * toast whenever a timer ends.
 */
export function TimerDock() {
  const { runs, notices, now } = useTimerState();
  const activeId = useAppSelector((s) => s.tabs.activeId);
  const nodes = useAppSelector((s) => s.fs.nodes);
  const [collapsed, setCollapsedState] = React.useState(readCollapsed);
  // True from Minimise until the cards finish dropping out.
  const [minimising, setMinimising] = React.useState(false);
  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    setMinimising(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
    } catch {
      // Remembered for this session only.
    }
  };

  const live = Object.values(runs).filter(
    (r) => r.status !== "done" && r.fileId !== activeId,
  );
  const isEmpty = !live.length && !notices.length;
  // The one ending soonest, for the collapsed pill.
  const soonest = [...live].sort(
    (a, b) => remainingOf(a, now) - remainingOf(b, now),
  )[0];

  return (
    // Stays mounted while empty so the last toast can animate out; it is a
    // click-through overlay, and only a landmark while it holds toasts.
    <div
      className="timer-dock"
      role={isEmpty ? undefined : "region"}
      aria-label={isEmpty ? undefined : "Timers"}
      data-testid="timer-dock"
    >
      {/* popLayout lifts exiting toasts out of the flow, so they leave from
          where they are while the pill settles into the corner. */}
      <AnimatePresence
        mode="popLayout"
        custom={minimising}
        onExitComplete={() => setMinimising(false)}
      >
        {notices.map((notice) => (
          <NoticeToast
            key={notice.id}
            notice={notice}
            fileName={nodes[notice.fileId]?.name}
          />
        ))}
        {live.length && collapsed ? (
          <m.div key="pill" className="timer-dock__slot" {...TOAST_MOTION}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="timer-dock__pill"
              aria-label={`Show ${live.length} running ${live.length === 1 ? "timer" : "timers"}`}
              data-testid="timer-dock-expand-button"
              onClick={() => setCollapsed(false)}
            >
              <IconAlarm aria-hidden className="timer-dock__icon" />
              <span className="timer-dock__pill-label">
                {soonest.label || "Untitled"}
              </span>
              <span className="timer-dock__pill-clock">
                {formatClock(remainingOf(soonest, now))}
              </span>
              {live.length > 1 ? (
                <span className="timer-dock__tag">+{live.length - 1}</span>
              ) : null}
            </Button>
          </m.div>
        ) : null}
        {live.length && !collapsed ? (
          <m.div key="collapse" className="timer-dock__slot" {...TOAST_MOTION}>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="timer-dock__collapse"
              data-testid="timer-dock-collapse-button"
              onClick={() => setCollapsed(true)}
            >
              <IconChevronDown
                aria-hidden
                className="timer-dock__button-icon"
              />
              Minimise
            </Button>
          </m.div>
        ) : null}
        {collapsed
          ? null
          : live.map((run) => (
              <LiveToast
                key={run.key}
                run={run}
                now={now}
                fileName={nodes[run.fileId]?.name}
              />
            ))}
      </AnimatePresence>
    </div>
  );
}

function LiveToast({
  run,
  now,
  fileName,
  ref,
}: {
  run: TimerRun;
  now: number;
  fileName: string | undefined;
  /** Set by `AnimatePresence` (popLayout) to measure the exiting toast. */
  ref?: React.Ref<HTMLDivElement>;
}) {
  const dispatch = useAppDispatch();
  const left = remainingOf(run, now);
  const progress = run.durationMs ? 1 - left / run.durationMs : 0;
  const testBase = `timer-dock-run-${run.key.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <m.div
      ref={ref}
      {...TOAST_MOTION}
      className={cn(
        "timer-dock__toast",
        run.status === "paused" && "timer-dock__toast--paused",
      )}
      data-testid={`${testBase}-item`}
    >
      <div className="timer-dock__row">
        <IconAlarm aria-hidden className="timer-dock__icon" />
        <div className="timer-dock__text">
          <span className="timer-dock__title">
            {run.label || "Untitled"}
            {run.queued ? <span className="timer-dock__tag">Queue</span> : null}
          </span>
          {fileName ? <span className="timer-dock__file">{fileName}</span> : null}
        </div>
        <span className="timer-dock__clock" role="timer">
          {formatClock(left)}
        </span>
      </div>
      <Progress
        size="sm"
        value={Math.min(1, Math.max(0, progress))}
        max={1}
        aria-label={`${run.label || "Timer"} progress`}
      />
      <div className="timer-dock__actions">
        {run.status === "running" ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="timer-dock__button"
            data-testid={`${testBase}-pause-button`}
            onClick={() => pauseRun(run.key)}
          >
            <IconPlayerPause aria-hidden className="timer-dock__button-icon" />
            Pause
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="timer-dock__button"
            data-testid={`${testBase}-resume-button`}
            onClick={() => resumeRun(run.key)}
          >
            <IconPlayerPlay aria-hidden className="timer-dock__button-icon" />
            Resume
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="timer-dock__button"
          data-testid={`${testBase}-stop-button`}
          onClick={() => stopRun(run.key)}
        >
          <IconPlayerStop aria-hidden className="timer-dock__button-icon" />
          {run.queued ? "Stop queue" : "Stop"}
        </Button>
        {fileName ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="timer-dock__button"
            data-testid={`${testBase}-open-button`}
            onClick={() => dispatch(openFile(run.fileId))}
          >
            <IconExternalLink aria-hidden className="timer-dock__button-icon" />
            Open
          </Button>
        ) : null}
      </div>
    </m.div>
  );
}

function NoticeToast({
  notice,
  fileName,
  ref,
}: {
  notice: TimerNotice;
  fileName: string | undefined;
  /** Set by `AnimatePresence` (popLayout) to measure the exiting toast. */
  ref?: React.Ref<HTMLDivElement>;
}) {
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    const timer = setTimeout(
      () => dismissNotice(notice.id),
      Math.max(0, notice.at + NOTICE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [notice.id, notice.at]);
  const testBase = `timer-dock-notice-${notice.id.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <m.div
      ref={ref}
      {...TOAST_MOTION}
      className="timer-dock__toast timer-dock__toast--done"
      role="alert"
      data-testid={`${testBase}-item`}
    >
      <div className="timer-dock__row">
        <IconAlarm aria-hidden className="timer-dock__icon" />
        <div className="timer-dock__text">
          <span className="timer-dock__title">{notice.label} — time's up</span>
          <span className="timer-dock__file">
            {notice.next ? `Next: ${notice.next}` : (fileName ?? "Timer finished")}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="timer-dock__close"
          aria-label="Dismiss"
          data-testid={`${testBase}-dismiss-button`}
          onClick={() => dismissNotice(notice.id)}
        >
          <IconX aria-hidden className="timer-dock__button-icon" />
        </Button>
      </div>
      {fileName ? (
        <div className="timer-dock__actions">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="timer-dock__button"
            data-testid={`${testBase}-open-button`}
            onClick={() => {
              dispatch(openFile(notice.fileId));
              dismissNotice(notice.id);
            }}
          >
            <IconExternalLink aria-hidden className="timer-dock__button-icon" />
            Open {fileName}
          </Button>
        </div>
      ) : null}
    </m.div>
  );
}
