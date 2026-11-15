/**
 * Running timers for every `.timer` file, kept outside React and outside the
 * file so they keep counting when the tab closes. Runs and queues are mirrored
 * to localStorage (wall-clock end times), so a reload picks them back up.
 *
 * A file can have any number of single runs going at once (one per timer)
 * plus one queue, which plays its timers one after another.
 */
import * as React from "react";

import type { TimerItem } from "@/lib/timer-doc";

export type RunStatus = "running" | "paused" | "done";

export type TimerRun = {
  key: string;
  fileId: string;
  timerId: string;
  label: string;
  durationMs: number;
  status: RunStatus;
  /** Wall-clock end while running. */
  endsAt: number;
  /** Time left while paused (0 once done). */
  remainingMs: number;
  /** Started by the file's queue rather than on its own. */
  queued: boolean;
  sound: boolean;
};

export type QueueStep = Pick<TimerItem, "label" | "durationMs"> & {
  timerId: string;
};

export type TimerQueue = {
  fileId: string;
  steps: QueueStep[];
  index: number;
  loop: boolean;
  sound: boolean;
  /** Completed passes, for looping queues. */
  round: number;
};

export type TimerNotice = {
  id: string;
  fileId: string;
  label: string;
  at: number;
  /** Label of the queue step that started next, if any. */
  next: string | null;
};

export type TimerState = {
  runs: Record<string, TimerRun>;
  queues: Record<string, TimerQueue>;
  notices: TimerNotice[];
  now: number;
};

const STORAGE_KEY = "note-editor.timers.v1";
const TICK_MS = 250;
const MAX_NOTICES = 5;
/** A queue step that ended longer ago than this restarts from "now". */
const CATCH_UP_MS = 5000;

export const runKey = (fileId: string, timerId: string) =>
  `${fileId}/${timerId}`;
export const queueKey = (fileId: string) => `${fileId}/#queue`;

let state: TimerState = { ...load(), notices: [], now: Date.now() };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;

function load(): Pick<TimerState, "runs" | "queues"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Pick<TimerState, "runs" | "queues">;
      if (parsed && typeof parsed === "object" && parsed.runs && parsed.queues) {
        return { runs: parsed.runs, queues: parsed.queues };
      }
    }
  } catch {
    // Storage blocked or corrupt — start empty.
  }
  return { runs: {}, queues: {} };
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ runs: state.runs, queues: state.queues }),
    );
  } catch {
    // Not fatal: timers still run for this session.
  }
}

function set(next: Partial<TimerState>, save = true) {
  state = { ...state, ...next };
  if (save) persist();
  listeners.forEach((l) => l());
  syncInterval();
}

function syncInterval() {
  const anyRunning = Object.values(state.runs).some(
    (r) => r.status === "running",
  );
  if (anyRunning && !interval) {
    interval = setInterval(tick, TICK_MS);
  } else if (!anyRunning && interval) {
    clearInterval(interval);
    interval = undefined;
  }
}

/* ── Sound and desktop alerts ──────────────────────────────────────── */

let audio: AudioContext | undefined;

/** Creates the audio context inside a click so later chimes may play. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No Web Audio — silent timers.
  }
}

function chime() {
  if (!audio) return;
  const start = audio.currentTime;
  [0, 0.22, 0.44].forEach((offset, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 2 ? 1046.5 : 880;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
    osc.connect(gain).connect(audio!.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.2);
  });
}

function desktopAlert(title: string, body: string) {
  try {
    if (
      document.hidden &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, tag: "note-editor-timer" });
    }
  } catch {
    // Notifications unsupported here.
  }
}

export function desktopAlertsState(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export async function enableDesktopAlerts() {
  if (!("Notification" in window)) return "unsupported" as const;
  const result = await Notification.requestPermission();
  listeners.forEach((l) => l());
  return result;
}

/* ── Clock ─────────────────────────────────────────────────────────── */

function tick() {
  const now = Date.now();
  const runs = { ...state.runs };
  const queues = { ...state.queues };
  const notices = [...state.notices];
  let changed = false;

  for (const run of Object.values(state.runs)) {
    if (run.status !== "running" || run.endsAt > now) continue;
    changed = true;
    let next: string | null = null;
    if (run.queued) {
      delete runs[run.key];
      const queue = queues[run.fileId];
      if (queue) {
        const advanced = advanceQueue(queue, run.endsAt, now);
        if (advanced) {
          queues[run.fileId] = advanced.queue;
          runs[advanced.run.key] = advanced.run;
          next = advanced.run.label || "Untitled";
        } else {
          delete queues[run.fileId];
        }
      }
    } else {
      runs[run.key] = { ...run, status: "done", remainingMs: 0 };
    }
    const label = run.label || "Untitled";
    notices.push({
      id: `${run.key}@${run.endsAt}`,
      fileId: run.fileId,
      label,
      at: now,
      next,
    });
    if (run.sound) chime();
    desktopAlert(`${label} — time's up`, next ? `Next: ${next}` : "Timer finished");
  }

  if (changed) {
    set({ runs, queues, notices: notices.slice(-MAX_NOTICES), now });
  } else {
    set({ now }, false);
  }
}

function makeRun(
  fileId: string,
  step: QueueStep,
  queued: boolean,
  sound: boolean,
  from: number,
): TimerRun {
  return {
    key: queued ? queueKey(fileId) : runKey(fileId, step.timerId),
    fileId,
    timerId: step.timerId,
    label: step.label,
    durationMs: step.durationMs,
    status: "running",
    endsAt: from + step.durationMs,
    remainingMs: step.durationMs,
    queued,
    sound,
  };
}

function advanceQueue(queue: TimerQueue, endedAt: number, now: number) {
  let index = queue.index + 1;
  let round = queue.round;
  if (index >= queue.steps.length) {
    if (!queue.loop) return null;
    index = 0;
    round += 1;
  }
  const from = now - endedAt > CATCH_UP_MS ? now : endedAt;
  const next = { ...queue, index, round };
  return {
    queue: next,
    run: makeRun(queue.fileId, queue.steps[index], true, queue.sound, from),
  };
}

/* ── Public actions ────────────────────────────────────────────────── */

export function remainingOf(run: TimerRun, now = state.now) {
  return run.status === "running"
    ? Math.max(0, run.endsAt - now)
    : run.remainingMs;
}

/** Starts one timer on its own, or resumes it when paused. */
export function startTimer(fileId: string, item: TimerItem, sound: boolean) {
  if (item.durationMs <= 0) return;
  unlockAudio();
  const key = runKey(fileId, item.id);
  const existing = state.runs[key];
  if (existing?.status === "paused") return resumeRun(key);
  const now = Date.now();
  set({
    now,
    runs: {
      ...state.runs,
      [key]: makeRun(
        fileId,
        { timerId: item.id, label: item.label, durationMs: item.durationMs },
        false,
        sound,
        now,
      ),
    },
  });
}

export function pauseRun(key: string) {
  const run = state.runs[key];
  if (run?.status !== "running") return;
  const now = Date.now();
  set({
    now,
    runs: {
      ...state.runs,
      [key]: { ...run, status: "paused", remainingMs: run.endsAt - now },
    },
  });
}

export function resumeRun(key: string) {
  const run = state.runs[key];
  if (run?.status !== "paused") return;
  unlockAudio();
  const now = Date.now();
  set({
    now,
    runs: {
      ...state.runs,
      [key]: { ...run, status: "running", endsAt: now + run.remainingMs },
    },
  });
}

/** Stops a run and forgets it; stopping the queue's run stops the queue. */
export function stopRun(key: string) {
  const run = state.runs[key];
  if (!run) return;
  if (run.queued) return stopQueue(run.fileId);
  const runs = { ...state.runs };
  delete runs[key];
  set({ runs });
}

/**
 * Plays `steps` one after another, beginning with the step whose timer is
 * `startTimerId` (the first one by default); replaces any running queue.
 */
export function startQueue(
  fileId: string,
  steps: QueueStep[],
  options: { loop: boolean; sound: boolean },
  startTimerId?: string,
) {
  const playable = steps.filter((s) => s.durationMs > 0);
  if (!playable.length) return;
  unlockAudio();
  const now = Date.now();
  const index = Math.max(
    0,
    playable.findIndex((s) => s.timerId === startTimerId),
  );
  const queue: TimerQueue = {
    fileId,
    steps: playable,
    index,
    round: 0,
    ...options,
  };
  set({
    now,
    queues: { ...state.queues, [fileId]: queue },
    runs: {
      ...state.runs,
      [queueKey(fileId)]: makeRun(
        fileId,
        playable[index],
        true,
        options.sound,
        now,
      ),
    },
  });
}

export function stopQueue(fileId: string) {
  const runs = { ...state.runs };
  const queues = { ...state.queues };
  delete runs[queueKey(fileId)];
  delete queues[fileId];
  set({ runs, queues });
}

/** Ends the current queue step now and moves on (no chime). */
export function skipQueueStep(fileId: string) {
  const queue = state.queues[fileId];
  if (!queue) return;
  const now = Date.now();
  const advanced = advanceQueue(queue, now, now);
  if (!advanced) return stopQueue(fileId);
  set({
    now,
    queues: { ...state.queues, [fileId]: advanced.queue },
    runs: { ...state.runs, [advanced.run.key]: advanced.run },
  });
}

/** Loop / sound toggled in the file while its queue runs. */
export function updateQueueOptions(
  fileId: string,
  options: { loop: boolean; sound: boolean },
) {
  const queue = state.queues[fileId];
  if (!queue) return;
  const runs = { ...state.runs };
  const run = runs[queueKey(fileId)];
  if (run) runs[run.key] = { ...run, sound: options.sound };
  set({ queues: { ...state.queues, [fileId]: { ...queue, ...options } }, runs });
}

export function dismissNotice(id: string) {
  set({ notices: state.notices.filter((n) => n.id !== id) }, false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

/** Every run, queue and notice; re-renders on each clock tick while running. */
export function useTimerState() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Runs restored from storage keep counting (and finish if their time passed).
syncInterval();
