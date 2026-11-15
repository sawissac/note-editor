/**
 * `.timer` files: a list of named countdowns stored as JSON. Running state
 * lives in `@/lib/timer-runtime`, not in the file.
 */

export type TimerItem = {
  id: string;
  label: string;
  durationMs: number;
};

export type TimerDoc = {
  version: 1;
  timers: TimerItem[];
  /** Run queue starts over after the last timer. */
  loop: boolean;
  /** Chime when a timer ends. */
  sound: boolean;
};

export const MAX_DURATION_MS = 99 * 3600_000 + 59 * 60_000 + 59_000;

export function newTimerId() {
  return Math.random().toString(36).slice(2, 10);
}

export function starterTimers(): TimerDoc {
  return {
    version: 1,
    loop: false,
    sound: true,
    timers: [
      { id: newTimerId(), label: "Focus", durationMs: 25 * 60_000 },
      { id: newTimerId(), label: "Short break", durationMs: 5 * 60_000 },
    ],
  };
}

export function serializeTimers(doc: TimerDoc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parseTimers(text: string): TimerDoc {
  if (!text.trim()) return { version: 1, loop: false, sound: true, timers: [] };
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Expected a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.timers) ? obj.timers : [];
  const seen = new Set<string>();
  const timers: TimerItem[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Record<string, unknown>;
    let id = typeof t.id === "string" && t.id ? t.id : newTimerId();
    if (seen.has(id)) id = newTimerId();
    seen.add(id);
    const ms = typeof t.durationMs === "number" ? t.durationMs : 0;
    timers.push({
      id,
      label: typeof t.label === "string" ? t.label : "",
      durationMs: Math.min(MAX_DURATION_MS, Math.max(0, Math.round(ms))),
    });
  }
  return {
    version: 1,
    loop: obj.loop === true,
    sound: obj.sound !== false,
    timers,
  };
}

/** `h:mm:ss`, or `m:ss` under an hour. Rounds partial seconds up. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** `1h 5m`, `25m`, `30s` — for summaries. */
export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

export function splitDuration(ms: number) {
  const total = Math.round(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function joinDuration(h: number, m: number, s: number) {
  return Math.min(MAX_DURATION_MS, ((h * 60 + m) * 60 + s) * 1000);
}
