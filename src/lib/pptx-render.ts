/**
 * Draws `.pptx` slides with Konva. One renderer feeds everything that
 * shows a slide — the editor stage, the thumbnails, presenting, and the PNG
 * behind the PDF / image exports — so they can never disagree.
 *
 * Imports Konva, so load this module lazily (the pane is already a lazy
 * chunk; converters use `await import()`).
 */
import Konva from "konva";

import { sniffImageFormat } from "@/lib/image-formats";
import { isCoarsePointer } from "@/lib/use-media-query";
import {
  type PptxDoc,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type TextElement,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  TEXT_LINE_HEIGHT,
  TEXT_PADDING,
  arrowHead,
  newId,
  roundedRadius,
} from "@/lib/pptx-doc";

/** Decoded pictures by image key. Owned by whoever draws (editor, exporter). */
export type ImageStore = Map<string, HTMLImageElement>;

export type DrawOptions = {
  /**
   * Show "Double-click to add text" ("Double-tap …" on touch screens) in
   * empty text boxes (editor only).
   */
  placeholders?: boolean;
  /** Text box being typed into: its text is hidden under the editor field. */
  editingId?: string | null;
};

/** Longest side a picture is stored at; bigger ones are scaled down. */
const MAX_PICTURE_SIDE = 1920;
const placeholderText = () =>
  isCoarsePointer() ? "Double-tap to add text" : "Double-click to add text";
const PLACEHOLDER_COLOR = "#94a3b8";

/* ──────────────────────────────── Pictures ─────────────────────────────── */

function decode(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the picture"));
    image.src = src;
  });
}

/**
 * Decodes every picture of `doc` not yet in `store`. A picture that fails to
 * decode is skipped — it draws as a grey box.
 */
export async function loadDeckImages(
  doc: PptxDoc,
  store: ImageStore = new Map(),
) {
  await Promise.all(
    Object.entries(doc.images)
      .filter(([key]) => !store.has(key))
      .map(async ([key, src]) => {
        try {
          store.set(key, await decode(src));
        } catch {
          // Drawn as a placeholder.
        }
      }),
  );
  return store;
}

/**
 * Turns a picked / pasted / dropped image file into what a deck stores: a
 * PNG or JPEG `data:` URL no larger than {@link MAX_PICTURE_SIDE}. Any format
 * the image editor reads works (WebP, SVG, HEIC, TIFF, …).
 */
export async function importPicture(file: Blob) {
  const bytes = await file.arrayBuffer();
  const format = sniffImageFormat(bytes) ?? (isSvg(file) ? "svg" : null);
  if (!format) throw new Error("That file is not an image this app can read.");
  const { decodeImage, fitWithin } = await import("@/lib/image-tools");
  const decoded = await decodeImage(bytes, format);
  const canvas = await fitWithin(decoded.canvas, MAX_PICTURE_SIDE);
  // Photos stay JPEG (small); everything else keeps its transparency as PNG.
  const src =
    format === "jpeg"
      ? canvas.toDataURL("image/jpeg", 0.9)
      : canvas.toDataURL("image/png");
  return {
    key: newId(),
    src,
    image: await decode(src),
    width: canvas.width,
    height: canvas.height,
  };
}

const isSvg = (file: Blob) => file.type === "image/svg+xml";

/* ──────────────────────────────── Geometry ─────────────────────────────── */

/** Polygon outline of `shape` filling a `w` × `h` box: `[x0, y0, x1, y1, …]`. */
function polygon(shape: ShapeKind, w: number, h: number): number[] {
  if (shape === "triangle") return [w / 2, 0, w, h, 0, h];
  if (shape === "diamond") return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
  // Five-point star, stretched so its tips touch every side of the box.
  const raw: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 === 0 ? 1 : 0.382;
    raw.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  return raw.flatMap(([x, y]) => [
    ((x - minX) / spanX) * w,
    ((y - minY) / spanY) * h,
  ]);
}

function textAttrs(el: TextElement) {
  return {
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontStyle:
      [el.italic ? "italic" : "", el.bold ? "bold" : ""]
        .filter(Boolean)
        .join(" ") || "normal",
    textDecoration: el.underline ? "underline" : "",
    align: el.align,
    verticalAlign: el.valign,
    padding: TEXT_PADDING,
    lineHeight: TEXT_LINE_HEIGHT,
    wrap: "word",
  };
}

/** Height `el`'s text needs at its current width, padding included. */
export function textHeight(el: TextElement) {
  const probe = new Konva.Text({
    ...textAttrs(el),
    text: el.text || " ",
    width: el.width,
  });
  const height = probe.height();
  probe.destroy();
  return Math.ceil(height);
}

/* ───────────────────────────────── Nodes ───────────────────────────────── */

function shapeNode(el: ShapeElement): Konva.Shape {
  switch (el.shape) {
    case "rect":
    case "rounded":
      return new Konva.Rect({ name: "shape" });
    case "ellipse":
      return new Konva.Ellipse({ name: "shape", radiusX: 0, radiusY: 0 });
    case "line":
      return new Konva.Line({ name: "shape", lineCap: "round" });
    case "arrow":
      return new Konva.Arrow({ name: "shape", points: [], lineCap: "round" });
    default:
      return new Konva.Line({ name: "shape", closed: true, lineJoin: "round" });
  }
}

/**
 * Applies `el` to its node: position, size, rotation and every style. Also
 * called on each frame of a resize with the box being dragged out, so text
 * re-wraps and outlines keep their width instead of stretching.
 */
export function syncElementNode(
  group: Konva.Group,
  el: SlideElement,
  images: ImageStore,
  options: DrawOptions = {},
) {
  const { width: w, height: h } = el;
  group.setAttrs({
    x: el.x + w / 2,
    y: el.y + h / 2,
    offsetX: w / 2,
    offsetY: h / 2,
    rotation: el.rotation,
    opacity: el.opacity,
    scaleX: 1,
    scaleY: 1,
  });
  // See-through, but still catches the pointer anywhere inside the box.
  group.findOne(".hit")?.setAttrs({ width: w, height: h });

  if (el.type === "text") {
    group.findOne(".box")?.setAttrs({
      width: w,
      height: h,
      fill: el.fill ?? undefined,
      fillEnabled: Boolean(el.fill),
    });
    const empty = !el.text && options.placeholders;
    group.findOne(".text")?.setAttrs({
      ...textAttrs(el),
      width: w,
      height: h,
      text: empty ? placeholderText() : el.text,
      fill: empty ? PLACEHOLDER_COLOR : el.color,
      visible: options.editingId !== el.id,
    });
    return;
  }

  if (el.type === "image") {
    const picture = images.get(el.image);
    group.findOne(".image")?.setAttrs({
      width: w,
      height: h,
      ...(picture ? { image: picture } : {}),
    });
    return;
  }

  const stroked = Boolean(el.stroke) && el.strokeWidth > 0;
  const paint = {
    fill: el.fill ?? undefined,
    fillEnabled: Boolean(el.fill),
    stroke: el.stroke ?? undefined,
    strokeWidth: el.strokeWidth,
    strokeEnabled: stroked,
  };
  const node = group.findOne(".shape");
  switch (el.shape) {
    case "rect":
    case "rounded":
      node?.setAttrs({
        ...paint,
        width: w,
        height: h,
        cornerRadius: el.shape === "rounded" ? roundedRadius(w, h) : 0,
      });
      break;
    case "ellipse":
      node?.setAttrs({
        ...paint,
        x: w / 2,
        y: h / 2,
        radiusX: w / 2,
        radiusY: h / 2,
      });
      break;
    case "line":
      node?.setAttrs({
        ...paint,
        fillEnabled: false,
        points: [0, h / 2, w, h / 2],
        hitStrokeWidth: Math.max(16, el.strokeWidth),
      });
      break;
    case "arrow":
      node?.setAttrs({
        ...paint,
        // The head is filled with the line colour.
        fill: el.stroke ?? undefined,
        fillEnabled: stroked,
        points: [0, h / 2, w, h / 2],
        pointerLength: arrowHead(el.strokeWidth),
        pointerWidth: arrowHead(el.strokeWidth),
        hitStrokeWidth: Math.max(16, el.strokeWidth),
      });
      break;
    default:
      node?.setAttrs({ ...paint, points: polygon(el.shape, w, h) });
  }
}

/** One element as a Konva group (`name: "element"`, `id` = the element's). */
export function createElementNode(
  el: SlideElement,
  images: ImageStore,
  options: DrawOptions = {},
) {
  const group = new Konva.Group({ id: el.id, name: "element" });
  group.add(new Konva.Rect({ name: "hit", fill: "transparent" }));
  if (el.type === "text") {
    group.add(new Konva.Rect({ name: "box" }));
    group.add(new Konva.Text({ name: "text" }));
  } else if (el.type === "image") {
    group.add(
      images.has(el.image)
        ? new Konva.Image({ name: "image", image: undefined })
        : // Picture missing or undecodable.
          new Konva.Rect({
            name: "image",
            fill: "#e2e8f0",
            stroke: PLACEHOLDER_COLOR,
            strokeWidth: 1,
            dash: [6, 4],
          }),
    );
  } else {
    group.add(shapeNode(el));
  }
  syncElementNode(group, el, images, options);
  return group;
}

/** The slide's nodes, bottom to top: its background, then every element. */
export function slideNodes(
  slide: Slide,
  images: ImageStore,
  options: DrawOptions = {},
): Array<Konva.Rect | Konva.Group> {
  return [
    new Konva.Rect({
      name: "background",
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fill: slide.background,
    }),
    ...slide.elements.map((el) => createElementNode(el, images, options)),
  ];
}

/* ──────────────────────────────── Raster ───────────────────────────────── */

/**
 * The slide drawn off-screen. `pixelRatio` 1 is 960×540; pictures of the
 * deck must already be in `images` (see {@link loadDeckImages}).
 */
export function renderSlideCanvas(
  slide: Slide,
  images: ImageStore,
  pixelRatio = 1,
) {
  const stage = new Konva.Stage({
    container: document.createElement("div"),
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
  });
  try {
    const layer = new Konva.Layer({ listening: false });
    layer.add(...slideNodes(slide, images));
    stage.add(layer);
    return stage.toCanvas({ pixelRatio });
  } finally {
    stage.destroy();
  }
}

/** PNG bytes of one slide, for the PDF and image exports. */
export async function renderSlidePng(
  slide: Slide,
  images: ImageStore,
  pixelRatio = 2,
) {
  const canvas = renderSlideCanvas(slide, images, pixelRatio);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not draw this slide");
  return new Uint8Array(await blob.arrayBuffer());
}

/** PNG of every slide, in order. Loads the deck's pictures itself. */
export async function renderDeckPngs(doc: PptxDoc, pixelRatio = 2) {
  const images = await loadDeckImages(doc);
  const pages: Uint8Array[] = [];
  for (const slide of doc.slides) {
    pages.push(await renderSlidePng(slide, images, pixelRatio));
  }
  return pages;
}
