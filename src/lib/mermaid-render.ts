/**
 * Mermaid → SVG / PNG, shared by the Mermaid pane (preview, image download)
 * and the unified PDF export. Mermaid is loaded on first use.
 */
import type { MermaidConfig } from "mermaid";

let renderSeq = 0;

export type MermaidRenderOptions = {
  theme?: "default" | "dark" | "neutral" | "forest" | "base";
  /**
   * HTML labels render text inside `<foreignObject>`, which a canvas refuses
   * to export. Turn them off for anything rasterised (PNG, PDF).
   */
  htmlLabels?: boolean;
};

export async function renderMermaidSvg(
  source: string,
  { theme = "default", htmlLabels = true }: MermaidRenderOptions = {},
) {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme,
    htmlLabels,
    flowchart: { htmlLabels },
  } as MermaidConfig);
  const { svg } = await mermaid.render(`mermaid-svg-${++renderSeq}`, source);
  return svg;
}

/** Intrinsic size of a rendered Mermaid SVG, from its viewBox. */
function svgSize(svg: SVGSVGElement) {
  const box = svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0)
    return { width: box.width, height: box.height };
  const width = parseFloat(svg.getAttribute("width") ?? "") || 800;
  const height = parseFloat(svg.getAttribute("height") ?? "") || 600;
  return { width, height };
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Some diagram types (journey, event modeling) always put labels in
 * `<foreignObject>`, which taints a canvas. Swap each for a centred SVG
 * `<text>` with the same words so the image can still be exported.
 */
function replaceForeignObjects(svg: SVGSVGElement) {
  for (const fo of Array.from(
    svg.getElementsByTagNameNS(SVG_NS, "foreignObject"),
  )) {
    const words = (fo.textContent ?? "").replace(/\s+/g, " ").trim();
    if (words) {
      const x = parseFloat(fo.getAttribute("x") ?? "0") || 0;
      const y = parseFloat(fo.getAttribute("y") ?? "0") || 0;
      const w = parseFloat(fo.getAttribute("width") ?? "0") || 0;
      const h = parseFloat(fo.getAttribute("height") ?? "0") || 0;
      const text = svg.ownerDocument.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(x + w / 2));
      text.setAttribute("y", String(y + h / 2));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute(
        "font-family",
        "trebuchet ms, verdana, arial, sans-serif",
      );
      text.setAttribute("font-size", "14");
      text.setAttribute("fill", "#333");
      text.textContent = words;
      fo.parentNode?.insertBefore(text, fo);
    }
    fo.remove();
  }
}

export type RasterImage = {
  png: Uint8Array;
  /** Pixel size of the PNG. */
  width: number;
  height: number;
  /** Size the diagram was drawn at (CSS px) — the PNG is `scale` × this. */
  baseWidth: number;
  baseHeight: number;
};

/** Draws an SVG string onto a canvas and returns PNG bytes. */
export async function svgToPng(
  svgText: string,
  { scale = 2, background = "#ffffff", maxSide = 8000 } = {},
): Promise<RasterImage> {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (svg.nodeName !== "svg")
    throw new Error("Mermaid did not produce an SVG.");
  const { width: baseWidth, height: baseHeight } = svgSize(svg);
  svg.setAttribute("width", String(baseWidth));
  svg.setAttribute("height", String(baseHeight));
  svg.removeAttribute("style"); // drops `max-width`, which would shrink it
  replaceForeignObjects(svg);
  const ratio = Math.min(scale, maxSide / Math.max(baseWidth, baseHeight));
  const width = Math.max(1, Math.round(baseWidth * ratio));
  const height = Math.max(1, Math.round(baseHeight * ratio));

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Could not encode the diagram as PNG.");
    return {
      png: new Uint8Array(await blob.arrayBuffer()),
      width,
      height,
      baseWidth,
      baseHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Source → PNG on a white background, light theme, canvas-safe labels. */
export async function renderMermaidPng(source: string, scale = 2) {
  const svg = await renderMermaidSvg(source, {
    theme: "default",
    htmlLabels: false,
  });
  return svgToPng(svg, { scale });
}
