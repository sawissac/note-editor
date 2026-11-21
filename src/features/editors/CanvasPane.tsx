import "@/styles/canvas-pane.css";

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUpRight,
  IconChalkboard,
  IconCircle,
  IconCopy,
  IconEraser,
  IconFocusCentered,
  IconHandStop,
  IconLetterT,
  IconLine,
  IconMinus,
  IconPencil,
  IconPhotoDown,
  IconPlus,
  IconPointer,
  IconSquare,
  IconStackBack,
  IconStackFront,
  IconTrash,
  type Icon,
} from "@tabler/icons-react";
import Konva from "konva";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  CANVAS_COLORS,
  type CanvasDoc,
  type CanvasShape,
  type CanvasTool,
  type CanvasView,
  fontSizeFor,
  MAX_SCALE,
  MIN_SCALE,
  newShapeId,
  paintColor,
  parseCanvas,
  serializeCanvas,
  STROKE_WIDTHS,
  type TextShape,
} from "@/lib/canvas-doc";
import { cn } from "@/lib/cn";
import { baseNameLength } from "@/lib/file-types";
import { downloadFile } from "@/lib/storage";
import { isCoarsePointer } from "@/lib/use-media-query";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useDebouncedSave } from "@/features/editors/use-file-content";

const TOOLS: { id: CanvasTool; label: string; key: string; icon: Icon }[] = [
  { id: "select", label: "Select", key: "v", icon: IconPointer },
  { id: "hand", label: "Hand", key: "h", icon: IconHandStop },
  { id: "pen", label: "Pen", key: "p", icon: IconPencil },
  { id: "rect", label: "Rectangle", key: "r", icon: IconSquare },
  { id: "ellipse", label: "Ellipse", key: "o", icon: IconCircle },
  { id: "arrow", label: "Arrow", key: "a", icon: IconArrowUpRight },
  { id: "line", label: "Line", key: "l", icon: IconLine },
  { id: "text", label: "Text", key: "t", icon: IconLetterT },
  { id: "eraser", label: "Eraser", key: "e", icon: IconEraser },
];
const TOOL_BY_KEY = new Map(TOOLS.map((t) => [t.key, t.id]));
const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
/** Tool bar groups: navigate · freehand · shapes and text. */
const TOOL_GROUPS: CanvasTool[][] = [
  ["select", "hand"],
  ["pen", "eraser"],
  ["rect", "ellipse", "arrow", "line", "text"],
];
/** Tools that draw something, so the style panel shows for them. */
const DRAWING_TOOLS: ReadonlySet<CanvasTool> = new Set([
  "pen",
  "rect",
  "ellipse",
  "arrow",
  "line",
  "text",
]);
const HISTORY_LIMIT = 100;
const FONT_FAMILY = "Inter, system-ui, sans-serif";
/** A click (no drag) with a box tool drops a shape this size. */
const DEFAULT_BOX = { width: 160, height: 100 };

type History = { past: CanvasShape[][]; future: CanvasShape[][] };
type TextEdit = { id: string; value: string; isNew: boolean };

/** `#rrggbb` → the same colour at ~18% alpha, for box fills. */
const tint = (hex: string) => (hex.length === 7 ? `${hex}2e` : hex);

/**
 * Board shortcuts apply while the board (or a canvas toolbar button) has
 * focus — never while another part of the app does, so Delete in the
 * explorer still deletes files there.
 */
const boardHasFocus = (host: HTMLElement) => {
  const active = document.activeElement;
  const pane = host.closest(".canvas-pane");
  return (
    active === host ||
    (!!pane && pane.contains(active) && active?.tagName === "BUTTON")
  );
};

/** Konva node for one shape; its name is `shape`, its id the shape's. */
function buildNode(shape: CanvasShape, isDark: boolean): Konva.Shape {
  const color = paintColor(shape.color, isDark);
  const common = {
    id: shape.id,
    name: "shape",
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    scaleX: shape.scaleX,
    scaleY: shape.scaleY,
    strokeScaleEnabled: false,
    hitStrokeWidth: Math.max(14, shape.strokeWidth + 8),
  };
  switch (shape.type) {
    case "pen":
      return new Konva.Line({
        ...common,
        points: shape.points,
        stroke: color,
        strokeWidth: shape.strokeWidth,
        lineCap: "round",
        lineJoin: "round",
        tension: 0.4,
      });
    case "rect":
      return new Konva.Rect({
        ...common,
        width: shape.width,
        height: shape.height,
        cornerRadius: 6,
        stroke: color,
        strokeWidth: shape.strokeWidth,
        fill: shape.fill ? tint(color) : undefined,
        fillEnabled: shape.fill,
      });
    case "ellipse":
      return new Konva.Ellipse({
        ...common,
        radiusX: shape.width / 2,
        radiusY: shape.height / 2,
        // Positioned by its top-left corner, like a rectangle.
        offsetX: -shape.width / 2,
        offsetY: -shape.height / 2,
        stroke: color,
        strokeWidth: shape.strokeWidth,
        fill: shape.fill ? tint(color) : undefined,
        fillEnabled: shape.fill,
      });
    case "line":
    case "arrow":
      return new Konva.Arrow({
        ...common,
        points: [...shape.points],
        stroke: color,
        fill: color,
        strokeWidth: shape.strokeWidth,
        lineCap: "round",
        pointerLength: shape.type === "arrow" ? shape.strokeWidth * 2 + 8 : 0,
        pointerWidth: shape.type === "arrow" ? shape.strokeWidth * 2 + 8 : 0,
      });
    case "text":
      return new Konva.Text({
        ...common,
        text: shape.text,
        fontSize: shape.fontSize,
        fontFamily: FONT_FAMILY,
        lineHeight: 1.25,
        fill: color,
      });
  }
}

/**
 * `.canvas` files: a freeform whiteboard drawn with Konva — pen, boxes,
 * ellipses, lines, arrows and text on an endless board. Pan with the hand
 * tool, Space-drag, the wheel or two fingers; zoom with ⌘/Ctrl-wheel or a
 * pinch. Edits autosave; ⌘/Ctrl+Z undoes. "Ink" strokes follow the theme.
 *
 * Styles: BEM block `canvas-pane` (`src/styles/canvas-pane.css`).
 *
 * @param props - {@link PaneProps}; `content` seeds the board once.
 */
export default function CanvasPane({
  id,
  name,
  content,
  isDark,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const initial = React.useMemo(() => {
    try {
      return {
        doc: parseCanvas(typeof content === "string" ? content : ""),
        error: null as string | null,
      };
    } catch (error) {
      return {
        doc: parseCanvas(""),
        error: error instanceof Error ? error.message : String(error),
      };
    }
    // Mounted per file (`key={id}` upstream) — `content` only seeds state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [parseError, setParseError] = React.useState(initial.error);

  const [shapes, setShapes] = React.useState(initial.doc.shapes);
  const [view, setView] = React.useState(initial.doc.view);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [tool, setTool] = React.useState<CanvasTool>("select");
  const [color, setColor] = React.useState<string>(CANVAS_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = React.useState<number>(
    STROKE_WIDTHS[1].width,
  );
  const [fill, setFill] = React.useState(false);
  const [editing, setEditing] = React.useState<TextEdit | null>(null);
  const [, setHistoryTick] = React.useState(0);

  // Refs are the source of truth for Konva's event handlers.
  const shapesRef = React.useRef(shapes);
  const viewRef = React.useRef(view);
  const history = React.useRef<History>({ past: [], future: [] });
  const live = React.useRef({ tool, color, strokeWidth, fill, isDark, selected });
  live.current = { tool, color, strokeWidth, fill, isDark, selected };

  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  const serialize = React.useCallback(
    (): string =>
      serializeCanvas({
        version: 1,
        view: viewRef.current,
        shapes: shapesRef.current,
      } satisfies CanvasDoc),
    [],
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, serialize())));

  /** Replaces the shapes, recording the old ones for undo, and saves. */
  const commit = React.useCallback(
    (next: CanvasShape[]) => {
      const { past } = history.current;
      past.push(shapesRef.current);
      if (past.length > HISTORY_LIMIT) past.shift();
      history.current.future = [];
      shapesRef.current = next;
      setShapes(next);
      setHistoryTick((n) => n + 1);
      save(serialize());
    },
    [save, serialize],
  );
  const patchShapes = React.useCallback(
    (patches: Map<string, Partial<CanvasShape>>) =>
      commit(
        shapesRef.current.map((s) =>
          patches.has(s.id)
            ? ({ ...s, ...patches.get(s.id) } as CanvasShape)
            : s,
        ),
      ),
    [commit],
  );
  const step = React.useCallback(
    (from: "past" | "future") => {
      const h = history.current;
      const target = h[from].pop();
      if (!target) return;
      (from === "past" ? h.future : h.past).push(shapesRef.current);
      shapesRef.current = target;
      setShapes(target);
      setSelected((ids) => ids.filter((i) => target.some((s) => s.id === i)));
      setHistoryTick((n) => n + 1);
      save(serialize());
    },
    [save, serialize],
  );
  const undo = React.useCallback(() => step("past"), [step]);
  const redo = React.useCallback(() => step("future"), [step]);

  const removeSelected = React.useCallback(() => {
    const ids = new Set(live.current.selected);
    if (!ids.size) return;
    commit(shapesRef.current.filter((s) => !ids.has(s.id)));
    setSelected([]);
  }, [commit]);

  const duplicateSelected = React.useCallback(() => {
    const ids = new Set(live.current.selected);
    if (!ids.size) return;
    const copies = shapesRef.current
      .filter((s) => ids.has(s.id))
      .map((s) => ({ ...s, id: newShapeId(), x: s.x + 24, y: s.y + 24 }));
    commit([...shapesRef.current, ...copies]);
    setSelected(copies.map((s) => s.id));
  }, [commit]);

  /** Moves the selection to the top (`front`) or bottom of the stack. */
  const reorderSelected = React.useCallback(
    (to: "front" | "back") => {
      const ids = new Set(live.current.selected);
      if (!ids.size) return;
      const picked = shapesRef.current.filter((s) => ids.has(s.id));
      const rest = shapesRef.current.filter((s) => !ids.has(s.id));
      commit(to === "front" ? [...rest, ...picked] : [...picked, ...rest]);
    },
    [commit],
  );

  /* ───────────── Konva stage ───────────── */

  const hostRef = React.useRef<HTMLDivElement>(null);
  const konvaRef = React.useRef<{
    stage: Konva.Stage;
    layer: Konva.Layer;
    overlay: Konva.Layer;
    transformer: Konva.Transformer;
  } | null>(null);

  const applyView = React.useCallback((next: CanvasView) => {
    viewRef.current = next;
    setView(next);
    const stage = konvaRef.current?.stage;
    if (!stage) return;
    stage.position({ x: next.x, y: next.y });
    stage.scale({ x: next.scale, y: next.scale });
  }, []);

  /** Zooms to `scale`, keeping the screen point `at` (default: centre) fixed. */
  const zoomTo = React.useCallback(
    (scale: number, at?: { x: number; y: number }) => {
      const stage = konvaRef.current?.stage;
      if (!stage) return;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      const point = at ?? { x: stage.width() / 2, y: stage.height() / 2 };
      const old = viewRef.current;
      const board = {
        x: (point.x - old.x) / old.scale,
        y: (point.y - old.y) / old.scale,
      };
      applyView({
        scale: clamped,
        x: point.x - board.x * clamped,
        y: point.y - board.y * clamped,
      });
    },
    [applyView],
  );

  const fitToContent = React.useCallback(() => {
    const k = konvaRef.current;
    if (!k) return;
    const nodes = k.layer.find(".shape");
    if (!nodes.length) {
      applyView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const box = k.layer.getClientRect({ relativeTo: k.stage });
    const pad = 48;
    const scale = Math.min(
      2,
      Math.max(
        MIN_SCALE,
        Math.min(
          (k.stage.width() - pad * 2) / Math.max(box.width, 1),
          (k.stage.height() - pad * 2) / Math.max(box.height, 1),
        ),
      ),
    );
    applyView({
      scale,
      x: (k.stage.width() - box.width * scale) / 2 - box.x * scale,
      y: (k.stage.height() - box.height * scale) / 2 - box.y * scale,
    });
  }, [applyView]);

  const exportPng = React.useCallback(() => {
    const k = konvaRef.current;
    if (!k || !k.layer.find(".shape").length) return;
    const pad = 24;
    const box = k.layer.getClientRect();
    const ratio = 2 / viewRef.current.scale;
    const art = k.layer.toCanvas({
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
      pixelRatio: Math.max(1, ratio),
    });
    const out = document.createElement("canvas");
    out.width = art.width;
    out.height = art.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = live.current.isDark ? "#1a1b1e" : "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(art, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((bytes) =>
        downloadFile(
          `${name.slice(0, baseNameLength(name))}.png`,
          bytes,
          "image/png",
        ),
      );
    }, "image/png");
  }, [name]);

  // Stage, layers and every pointer interaction — set up once.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || parseError) return;
    const accent =
      getComputedStyle(host).getPropertyValue("--app-accent").trim() ||
      "#2563eb";
    const coarse = isCoarsePointer();
    const v = viewRef.current;
    const stage = new Konva.Stage({
      container: host,
      width: host.clientWidth,
      height: host.clientHeight,
      x: v.x,
      y: v.y,
      scaleX: v.scale,
      scaleY: v.scale,
    });
    const layer = new Konva.Layer();
    const overlay = new Konva.Layer();
    const transformer = new Konva.Transformer({
      flipEnabled: false,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      anchorSize: coarse ? 16 : 9,
      anchorCornerRadius: 2,
      anchorStroke: accent,
      anchorFill: "#ffffff",
      borderStroke: accent,
      padding: 4,
    });
    const marquee = new Konva.Rect({
      visible: false,
      fill: `${accent}1a`,
      stroke: accent,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      listening: false,
    });
    overlay.add(transformer, marquee);
    stage.add(layer, overlay);
    konvaRef.current = { stage, layer, overlay, transformer };

    const resize = new ResizeObserver(() =>
      stage.size({ width: host.clientWidth, height: host.clientHeight }),
    );
    resize.observe(host);

    const boardPoint = () => stage.getRelativePointerPosition() ?? { x: 0, y: 0 };
    const shapeOf = (node: Konva.Node | null) =>
      node && node.name() === "shape" ? node : null;

    /** Moved / transformed nodes → their new geometry, committed. */
    const commitNodes = (nodes: Konva.Node[]) => {
      const patches = new Map<string, Partial<CanvasShape>>();
      for (const node of nodes) {
        patches.set(node.id(), {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
        });
      }
      if (patches.size) patchShapes(patches);
    };
    transformer.on("transformend", () => commitNodes(transformer.nodes()));
    layer.on("dragend", (e) => {
      const moved = new Set<Konva.Node>(transformer.nodes());
      if (shapeOf(e.target)) moved.add(e.target);
      commitNodes([...moved]);
    });
    stage.on("dragend", (e) => {
      if (e.target !== stage) return;
      applyView({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
    });

    // In-progress gesture.
    let draft: Konva.Shape | null = null;
    // Style and tool as the gesture began; a mid-gesture switch can't mix them.
    let gesture = live.current;
    let start = { x: 0, y: 0 };
    let erased = new Set<string>();
    // Eraser only rubs while a button / finger is down.
    let erasing = false;
    // A text tool press, opened as a field on release.
    let pendingText: (() => void) | null = null;
    let marqueeFrom: { x: number; y: number } | null = null;
    let spaceDown = false;
    let pinch: { dist: number; center: { x: number; y: number } } | null = null;

    const cancelDraft = () => {
      draft?.destroy();
      draft = null;
      marqueeFrom = null;
      marquee.visible(false);
    };

    const eraseAt = () => {
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const hit = shapeOf(layer.getIntersection(pos));
      if (hit && !erased.has(hit.id())) {
        erased.add(hit.id());
        hit.opacity(0.2);
      }
    };

    stage.on("pointerdown", (e) => {
      host.focus({ preventScroll: true });
      if (pinch || stage.isDragging()) return;
      gesture = live.current;
      const { tool, color, strokeWidth, fill, isDark } = gesture;
      if (tool === "hand" || spaceDown) return;
      if (e.evt.button !== 0 && e.evt.pointerType === "mouse") return;
      const p = boardPoint();
      start = p;
      const target = shapeOf(e.target);
      const paint = paintColor(color, isDark);

      switch (tool) {
        case "select": {
          if (target) {
            const sid = target.id();
            const sel = live.current.selected;
            if (e.evt.shiftKey) {
              setSelected(
                sel.includes(sid) ? sel.filter((s) => s !== sid) : [...sel, sid],
              );
            } else if (!sel.includes(sid)) {
              setSelected([sid]);
            }
            return;
          }
          if (!e.evt.shiftKey) setSelected([]);
          marqueeFrom = p;
          marquee.setAttrs({ x: p.x, y: p.y, width: 0, height: 0, visible: true });
          return;
        }
        case "eraser":
          erased = new Set();
          erasing = true;
          eraseAt();
          return;
        case "text": {
          // The field opens on release: opened now, the browser's own
          // mousedown focus (the board is focusable) would blur it at once,
          // and a blank text is dropped on blur.
          if (target && target.className === "Text") {
            const existing = target as Konva.Text;
            pendingText = () => {
              setTool("select");
              setEditing({ id: existing.id(), value: existing.text(), isNew: false });
            };
            return;
          }
          const shape: TextShape = {
            id: newShapeId(),
            type: "text",
            x: p.x,
            y: p.y - fontSizeFor(strokeWidth) * 0.6,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            color,
            strokeWidth,
            text: "",
            fontSize: fontSizeFor(strokeWidth),
          };
          pendingText = () => {
            // Shown (and saved) only once it has text — see `finishEditing`.
            shapesRef.current = [...shapesRef.current, shape];
            setShapes(shapesRef.current);
            setTool("select");
            setEditing({ id: shape.id, value: "", isNew: true });
          };
          return;
        }
        case "pen":
          draft = new Konva.Line({
            points: [p.x, p.y, p.x, p.y],
            stroke: paint,
            strokeWidth,
            lineCap: "round",
            lineJoin: "round",
            tension: 0.4,
            listening: false,
          });
          break;
        case "rect":
          draft = new Konva.Rect({
            x: p.x,
            y: p.y,
            cornerRadius: 6,
            stroke: paint,
            strokeWidth,
            fill: fill ? tint(paint) : undefined,
            listening: false,
          });
          break;
        case "ellipse":
          draft = new Konva.Ellipse({
            x: p.x,
            y: p.y,
            radiusX: 0,
            radiusY: 0,
            stroke: paint,
            strokeWidth,
            fill: fill ? tint(paint) : undefined,
            listening: false,
          });
          break;
        case "arrow":
        case "line":
          draft = new Konva.Arrow({
            points: [p.x, p.y, p.x, p.y],
            stroke: paint,
            fill: paint,
            strokeWidth,
            lineCap: "round",
            pointerLength: tool === "arrow" ? strokeWidth * 2 + 8 : 0,
            pointerWidth: tool === "arrow" ? strokeWidth * 2 + 8 : 0,
            listening: false,
          });
          break;
      }
      if (draft) {
        draft.strokeScaleEnabled(false);
        layer.add(draft);
      }
    });

    stage.on("pointermove", () => {
      if (pinch) return;
      const p = boardPoint();
      if (marqueeFrom) {
        marquee.setAttrs({
          x: Math.min(marqueeFrom.x, p.x),
          y: Math.min(marqueeFrom.y, p.y),
          width: Math.abs(p.x - marqueeFrom.x),
          height: Math.abs(p.y - marqueeFrom.y),
        });
        return;
      }
      if (erasing) {
        eraseAt();
        return;
      }
      if (!draft) return;
      if (draft instanceof Konva.Arrow) {
        draft.points([start.x, start.y, p.x, p.y]);
      } else if (draft instanceof Konva.Line) {
        draft.points([...draft.points(), p.x, p.y]);
      } else if (draft instanceof Konva.Rect) {
        draft.setAttrs({
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.abs(p.x - start.x),
          height: Math.abs(p.y - start.y),
        });
      } else if (draft instanceof Konva.Ellipse) {
        draft.setAttrs({
          x: (start.x + p.x) / 2,
          y: (start.y + p.y) / 2,
          radiusX: Math.abs(p.x - start.x) / 2,
          radiusY: Math.abs(p.y - start.y) / 2,
        });
      }
    });

    const finish = () => {
      erasing = false;
      if (pendingText) {
        const open = pendingText;
        pendingText = null;
        open();
        return;
      }
      if (marqueeFrom) {
        const box = marquee.getClientRect();
        const hits =
          box.width > 2 || box.height > 2
            ? layer
                .find(".shape")
                .filter((node) =>
                  Konva.Util.haveIntersection(box, node.getClientRect()),
                )
                .map((node) => node.id())
            : [];
        if (hits.length) {
          setSelected((sel) => Array.from(new Set([...sel, ...hits])));
        }
        marqueeFrom = null;
        marquee.visible(false);
        return;
      }
      if (erased.size) {
        const gone = erased;
        erased = new Set();
        commit(shapesRef.current.filter((s) => !gone.has(s.id)));
        return;
      }
      if (!draft) return;
      const { tool, color, strokeWidth, fill } = gesture;
      const p = boardPoint();
      const base = {
        id: newShapeId(),
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        color,
        strokeWidth,
      };
      let shape: CanvasShape | null = null;
      if (tool === "pen" && draft instanceof Konva.Line && !(draft instanceof Konva.Arrow)) {
        const pts = draft.points();
        const ox = Math.min(...pts.filter((_, i) => i % 2 === 0));
        const oy = Math.min(...pts.filter((_, i) => i % 2 === 1));
        shape = {
          ...base,
          type: "pen",
          x: ox,
          y: oy,
          points: pts.map((n, i) => n - (i % 2 === 0 ? ox : oy)),
        };
      } else if (tool === "rect" || tool === "ellipse") {
        const dragged = Math.abs(p.x - start.x) > 4 || Math.abs(p.y - start.y) > 4;
        shape = {
          ...base,
          type: tool,
          fill,
          ...(dragged
            ? {
                x: Math.min(start.x, p.x),
                y: Math.min(start.y, p.y),
                width: Math.abs(p.x - start.x),
                height: Math.abs(p.y - start.y),
              }
            : {
                x: start.x - DEFAULT_BOX.width / 2,
                y: start.y - DEFAULT_BOX.height / 2,
                ...DEFAULT_BOX,
              }),
        };
      } else if (
        (tool === "arrow" || tool === "line") &&
        Math.hypot(p.x - start.x, p.y - start.y) > 4
      ) {
        shape = {
          ...base,
          type: tool,
          x: start.x,
          y: start.y,
          points: [0, 0, p.x - start.x, p.y - start.y],
        };
      }
      draft.destroy();
      draft = null;
      if (shape) commit([...shapesRef.current, shape]);
    };
    stage.on("pointerup pointercancel", finish);
    // A release outside the board still ends the gesture.
    window.addEventListener("pointerup", finish);

    stage.on("dblclick dbltap", (e) => {
      const target = shapeOf(e.target);
      if (live.current.tool === "select" && target?.className === "Text") {
        setEditing({ id: target.id(), value: (target as Konva.Text).text(), isNew: false });
      }
    });

    // Wheel: scroll pans (trackpads), ⌘/Ctrl or pinch-gesture zooms.
    stage.on("wheel", (e) => {
      e.evt.preventDefault();
      const ev = e.evt;
      if (ev.ctrlKey || ev.metaKey) {
        const pos = stage.getPointerPosition() ?? undefined;
        zoomTo(viewRef.current.scale * Math.exp(-ev.deltaY * 0.01), pos);
      } else {
        const v = viewRef.current;
        applyView({ ...v, x: v.x - ev.deltaX, y: v.y - ev.deltaY });
      }
    });

    // Two fingers: pinch to zoom and pan together.
    const touchInfo = (touches: TouchList) => {
      const rect = host.getBoundingClientRect();
      const [a, b] = [touches[0], touches[1]];
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        center: {
          x: (a.clientX + b.clientX) / 2 - rect.left,
          y: (a.clientY + b.clientY) / 2 - rect.top,
        },
      };
    };
    stage.on("touchstart", (e) => {
      if (e.evt.touches.length !== 2) return;
      cancelDraft();
      pendingText = null;
      erased.forEach((sid) => layer.findOne(`#${sid}`)?.opacity(1));
      erased = new Set();
      transformer.nodes().forEach((n) => n.stopDrag());
      pinch = touchInfo(e.evt.touches);
    });
    stage.on("touchmove", (e) => {
      if (!pinch || e.evt.touches.length !== 2) return;
      e.evt.preventDefault();
      const next = touchInfo(e.evt.touches);
      const v = viewRef.current;
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, (v.scale * next.dist) / pinch.dist),
      );
      const board = {
        x: (pinch.center.x - v.x) / v.scale,
        y: (pinch.center.y - v.y) / v.scale,
      };
      applyView({
        scale,
        x: next.center.x - board.x * scale,
        y: next.center.y - board.y * scale,
      });
      pinch = next;
    });
    stage.on("touchend touchcancel", (e) => {
      if (e.evt.touches.length < 2) pinch = null;
    });

    // Space held: drag the board with any tool.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && boardHasFocus(host) && !spaceDown) {
        spaceDown = true;
        stage.draggable(true);
        host.classList.add("canvas-pane__stage--panning");
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceDown = false;
      stage.draggable(live.current.tool === "hand");
      host.classList.remove("canvas-pane__stage--panning");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      resize.disconnect();
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      konvaRef.current = null;
      stage.destroy();
    };
  }, [parseError, applyView, zoomTo, commit, patchShapes]);

  // Shapes → nodes. Rebuilt on every change (boards stay small enough) —
  // but not on a selection change, which may land mid-drag.
  const editingId = editing?.id;
  React.useEffect(() => {
    const k = konvaRef.current;
    if (!k) return;
    k.layer.destroyChildren();
    for (const shape of shapes) {
      if (shape.type === "text" && !shape.text && editingId !== shape.id) {
        continue;
      }
      const node = buildNode(shape, isDark);
      if (editingId === shape.id) node.visible(false);
      k.layer.add(node);
    }
  }, [shapes, isDark, editingId]);

  // Selection → transformer; tool → what can be dragged.
  React.useEffect(() => {
    const k = konvaRef.current;
    if (!k) return;
    for (const node of k.layer.find(".shape")) {
      node.draggable(tool === "select");
    }
    k.transformer.nodes(
      selected
        .map((sid) => k.layer.findOne(`#${sid}`))
        .filter((n): n is Konva.Shape => !!n && n.visible()),
    );
    k.stage.draggable(tool === "hand");
  }, [shapes, selected, tool, isDark, editingId]);

  // Changing a style while shapes are selected restyles them.
  const restyle = (patch: Partial<CanvasShape>) => {
    if (!selected.length) return;
    const patches = new Map<string, Partial<CanvasShape>>();
    for (const shape of shapesRef.current) {
      if (!selected.includes(shape.id)) continue;
      const p: Record<string, unknown> = { ...patch };
      if ("fill" in patch && shape.type !== "rect" && shape.type !== "ellipse") {
        delete p.fill;
      }
      if ("strokeWidth" in patch && shape.type === "text") {
        p.fontSize = fontSizeFor(patch.strokeWidth as number);
      }
      if (Object.keys(p).length) patches.set(shape.id, p as Partial<CanvasShape>);
    }
    if (patches.size) patchShapes(patches);
  };

  const chooseTool = React.useCallback((next: CanvasTool) => {
    setTool(next);
    if (next !== "select") setSelected([]);
  }, []);

  /* ───────────── Text editing ───────────── */

  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const finishEditing = React.useCallback(() => {
    if (!editing) return;
    const text = editing.value.replace(/\s+$/, "");
    setEditing(null);
    const current = shapesRef.current;
    if (!text) {
      const without = current.filter((s) => s.id !== editing.id);
      if (editing.isNew) {
        shapesRef.current = without;
        setShapes(without);
      } else {
        commit(without);
      }
      return;
    }
    if (editing.isNew) {
      // The blank placeholder never reached history; record from before it.
      const before = current.filter((s) => s.id !== editing.id);
      shapesRef.current = before;
    }
    commit(
      current.map((s) =>
        s.id === editing.id && s.type === "text" ? { ...s, text } : s,
      ),
    );
    setSelected([editing.id]);
  }, [editing, commit]);

  // Next task, so it lands after the click that opened the field (a
  // double-click's own focus handling included).
  React.useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editingShape = editing
    ? (shapes.find((s) => s.id === editing.id) as TextShape | undefined)
    : undefined;

  /* ───────────── Keyboard ───────────── */

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const host = hostRef.current;
      if (!host || parseError || !boardHasFocus(host)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        setTool("select");
        setSelected(shapesRef.current.map((s) => s.id));
      } else if (mod && key === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (key === "delete" || key === "backspace") {
        if (live.current.selected.length) {
          e.preventDefault();
          removeSelected();
        }
      } else if (key === "]" || key === "[") {
        reorderSelected(key === "]" ? "front" : "back");
      } else if (key === "escape") {
        setSelected([]);
      } else if (!mod && !e.altKey && TOOL_BY_KEY.has(key)) {
        chooseTool(TOOL_BY_KEY.get(key)!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    removeSelected,
    duplicateSelected,
    reorderSelected,
    chooseTool,
    parseError,
  ]);

  /* ───────────── Render ───────────── */

  if (parseError) {
    return (
      <div data-testid="canvas-pane-error-message" className="canvas-pane__error">
        <p className="canvas-pane__error-title">
          This canvas file could not be read
        </p>
        <p className="canvas-pane__error-text">
          It is not valid canvas JSON ({parseError}). Starting a blank canvas
          replaces the file's contents.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-testid="canvas-pane-reset-button"
          onClick={() => {
            setParseError(null);
            commit([]);
          }}
        >
          <IconChalkboard />
          Start a blank canvas
        </Button>
      </div>
    );
  }

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const gridSize = 24 * view.scale;

  // The style panel shows the selection's look when there is one, else the
  // style the next shape will be drawn with.
  const selectedShapes = shapes.filter((s) => selected.includes(s.id));
  const lead = selectedShapes[0];
  const isBox = (s: CanvasShape) => s.type === "rect" || s.type === "ellipse";
  const shownColor = lead ? lead.color : color;
  const shownWidth = lead ? lead.strokeWidth : strokeWidth;
  const shownFill = lead && isBox(lead) ? (lead as { fill: boolean }).fill : fill;
  const showStyles =
    !editing && (DRAWING_TOOLS.has(tool) || selectedShapes.length > 0);
  const showFill =
    tool === "rect" || tool === "ellipse" || selectedShapes.some(isBox);

  return (
    <div data-testid="canvas-pane" className="canvas-pane">
      <div
        ref={hostRef}
        tabIndex={0}
        aria-label="Canvas"
        data-testid="canvas-pane-stage"
        className={cn("canvas-pane__stage", `canvas-pane__stage--${tool}`)}
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      />

      {!shapes.length && !editing ? (
        <div data-testid="canvas-pane-empty-message" className="canvas-pane__empty">
          <IconChalkboard aria-hidden className="canvas-pane__empty-icon" />
          <p className="canvas-pane__empty-title">An empty board</p>
          <p className="canvas-pane__empty-text">
            Pick a tool above — or press <kbd className="canvas-pane__kbd">P</kbd>{" "}
            to draw, <kbd className="canvas-pane__kbd">R</kbd> for a box,{" "}
            <kbd className="canvas-pane__kbd">T</kbd> for text. Scroll to pan,
            ⌘/Ctrl + scroll to zoom.
          </p>
        </div>
      ) : null}

      {/* ── Tools: top centre ── */}
      <div
        role="toolbar"
        aria-label="Tools"
        data-testid="canvas-pane-tool-toolbar"
        className="canvas-pane__island canvas-pane__island--tools"
      >
        {TOOL_GROUPS.map((group, g) => (
          <React.Fragment key={g}>
            {g ? <span aria-hidden className="canvas-pane__divider" /> : null}
            {group.map((toolId) => {
              const t = TOOL_BY_ID.get(toolId)!;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`canvas-pane-tool-${t.id}-button`}
                  aria-label={t.label}
                  title={`${t.label} — ${t.key.toUpperCase()}`}
                  aria-pressed={active}
                  className={cn(
                    "canvas-pane__tool",
                    active && "canvas-pane__tool--active",
                  )}
                  onClick={() => chooseTool(t.id)}
                >
                  <t.icon aria-hidden className="canvas-pane__icon" />
                  <span aria-hidden className="canvas-pane__key">
                    {t.key.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* ── Style: left edge, only while it applies ── */}
      {showStyles ? (
        <div
          role="toolbar"
          aria-label="Style"
          aria-orientation="vertical"
          data-testid="canvas-pane-style-toolbar"
          className="canvas-pane__island canvas-pane__island--style"
        >
          <section className="canvas-pane__section">
            <h3 className="canvas-pane__label">Colour</h3>
            <div className="canvas-pane__swatches">
              {CANVAS_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid={`canvas-pane-color-${c.replace("#", "")}-button`}
                  aria-label={c === "ink" ? "Ink" : c}
                  title={c === "ink" ? "Ink (follows the theme)" : c}
                  aria-pressed={shownColor === c}
                  className={cn(
                    "canvas-pane__swatch",
                    shownColor === c && "canvas-pane__swatch--active",
                  )}
                  style={{ background: paintColor(c, isDark) }}
                  onClick={() => {
                    setColor(c);
                    restyle({ color: c });
                  }}
                />
              ))}
            </div>
          </section>

          <section className="canvas-pane__section">
            <h3 className="canvas-pane__label">Stroke</h3>
            <div className="canvas-pane__segmented">
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  data-testid={`canvas-pane-width-${w.id}-button`}
                  aria-label={w.label}
                  title={w.label}
                  aria-pressed={shownWidth === w.width}
                  className={cn(
                    "canvas-pane__option",
                    shownWidth === w.width && "canvas-pane__option--active",
                  )}
                  onClick={() => {
                    setStrokeWidth(w.width);
                    restyle({ strokeWidth: w.width });
                  }}
                >
                  <span
                    aria-hidden
                    className="canvas-pane__width-mark"
                    style={{ height: Math.max(2, w.width - 1) }}
                  />
                </button>
              ))}
            </div>
          </section>

          {showFill ? (
            <section className="canvas-pane__section">
              <h3 className="canvas-pane__label">Fill</h3>
              <div className="canvas-pane__segmented">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    data-testid={`canvas-pane-fill-${on ? "tint" : "none"}-button`}
                    aria-label={on ? "Tinted fill" : "No fill"}
                    title={on ? "Tinted fill" : "No fill"}
                    aria-pressed={shownFill === on}
                    className={cn(
                      "canvas-pane__option",
                      shownFill === on && "canvas-pane__option--active",
                    )}
                    onClick={() => {
                      setFill(on);
                      restyle({ fill: on } as Partial<CanvasShape>);
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "canvas-pane__fill-mark",
                        on && "canvas-pane__fill-mark--filled",
                      )}
                    />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {selectedShapes.length ? (
            <section className="canvas-pane__section">
              <h3 className="canvas-pane__label">
                {selectedShapes.length === 1
                  ? "Selection"
                  : `${selectedShapes.length} selected`}
              </h3>
              <div className="canvas-pane__segmented">
                <button
                  type="button"
                  data-testid="canvas-pane-front-button"
                  aria-label="Bring to front"
                  title="Bring to front — ]"
                  className="canvas-pane__option"
                  onClick={() => reorderSelected("front")}
                >
                  <IconStackFront aria-hidden className="canvas-pane__icon" />
                </button>
                <button
                  type="button"
                  data-testid="canvas-pane-back-button"
                  aria-label="Send to back"
                  title="Send to back — ["
                  className="canvas-pane__option"
                  onClick={() => reorderSelected("back")}
                >
                  <IconStackBack aria-hidden className="canvas-pane__icon" />
                </button>
                <button
                  type="button"
                  data-testid="canvas-pane-duplicate-button"
                  aria-label="Duplicate"
                  title="Duplicate — ⌘/Ctrl+D"
                  className="canvas-pane__option"
                  onClick={duplicateSelected}
                >
                  <IconCopy aria-hidden className="canvas-pane__icon" />
                </button>
                <button
                  type="button"
                  data-testid="canvas-pane-delete-button"
                  aria-label="Delete"
                  title="Delete — ⌫"
                  className="canvas-pane__option canvas-pane__option--danger"
                  onClick={removeSelected}
                >
                  <IconTrash aria-hidden className="canvas-pane__icon" />
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ── History and zoom: bottom left ── */}
      <div
        role="toolbar"
        aria-label="History and zoom"
        data-testid="canvas-pane-view-toolbar"
        className="canvas-pane__island canvas-pane__island--view"
      >
        <button
          type="button"
          data-testid="canvas-pane-undo-button"
          aria-label="Undo"
          title="Undo — ⌘/Ctrl+Z"
          disabled={!canUndo}
          className="canvas-pane__option"
          onClick={undo}
        >
          <IconArrowBackUp aria-hidden className="canvas-pane__icon" />
        </button>
        <button
          type="button"
          data-testid="canvas-pane-redo-button"
          aria-label="Redo"
          title="Redo — ⌘/Ctrl+Shift+Z"
          disabled={!canRedo}
          className="canvas-pane__option"
          onClick={redo}
        >
          <IconArrowForwardUp aria-hidden className="canvas-pane__icon" />
        </button>
        <span aria-hidden className="canvas-pane__divider" />
        <button
          type="button"
          data-testid="canvas-pane-zoom-out-button"
          aria-label="Zoom out"
          title="Zoom out"
          className="canvas-pane__option"
          onClick={() => zoomTo(view.scale / 1.25)}
        >
          <IconMinus aria-hidden className="canvas-pane__icon" />
        </button>
        <button
          type="button"
          data-testid="canvas-pane-zoom-reset-button"
          title="Reset zoom to 100%"
          className="canvas-pane__zoom"
          onClick={() => zoomTo(1)}
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button
          type="button"
          data-testid="canvas-pane-zoom-in-button"
          aria-label="Zoom in"
          title="Zoom in"
          className="canvas-pane__option"
          onClick={() => zoomTo(view.scale * 1.25)}
        >
          <IconPlus aria-hidden className="canvas-pane__icon" />
        </button>
        <button
          type="button"
          data-testid="canvas-pane-fit-button"
          aria-label="Fit to content"
          title="Fit to content"
          className="canvas-pane__option"
          onClick={fitToContent}
        >
          <IconFocusCentered aria-hidden className="canvas-pane__icon" />
        </button>
      </div>

      {/* ── Export: bottom right ── */}
      <div className="canvas-pane__island canvas-pane__island--export">
        <button
          type="button"
          data-testid="canvas-pane-export-png-button"
          title="Download the drawing as a PNG image"
          disabled={!shapes.length}
          className="canvas-pane__export"
          onClick={exportPng}
        >
          <IconPhotoDown aria-hidden className="canvas-pane__icon" />
          <span className="canvas-pane__export-label">PNG</span>
        </button>
      </div>

      {editing && editingShape ? (
        <textarea
          ref={textRef}
          data-testid="canvas-pane-text-input"
          aria-label="Text"
          className="canvas-pane__text-input"
          value={editing.value}
          rows={Math.max(1, editing.value.split("\n").length)}
          style={{
            left: view.x + editingShape.x * view.scale,
            top: view.y + editingShape.y * view.scale,
            fontSize: editingShape.fontSize * view.scale * editingShape.scaleY,
            color: paintColor(editingShape.color, isDark),
            transform: `rotate(${editingShape.rotation}deg)`,
          }}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (
              e.key === "Escape" ||
              (e.key === "Enter" && (e.metaKey || e.ctrlKey))
            ) {
              e.preventDefault();
              textRef.current?.blur();
            }
          }}
        />
      ) : null}
    </div>
  );
}
