/**
 * Turns image bytes from a note or document into something pdf-lib can embed.
 * PNG and JPEG are kept as-is (no quality loss); every other format the
 * browser can decode (GIF, WebP, BMP, SVG, AVIF…) is redrawn to PNG.
 */

export type BakedImage = {
  data: Uint8Array;
  format: "png" | "jpg";
  /** Natural size in CSS px. */
  width: number;
  height: number;
};

/** Longest side, in px, of an image re-encoded through a canvas. */
const MAX_SIDE = 4000;
const FETCH_TIMEOUT_MS = 15000;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/emf",
  wmf: "image/wmf",
};

export function mimeFromName(name: string) {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(name)?.[1]?.toLowerCase();
  return ext ? MIME_BY_EXTENSION[ext] : undefined;
}

function sniff(bytes: Uint8Array): "png" | "jpg" | "svg" | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 512))
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (
    /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b/i.test(
      head,
    )
  )
    return "svg";
  return null;
}

/**
 * Bakes raw image bytes. `mime` is a hint (from a data URL, file extension or
 * response header); the bytes' own signature wins when they disagree.
 */
export async function bakeImage(
  bytes: Uint8Array,
  mime?: string,
): Promise<BakedImage> {
  if (mime === "image/emf" || mime === "image/wmf")
    throw new Error("EMF/WMF drawings cannot be rendered in the browser");
  const kind = sniff(bytes);
  const type =
    kind === "png"
      ? "image/png"
      : kind === "jpg"
        ? "image/jpeg"
        : kind === "svg"
          ? "image/svg+xml"
          : mime || "application/octet-stream";

  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("the browser could not decode it");
    });
    // SVGs without width/height report 0 (or 300×150); fall back sensibly.
    const width = image.naturalWidth || 300;
    const height = image.naturalHeight || 150;
    if (kind === "png" || kind === "jpg") {
      // pdf-lib reads `data.buffer` from byte 0 — hand it a standalone copy.
      const data =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes
          : bytes.slice();
      return { data, format: kind, width, height };
    }

    const ratio = Math.min(
      kind === "svg" ? 2 : 1, // rasterise vectors at 2× for crisp print
      MAX_SIDE / Math.max(width, height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas is not available");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("could not re-encode it as PNG");
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      format: "png",
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Loads an image referenced from Markdown: `data:` and `blob:` URLs, or an
 * absolute http(s) URL (which needs the host to allow CORS).
 */
export async function bakeImageUrl(src: string): Promise<BakedImage> {
  if (!/^(data:|blob:|https?:\/\/)/i.test(src))
    throw new Error("relative paths cannot be resolved");
  let response: Response;
  try {
    response = await fetch(src, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      /^https?:/i.test(src)
        ? "it could not be downloaded (offline, or the host blocks cross-origin requests)"
        : "it could not be read",
    );
  }
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  const mime =
    response.headers.get("content-type")?.split(";")[0].trim() ||
    mimeFromName(src);
  return bakeImage(new Uint8Array(await response.arrayBuffer()), mime);
}
