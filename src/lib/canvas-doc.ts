/**
 * `.canvas` files: a freeform whiteboard drawn with Konva (see
 * `CanvasPane`). The file is JSON — the shapes in paint order plus the last
 * view (pan / zoom), so a board reopens where it was left.
 */

/** Drawing tools of the canvas pane. */
export type CanvasTool =
  | "select"
  | "hand"
  | "pen"
  | "rect"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "eraser";

type ShapeBase = {
  id: string;
  /** Position in board coordinates; shapes rotate / scale around it. */
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** A colour from {@link CANVAS_COLORS}; `"ink"` follows the theme. */
  color: string;
  strokeWidth: number;
};

/** Freehand stroke; `points` are flat `[x, y, …]` relative to `x` / `y`. */
export type PenShape = ShapeBase & { type: "pen"; points: number[] };
export type BoxShape = ShapeBase & {
  type: "rect" | "ellipse";
  width: number;
  height: number;
  /** Filled with a light tint of `color`. */
  fill: boolean;
};
/** Straight line or arrow from `(x, y)` to `(x + dx, y + dy)`. */
export type LineShape = ShapeBase & {
  type: "line" | "arrow";
  points: [number, number, number, number];
};
export type TextShape = ShapeBase & {
  type: "text";
  text: string;
  fontSize: number;
};
export type CanvasShape = PenShape | BoxShape | LineShape | TextShape;

export type CanvasView = { x: number; y: number; scale: number };

export type CanvasDoc = {
  version: 1;
  view: CanvasView;
  shapes: CanvasShape[];
};

/** Theme-following ink: near-black on light, near-white on dark. */
export const INK = "ink";

export const CANVAS_COLORS = [
  INK,
  "#e03131",
  "#f08c00",
  "#2f9e44",
  "#1971c2",
  "#7048e8",
  "#c2255c",
  "#868e96",
] as const;

export const STROKE_WIDTHS = [
  { id: "s", label: "Thin", width: 2 },
  { id: "m", label: "Medium", width: 4 },
  { id: "l", label: "Thick", width: 8 },
] as const;

/** Text size for a stroke width: thicker pens write bigger. */
export function fontSizeFor(strokeWidth: number) {
  return strokeWidth <= 2 ? 18 : strokeWidth <= 4 ? 24 : 36;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function emptyCanvas(): CanvasDoc {
  return { version: 1, view: { x: 0, y: 0, scale: 1 }, shapes: [] };
}

export function newShapeId() {
  return Math.random().toString(36).slice(2, 10);
}

/** The colour to paint with: `"ink"` resolved for the theme. */
export function paintColor(color: string, isDark: boolean) {
  if (color !== INK) return color;
  return isDark ? "#e9ecef" : "#1e1e1e";
}

const TYPES = new Set(["pen", "rect", "ellipse", "line", "arrow", "text"]);
const num = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const numbers = (value: unknown) =>
  Array.isArray(value) && value.every((n) => typeof n === "number")
    ? (value as number[])
    : null;

/** Fills defaults; `null` for anything that is not a known shape. */
function normalizeShape(raw: unknown): CanvasShape | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !TYPES.has(r.type as string)) return null;
  const base: ShapeBase = {
    id: r.id,
    x: num(r.x, 0),
    y: num(r.y, 0),
    rotation: num(r.rotation, 0),
    scaleX: num(r.scaleX, 1),
    scaleY: num(r.scaleY, 1),
    color: typeof r.color === "string" ? r.color : INK,
    strokeWidth: num(r.strokeWidth, 4),
  };
  switch (r.type) {
    case "pen": {
      const points = numbers(r.points);
      return points && points.length >= 2
        ? { ...base, type: "pen", points }
        : null;
    }
    case "rect":
    case "ellipse":
      return {
        ...base,
        type: r.type,
        width: num(r.width, 100),
        height: num(r.height, 100),
        fill: r.fill === true,
      };
    case "line":
    case "arrow": {
      const points = numbers(r.points);
      return points && points.length === 4
        ? {
            ...base,
            type: r.type,
            points: points as LineShape["points"],
          }
        : null;
    }
    case "text":
      return typeof r.text === "string"
        ? { ...base, type: "text", text: r.text, fontSize: num(r.fontSize, 24) }
        : null;
  }
  return null;
}

/**
 * The board in `text`. Empty text is a blank board; anything that is not a
 * canvas document throws. Unknown shapes are dropped.
 */
export function parseCanvas(text: string): CanvasDoc {
  if (!text.trim()) return emptyCanvas();
  const raw = JSON.parse(text) as unknown;
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as CanvasDoc).shapes)) {
    throw new Error("no shapes list");
  }
  const doc = raw as Partial<CanvasDoc>;
  const view = doc.view ?? { x: 0, y: 0, scale: 1 };
  return {
    version: 1,
    view: {
      x: num(view.x, 0),
      y: num(view.y, 0),
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, num(view.scale, 1))),
    },
    shapes: (doc.shapes as unknown[])
      .map(normalizeShape)
      .filter((s): s is CanvasShape => s !== null),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** JSON for the file; coordinates rounded so pen strokes stay compact. */
export function serializeCanvas(doc: CanvasDoc) {
  return JSON.stringify(
    {
      version: 1,
      view: {
        x: round(doc.view.x),
        y: round(doc.view.y),
        scale: round(doc.view.scale * 100) / 100,
      },
      shapes: doc.shapes.map((shape) =>
        "points" in shape
          ? { ...shape, points: shape.points.map(round) }
          : shape,
      ),
    },
    null,
    1,
  );
}
