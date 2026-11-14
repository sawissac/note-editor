/**
 * Lays out exported files into one PDF with pdf-lib: an optional contents
 * page, one section per file (each starting on a new page), page footers.
 *
 * One typeface (Helvetica) at one body size for all text content — the
 * "unified" look. Section titles, table headers and footers are the
 * exporter's own chrome, not the files' formatting.
 */
import {
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PageSizes,
  PDFDocument,
  rgb,
  StandardFonts,
} from "pdf-lib";

import type { FileKind } from "@/lib/file-types";
import { KIND_LABEL } from "@/lib/file-types";
import { storage } from "@/lib/storage";
import { type Block, toBlocks } from "@/lib/unified-export/extract";

export type ExportItem = {
  id: string;
  name: string;
  /** "Folder / sub / file.md" — shown under the section title. */
  path: string;
  kind: FileKind;
};

export type ExportOptions = {
  pageSize: "a4" | "letter";
  /** Add a contents page listing every file with its start page. */
  contents: boolean;
  title: string;
};

export type ExportProgress = { index: number; total: number; name: string };

export type ExportResult = {
  bytes: Uint8Array;
  failures: Array<{ name: string; error: string }>;
};

const MARGIN = 56;
const FOOTER = 28;
const BODY_SIZE = 10.5;
const BODY_LEADING = 15.5;
const PARAGRAPH_GAP = 6;
const TABLE_SIZES = [8.5, 7.5, 6.5];
const CELL_PAD_X = 4;
const CELL_PAD_Y = 3;
const MAX_CELL_LINES = 30;

const INK = rgb(0.12, 0.13, 0.15);
const DIM = rgb(0.45, 0.47, 0.5);
const RULE = rgb(0.8, 0.82, 0.85);
const HEADER_FILL = rgb(0.91, 0.92, 0.94);
const ZEBRA_FILL = rgb(0.97, 0.975, 0.98);
const CODE_FILL = rgb(0.955, 0.96, 0.968);

/** Characters the standard fonts cannot encode, mapped to look-alikes. */
const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "☐": "[ ]",
  "☑": "[x]",
  "⌘": "Cmd",
  "⌥": "Opt",
  "⇧": "Shift",
  "⌃": "Ctrl",
  "\u00a0": " ",
  "\u200b": "",
  "\ufeff": "",
};

class Composer {
  readonly doc: PDFDocument;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly oblique: PDFFont;
  readonly mono: PDFFont;
  private readonly charset: Set<number>;
  private readonly size: [number, number];
  page!: PDFPage;
  y = 0;
  /** Section index per page (`null` = contents / copied PDF pages). */
  readonly pageSection: Array<number | null> = [];
  private section: number | null = null;
  /** One embed per image buffer — a DOCX picture reused N times is stored once. */
  private readonly embedded = new WeakMap<Uint8Array, Promise<PDFImage>>();

  private constructor(
    doc: PDFDocument,
    fonts: PDFFont[],
    size: [number, number],
  ) {
    this.doc = doc;
    [this.regular, this.bold, this.oblique, this.mono] = fonts;
    this.charset = new Set(this.regular.getCharacterSet());
    this.size = size;
  }

  static async create(size: [number, number]) {
    const doc = await PDFDocument.create();
    const fonts = await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
      doc.embedFont(StandardFonts.HelveticaOblique),
      doc.embedFont(StandardFonts.Courier),
    ]);
    return new Composer(doc, fonts, size);
  }

  get contentWidth() {
    return this.page.getWidth() - MARGIN * 2;
  }
  private get bottom() {
    return MARGIN + FOOTER;
  }

  startSection(index: number | null) {
    this.section = index;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(this.size);
    this.pageSection.push(this.section);
    this.y = this.page.getHeight() - MARGIN;
  }

  /** Room for `height` more points on this page, or a new page. */
  ensure(height: number) {
    if (this.y - height < this.bottom) this.newPage();
  }

  clean(text: string) {
    let out = "";
    for (const ch of text.replace(/\t/g, "    ").replace(/\r/g, "")) {
      const mapped = REPLACEMENTS[ch];
      if (mapped !== undefined) out += mapped;
      else if (this.charset.has(ch.codePointAt(0)!)) out += ch;
      else {
        // Try dropping accents (ă → a), else a visible placeholder.
        const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
        out += [...base].every((c) => this.charset.has(c.codePointAt(0)!))
          ? base
          : "?";
      }
    }
    return out;
  }

  /** Greedy word wrap; words longer than the line are broken by character. */
  wrap(text: string, font: PDFFont, size: number, width: number) {
    // Tolerance: a column sized to its widest word must not wrap that word.
    const maxWidth = width + 0.5;
    const lines: string[] = [];
    for (const raw of this.clean(text).split("\n")) {
      const words = raw.split(/(\s+)/);
      let line = "";
      const push = () => {
        lines.push(line.trimEnd());
        line = "";
      };
      for (const word of words) {
        if (!word) continue;
        const candidate = line + word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (/^\s+$/.test(word)) {
          push();
          continue;
        }
        if (line.trim()) push();
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
          line = word;
          continue;
        }
        for (const ch of word) {
          if (font.widthOfTextAtSize(line + ch, size) > maxWidth && line)
            push();
          line += ch;
        }
      }
      push();
    }
    return lines;
  }

  text(
    content: string,
    opts: {
      font?: PDFFont;
      size?: number;
      leading?: number;
      indent?: number;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) {
    const font = opts.font ?? this.regular;
    const size = opts.size ?? BODY_SIZE;
    const leading = opts.leading ?? BODY_LEADING;
    const indent = opts.indent ?? 0;
    for (const line of this.wrap(
      content,
      font,
      size,
      this.contentWidth - indent,
    )) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y + (leading - size) / 2 + 1,
        size,
        font,
        color: opts.color ?? INK,
      });
    }
  }

  sectionHeader(title: string, subtitle: string) {
    this.text(title, { font: this.bold, size: 15, leading: 20 });
    this.y -= 2;
    this.text(subtitle, { size: 8.5, leading: 12, color: DIM });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + this.contentWidth, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 14;
  }

  /**
   * Centred image. With `widthFraction` it takes that share of the text
   * column (DOCX); otherwise its own size, scaled down (never up) to fit.
   * Either way it is shrunk to fit the page height.
   */
  image(
    data: Uint8Array,
    format: "png" | "jpg",
    width: number,
    height: number,
    widthFraction?: number,
  ) {
    let embed = this.embedded.get(data);
    if (!embed) {
      embed =
        format === "jpg" ? this.doc.embedJpg(data) : this.doc.embedPng(data);
      this.embedded.set(data, embed);
    }
    return embed.then((embedded) => {
      const pageHeight = this.page.getHeight() - MARGIN * 2 - FOOTER;
      const target =
        widthFraction === undefined
          ? Math.min(width, this.contentWidth)
          : this.contentWidth * Math.min(1, Math.max(0, widthFraction));
      const scale = Math.min(target / width, pageHeight / height);
      const w = width * scale;
      const h = height * scale;
      this.ensure(h);
      this.y -= h;
      this.page.drawImage(embedded, {
        x: MARGIN + (this.contentWidth - w) / 2,
        y: this.y,
        width: w,
        height: h,
      });
      this.y -= PARAGRAPH_GAP;
    });
  }

  table(header: string[] | null, rows: string[][], caption?: string) {
    const columnCount = Math.max(
      header?.length ?? 0,
      ...rows.map((r) => r.length),
      0,
    );
    if (!columnCount) return;
    const norm = (row: string[]) =>
      Array.from({ length: columnCount }, (_, i) => this.clean(row[i] ?? ""));
    const head = header ? norm(header) : null;
    const body = rows.map(norm);

    // Natural column widths from the header and a sample of rows.
    const natural = (size: number) =>
      Array.from({ length: columnCount }, (_, c) => {
        let w = head ? this.bold.widthOfTextAtSize(head[c], size) : 0;
        for (let r = 0; r < Math.min(body.length, 300); r++) {
          w = Math.max(w, this.regular.widthOfTextAtSize(body[r][c], size));
        }
        return Math.min(w, 220) + CELL_PAD_X * 2;
      });

    // Pick the largest font whose columns fit in the fewest column groups.
    const available = this.contentWidth;
    let size = TABLE_SIZES[0];
    let widths = natural(size);
    for (const candidate of TABLE_SIZES) {
      size = candidate;
      widths = natural(candidate);
      if (widths.reduce((a, b) => a + b, 0) <= available) break;
    }
    const groups = this.columnGroups(widths, available);

    groups.forEach((columns, groupIndex) => {
      let label = caption;
      if (groups.length > 1) {
        // Later groups repeat column 1 as a row key; label the new range.
        const repeated =
          groupIndex > 0 && columns[0] === 0 && columns.length > 1;
        const own = repeated ? columns.slice(1) : columns;
        const range =
          own.length > 1
            ? `Columns ${own[0] + 1}–${own.at(-1)! + 1} of ${columnCount}`
            : `Column ${own[0] + 1} of ${columnCount}`;
        label =
          [label, range].filter(Boolean).join(" · ") +
          (repeated ? " (with column 1)" : "");
      }
      this.tableGroup(
        head,
        body,
        columns,
        this.fitWidths(
          columns.map((c) => widths[c]),
          available,
        ),
        size,
        label,
      );
    });
  }

  /** Split columns into groups that fit the page width (first column repeats). */
  private columnGroups(widths: number[], available: number) {
    const capped = widths.map((w) => Math.min(w, 140));
    const total = capped.reduce((a, b) => a + b, 0);
    const all = widths.map((_, i) => i);
    if (total <= available * 1.6) return [all]; // squeeze + wrap is fine
    const groups: number[][] = [];
    let current: number[] = [];
    let used = 0;
    for (let c = 0; c < widths.length; c++) {
      if (current.length && used + capped[c] > available) {
        groups.push(current);
        current = [0];
        used = capped[0];
      }
      if (!(
        current.length === 1 &&
        current[0] === 0 &&
        c === 0 &&
        groups.length
      )) {
        current.push(c);
        used += capped[c];
      }
    }
    if (current.length) groups.push(current);
    return groups.map((g) => [...new Set(g)]);
  }

  /** Scale widths to fit, never below a readable minimum. */
  private fitWidths(widths: number[], available: number) {
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= available) return widths;
    const min = 28;
    const scaled = widths.map((w) => Math.max(min, (w * available) / total));
    const over = scaled.reduce((a, b) => a + b, 0) - available;
    if (over <= 0) return scaled;
    const flexible = scaled
      .filter((w) => w > min)
      .reduce((a, b) => a + b - min, 0);
    return scaled.map((w) =>
      w > min && flexible > 0 ? w - ((w - min) / flexible) * over : w,
    );
  }

  private tableGroup(
    head: string[] | null,
    body: string[][],
    columns: number[],
    widths: number[],
    size: number,
    caption?: string,
  ) {
    const leading = size * 1.3;
    const cellLines = (row: string[], font: PDFFont) =>
      columns.map((c, i) => {
        const lines = this.wrap(row[c], font, size, widths[i] - CELL_PAD_X * 2);
        if (lines.length > MAX_CELL_LINES) {
          lines.length = MAX_CELL_LINES;
          lines[MAX_CELL_LINES - 1] += " …";
        }
        return lines;
      });
    const isNumeric = (s: string) =>
      /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?%?$/i.test(s.trim());

    const drawRow = (
      row: string[],
      lines: string[][],
      font: PDFFont,
      fill?: ReturnType<typeof rgb>,
    ) => {
      const height =
        Math.max(1, ...lines.map((l) => l.length)) * leading + CELL_PAD_Y * 2;
      const top = this.y;
      let x = MARGIN;
      columns.forEach((c, i) => {
        const w = widths[i];
        if (fill) {
          this.page.drawRectangle({
            x,
            y: top - height,
            width: w,
            height,
            color: fill,
          });
        }
        this.page.drawRectangle({
          x,
          y: top - height,
          width: w,
          height,
          borderColor: RULE,
          borderWidth: 0.5,
        });
        const alignRight = font === this.regular && isNumeric(row[c]);
        lines[i].forEach((line, l) => {
          const lineWidth = font.widthOfTextAtSize(line, size);
          this.page.drawText(line, {
            x: alignRight ? x + w - CELL_PAD_X - lineWidth : x + CELL_PAD_X,
            y: top - CELL_PAD_Y - (l + 1) * leading + (leading - size) / 2 + 1,
            size,
            font,
            color: INK,
          });
        });
        x += w;
      });
      this.y -= height;
      return height;
    };

    const headLines = head ? cellLines(head, this.bold) : null;
    const headHeight = headLines
      ? Math.max(1, ...headLines.map((l) => l.length)) * leading +
        CELL_PAD_Y * 2
      : 0;
    const drawHeader = () => {
      if (head && headLines) drawRow(head, headLines, this.bold, HEADER_FILL);
    };

    if (caption) {
      this.ensure(12 + headHeight + leading * 2);
      this.text(caption, { font: this.bold, size: 9, leading: 13 });
      this.y -= 3;
    }
    this.ensure(headHeight + leading + CELL_PAD_Y * 2);
    drawHeader();
    body.forEach((row, r) => {
      const lines = cellLines(row, this.regular);
      const height =
        Math.max(1, ...lines.map((l) => l.length)) * leading + CELL_PAD_Y * 2;
      if (this.y - height < this.bottom) {
        this.newPage();
        drawHeader();
      }
      drawRow(row, lines, this.regular, r % 2 === 1 ? ZEBRA_FILL : undefined);
    });
    this.y -= PARAGRAPH_GAP * 2;
  }

  /**
   * A code block: Courier in a shaded, bordered box. Indentation is kept and
   * long lines wrap at the box edge by character. The box splits across pages.
   */
  code(source: string[], language?: string) {
    const size = 9;
    const leading = 12.5;
    const pad = 8;
    const charWidth = this.mono.widthOfTextAtSize("M", size);
    const perLine = Math.max(
      8,
      Math.floor((this.contentWidth - pad * 2) / charWidth),
    );
    const lines: string[] = [];
    for (const raw of source.length ? source : [""]) {
      const text = this.clean(raw).replace(/\s+$/, "");
      if (!text) {
        lines.push("");
        continue;
      }
      for (let i = 0; i < text.length; i += perLine)
        lines.push(text.slice(i, i + perLine));
    }

    let index = 0;
    let first = true;
    while (index < lines.length) {
      const labelSpace = first && language ? 10 : 0;
      // Fit as many lines as this page allows (at least one, else new page).
      let fit = Math.floor(
        (this.y - this.bottom - pad * 2 - labelSpace) / leading,
      );
      if (fit < 1) {
        this.newPage();
        continue;
      }
      fit = Math.min(fit, lines.length - index);
      const height = fit * leading + pad * 2 + labelSpace;
      const top = this.y;
      this.page.drawRectangle({
        x: MARGIN,
        y: top - height,
        width: this.contentWidth,
        height,
        color: CODE_FILL,
        borderColor: RULE,
        borderWidth: 0.5,
      });
      if (labelSpace) {
        const label = this.clean(language!).slice(0, 24);
        const w = this.regular.widthOfTextAtSize(label, 7);
        this.page.drawText(label, {
          x: MARGIN + this.contentWidth - pad - w,
          y: top - pad - 5,
          size: 7,
          font: this.regular,
          color: DIM,
        });
      }
      for (let l = 0; l < fit; l++) {
        const text = lines[index + l];
        if (!text) continue;
        this.page.drawText(text, {
          x: MARGIN + pad,
          y:
            top -
            pad -
            labelSpace -
            (l + 1) * leading +
            (leading - size) / 2 +
            1.5,
          size,
          font: this.mono,
          color: INK,
        });
      }
      index += fit;
      this.y -= height;
      first = false;
      if (index < lines.length) this.newPage();
    }
    this.y -= PARAGRAPH_GAP * 1.5;
  }

  async copyPdf(bytes: ArrayBuffer) {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await this.doc.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      this.doc.addPage(page);
      this.pageSection.push(null);
    }
  }
}

async function renderBlocks(composer: Composer, blocks: Block[]) {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        composer.text(block.text, { indent: block.indent });
        composer.y -= PARAGRAPH_GAP;
        break;
      case "line":
        composer.text(block.text);
        break;
      case "code":
        composer.code(block.lines, block.language);
        break;
      case "gap":
        composer.y -= BODY_LEADING * 0.6;
        break;
      case "note":
        composer.text(block.text, {
          font: composer.oblique,
          size: 9,
          leading: 13,
          color: DIM,
        });
        composer.y -= PARAGRAPH_GAP;
        break;
      case "table":
        composer.table(block.header, block.rows, block.caption);
        break;
      case "image":
        try {
          await composer.image(
            block.data,
            block.format,
            block.width,
            block.height,
            block.widthFraction,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          composer.text(`Image not included: ${reason}`, {
            font: composer.oblique,
            size: 9,
            leading: 13,
            color: DIM,
          });
          composer.y -= PARAGRAPH_GAP;
        }
        break;
      case "pdf":
        break; // handled by the caller
    }
  }
}

export async function buildUnifiedPdf(
  items: ExportItem[],
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ExportResult> {
  const size = (
    options.pageSize === "letter" ? PageSizes.Letter : PageSizes.A4
  ) as [number, number];
  const composer = await Composer.create(size);
  const failures: ExportResult["failures"] = [];
  const startPages: number[] = [];

  for (const [index, item] of items.entries()) {
    onProgress?.({ index, total: items.length, name: item.name });
    // Let the dialog paint progress between files.
    await new Promise((resolve) => setTimeout(resolve, 0));
    startPages.push(composer.doc.getPageCount());

    let blocks: Block[];
    try {
      blocks = await toBlocks(item.kind, await storage.getContent(item.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: item.name, error: message });
      blocks = [
        { type: "note", text: `Could not convert this file: ${message}` },
      ];
    }

    const pdf = blocks.find(
      (b): b is Extract<Block, { type: "pdf" }> => b.type === "pdf",
    );
    if (pdf) {
      try {
        await composer.copyPdf(pdf.bytes);
        continue;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: item.name, error: message });
        blocks = [
          { type: "note", text: `Could not copy this PDF: ${message}` },
        ];
      }
    }

    composer.startSection(index);
    composer.sectionHeader(
      item.name,
      `${item.path}  ·  ${KIND_LABEL[item.kind]}`,
    );
    await renderBlocks(composer, blocks);
  }
  onProgress?.({ index: items.length, total: items.length, name: "" });

  const contentsPages = options.contents
    ? drawContents(composer, items, startPages, options.title, size)
    : 0;
  drawFooters(composer, items, contentsPages);

  composer.doc.setTitle(options.title);
  composer.doc.setCreator("Note Editor");
  composer.doc.setProducer("Note Editor unified export");
  return { bytes: await composer.doc.save(), failures };
}

/** Contents pages at the front; returns how many were inserted. */
function drawContents(
  composer: Composer,
  items: ExportItem[],
  startPages: number[],
  title: string,
  size: [number, number],
) {
  const [width, height] = size;
  const rowHeight = 18;
  const firstPageRows = Math.floor(
    (height - MARGIN * 2 - FOOTER - 70) / rowHeight,
  );
  const otherPageRows = Math.floor((height - MARGIN * 2 - FOOTER) / rowHeight);
  const pageCount =
    items.length <= firstPageRows
      ? 1
      : 1 + Math.ceil((items.length - firstPageRows) / otherPageRows);

  let row = 0;
  for (let p = 0; p < pageCount; p++) {
    const page = composer.doc.insertPage(p, size);
    composer.pageSection.splice(p, 0, null);
    let y = height - MARGIN;
    if (p === 0) {
      page.drawText(composer.clean(title), {
        x: MARGIN,
        y: y - 20,
        size: 20,
        font: composer.bold,
        color: INK,
      });
      const stamp = `${items.length} file${items.length === 1 ? "" : "s"} · exported ${new Date().toLocaleString()}`;
      page.drawText(composer.clean(stamp), {
        x: MARGIN,
        y: y - 38,
        size: 9,
        font: composer.regular,
        color: DIM,
      });
      y -= 70;
    }
    const rows = p === 0 ? firstPageRows : otherPageRows;
    for (let r = 0; r < rows && row < items.length; r++, row++) {
      y -= rowHeight;
      const item = items[row];
      const pageNumber = String(startPages[row] + pageCount + 1);
      const numberWidth = composer.regular.widthOfTextAtSize(
        pageNumber,
        BODY_SIZE,
      );
      const label = `${row + 1}.  ${composer.clean(item.path)}`;
      const maxLabel = width - MARGIN * 2 - numberWidth - 24;
      let shown = label;
      while (
        shown.length > 4 &&
        composer.regular.widthOfTextAtSize(shown, BODY_SIZE) > maxLabel
      ) {
        shown = `${shown.slice(0, -2)}…`;
      }
      page.drawText(shown, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: composer.regular,
        color: INK,
      });
      const labelEnd =
        MARGIN + composer.regular.widthOfTextAtSize(shown, BODY_SIZE) + 6;
      const numberX = width - MARGIN - numberWidth;
      page.drawLine({
        start: { x: labelEnd, y: y + 2 },
        end: { x: numberX - 6, y: y + 2 },
        thickness: 0.6,
        color: RULE,
        dashArray: [1, 2.5],
      });
      page.drawText(pageNumber, {
        x: numberX,
        y,
        size: BODY_SIZE,
        font: composer.regular,
        color: INK,
      });
    }
  }
  return pageCount;
}

function drawFooters(
  composer: Composer,
  items: ExportItem[],
  contentsPages: number,
) {
  const pages = composer.doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const section = composer.pageSection[i];
    if (section === null && i >= contentsPages) return; // copied PDF pages keep their own look
    const y = MARGIN - 6;
    const number = `${i + 1} / ${total}`;
    const size = 8;
    const numberWidth = composer.regular.widthOfTextAtSize(number, size);
    page.drawText(number, {
      x: page.getWidth() - MARGIN - numberWidth,
      y,
      size,
      font: composer.regular,
      color: DIM,
    });
    const label = section === null ? "Contents" : (items[section]?.name ?? "");
    page.drawText(composer.clean(label).slice(0, 80), {
      x: MARGIN,
      y,
      size,
      font: composer.regular,
      color: DIM,
    });
  });
}
