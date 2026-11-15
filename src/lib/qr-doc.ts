/**
 * `.qr` files: a QR code design stored as JSON — what it encodes plus how it
 * looks. Rendered (and exported) with `qr-code-styling`.
 */
import type {
  CornerDotType,
  CornerSquareType,
  DotType,
  ErrorCorrectionLevel,
  Options,
} from "qr-code-styling";

export type QrContentKind = "text" | "wifi" | "email" | "phone" | "sms";

/** What the code encodes. Every field is kept so switching kinds is lossless. */
export type QrContent = {
  kind: QrContentKind;
  text: string;
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hidden: boolean;
  email: string;
  subject: string;
  body: string;
  phone: string;
  message: string;
};

export type QrGradient = {
  type: "linear" | "radial";
  /** Second colour; the first is the plain colour of the part. */
  to: string;
  /** Degrees, linear only. */
  rotation: number;
};

export type QrDoc = {
  version: 1;
  content: QrContent;
  /** Export size in px (square). */
  size: number;
  /** Quiet zone around the code, px. */
  margin: number;
  errorCorrection: ErrorCorrectionLevel;
  shape: "square" | "circle";
  dots: { type: DotType; color: string; gradient: QrGradient | null };
  cornerSquare: { type: CornerSquareType; color: string };
  cornerDot: { type: CornerDotType; color: string };
  background: { color: string; transparent: boolean };
  /** Centre image as a data: URL. */
  logo: {
    src: string;
    /** Share of the code the image may cover, 0.1–0.5. */
    size: number;
    margin: number;
    hideBackgroundDots: boolean;
  } | null;
};

export const DOT_TYPES: { value: DotType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "extra-rounded", label: "Extra rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
  { value: "classy-rounded", label: "Classy rounded" },
];

export const CORNER_SQUARE_TYPES: { value: CornerSquareType; label: string }[] =
  [
    { value: "square", label: "Square" },
    { value: "extra-rounded", label: "Rounded" },
    { value: "dot", label: "Dot" },
  ];

export const CORNER_DOT_TYPES: { value: CornerDotType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "dot", label: "Dot" },
];

export const ERROR_LEVELS: { value: ErrorCorrectionLevel; label: string }[] = [
  { value: "L", label: "Low · 7%" },
  { value: "M", label: "Medium · 15%" },
  { value: "Q", label: "Quartile · 25%" },
  { value: "H", label: "High · 30%" },
];

export const CONTENT_KINDS: { value: QrContentKind; label: string }[] = [
  { value: "text", label: "Text / URL" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
];

export const MIN_SIZE = 128;
export const MAX_SIZE = 2048;

export function defaultQrDoc(): QrDoc {
  return {
    version: 1,
    content: {
      kind: "text",
      text: "https://example.com",
      ssid: "",
      password: "",
      security: "WPA",
      hidden: false,
      email: "",
      subject: "",
      body: "",
      phone: "",
      message: "",
    },
    size: 512,
    margin: 16,
    errorCorrection: "Q",
    shape: "square",
    dots: { type: "rounded", color: "#111827", gradient: null },
    cornerSquare: { type: "extra-rounded", color: "#111827" },
    cornerDot: { type: "dot", color: "#111827" },
    background: { color: "#ffffff", transparent: false },
    logo: null,
  };
}

export function serializeQr(doc: QrDoc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T) =>
  list.includes(v as T) ? (v as T) : fallback;

/**
 * Reads a `.qr` file. Missing or invalid fields fall back to the defaults so
 * a hand-edited file still opens; an empty file is a fresh design.
 */
export function parseQr(text: string): QrDoc {
  const base = defaultQrDoc();
  if (!text.trim()) return base;
  const raw: unknown = JSON.parse(text);
  if (!isObj(raw)) throw new Error("Expected a JSON object");
  const c = isObj(raw.content) ? raw.content : {};
  const dots = isObj(raw.dots) ? raw.dots : {};
  const grad = isObj(dots.gradient) ? dots.gradient : null;
  const cs = isObj(raw.cornerSquare) ? raw.cornerSquare : {};
  const cd = isObj(raw.cornerDot) ? raw.cornerDot : {};
  const bg = isObj(raw.background) ? raw.background : {};
  const logo = isObj(raw.logo) ? raw.logo : null;
  const bc = base.content;
  return {
    version: 1,
    content: {
      kind: oneOf(c.kind, CONTENT_KINDS.map((k) => k.value), bc.kind),
      text: str(c.text, bc.text),
      ssid: str(c.ssid, ""),
      password: str(c.password, ""),
      security: oneOf(c.security, ["WPA", "WEP", "nopass"] as const, "WPA"),
      hidden: c.hidden === true,
      email: str(c.email, ""),
      subject: str(c.subject, ""),
      body: str(c.body, ""),
      phone: str(c.phone, ""),
      message: str(c.message, ""),
    },
    size: num(raw.size, base.size, MIN_SIZE, MAX_SIZE),
    margin: num(raw.margin, base.margin, 0, 200),
    errorCorrection: oneOf(
      raw.errorCorrection,
      ERROR_LEVELS.map((l) => l.value),
      base.errorCorrection,
    ),
    shape: oneOf(raw.shape, ["square", "circle"] as const, "square"),
    dots: {
      type: oneOf(dots.type, DOT_TYPES.map((d) => d.value), base.dots.type),
      color: str(dots.color, base.dots.color),
      gradient: grad
        ? {
            type: oneOf(grad.type, ["linear", "radial"] as const, "linear"),
            to: str(grad.to, "#6366f1"),
            rotation: num(grad.rotation, 0, 0, 360),
          }
        : null,
    },
    cornerSquare: {
      type: oneOf(
        cs.type,
        CORNER_SQUARE_TYPES.map((d) => d.value),
        base.cornerSquare.type,
      ),
      color: str(cs.color, base.cornerSquare.color),
    },
    cornerDot: {
      type: oneOf(
        cd.type,
        CORNER_DOT_TYPES.map((d) => d.value),
        base.cornerDot.type,
      ),
      color: str(cd.color, base.cornerDot.color),
    },
    background: {
      color: str(bg.color, base.background.color),
      transparent: bg.transparent === true,
    },
    logo:
      logo && typeof logo.src === "string" && logo.src.startsWith("data:image/")
        ? {
            src: logo.src,
            size: num(logo.size, 0.3, 0.1, 0.5),
            margin: num(logo.margin, 4, 0, 40),
            hideBackgroundDots: logo.hideBackgroundDots !== false,
          }
        : null,
  };
}

/** Wi-Fi strings escape `\ ; , : "` with a backslash. */
const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

/** The string the code encodes. */
export function qrData(content: QrContent) {
  switch (content.kind) {
    case "text":
      return content.text;
    case "wifi":
      return `WIFI:T:${content.security};S:${wifiEscape(content.ssid)};${
        content.security === "nopass" ? "" : `P:${wifiEscape(content.password)};`
      }${content.hidden ? "H:true;" : ""};`;
    case "email": {
      const params = new URLSearchParams();
      if (content.subject) params.set("subject", content.subject);
      if (content.body) params.set("body", content.body);
      const query = params.toString().replace(/\+/g, "%20");
      return `mailto:${content.email}${query ? `?${query}` : ""}`;
    }
    case "phone":
      return `tel:${content.phone.replace(/\s+/g, "")}`;
    case "sms":
      return `SMSTO:${content.phone.replace(/\s+/g, "")}:${content.message}`;
  }
}

/** Options for `qr-code-styling` at `size` px (defaults to the doc's size). */
export function qrOptions(doc: QrDoc, size = doc.size): Partial<Options> {
  const scale = size / doc.size;
  const g = doc.dots.gradient;
  return {
    type: "svg",
    shape: doc.shape,
    width: size,
    height: size,
    margin: Math.round(doc.margin * scale),
    data: qrData(doc.content) || " ",
    image: doc.logo?.src,
    qrOptions: { errorCorrectionLevel: doc.errorCorrection },
    imageOptions: {
      hideBackgroundDots: doc.logo?.hideBackgroundDots ?? true,
      imageSize: doc.logo?.size ?? 0.3,
      margin: Math.round((doc.logo?.margin ?? 4) * scale),
      crossOrigin: "anonymous",
    },
    dotsOptions: {
      type: doc.dots.type,
      color: doc.dots.color,
      gradient: g
        ? {
            type: g.type,
            rotation: (g.rotation * Math.PI) / 180,
            colorStops: [
              { offset: 0, color: doc.dots.color },
              { offset: 1, color: g.to },
            ],
          }
        : undefined,
    },
    cornersSquareOptions: {
      type: doc.cornerSquare.type,
      color: doc.cornerSquare.color,
    },
    cornersDotOptions: { type: doc.cornerDot.type, color: doc.cornerDot.color },
    backgroundOptions: {
      color: doc.background.transparent ? "transparent" : doc.background.color,
    },
  };
}

/** PNG bytes of the design, for the PDF export. */
export async function renderQrPng(doc: QrDoc, size = 512) {
  const { default: QRCodeStyling } = await import("qr-code-styling");
  const qr = new QRCodeStyling({ ...qrOptions(doc, size), type: "canvas" });
  const blob = await qr.getRawData("png");
  if (!blob || !(blob instanceof Blob)) throw new Error("QR render failed");
  return new Uint8Array(await blob.arrayBuffer());
}
