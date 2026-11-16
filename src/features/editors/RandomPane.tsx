import "@/styles/random-pane.css";
import {
  IconCheck,
  IconCopy,
  IconDice5,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { cn } from "@/lib/cn";
import {
  drawIndices,
  parseRandomValues,
  RANDOM_STARTER,
} from "@/lib/random-doc";
import * as ui from "@/lib/ui-styles";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { TabMode } from "@/store/tabs-slice";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

/* ───────────────────────────── Motion tuning ───────────────────────────── */

/** Chips spiral from wherever they float into the centre. */
const GATHER_MS = 900;
/** They churn in the centre before the draw is revealed. */
const SHUFFLE_MS = 750;
/** Each pick flies to its slot; later picks start a little after. */
const REVEAL_MS = 650;
const REVEAL_STAGGER_MS = 110;
/** Drift speed while floating (px/s). */
const FLOAT_MIN = 18;
const FLOAT_MAX = 46;
/** How hard the losers are thrown back out of the centre (px/s). */
const BURST = 520;
/** Radians per second of the gather spiral. */
const SPIN = 5.5;
/** Pick scales tried, largest first, until the result fits the stage. */
const PICK_SCALES = [2, 1.7, 1.4, 1.15, 1, 0.85, 0.7];
const SLOT_GAP = 14;
/** Space kept clear around the result, and above the dock. */
const STAGE_PAD = 24;
const DOCK_ROOM = 72;

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Current scale. */
  s: number;
  /** Size at scale 1 (measured from the DOM). */
  w: number;
  h: number;
  /** Where a tween starts. */
  fromX: number;
  fromY: number;
  fromS: number;
  /** Gather spiral: start angle, outer and inner radius. */
  angle: number;
  outer: number;
  inner: number;
};

type Phase =
  | { kind: "float" }
  | { kind: "gather"; t0: number }
  | { kind: "reveal"; t0: number; picks: number[] }
  | { kind: "result"; picks: number[] };

/** What React renders from; the frame loop works from {@link Phase}. */
type View =
  | { kind: "float" }
  | { kind: "drawing" }
  | { kind: "result"; picks: number[] };

type Slot = { x: number; y: number; s: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function newChip(width: number, height: number, still: boolean): Chip {
  const angle = rand(0, Math.PI * 2);
  const speed = still ? 0 : rand(FLOAT_MIN, FLOAT_MAX);
  const x = rand(0.1, 0.9) * width;
  const y = rand(0.1, 0.9) * height;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    s: 1,
    w: 0,
    h: 0,
    fromX: x,
    fromY: y,
    fromS: 1,
    angle: 0,
    outer: 0,
    inner: 0,
  };
}

/**
 * Centres of the picked chips: rows that wrap inside the stage, centred
 * above the dock, at the largest scale that fits.
 */
function layoutSlots(
  picks: number[],
  chips: Chip[],
  width: number,
  height: number,
): Slot[] {
  const maxW = Math.max(40, width - STAGE_PAD * 2);
  const maxH = Math.max(40, height - STAGE_PAD * 2 - DOCK_ROOM);
  for (const s of PICK_SCALES) {
    const rows: number[][] = [[]];
    let rowW = 0;
    for (const i of picks) {
      const w = chips[i].w * s;
      const row = rows[rows.length - 1];
      if (row.length && rowW + SLOT_GAP + w > maxW) {
        rows.push([i]);
        rowW = w;
      } else {
        rowW += (row.length ? SLOT_GAP : 0) + w;
        row.push(i);
      }
    }
    const rowH = Math.max(...picks.map((i) => chips[i].h)) * s;
    const totalH = rows.length * rowH + (rows.length - 1) * SLOT_GAP;
    const last = s === PICK_SCALES[PICK_SCALES.length - 1];
    if (totalH > maxH && !last) continue;
    const slots = new Map<number, Slot>();
    let y = STAGE_PAD + Math.max(0, (maxH - totalH) / 2) + rowH / 2;
    for (const row of rows) {
      const widths = row.map((i) => chips[i].w * s);
      const total =
        widths.reduce((a, b) => a + b, 0) + (row.length - 1) * SLOT_GAP;
      let x = (width - total) / 2;
      row.forEach((i, k) => {
        slots.set(i, { x: x + widths[k] / 2, y, s });
        x += widths[k] + SLOT_GAP;
      });
      y += rowH + SLOT_GAP;
    }
    return picks.map((i) => slots.get(i)!);
  }
  return [];
}

/** Drift, wander a little, bounce off the stage edges. */
function float(c: Chip, dt: number, width: number, height: number) {
  c.vx += rand(-1, 1) * 40 * dt;
  c.vy += rand(-1, 1) * 40 * dt;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed > FLOAT_MAX) {
    // Thrown chips settle back to a drift.
    const k = Math.max(FLOAT_MAX / speed, Math.exp(-dt * 2.2));
    c.vx *= k;
    c.vy *= k;
  } else if (speed > 0 && speed < FLOAT_MIN) {
    c.vx *= FLOAT_MIN / speed;
    c.vy *= FLOAT_MIN / speed;
  }
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.s += (1 - c.s) * Math.min(1, dt * 6);
  const hw = (c.w * c.s) / 2;
  const hh = (c.h * c.s) / 2;
  if (width <= hw * 2) c.x = width / 2;
  else if (c.x < hw) (c.x = hw), (c.vx = Math.abs(c.vx));
  else if (c.x > width - hw) (c.x = width - hw), (c.vx = -Math.abs(c.vx));
  if (height <= hh * 2) c.y = height / 2;
  else if (c.y < hh) (c.y = hh), (c.vy = Math.abs(c.vy));
  else if (c.y > height - hh) (c.y = height - hh), (c.vy = -Math.abs(c.vy));
}

function readCount(id: string) {
  try {
    const n = Number(localStorage.getItem(`random-pane:count:${id}`));
    return Number.isInteger(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

function writeCount(id: string, n: number) {
  try {
    localStorage.setItem(`random-pane:count:${id}`, String(n));
  } catch {
    // Per-viewer convenience only.
  }
}

/**
 * The draw: every value floats around the stage as a chip. Random pulls
 * them all into a spiral at the centre, churns them, then throws the
 * losers back out while the picks fly into a row in the middle, numbered
 * in draw order. Picks are distinct entries (no entry twice per draw) and
 * come from `crypto.getRandomValues`.
 *
 * Test ids: `random-pane-stage`, `random-pane-chip-<index>`,
 * `random-pane-count-input`, `random-pane-count-decrease-button`,
 * `random-pane-count-increase-button`, `random-pane-draw-button`,
 * `random-pane-result`, `random-pane-empty-message`.
 *
 * CSS block: `random-pane` (`src/styles/random-pane.css`).
 */
function RandomStage({
  id,
  values,
  emptyHint,
  onResult,
}: {
  id: string;
  values: string[];
  emptyHint: string;
  onResult: (picks: string[] | null) => void;
}) {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const els = React.useRef<(HTMLSpanElement | null)[]>([]);
  const chips = React.useRef<Chip[]>([]);
  const size = React.useRef({ width: 0, height: 0 });
  const phase = React.useRef<Phase>({ kind: "float" });
  const [view, setView] = React.useState<View>({ kind: "float" });
  const [count, setCount] = React.useState(() => readCount(id));
  const total = values.length;
  const pickCount = Math.max(1, Math.min(count, total));
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;
  const valuesRef = React.useRef(values);
  valuesRef.current = values;
  const pickCountRef = React.useRef(pickCount);
  pickCountRef.current = pickCount;

  const changeCount = (next: number) => {
    const n = Math.max(1, Math.min(Number.isFinite(next) ? next : 1, total || 1));
    setCount(n);
    writeCount(id, n);
  };

  // New or edited values: keep chips that still exist where they are, spawn
  // the rest, measure everyone, and drop any finished draw.
  React.useLayoutEffect(() => {
    const { width, height } = size.current;
    const still = reducedMotion();
    chips.current = values.map(
      (_, i) => chips.current[i] ?? newChip(width || 1, height || 1, still),
    );
    chips.current.forEach((c, i) => {
      const el = els.current[i];
      if (!el) return;
      c.w = el.offsetWidth;
      c.h = el.offsetHeight;
    });
    phase.current = { kind: "float" };
    setView({ kind: "float" });
    onResultRef.current(null);
  }, [values]);

  // Track the stage size; the first measurement scatters the chips over it.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const first = size.current.width === 0;
      size.current = { width, height };
      if (first) {
        for (const c of chips.current) {
          c.x = rand(0.1, 0.9) * width;
          c.y = rand(0.1, 0.9) * height;
        }
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // One frame loop for the whole stage: positions are written straight to
  // the chips' transforms, React only re-renders on phase changes.
  React.useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { width, height } = size.current;
      if (!width || !height) return;
      const cx = width / 2;
      const cy = (height - DOCK_ROOM / 2) / 2;
      const list = chips.current;
      let ph = phase.current;

      if (ph.kind === "gather" && now - ph.t0 >= GATHER_MS + SHUFFLE_MS) {
        const picks = drawIndices(list.length, pickCountRef.current);
        startReveal(picks, now);
        ph = phase.current;
      }
      if (ph.kind === "reveal") {
        const end =
          REVEAL_MS + REVEAL_STAGGER_MS * Math.max(0, ph.picks.length - 1);
        if (now - ph.t0 >= end) {
          phase.current = { kind: "result", picks: ph.picks };
          ph = phase.current;
        }
      }

      const slots =
        ph.kind === "reveal" || ph.kind === "result"
          ? layoutSlots(ph.picks, list, width, height)
          : [];
      const rank = new Map<number, number>();
      if (ph.kind === "reveal" || ph.kind === "result") {
        ph.picks.forEach((i, k) => rank.set(i, k));
      }

      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (ph.kind === "gather") {
          const t = now - ph.t0;
          const e = easeInOutCubic(Math.min(1, t / GATHER_MS));
          const churn = 1 + 0.18 * Math.sin(t / 85 + i * 1.7) * e;
          const r = lerp(c.outer, c.inner, e) * churn;
          const a = c.angle + (t / 1000) * SPIN * (0.4 + e);
          c.x = lerp(c.fromX, cx + Math.cos(a) * r, e);
          c.y = lerp(c.fromY, cy + Math.sin(a) * r, e);
          c.s = lerp(c.fromS, 0.8, e);
        } else if (rank.has(i)) {
          const k = rank.get(i)!;
          const slot = slots[k];
          if (ph.kind === "reveal") {
            const t = now - ph.t0 - k * REVEAL_STAGGER_MS;
            const e = easeOutBack(Math.max(0, Math.min(1, t / REVEAL_MS)));
            c.x = lerp(c.fromX, slot.x, e);
            c.y = lerp(c.fromY, slot.y, e);
            c.s = lerp(c.fromS, slot.s, e);
          } else {
            c.x = slot.x;
            c.y = slot.y;
            c.s = slot.s;
          }
        } else {
          float(c, dt, width, height);
        }
        const el = els.current[i];
        if (!el) continue;
        el.style.transform = `translate3d(${c.x - c.w / 2}px, ${c.y - c.h / 2}px, 0) scale(${c.s})`;
        el.style.visibility = "visible";
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The loop reads everything through refs.
  }, []);

  /** Picks fly from where they churned; everyone else bursts outward. */
  function startReveal(picks: number[], now: number) {
    const { width, height } = size.current;
    const cx = width / 2;
    const cy = (height - DOCK_ROOM / 2) / 2;
    const picked = new Set(picks);
    chips.current.forEach((c, i) => {
      c.fromX = c.x;
      c.fromY = c.y;
      c.fromS = c.s;
      if (picked.has(i)) return;
      const dx = c.x - cx;
      const dy = c.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const speed = BURST * rand(0.6, 1.2);
      c.vx = (dx / d) * speed;
      c.vy = (dy / d) * speed;
    });
    phase.current = { kind: "reveal", t0: now, picks };
    setView({ kind: "result", picks });
    onResultRef.current(picks.map((i) => valuesRef.current[i]));
  }

  const draw = () => {
    if (!total || view.kind === "drawing") return;
    const { width, height } = size.current;
    const list = chips.current;
    if (reducedMotion()) {
      const picks = drawIndices(list.length, pickCount);
      list.forEach((c) => {
        c.vx = 0;
        c.vy = 0;
      });
      phase.current = { kind: "result", picks };
      setView({ kind: "result", picks });
      onResult(picks.map((i) => values[i]));
      return;
    }
    const base = Math.min(width, height);
    const core = Math.min(base * 0.2, 14 + 7 * Math.sqrt(list.length));
    list.forEach((c) => {
      c.fromX = c.x;
      c.fromY = c.y;
      c.fromS = c.s;
      c.angle = Math.atan2(c.y - height / 2, c.x - width / 2);
      c.outer = Math.hypot(c.x - width / 2, c.y - height / 2);
      c.inner = core * rand(0.15, 1);
    });
    phase.current = { kind: "gather", t0: performance.now() };
    setView({ kind: "drawing" });
    onResult(null);
  };

  const picks = view.kind === "result" ? view.picks : [];
  const rankOf = new Map(picks.map((i, k) => [i, k]));
  const drawing = view.kind === "drawing";

  return (
    <div
      className={cn(
        "random-pane",
        drawing && "random-pane--drawing",
        view.kind === "result" && "random-pane--result",
        values.length > 60 && "random-pane--dense",
      )}
    >
      <div
        ref={stageRef}
        className="random-pane__stage"
        data-testid="random-pane-stage"
      >
        <div className="random-pane__core" aria-hidden="true" />
        {values.map((value, i) => {
          const rank = rankOf.get(i);
          return (
            <span
              key={i}
              ref={(el) => {
                els.current[i] = el;
              }}
              title={value}
              data-testid={`random-pane-chip-${i}`}
              style={{ visibility: "hidden" }}
              className={cn(
                "random-pane__chip",
                rank !== undefined && "random-pane__chip--picked",
                view.kind === "result" &&
                  rank === undefined &&
                  "random-pane__chip--dimmed",
              )}
            >
              {rank !== undefined ? (
                <span className="random-pane__chip-rank">{rank + 1}</span>
              ) : null}
              <span className="random-pane__chip-text">{value}</span>
            </span>
          );
        })}
        {total === 0 ? (
          <p
            className="random-pane__empty"
            data-testid="random-pane-empty-message"
          >
            {emptyHint}
          </p>
        ) : null}
      </div>

      <form
        className="random-pane__dock"
        aria-label="Draw"
        onSubmit={(e) => {
          e.preventDefault();
          draw();
        }}
      >
        <span className="random-pane__dock-label">Pick</span>
        <div className="random-pane__stepper">
          <button
            type="button"
            className="random-pane__step"
            aria-label="Pick fewer"
            data-testid="random-pane-count-decrease-button"
            disabled={pickCount <= 1 || drawing}
            onClick={() => changeCount(pickCount - 1)}
          >
            <IconMinus className="random-pane__step-icon" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            className="random-pane__count"
            aria-label="How many to pick"
            data-testid="random-pane-count-input"
            min={1}
            max={Math.max(1, total)}
            value={pickCount}
            disabled={drawing || total === 0}
            onChange={(e) => changeCount(Math.floor(Number(e.target.value)))}
          />
          <button
            type="button"
            className="random-pane__step"
            aria-label="Pick more"
            data-testid="random-pane-count-increase-button"
            disabled={pickCount >= total || drawing}
            onClick={() => changeCount(pickCount + 1)}
          >
            <IconPlus className="random-pane__step-icon" />
          </button>
        </div>
        <span className="random-pane__dock-total">of {total}</span>
        <Button
          type="submit"
          size="sm"
          data-testid="random-pane-draw-button"
          disabled={total === 0 || drawing}
        >
          <IconDice5 className="random-pane__draw-icon" />
          {drawing ? "Drawing…" : "Random"}
        </Button>
      </form>

      <p
        className="random-pane__live"
        aria-live="polite"
        data-testid="random-pane-result"
      >
        {view.kind === "result"
          ? `Picked: ${picks.map((i) => values[i]).join(", ")}`
          : ""}
      </p>
    </div>
  );
}

/** File bar: copy the last draw, one value per line. */
function CopyResult({ picks }: { picks: string[] | null }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => setCopied(false), [picks]);
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(ui.paneToolbarBtn)}
      data-testid="random-pane-copy-button"
      title="Copy the picked values"
      disabled={!picks?.length}
      onClick={async () => {
        if (!picks?.length) return;
        try {
          await navigator.clipboard.writeText(picks.join("\n"));
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? "Copied" : "Copy result"}
    </Button>
  );
}

/** Same array back while the parsed values are unchanged, so edits that only
 *  touch spacing or layout leave a running draw alone. */
function useStableValues(next: string[]) {
  const ref = React.useRef(next);
  const same =
    ref.current.length === next.length &&
    ref.current.every((v, i) => v === next[i]);
  if (!same) ref.current = next;
  return ref.current;
}

/**
 * `.random` files: comma- and/or line-separated values (CSV) drawn at
 * random. Edit mode splits the raw list and the stage; view mode shows the
 * stage alone. The text is the source of truth; the pick count is a
 * per-viewer setting.
 */
export default function RandomPane({
  id,
  content,
  mode,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const [focusOnMount] = React.useState(autoFocus);
  const [picks, setPicks] = React.useState<string[] | null>(null);
  const values = useStableValues(parseRandomValues(text));
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));

  const actions = (
    <FileBarSlot>
      <CopyResult picks={picks} />
    </FileBarSlot>
  );

  if (mode === "view") {
    return (
      <>
        {actions}
        <RandomStage
          id={id}
          values={values}
          onResult={setPicks}
          emptyHint="Nothing to draw yet — list values in Edit mode, separated by commas or new lines."
        />
      </>
    );
  }

  return (
    <>
      {actions}
      <ResizableGroup orientation="horizontal">
        <ResizablePanel defaultSize="35%" minSize="200px">
          <LazyCodeEditor
            path={`${id}.random`}
            language="csv"
            aria-label="Values to draw from"
            data-testid="random-pane-raw-input"
            placeholder={RANDOM_STARTER}
            autoFocus={focusOnMount}
            defaultValue={text}
            onChange={(value) => {
              setText(value);
              save(value);
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="280px">
          <RandomStage
            id={id}
            values={values}
            onResult={setPicks}
            emptyHint="Write values on the left, separated by commas or new lines."
          />
        </ResizablePanel>
      </ResizableGroup>
    </>
  );
}
