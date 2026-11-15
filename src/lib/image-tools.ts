/**
 * Canvas-based image operations for the image pane: decode any format the
 * browser (or a lazily loaded decoder) can read, geometry edits, colour
 * adjustments and encoding to every writable format.
 *
 * Libraries are imported on demand so they only load when needed:
 * - `pica` — high-quality (lanczos) resize, in web workers / WASM.
 * - `utif` — TIFF decode and encode (most browsers can't read TIFF).
 * - `gifenc` — GIF encode with palette quantisation.
 * - `heic2any` — HEIC / HEIF decode (only Safari reads HEIC natively).
 */
import type { Pica } from "pica";

import { IMAGE_FORMATS, type ImageFormat } from "@/lib/image-formats";

export type Rect = { x: number; y: number; width: number; height: number };

/* ───────────────────────────── Canvas basics ───────────────────────────── */

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  return ctx;
}

function copyCanvas(src: CanvasImageSource, width: number, height: number) {
  const out = makeCanvas(width, height);
  context2d(out).drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/* ───────────────────────────── Decoding ───────────────────────────── */

/** SVGs are rasterised so their longest side is at least this many px. */
const SVG_MIN_SIDE = 1024;
const SVG_MAX_SCALE = 8;

export type DecodedImage = {
  canvas: HTMLCanvasElement;
  /** Raster px per SVG user unit (1 for raster formats). */
  vectorScale: number;
  /** The browser decoded it itself, so an `<img>` can show the original. */
  native: boolean;
};

async function loadImageElement(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded pixels stay usable after the URL is gone.
    URL.revokeObjectURL(url);
  }
}

async function decodeTiff(bytes: ArrayBuffer) {
  const { default: UTIF } = await import("utif");
  const ifds = UTIF.decode(bytes);
  // Largest page (TIFFs often carry a thumbnail first).
  let best = ifds[0];
  for (const ifd of ifds) {
    UTIF.decodeImage(bytes, ifd);
    if (ifd.width * ifd.height > (best?.width ?? 0) * (best?.height ?? 0)) {
      best = ifd;
    }
  }
  if (!best?.width) throw new Error("No image found in this TIFF");
  const rgba = UTIF.toRGBA8(best);
  const canvas = makeCanvas(best.width, best.height);
  context2d(canvas).putImageData(
    new ImageData(new Uint8ClampedArray(rgba), best.width, best.height),
    0,
    0,
  );
  return canvas;
}

async function decodeHeic(blob: Blob) {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob, toType: "image/png" });
  const png = Array.isArray(result) ? result[0] : result;
  const image = await loadImageElement(png);
  return copyCanvas(image, image.naturalWidth, image.naturalHeight);
}

/**
 * Bytes → canvas. Tries the browser's own decoder first (Safari reads TIFF
 * and HEIC natively), then the format's library.
 */
export async function decodeImage(
  bytes: ArrayBuffer,
  format: ImageFormat,
): Promise<DecodedImage> {
  const blob = new Blob([bytes], { type: IMAGE_FORMATS[format].mime });
  try {
    const image = await loadImageElement(blob);
    if (format === "svg") {
      // Size-less SVGs report 0 — draw them at a sensible default.
      const w = image.naturalWidth || 512;
      const h = image.naturalHeight || 512;
      const scale = Math.min(
        SVG_MAX_SCALE,
        Math.max(1, SVG_MIN_SIDE / Math.max(w, h)),
      );
      return {
        canvas: copyCanvas(image, w * scale, h * scale),
        vectorScale: scale,
        native: true,
      };
    }
    if (!image.naturalWidth) throw new Error("empty image");
    return {
      canvas: copyCanvas(image, image.naturalWidth, image.naturalHeight),
      vectorScale: 1,
      native: true,
    };
  } catch (nativeError) {
    if (format === "tiff") {
      return { canvas: await decodeTiff(bytes), vectorScale: 1, native: false };
    }
    if (format === "heic") {
      return { canvas: await decodeHeic(blob), vectorScale: 1, native: false };
    }
    throw new Error(
      `This browser can't decode this ${IMAGE_FORMATS[format].label} file` +
        (nativeError instanceof Error && nativeError.message !== "empty image"
          ? ""
          : " (it looks empty)"),
    );
  }
}

/* ───────────────────────────── Geometry ───────────────────────────── */

/** Quarter turn: 1 = clockwise, -1 = counter-clockwise. */
export function rotateQuarter(src: HTMLCanvasElement, dir: 1 | -1) {
  const out = makeCanvas(src.height, src.width);
  const ctx = context2d(out);
  ctx.translate(dir === 1 ? out.width : 0, dir === 1 ? 0 : out.height);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}

export function flip(src: HTMLCanvasElement, axis: "horizontal" | "vertical") {
  const out = makeCanvas(src.width, src.height);
  const ctx = context2d(out);
  if (axis === "horizontal") {
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, out.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(src, 0, 0);
  return out;
}

export function cropCanvas(src: HTMLCanvasElement, rect: Rect) {
  const r = clampRect(rect, src.width, src.height);
  const out = makeCanvas(r.width, r.height);
  context2d(out).drawImage(
    src,
    r.x,
    r.y,
    r.width,
    r.height,
    0,
    0,
    r.width,
    r.height,
  );
  return out;
}

/** Whole-pixel rect inside `width` × `height`, at least 1×1. */
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.min(Math.max(0, Math.round(rect.x)), width - 1);
  const y = Math.min(Math.max(0, Math.round(rect.y)), height - 1);
  return {
    x,
    y,
    width: Math.min(Math.max(1, Math.round(rect.width)), width - x),
    height: Math.min(Math.max(1, Math.round(rect.height)), height - y),
  };
}

/** Bounding box of the non-transparent pixels, or null if all are. */
export function opaqueBounds(src: HTMLCanvasElement): Rect | null {
  const { width, height } = src;
  const data = context2d(src).getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

let picaInstance: Promise<Pica> | null = null;

function getPica() {
  picaInstance ??= import("pica").then(({ default: createPica }) =>
    createPica({ features: ["js", "wasm", "ww"] }),
  );
  return picaInstance;
}

/** High-quality resize (lanczos3 via pica, off the main thread). */
export async function resizeCanvas(
  src: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const out = makeCanvas(width, height);
  if (out.width === src.width && out.height === src.height) {
    context2d(out).drawImage(src, 0, 0);
    return out;
  }
  try {
    const pica = await getPica();
    await pica.resize(src, out, { filter: "lanczos3" });
  } catch {
    // Worker / WASM blocked — fall back to the browser's own smoothing.
    const ctx = context2d(out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  return out;
}

/** `src` scaled to fit inside `max` × `max` (never enlarged). */
export async function fitWithin(src: HTMLCanvasElement, max: number) {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  if (scale === 1) return src;
  return resizeCanvas(src, src.width * scale, src.height * scale);
}

/* ───────────────────────────── Adjustments ───────────────────────────── */

/**
 * Non-destructive colour edits, applied on top of the current pixels.
 * Ranges: brightness / contrast / saturation / temperature −100…100,
 * hue −180…180°, grayscale / sepia / sharpen / vignette 0…100, blur 0…20 px.
 */
export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  grayscale: number;
  sepia: number;
  invert: boolean;
  blur: number;
  sharpen: number;
  vignette: number;
};

export const NO_ADJUSTMENTS: Adjustments = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  grayscale: 0,
  sepia: 0,
  invert: false,
  blur: 0,
  sharpen: 0,
  vignette: 0,
});

export function sameAdjustments(a: Adjustments, b: Adjustments) {
  return (Object.keys(NO_ADJUSTMENTS) as (keyof Adjustments)[]).every(
    (key) => a[key] === b[key],
  );
}

export function isIdentity(a: Adjustments) {
  return sameAdjustments(a, NO_ADJUSTMENTS);
}

/** One-click looks; each replaces every adjustment. */
export const ADJUSTMENT_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  adjust: Partial<Adjustments>;
}> = [
  { id: "none", label: "Original", adjust: {} },
  { id: "mono", label: "Mono", adjust: { grayscale: 100, contrast: 10 } },
  {
    id: "noir",
    label: "Noir",
    adjust: { grayscale: 100, contrast: 45, brightness: -10, vignette: 40 },
  },
  { id: "sepia", label: "Sepia", adjust: { sepia: 80, contrast: 5 } },
  {
    id: "vintage",
    label: "Vintage",
    adjust: {
      sepia: 35,
      saturation: -20,
      contrast: -10,
      vignette: 35,
      temperature: 15,
    },
  },
  { id: "vivid", label: "Vivid", adjust: { saturation: 45, contrast: 15 } },
  { id: "warm", label: "Warm", adjust: { temperature: 35, saturation: 10 } },
  { id: "cool", label: "Cool", adjust: { temperature: -35, brightness: 5 } },
  {
    id: "fade",
    label: "Fade",
    adjust: { contrast: -30, brightness: 10, saturation: -25 },
  },
];

/** Colour part of `a` as a CSS filter list (blur in output px). */
function cssFilter(a: Adjustments, scale: number) {
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${1 + a.brightness / 100})`);
  if (a.contrast) parts.push(`contrast(${1 + a.contrast / 100})`);
  if (a.saturation) parts.push(`saturate(${1 + a.saturation / 100})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale / 100})`);
  if (a.sepia) parts.push(`sepia(${a.sepia / 100})`);
  if (a.invert) parts.push("invert(1)");
  if (a.blur) parts.push(`blur(${a.blur * scale}px)`);
  return parts.join(" ") || "none";
}

let canvasFilterSupport: boolean | null = null;

/** Whether `ctx.filter` actually filters (it is a no-op in older Safari). */
function supportsCanvasFilter() {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  try {
    const probe = makeCanvas(1, 1);
    const ctx = context2d(probe);
    const red = makeCanvas(1, 1);
    const redCtx = context2d(red);
    redCtx.fillStyle = "#ff0000";
    redCtx.fillRect(0, 0, 1, 1);
    ctx.filter = "invert(1)";
    ctx.drawImage(red, 0, 0);
    canvasFilterSupport = ctx.getImageData(0, 0, 1, 1).data[0] < 128;
  } catch {
    canvasFilterSupport = false;
  }
  return canvasFilterSupport;
}

/** 3×4 RGB matrix (rows: r, g, b; columns: r, g, b, offset 0…255). */
type Matrix = number[];
const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function multiply(next: Matrix, prev: Matrix): Matrix {
  const out: Matrix = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = col === 3 ? next[row * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) sum += next[row * 4 + k] * prev[k * 4 + col];
      out.push(sum);
    }
  }
  return out;
}

const diag = (r: number, g: number, b: number, offset = 0): Matrix => [
  r,
  0,
  0,
  offset,
  0,
  g,
  0,
  offset,
  0,
  0,
  b,
  offset,
];

/** Filter Effects spec matrices, so the fallback matches `ctx.filter`. */
function colourMatrix(a: Adjustments, includeCss: boolean): Matrix {
  let m = IDENTITY;
  const then = (next: Matrix) => (m = multiply(next, m));
  if (includeCss) {
    if (a.brightness) {
      const b = 1 + a.brightness / 100;
      then(diag(b, b, b));
    }
    if (a.contrast) {
      const c = 1 + a.contrast / 100;
      then(diag(c, c, c, (0.5 - 0.5 * c) * 255));
    }
    if (a.saturation) {
      const s = 1 + a.saturation / 100;
      then([
        0.213 + 0.787 * s,
        0.715 - 0.715 * s,
        0.072 - 0.072 * s,
        0,
        0.213 - 0.213 * s,
        0.715 + 0.285 * s,
        0.072 - 0.072 * s,
        0,
        0.213 - 0.213 * s,
        0.715 - 0.715 * s,
        0.072 + 0.928 * s,
        0,
      ]);
    }
    if (a.hue) {
      const rad = (a.hue * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      then([
        0.213 + c * 0.787 - s * 0.213,
        0.715 - c * 0.715 - s * 0.715,
        0.072 - c * 0.072 + s * 0.928,
        0,
        0.213 - c * 0.213 + s * 0.143,
        0.715 + c * 0.285 + s * 0.14,
        0.072 - c * 0.072 - s * 0.283,
        0,
        0.213 - c * 0.213 - s * 0.787,
        0.715 - c * 0.715 + s * 0.715,
        0.072 + c * 0.928 + s * 0.072,
        0,
      ]);
    }
    if (a.grayscale) {
      const g = 1 - a.grayscale / 100;
      then([
        0.2126 + 0.7874 * g,
        0.7152 - 0.7152 * g,
        0.0722 - 0.0722 * g,
        0,
        0.2126 - 0.2126 * g,
        0.7152 + 0.2848 * g,
        0.0722 - 0.0722 * g,
        0,
        0.2126 - 0.2126 * g,
        0.7152 - 0.7152 * g,
        0.0722 + 0.9278 * g,
        0,
      ]);
    }
    if (a.sepia) {
      const g = 1 - a.sepia / 100;
      then([
        0.393 + 0.607 * g,
        0.769 - 0.769 * g,
        0.189 - 0.189 * g,
        0,
        0.349 - 0.349 * g,
        0.686 + 0.314 * g,
        0.168 - 0.168 * g,
        0,
        0.272 - 0.272 * g,
        0.534 - 0.534 * g,
        0.131 + 0.869 * g,
        0,
      ]);
    }
    if (a.invert) then(diag(-1, -1, -1, 255));
  }
  if (a.temperature) {
    // Warm pushes red up and blue down; cool the reverse.
    const t = a.temperature / 100;
    then(diag(1 + 0.2 * t, 1 + 0.03 * t, 1 - 0.2 * t));
  }
  return m;
}

function applyMatrix(data: Uint8ClampedArray, m: Matrix) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = m[0] * r + m[1] * g + m[2] * b + m[3];
    data[i + 1] = m[4] * r + m[5] * g + m[6] * b + m[7];
    data[i + 2] = m[8] * r + m[9] * g + m[10] * b + m[11];
  }
}

/** Three box-blur passes ≈ Gaussian. Fallback when `ctx.filter` is missing. */
function boxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(1, Math.round(radius / 1.5));
  const tmp = new Uint8ClampedArray(data.length);
  const pass = (
    src: Uint8ClampedArray,
    dst: Uint8ClampedArray,
    horizontal: boolean,
  ) => {
    const lines = horizontal ? height : width;
    const len = horizontal ? width : height;
    const step = horizontal ? 4 : width * 4;
    const span = r * 2 + 1;
    for (let line = 0; line < lines; line++) {
      const start = horizontal ? line * width * 4 : line * 4;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          sum += src[start + Math.min(len - 1, Math.max(0, k)) * step + c];
        }
        for (let i = 0; i < len; i++) {
          dst[start + i * step + c] = sum / span;
          const out = Math.max(0, i - r);
          const inn = Math.min(len - 1, i + r + 1);
          sum += src[start + inn * step + c] - src[start + out * step + c];
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(data, tmp, true);
    pass(tmp, data, false);
  }
}

/** 3×3 cross sharpen; `amount` 0…1. */
function sharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
) {
  const src = new Uint8ClampedArray(data);
  const k = amount * 1.5;
  const row = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        data[p] =
          src[p] * (1 + 4 * k) -
          k * (src[p - 4] + src[p + 4] + src[p - row] + src[p + row]);
      }
    }
  }
}

function vignette(canvas: HTMLCanvasElement, amount: number) {
  const ctx = context2d(canvas);
  const { width, height } = canvas;
  const outer = Math.hypot(width, height) / 2;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    outer * (0.75 - amount * 0.45),
    width / 2,
    height / 2,
    outer,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${0.85 * amount})`);
  ctx.save();
  // Darken only where there are pixels — transparency stays transparent.
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * `src` with `a` applied, drawn at `scale` (previews render below full
 * size). Returns `src` itself when there is nothing to do at full size.
 */
export function applyAdjustments(
  src: HTMLCanvasElement,
  a: Adjustments,
  scale = 1,
): HTMLCanvasElement {
  if (isIdentity(a) && scale === 1) return src;
  const out = makeCanvas(src.width * scale, src.height * scale);
  const ctx = context2d(out);
  ctx.imageSmoothingQuality = "high";
  const native = supportsCanvasFilter();
  if (native) ctx.filter = cssFilter(a, scale);
  ctx.drawImage(src, 0, 0, out.width, out.height);
  ctx.filter = "none";

  const matrix = colourMatrix(a, !native);
  const needsPixels =
    matrix !== IDENTITY || a.sharpen > 0 || (!native && a.blur > 0);
  if (needsPixels) {
    const image = ctx.getImageData(0, 0, out.width, out.height);
    if (matrix !== IDENTITY) applyMatrix(image.data, matrix);
    if (!native && a.blur > 0) {
      boxBlur(image.data, out.width, out.height, a.blur * scale);
    }
    if (a.sharpen > 0)
      sharpen(image.data, out.width, out.height, a.sharpen / 100);
    ctx.putImageData(image, 0, 0);
  }
  if (a.vignette > 0) vignette(out, a.vignette / 100);
  return out;
}

/* ───────────────────────────── Encoding ───────────────────────────── */

export type EncodeOptions = {
  /** 0…1, for lossy formats. */
  quality?: number;
  /** Fill behind transparent pixels for formats without alpha. */
  background?: string;
};

function flatten(src: HTMLCanvasElement, background: string) {
  const out = makeCanvas(src.width, src.height);
  const ctx = context2d(out);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality?: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  );
}

async function blobBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

const nativeEncoders = new Map<string, Promise<boolean>>();

/** Whether the browser's canvas can write `mime` (AVIF/WebP vary). */
function canvasCanWrite(mime: string) {
  let probe = nativeEncoders.get(mime);
  if (!probe) {
    probe = canvasBlob(makeCanvas(1, 1), mime).then((b) => b?.type === mime);
    nativeEncoders.set(mime, probe);
  }
  return probe;
}

/** Whether `format` can be written in this browser. */
export async function canEncode(format: ImageFormat) {
  if (format === "heic") return false;
  if (format === "webp" || format === "avif") {
    return canvasCanWrite(IMAGE_FORMATS[format].mime);
  }
  return true;
}

/** Formats this browser can write, in display order. */
export async function writableFormats() {
  const all = Object.keys(IMAGE_FORMATS) as ImageFormat[];
  const flags = await Promise.all(all.map(canEncode));
  return all.filter((_, i) => flags[i]);
}

function encodeBmp(src: HTMLCanvasElement) {
  const { width, height } = src;
  const data = context2d(src).getImageData(0, 0, width, height).data;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + rowSize * height;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  view.setUint16(0, 0x424d); // "BM"
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // bottom-up rows
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, rowSize * height, true);
  view.setInt32(38, 2835, true); // 72 dpi
  view.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < height; y++) {
    const rowStart = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = rowStart + x * 3;
      out[o] = data[i + 2];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i];
    }
  }
  return out;
}

/** Single-image ICO holding a PNG (Vista+ format), at most 256×256. */
async function encodeIco(src: HTMLCanvasElement) {
  const icon = await fitWithin(src, 256);
  const blob = await canvasBlob(icon, "image/png");
  if (!blob) throw new Error("Could not encode the icon");
  const png = await blobBytes(blob);
  const out = new Uint8Array(22 + png.length);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // one image
  out[6] = icon.width >= 256 ? 0 : icon.width;
  out[7] = icon.height >= 256 ? 0 : icon.height;
  view.setUint16(10, 1, true); // planes
  view.setUint16(12, 32, true); // bpp
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

async function encodeGif(src: HTMLCanvasElement) {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const { width, height } = src;
  const rgba = context2d(src).getImageData(0, 0, width, height).data;
  const palette = quantize(rgba, 256, {
    format: "rgba4444",
    oneBitAlpha: true,
  });
  const index = applyPalette(rgba, palette, "rgba4444");
  const transparentIndex = palette.findIndex((c) => (c[3] ?? 255) < 128);
  const gif = GIFEncoder();
  gif.writeFrame(index, width, height, {
    palette,
    transparent: transparentIndex >= 0,
    transparentIndex: Math.max(0, transparentIndex),
  });
  gif.finish();
  return gif.bytes();
}

async function encodeTiff(src: HTMLCanvasElement) {
  const { default: UTIF } = await import("utif");
  const { width, height } = src;
  const rgba = context2d(src).getImageData(0, 0, width, height).data;
  return new Uint8Array(
    UTIF.encodeImage(new Uint8Array(rgba.buffer), width, height),
  );
}

/** An SVG wrapping the pixels as an embedded PNG. */
async function encodeSvg(src: HTMLCanvasElement, vectorScale: number) {
  const blob = await canvasBlob(src, "image/png");
  if (!blob) throw new Error("Could not encode the image");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const w = +(src.width / vectorScale).toFixed(2);
  const h = +(src.height / vectorScale).toFixed(2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<image width="${w}" height="${h}" href="${dataUrl}"/></svg>\n`;
  return new TextEncoder().encode(svg);
}

/**
 * Writes `src` as `format`. `vectorScale` keeps an edited SVG at its
 * original user-unit size.
 */
export async function encodeImage(
  src: HTMLCanvasElement,
  format: ImageFormat,
  { quality = 0.92, background = "#ffffff" }: EncodeOptions = {},
  vectorScale = 1,
): Promise<Uint8Array> {
  const info = IMAGE_FORMATS[format];
  const pixels = info.alpha ? src : flatten(src, background);
  switch (format) {
    case "bmp":
      return encodeBmp(pixels);
    case "ico":
      return encodeIco(pixels);
    case "gif":
      return encodeGif(pixels);
    case "tiff":
      return encodeTiff(pixels);
    case "svg":
      return encodeSvg(pixels, vectorScale);
    case "heic":
      throw new Error("HEIC images can't be written in the browser");
    default: {
      const blob = await canvasBlob(
        pixels,
        info.mime,
        info.lossy ? quality : undefined,
      );
      if (!blob || blob.type !== info.mime) {
        throw new Error(`This browser can't write ${info.label} images`);
      }
      return blobBytes(blob);
    }
  }
}

/* ───────────────────────────── Misc ───────────────────────────── */

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
