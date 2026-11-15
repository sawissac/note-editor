/** Minimal typings for the untyped image libraries used by `@/lib/image-tools`. */

declare module "utif" {
  type Ifd = { width: number; height: number; [tag: string]: unknown };
  const UTIF: {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd, ifds?: Ifd[]): void;
    toRGBA8(ifd: Ifd): Uint8Array;
    encodeImage(
      rgba: Uint8Array,
      width: number,
      height: number,
      metadata?: Record<string, unknown>,
    ): ArrayBuffer;
  };
  export default UTIF;
}

declare module "gifenc" {
  type Palette = number[][];
  type Format = "rgb565" | "rgb444" | "rgba4444";
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: Format; oneBitAlpha?: boolean | number },
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: Format,
  ): Uint8Array;
  export function GIFEncoder(options?: { auto?: boolean }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: Palette;
        transparent?: boolean;
        transparentIndex?: number;
        delay?: number;
        repeat?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
