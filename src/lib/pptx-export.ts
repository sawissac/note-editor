/**
 * The download made from the app's JSON `.pptx` deck: a real PowerPoint
 * `.pptx` (pptxgenjs — text stays text, shapes stay shapes). The library
 * loads on demand, the first time a download is asked for.
 */
import {
  type PptxDoc,
  type SlideElement,
  TEXT_PADDING,
  roundedRadius,
} from "@/lib/pptx-doc";

export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Slide px per inch — a 960 px slide is PowerPoint's 10 in wide 16:9. */
const PX_PER_INCH = 96;
/** CSS px → points. */
const PX_TO_PT = 0.75;

const inches = (px: number) => px / PX_PER_INCH;
/** `#aabbcc` → `AABBCC`, the form pptxgenjs takes. */
const hex = (color: string) => color.slice(1).toUpperCase();
/** Opacity 0–1 → PowerPoint transparency 0–100. */
const transparency = (opacity: number) => Math.round((1 - opacity) * 100);
const degrees = (rotation: number) =>
  ((Math.round(rotation) % 360) + 360) % 360;

const box = (el: SlideElement) => ({
  x: inches(el.x),
  y: inches(el.y),
  w: inches(el.width),
  h: inches(el.height),
  rotate: degrees(el.rotation),
});

/**
 * The deck as a `.pptx` file. Text boxes, shapes, lines and pictures become
 * their PowerPoint counterparts, editable there; speaker notes carry over.
 */
export async function buildPptx(doc: PptxDoc, title: string) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = title;

  for (const slide of doc.slides) {
    const page = pptx.addSlide();
    page.background = { color: hex(slide.background) };
    if (slide.notes.trim()) page.addNotes(slide.notes);

    for (const el of slide.elements) {
      const alpha = transparency(el.opacity);
      if (el.type === "text") {
        if (!el.text && !el.fill) continue;
        page.addText(el.text, {
          ...box(el),
          fontFace: el.fontFamily,
          fontSize: Math.round(el.fontSize * PX_TO_PT * 10) / 10,
          bold: el.bold,
          italic: el.italic,
          underline: el.underline ? { style: "sng" } : undefined,
          color: hex(el.color),
          transparency: alpha,
          align: el.align,
          valign: el.valign,
          margin: TEXT_PADDING * PX_TO_PT,
          fill: el.fill
            ? { color: hex(el.fill), transparency: alpha }
            : undefined,
          fit: "none",
          wrap: true,
        });
        continue;
      }
      if (el.type === "image") {
        const data = doc.images[el.image];
        if (!data) continue;
        page.addImage({ ...box(el), data, transparency: alpha });
        continue;
      }
      const line =
        el.stroke && el.strokeWidth > 0
          ? {
              color: hex(el.stroke),
              width: el.strokeWidth * PX_TO_PT,
              transparency: alpha,
            }
          : undefined;
      if (el.shape === "line" || el.shape === "arrow") {
        if (!line) continue;
        // A PowerPoint line is a zero-height box along the element's middle.
        page.addShape("line", {
          ...box(el),
          y: inches(el.y + el.height / 2),
          h: 0,
          line: {
            ...line,
            endArrowType: el.shape === "arrow" ? "triangle" : undefined,
          },
        });
        continue;
      }
      page.addShape(
        (
          {
            rect: "rect",
            rounded: "roundRect",
            ellipse: "ellipse",
            triangle: "triangle",
            diamond: "diamond",
            star: "star5",
          } as const
        )[el.shape],
        {
          ...box(el),
          fill: el.fill
            ? { color: hex(el.fill), transparency: alpha }
            : undefined,
          line,
          // pptxgenjs takes the corner radius in inches.
          rectRadius:
            el.shape === "rounded"
              ? inches(roundedRadius(el.width, el.height))
              : undefined,
        },
      );
    }
  }

  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
