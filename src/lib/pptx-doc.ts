/**
 * `.pptx` files: a slide deck stored as JSON — the app's own format, not
 * PowerPoint's zipped OOXML (that one comes from the export). Every slide is a fixed
 * 960×540 (16:9) canvas holding text boxes, shapes and images, bottom to top.
 * Pictures live once in `images` and are referenced by key, so duplicating a
 * slide never copies the bytes.
 *
 * This module is plain data — drawing lives in `pptx-render.ts`
 * (Konva), PowerPoint / PDF output in `pptx-export.ts`.
 */

/** Slide size in px. 96 px = 1 in, so a slide is PowerPoint's 10 × 5.625 in. */
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

/** Space between a text box's edge and its text, px. */
export const TEXT_PADDING = 8;
export const TEXT_LINE_HEIGHT = 1.2;
/** Smallest side an element can be resized to, px. */
export const MIN_ELEMENT_SIZE = 8;

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 200;
export const MAX_STROKE_WIDTH = 24;

export type ShapeKind =
  | "rect"
  | "rounded"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "star"
  | "line"
  | "arrow";

export type TextAlign = "left" | "center" | "right";
export type TextValign = "top" | "middle" | "bottom";

type ElementBase = {
  id: string;
  /** Unrotated box, slide px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees clockwise, around the box centre. */
  rotation: number;
  /** 0 (invisible) – 1 (solid). */
  opacity: number;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  fontFamily: string;
  /** px. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  valign: TextValign;
  /** Box colour behind the text; `null` is see-through. */
  fill: string | null;
};

export type ShapeElement = ElementBase & {
  type: "shape";
  shape: ShapeKind;
  /** `null` is see-through. Lines and arrows have no fill. */
  fill: string | null;
  /** Outline colour; `null` draws none. */
  stroke: string | null;
  /** px. */
  strokeWidth: number;
};

export type ImageElement = ElementBase & {
  type: "image";
  /** Key into {@link PptxDoc.images}. */
  image: string;
};

export type SlideElement = TextElement | ShapeElement | ImageElement;

export type Slide = {
  id: string;
  background: string;
  /** Speaker notes. */
  notes: string;
  /** Bottom to top. */
  elements: SlideElement[];
};

export type PptxDoc = {
  version: 1;
  slides: Slide[];
  /** Picture key → PNG / JPEG `data:` URL. */
  images: Record<string, string>;
};

export const SHAPE_KINDS: { value: ShapeKind; label: string }[] = [
  { value: "rect", label: "Rectangle" },
  { value: "rounded", label: "Rounded rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" },
  { value: "star", label: "Star" },
  { value: "line", label: "Line" },
  { value: "arrow", label: "Arrow" },
];

/** Fonts PowerPoint and browsers both ship. */
export const FONT_FAMILIES = [
  "Arial",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
] as const;

/** Quick-pick colours next to every colour field. */
export const SWATCHES = [
  "#ffffff",
  "#f1f5f9",
  "#94a3b8",
  "#334155",
  "#0f172a",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
const TEXT_VALIGNS: readonly TextValign[] = ["top", "middle", "bottom"];

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** A line or arrow: drawn along the middle of its box, no fill. */
export const isLineShape = (el: SlideElement) =>
  el.type === "shape" && (el.shape === "line" || el.shape === "arrow");

/** Corner radius of a rounded rectangle, px. */
export function roundedRadius(width: number, height: number) {
  return Math.min(width, height) * 0.16;
}

/** Arrow head size for a stroke width, px. */
export function arrowHead(strokeWidth: number) {
  return Math.max(10, strokeWidth * 3);
}

export function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/* ─────────────────────────────── Factories ─────────────────────────────── */

export function newText(patch: Partial<TextElement> = {}): TextElement {
  return {
    id: newId(),
    type: "text",
    x: 280,
    y: 230,
    width: 400,
    height: 60,
    rotation: 0,
    opacity: 1,
    text: "",
    fontFamily: "Arial",
    fontSize: 28,
    bold: false,
    italic: false,
    underline: false,
    color: "#0f172a",
    align: "left",
    valign: "top",
    fill: null,
    ...patch,
  };
}

export function newShape(shape: ShapeKind): ShapeElement {
  const line = shape === "line" || shape === "arrow";
  const width = line
    ? 280
    : shape === "rect" || shape === "rounded"
      ? 260
      : 180;
  const height = line
    ? 24
    : shape === "rect" || shape === "rounded"
      ? 160
      : 180;
  return {
    id: newId(),
    type: "shape",
    shape,
    x: Math.round((SLIDE_WIDTH - width) / 2),
    y: Math.round((SLIDE_HEIGHT - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    fill: line ? null : "#3b82f6",
    stroke: line ? "#0f172a" : null,
    strokeWidth: line ? 4 : 2,
  };
}

/** An image element fitted inside the slide, centred. */
export function newImage(
  image: string,
  naturalWidth: number,
  naturalHeight: number,
): ImageElement {
  const fit = Math.min(
    1,
    (SLIDE_WIDTH * 0.7) / naturalWidth,
    (SLIDE_HEIGHT * 0.7) / naturalHeight,
  );
  const width = Math.max(MIN_ELEMENT_SIZE, Math.round(naturalWidth * fit));
  const height = Math.max(MIN_ELEMENT_SIZE, Math.round(naturalHeight * fit));
  return {
    id: newId(),
    type: "image",
    image,
    x: Math.round((SLIDE_WIDTH - width) / 2),
    y: Math.round((SLIDE_HEIGHT - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
  };
}

export function blankSlide(background = "#ffffff"): Slide {
  return { id: newId(), background, notes: "", elements: [] };
}

/** A slide with an empty title and body, ready to type into. */
export function contentSlide(background = "#ffffff"): Slide {
  return {
    ...blankSlide(background),
    elements: [
      newText({
        x: 60,
        y: 40,
        width: 840,
        height: 70,
        fontSize: 40,
        bold: true,
        valign: "middle",
      }),
      newText({ x: 60, y: 130, width: 840, height: 360, fontSize: 24 }),
    ],
  };
}

/** What a new `.pptx` file starts with: one title slide. */
export function starterDeck(): PptxDoc {
  return {
    version: 1,
    images: {},
    slides: [
      {
        ...blankSlide(),
        elements: [
          newText({
            x: 80,
            y: 170,
            width: 800,
            height: 100,
            text: "Presentation title",
            fontSize: 56,
            bold: true,
            align: "center",
            valign: "middle",
          }),
          newText({
            x: 80,
            y: 290,
            width: 800,
            height: 60,
            text: "Double-click to edit the subtitle",
            fontSize: 24,
            color: "#475569",
            align: "center",
            valign: "middle",
          }),
        ],
      },
    ],
  };
}

/** A copy with fresh ids, nudged so it does not hide the original. */
export function cloneElement(el: SlideElement, offset = 16): SlideElement {
  return { ...el, id: newId(), x: el.x + offset, y: el.y + offset };
}

export function cloneSlide(slide: Slide): Slide {
  return {
    ...slide,
    id: newId(),
    elements: slide.elements.map((el) => cloneElement(el, 0)),
  };
}

/* ──────────────────────────── Read and write ───────────────────────────── */

/** Drops pictures no slide uses any more, then writes the deck. */
export function serializePptx(doc: PptxDoc) {
  const used = new Set<string>();
  for (const slide of doc.slides) {
    for (const el of slide.elements) {
      if (el.type === "image") used.add(el.image);
    }
  }
  const images: Record<string, string> = {};
  for (const key of Object.keys(doc.images)) {
    if (used.has(key)) images[key] = doc.images[key];
  }
  return `${JSON.stringify({ ...doc, images }, null, 2)}\n`;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
const oneOf = <T extends string>(
  v: unknown,
  list: readonly T[],
  fallback: T,
) => (list.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown, fallback: string) => (isHexColor(v) ? v : fallback);
const colorOrNone = (v: unknown, fallback: string | null) =>
  v === null ? null : isHexColor(v) ? v : fallback;

function parseElement(
  raw: unknown,
  images: Record<string, string>,
): SlideElement | null {
  if (!isObj(raw)) return null;
  const base = {
    id: str(raw.id, "") || newId(),
    x: num(raw.x, 0, -4 * SLIDE_WIDTH, 4 * SLIDE_WIDTH),
    y: num(raw.y, 0, -4 * SLIDE_HEIGHT, 4 * SLIDE_HEIGHT),
    width: num(raw.width, 200, MIN_ELEMENT_SIZE, 4 * SLIDE_WIDTH),
    height: num(raw.height, 100, MIN_ELEMENT_SIZE, 4 * SLIDE_HEIGHT),
    rotation: num(raw.rotation, 0, -360, 360),
    opacity: num(raw.opacity, 1, 0, 1),
  };
  switch (raw.type) {
    case "text":
      return {
        ...base,
        type: "text",
        text: str(raw.text, ""),
        fontFamily: str(raw.fontFamily, "Arial") || "Arial",
        fontSize: num(raw.fontSize, 28, MIN_FONT_SIZE, MAX_FONT_SIZE),
        bold: raw.bold === true,
        italic: raw.italic === true,
        underline: raw.underline === true,
        color: color(raw.color, "#0f172a"),
        align: oneOf(raw.align, TEXT_ALIGNS, "left"),
        valign: oneOf(raw.valign, TEXT_VALIGNS, "top"),
        fill: colorOrNone(raw.fill, null),
      };
    case "shape": {
      const shape = oneOf(
        raw.shape,
        SHAPE_KINDS.map((s) => s.value),
        "rect",
      );
      const line = shape === "line" || shape === "arrow";
      return {
        ...base,
        type: "shape",
        shape,
        fill: line ? null : colorOrNone(raw.fill, "#3b82f6"),
        // A line with no outline would be invisible.
        stroke: line
          ? color(raw.stroke, "#0f172a")
          : colorOrNone(raw.stroke, null),
        strokeWidth: num(raw.strokeWidth, 2, line ? 1 : 0, MAX_STROKE_WIDTH),
      };
    }
    case "image": {
      const image = str(raw.image, "");
      return image in images ? { ...base, type: "image", image } : null;
    }
    default:
      return null;
  }
}

/**
 * Elements read from untrusted JSON (a paste). Image elements whose picture
 * is not in `images` are dropped.
 */
export function parseElements(raw: unknown, images: Record<string, string>) {
  return (Array.isArray(raw) ? raw : [])
    .map((el) => parseElement(el, images))
    .filter((el): el is SlideElement => el !== null);
}

/**
 * Reads a `.pptx` file. Missing or invalid fields fall back to defaults
 * and unknown elements are dropped, so a hand-edited file still opens; an
 * empty file is a fresh deck.
 */
export function parsePptx(text: string): PptxDoc {
  if (!text.trim()) return starterDeck();
  const raw: unknown = JSON.parse(text);
  if (!isObj(raw)) throw new Error("Expected a JSON object");
  const images: Record<string, string> = {};
  if (isObj(raw.images)) {
    for (const [key, value] of Object.entries(raw.images)) {
      if (
        typeof value === "string" &&
        /^data:image\/(png|jpeg);base64,/.test(value)
      ) {
        images[key] = value;
      }
    }
  }
  const seen = new Set<string>();
  const unique = (id: string) => {
    const next = !id || seen.has(id) ? newId() : id;
    seen.add(next);
    return next;
  };
  const slides = (Array.isArray(raw.slides) ? raw.slides : [])
    .filter(isObj)
    .map((s): Slide => ({
      id: unique(str(s.id, "")),
      background: color(s.background, "#ffffff"),
      notes: str(s.notes, ""),
      elements: parseElements(s.elements, images).map((el) => ({
        ...el,
        id: unique(el.id),
      })),
    }));
  return {
    version: 1,
    slides: slides.length ? slides : [blankSlide()],
    images,
  };
}

/* ───────────────────────────── Plain-text view ─────────────────────────── */

/** The text on one slide, top to bottom, one box per entry. */
export function slideTexts(slide: Slide) {
  return slide.elements
    .filter((el): el is TextElement => el.type === "text")
    .filter((el) => el.text.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((el) => el.text.trim());
}

/**
 * The deck as Markdown — slide text and speaker notes, no pictures. What
 * "Ask AI" reads, since the file itself is mostly base64.
 */
export function deckOutline(doc: PptxDoc) {
  return doc.slides
    .map((slide, i) => {
      const lines = [`## Slide ${i + 1}`, ...slideTexts(slide)];
      const pictures = slide.elements.filter(
        (el) => el.type === "image",
      ).length;
      if (pictures)
        lines.push(`(${pictures} picture${pictures > 1 ? "s" : ""})`);
      if (slide.notes.trim()) lines.push(`Notes: ${slide.notes.trim()}`);
      return lines.join("\n\n");
    })
    .join("\n\n");
}
