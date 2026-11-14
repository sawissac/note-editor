/**
 * Minimal ZIP reader for the Office files the unified export reads (DOCX,
 * XLSX). Handles stored and deflated entries — the only two methods Office
 * writes — using the browser's own `DecompressionStream`.
 */
export type ZipArchive = {
  names: string[];
  /** Entry text (UTF-8), or `null` when the entry does not exist. */
  text: (name: string) => Promise<string | null>;
  /** Entry bytes, or `null` when the entry does not exist. */
  bytes: (name: string) => Promise<Uint8Array | null>;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

type Entry = { method: number; compressedSize: number; localOffset: number };

export function readZip(buffer: ArrayBuffer): ZipArchive {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // End-of-central-directory record: last 22 bytes + up to 64 KiB comment.
  let eocd = -1;
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 22 - 0xffff);
    i--
  ) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error("Not a ZIP archive (no end of central directory).");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Entry>();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("Corrupt ZIP central directory.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const data = async (entry: Entry) => {
    const at = entry.localOffset;
    if (view.getUint32(at, true) !== LOCAL_SIGNATURE)
      throw new Error("Corrupt ZIP entry.");
    const start =
      at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const raw = bytes.subarray(start, start + entry.compressedSize);
    // Copy stored entries: a view into the whole archive breaks consumers that
    // read `.buffer` from offset 0 (pdf-lib's JPEG embedder does).
    if (entry.method === 0) return raw.slice();
    if (entry.method !== 8)
      throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
    const stream = new Blob([raw])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  return {
    names: [...entries.keys()],
    async text(name) {
      const entry = entries.get(name.replace(/^\//, ""));
      return entry ? decoder.decode(await data(entry)) : null;
    },
    async bytes(name) {
      const entry = entries.get(name.replace(/^\//, ""));
      return entry ? data(entry) : null;
    },
  };
}
