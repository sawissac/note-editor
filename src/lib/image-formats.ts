/**
 * Raster / vector image formats the image pane understands. Kept separate
 * from the canvas code (`@/lib/image-tools`) so `file-types` can read the
 * extension table without pulling in any image library.
 */

export type ImageFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "avif"
  | "gif"
  | "bmp"
  | "ico"
  | "tiff"
  | "svg"
  | "heic";

export type ImageFormatInfo = {
  label: string;
  mime: string;
  /** Extension a converted copy gets. */
  ext: string;
  /** Keeps transparency when written. */
  alpha: boolean;
  /** Takes a quality setting when written. */
  lossy: boolean;
};

export const IMAGE_FORMATS: Record<ImageFormat, ImageFormatInfo> = {
  png: {
    label: "PNG",
    mime: "image/png",
    ext: "png",
    alpha: true,
    lossy: false,
  },
  jpeg: {
    label: "JPEG",
    mime: "image/jpeg",
    ext: "jpg",
    alpha: false,
    lossy: true,
  },
  webp: {
    label: "WebP",
    mime: "image/webp",
    ext: "webp",
    alpha: true,
    lossy: true,
  },
  avif: {
    label: "AVIF",
    mime: "image/avif",
    ext: "avif",
    alpha: true,
    lossy: true,
  },
  gif: {
    label: "GIF",
    mime: "image/gif",
    ext: "gif",
    alpha: true,
    lossy: false,
  },
  bmp: {
    label: "BMP",
    mime: "image/bmp",
    ext: "bmp",
    alpha: false,
    lossy: false,
  },
  ico: {
    label: "ICO",
    mime: "image/x-icon",
    ext: "ico",
    alpha: true,
    lossy: false,
  },
  tiff: {
    label: "TIFF",
    mime: "image/tiff",
    ext: "tiff",
    alpha: true,
    lossy: false,
  },
  svg: {
    label: "SVG",
    mime: "image/svg+xml",
    ext: "svg",
    alpha: true,
    lossy: false,
  },
  heic: {
    label: "HEIC",
    mime: "image/heic",
    ext: "heic",
    alpha: true,
    lossy: true,
  },
};

/** Every image extension that opens in the image pane. */
export const IMAGE_FORMAT_BY_EXT: Record<string, ImageFormat> = {
  png: "png",
  apng: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  jpe: "jpeg",
  jfif: "jpeg",
  pjpeg: "jpeg",
  pjp: "jpeg",
  webp: "webp",
  avif: "avif",
  gif: "gif",
  bmp: "bmp",
  dib: "bmp",
  ico: "ico",
  cur: "ico",
  tif: "tiff",
  tiff: "tiff",
  svg: "svg",
  heic: "heic",
  heif: "heic",
};

/** The format a file name's extension stands for, or null. */
export function imageFormatOf(name: string): ImageFormat | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return IMAGE_FORMAT_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** `{ mime: [".ext", …] }` for every readable image type (file pickers). */
export const IMAGE_ACCEPT: Record<string, string[]> = Object.entries(
  IMAGE_FORMAT_BY_EXT,
).reduce<Record<string, string[]>>((acc, [ext, format]) => {
  (acc[IMAGE_FORMATS[format].mime] ??= []).push(`.${ext}`);
  return acc;
}, {});

/**
 * The format of image bytes, from their signature — `.img` files hold any
 * image, so the bytes (not the name) say what they are. Null if unknown.
 */
export function sniffImageFormat(
  data: ArrayBuffer | Uint8Array,
): ImageFormat | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.length < 4) return null;
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...b.subarray(offset, offset + length));
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (ascii(0, 4) === "GIF8") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  if (ascii(0, 2) === "BM") return "bmp";
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) {
    return "ico";
  }
  if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") return "tiff";
  if (ascii(4, 4) === "ftyp") {
    // Major + compatible brands of the ISO-BMFF container.
    const brands = ascii(8, Math.min(40, b.length - 8));
    if (/avi[fs]/.test(brands)) return "avif";
    if (/hei[cxms]|hev[cxms]|mif1|msf1/.test(brands)) return "heic";
  }
  const head = new TextDecoder()
    .decode(b.subarray(0, 2048))
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (
    /^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(
      head,
    )
  ) {
    return "svg";
  }
  return null;
}
