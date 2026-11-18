import type { FileKind } from "@/lib/file-types";

/** An open-source package an editor is built on. */
export type Library = {
  /** Display name. */
  name: string;
  /** npm package name — also the link target on npmjs.com. */
  pkg: string;
};

const LIB = {
  mdxeditor: { name: "MDXEditor", pkg: "@mdxeditor/editor" },
  monaco: { name: "Monaco Editor", pkg: "monaco-editor" },
  glide: { name: "Glide Data Grid", pkg: "@glideapps/glide-data-grid" },
  papaparse: { name: "Papa Parse", pkg: "papaparse" },
  embedpdf: { name: "EmbedPDF", pkg: "@embedpdf/core" },
  reactDocx: { name: "React Docx", pkg: "@extend-ai/react-docx" },
  reactXlsx: { name: "React Xlsx", pkg: "@extend-ai/react-xlsx" },
  dndKit: { name: "dnd kit", pkg: "@dnd-kit/core" },
  mermaid: { name: "Mermaid", pkg: "mermaid" },
  zoomPanPinch: { name: "React Zoom Pan Pinch", pkg: "react-zoom-pan-pinch" },
  dayPicker: { name: "React DayPicker", pkg: "react-day-picker" },
  yaml: { name: "YAML", pkg: "yaml" },
  smolToml: { name: "smol-toml", pkg: "smol-toml" },
  sqljs: { name: "sql.js", pkg: "sql.js" },
  regexpp: { name: "regexpp", pkg: "@eslint-community/regexpp" },
  regexpTree: { name: "regexp-tree", pkg: "regexp-tree" },
  pierreDiffs: { name: "Pierre Diffs", pkg: "@pierre/diffs" },
  jsdiff: { name: "jsdiff", pkg: "diff" },
  qrStyling: { name: "QR Code Styling", pkg: "qr-code-styling" },
  konva: { name: "Konva", pkg: "konva" },
  pptxgen: { name: "PptxGenJS", pkg: "pptxgenjs" },
  pdfLib: { name: "pdf-lib", pkg: "pdf-lib" },
  reactMarkdown: { name: "React Markdown", pkg: "react-markdown" },
  remarkGfm: { name: "remark-gfm", pkg: "remark-gfm" },
  d3: { name: "D3", pkg: "d3" },
  imageCrop: { name: "React Image Crop", pkg: "react-image-crop" },
  pica: { name: "Pica", pkg: "pica" },
  utif: { name: "UTIF", pkg: "utif" },
  gifenc: { name: "gifenc", pkg: "gifenc" },
  heic2any: { name: "heic2any", pkg: "heic2any" },
} satisfies Record<string, Library>;

/**
 * The main libraries behind each file type's editor, most important first.
 * An empty list means the editor is built in-house. Keep in step with the
 * imports of the matching pane in `src/features/editors/`.
 */
export const KIND_LIBRARIES: Record<FileKind, Library[]> = {
  markdown: [LIB.mdxeditor],
  csv: [LIB.glide, LIB.papaparse, LIB.monaco],
  pdf: [LIB.embedpdf],
  docx: [LIB.reactDocx],
  xlsx: [LIB.reactXlsx],
  schema: [LIB.dndKit, LIB.monaco],
  mermaid: [LIB.mermaid, LIB.monaco, LIB.zoomPanPinch],
  calendar: [LIB.dayPicker],
  kanban: [LIB.dndKit, LIB.dayPicker],
  json: [LIB.monaco],
  yaml: [LIB.monaco, LIB.yaml],
  toml: [LIB.monaco, LIB.smolToml],
  sql: [LIB.sqljs, LIB.monaco],
  env: [LIB.monaco],
  apikeys: [LIB.monaco],
  prompt: [LIB.monaco],
  regex: [LIB.monaco, LIB.regexpp, LIB.regexpTree],
  diff: [LIB.pierreDiffs, LIB.jsdiff],
  qr: [LIB.qrStyling],
  timer: [LIB.dndKit],
  random: [LIB.papaparse, LIB.monaco],
  bookmark: [],
  pptx: [LIB.konva, LIB.pptxgen, LIB.pdfLib, LIB.dndKit],
  chat: [LIB.reactMarkdown, LIB.remarkGfm, LIB.mdxeditor],
  appinfo: [],
  appstate: [LIB.d3],
  image: [LIB.imageCrop, LIB.pica, LIB.utif, LIB.gifenc, LIB.heic2any],
  text: [LIB.monaco],
};
