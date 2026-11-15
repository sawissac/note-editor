import "@/styles/image-pane.css";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBorderCorners,
  IconCheck,
  IconCopy,
  IconCrop,
  IconDeviceFloppy,
  IconDownload,
  IconFilePlus,
  IconFlipHorizontal,
  IconFlipVertical,
  IconPhotoPlus,
  IconRefresh,
  IconRestore,
  IconRotate2,
  IconRotateClockwise2,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import * as React from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { baseNameLength } from "@/lib/file-types";
import {
  IMAGE_ACCEPT,
  IMAGE_FORMATS,
  type ImageFormat,
  sniffImageFormat,
} from "@/lib/image-formats";
import {
  ADJUSTMENT_PRESETS,
  type Adjustments,
  applyAdjustments,
  canEncode,
  context2d,
  cropCanvas,
  decodeImage,
  encodeImage,
  flip,
  formatBytes,
  isIdentity,
  NO_ADJUSTMENTS,
  opaqueBounds,
  resizeCanvas,
  rotateQuarter,
  sameAdjustments,
  toHex,
  writableFormats,
} from "@/lib/image-tools";
import { downloadFile, toArrayBuffer } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import { addFileWithContent, saveContent } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { useBinaryAutosave } from "@/features/editors/use-binary-autosave";
import { useObjectUrl } from "@/features/editors/use-file-content";

/** One step of edit history: the pixels plus the colour settings on top. */
type Snapshot = {
  canvas: HTMLCanvasElement;
  adjust: Adjustments;
  /** The decoded file, untouched. */
  original?: boolean;
};
type History = { stack: Snapshot[]; index: number };

const HISTORY_LIMIT = 30;
/** Longest side of the adjusted preview; full size is used when saving. */
const PREVIEW_MAX = 2048;
const MAX_DIMENSION = 16384;
const ZOOM_STEPS = [
  0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16,
];
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;
/** Breathing room around the image when fitted. */
const STAGE_PAD = 48;

const ASPECTS: ReadonlyArray<{ id: string; label: string; ratio?: number }> = [
  { id: "free", label: "Free" },
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

type SliderSpec = {
  key: Exclude<keyof Adjustments, "invert">;
  label: string;
  min: number;
  max: number;
  unit?: string;
};

const SLIDERS: readonly SliderSpec[] = [
  { key: "brightness", label: "Brightness", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "hue", label: "Hue", min: -180, max: 180, unit: "°" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100 },
  { key: "sepia", label: "Sepia", min: 0, max: 100 },
  { key: "blur", label: "Blur", min: 0, max: 20, unit: " px" },
  { key: "sharpen", label: "Sharpen", min: 0, max: 100 },
  { key: "vignette", label: "Vignette", min: 0, max: 100 },
];

type Notice = { tone: "info" | "error"; text: string };
type Readout = { x: number; y: number; hex: string; alpha: number };

/** Largest image accepted by the importer. */
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

/**
 * `.img` files: one image of any format (PNG, JPEG, WebP, AVIF, GIF, BMP,
 * ICO, TIFF, SVG, HEIC) — the bytes say which. A new `.img` is empty and
 * asks for an image to import; once filled it opens in {@link ImageEditor}.
 * "Replace" in the file bar imports a different image into the same file.
 */
export default function ImagePane(props: PaneProps) {
  const dispatch = useAppDispatch();
  const [bytes, setBytes] = React.useState<ArrayBuffer | null>(() =>
    props.content instanceof ArrayBuffer && props.content.byteLength > 0
      ? props.content
      : null,
  );
  // Bumped whenever the bytes are swapped, so the editor starts afresh.
  const [version, setVersion] = React.useState(0);
  const [replacing, setReplacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const replaceWith = (next: ArrayBuffer) => {
    setBytes(next);
    setVersion((v) => v + 1);
    setReplacing(false);
    setError(null);
  };

  const importFile = async (file: File) => {
    const data = await file.arrayBuffer();
    if (!sniffImageFormat(data)) {
      setError(`“${file.name}” is not an image this editor can read.`);
      return;
    }
    await dispatch(saveContent(props.id, data));
    replaceWith(data);
  };

  if (!bytes || replacing) {
    return (
      <div className="image-pane__import" data-testid="image-pane-import">
        <div className="image-pane__import-box">
          <h2 className="image-pane__import-title">
            {bytes ? "Replace the image" : "Import an image"}
          </h2>
          <p className="pane-field__hint">
            PNG, JPEG, WebP, AVIF, GIF, BMP, ICO, TIFF, SVG or HEIC. It is
            stored inside {props.name}.
          </p>
          <FileUpload
            data-testid="image-pane-import-upload"
            accept={IMAGE_ACCEPT}
            maxSize={MAX_IMPORT_BYTES}
            maxFiles={1}
            multiple={false}
            title="Click or drop an image"
            onFilesAdded={(files) => {
              if (files[0]) void importFile(files[0]);
            }}
            onFilesRejected={(rejections) =>
              setError(
                `Not imported: ${rejections.map((r) => r.file.name).join(", ")}`,
              )
            }
          />
          {error ? (
            <p
              className="image-pane__import-error"
              role="alert"
              data-testid="image-pane-import-error-message"
            >
              <IconAlertTriangle aria-hidden className="pane-icon" />
              {error}
            </p>
          ) : null}
          {bytes ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="image-pane-import-cancel-button"
              onClick={() => setReplacing(false)}
            >
              <IconX aria-hidden className="pane-icon" />
              Keep the current image
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <ImageEditor
      key={version}
      id={props.id}
      name={props.name}
      bytes={bytes}
      registerSave={props.registerSave}
      onReplace={() => setReplacing(true)}
      onReplaced={replaceWith}
    />
  );
}

/**
 * Viewer with zoom and a pixel colour readout, plus an editor — crop with
 * aspect presets, rotate, flip, trim, resize, colour adjustments and
 * presets — with undo / redo. Edits autosave in the image's own format
 * (PNG when the browser can't write that format); the Export tab downloads
 * any writable format, converts this file, or saves a converted copy.
 */
function ImageEditor({
  id,
  name,
  bytes: originalBytes,
  registerSave,
  onReplace,
  onReplaced,
}: {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  registerSave: PaneProps["registerSave"];
  onReplace: () => void;
  onReplaced: (bytes: ArrayBuffer) => void;
}) {
  const dispatch = useAppDispatch();
  const parentId = useAppSelector((s) => s.fs.nodes[id]?.parentId ?? null);
  const [format] = React.useState<ImageFormat>(
    () => sniffImageFormat(originalBytes) ?? "png",
  );
  const info = IMAGE_FORMATS[format];
  const baseName = name.slice(0, baseNameLength(name)) || "image";
  const originalUrl = useObjectUrl(originalBytes, info.mime);

  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [vectorScale, setVectorScale] = React.useState(1);
  const [nativeDisplay, setNativeDisplay] = React.useState(false);
  const [history, setHistoryState] = React.useState<History | null>(null);
  const historyRef = React.useRef(history);
  const [adjust, setAdjustState] = React.useState<Adjustments>(NO_ADJUSTMENTS);
  const adjustRef = React.useRef(adjust);
  const [saved, setSavedState] = React.useState<{
    snap: Snapshot | null;
    adjust: Adjustments;
  }>({ snap: null, adjust: NO_ADJUSTMENTS });
  const savedRef = React.useRef(saved);
  // Edits are written in the image's own format, or PNG when the browser
  // can't write that one (HEIC, AVIF in some browsers).
  const [saveFormat, setSaveFormat] = React.useState<ImageFormat>(format);
  const [exportFormats, setExportFormats] = React.useState<ImageFormat[]>([]);

  const [zoomSetting, setZoomSetting] = React.useState<number | "fit">("fit");
  const [fit, setFit] = React.useState(1);
  const [crop, setCrop] = React.useState<PercentCrop | null>(null);
  const [aspectId, setAspectId] = React.useState("free");
  const [readout, setReadout] = React.useState<Readout | null>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const previewScaleRef = React.useRef(1);

  const setHistory = (next: History) => {
    historyRef.current = next;
    setHistoryState(next);
  };
  const setAdjust = (next: Adjustments) => {
    adjustRef.current = next;
    setAdjustState(next);
  };
  const setSaved = (next: { snap: Snapshot | null; adjust: Adjustments }) => {
    savedRef.current = next;
    setSavedState(next);
  };

  const current = history ? history.stack[history.index] : null;
  const width = current?.canvas.width ?? 0;
  const height = current?.canvas.height ?? 0;
  const pristine = Boolean(current?.original) && isIdentity(adjust);
  const dirty =
    current !== null &&
    !(saved.snap === current && sameAdjustments(saved.adjust, adjust));
  const zoom = zoomSetting === "fit" ? fit : zoomSetting;

  /* ── Load ─────────────────────────────────────────────────────────── */

  React.useEffect(() => {
    let live = true;
    decodeImage(originalBytes, format)
      .then((decoded) => {
        if (!live) return;
        const first: Snapshot = {
          canvas: decoded.canvas,
          adjust: NO_ADJUSTMENTS,
          original: true,
        };
        setVectorScale(decoded.vectorScale);
        setNativeDisplay(decoded.native);
        setHistory({ stack: [first], index: 0 });
        setSaved({ snap: first, adjust: NO_ADJUSTMENTS });
      })
      .catch((error: unknown) => {
        if (live)
          setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      live = false;
    };
    // Decoded once per mounted file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let live = true;
    void canEncode(format).then((ok) => live && !ok && setSaveFormat("png"));
    void writableFormats().then((list) => live && setExportFormats(list));
    return () => {
      live = false;
    };
  }, [format]);

  /* ── Saving ───────────────────────────────────────────────────────── */

  const save = async () => {
    const h = historyRef.current;
    if (!h) return;
    const snap = h.stack[h.index];
    const adj = adjustRef.current;
    const last = savedRef.current;
    if (last.snap === snap && sameAdjustments(last.adjust, adj)) return;
    try {
      const data =
        snap.original && isIdentity(adj)
          ? originalBytes // back to the start: keep the original bytes
          : await encodeImage(
              applyAdjustments(snap.canvas, adj),
              saveFormat,
              {},
              vectorScale,
            );
      await dispatch(saveContent(id, data));
      setSaved({ snap, adjust: adj });
    } catch (error) {
      setNotice({ tone: "error", text: `Not saved: ${errorText(error)}` });
    }
  };
  useSaveHandler(registerSave, save);
  const autosave = useBinaryAutosave(save);

  /** Pushes a new history step (pixels and/or colour settings). */
  const commit = (canvas: HTMLCanvasElement, next = adjustRef.current) => {
    const h = historyRef.current;
    if (!h) return;
    const top = h.stack[h.index];
    setAdjust(next);
    if (canvas === top.canvas && sameAdjustments(next, top.adjust)) return;
    const stack = [...h.stack.slice(0, h.index + 1), { canvas, adjust: next }];
    while (stack.length > HISTORY_LIMIT) stack.shift();
    setHistory({ stack, index: stack.length - 1 });
    setNotice(null);
    autosave.onChange();
  };

  const go = (delta: number) => {
    const h = historyRef.current;
    if (!h) return;
    const index = h.index + delta;
    if (index < 0 || index >= h.stack.length) return;
    setHistory({ ...h, index });
    setAdjust(h.stack[index].adjust);
    setCrop(null);
    autosave.onChange();
  };
  const canUndo = Boolean(history && history.index > 0);
  const canRedo = Boolean(history && history.index < history.stack.length - 1);

  /* ── Preview ──────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!current || (pristine && nativeDisplay)) return;
    const frame = requestAnimationFrame(() => {
      const display = canvasRef.current;
      if (!display) return;
      const src = current.canvas;
      const scale = isIdentity(adjust)
        ? 1
        : Math.min(1, PREVIEW_MAX / Math.max(src.width, src.height));
      const out = applyAdjustments(src, adjust, scale);
      display.width = out.width;
      display.height = out.height;
      context2d(display).drawImage(out, 0, 0);
      previewScaleRef.current = scale;
    });
    return () => cancelAnimationFrame(frame);
  }, [current, adjust, pristine, nativeDisplay]);

  /* ── Zoom ─────────────────────────────────────────────────────────── */

  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !width || !height) return;
    const measure = () => {
      const w = stage.clientWidth - STAGE_PAD * 2;
      const h = stage.clientHeight - STAGE_PAD * 2;
      setFit(Math.max(MIN_ZOOM, Math.min(1, w / width, h / height)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [width, height]);

  const zoomTo = (next: number) =>
    setZoomSetting(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  const zoomIn = () =>
    zoomTo(ZOOM_STEPS.find((s) => s > zoom + 0.001) ?? MAX_ZOOM);
  const zoomOut = () =>
    zoomTo([...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001) ?? MIN_ZOOM);

  // ⌘/Ctrl + wheel (and trackpad pinch) zooms; needs a non-passive listener.
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomSetting(
        Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, zoomRef.current * Math.exp(-e.deltaY * 0.002)),
        ),
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [history !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Crop ─────────────────────────────────────────────────────────── */

  const ratioOf = (aspect: string) =>
    aspect === "original"
      ? width / height
      : ASPECTS.find((a) => a.id === aspect)?.ratio;
  const aspectRatio = ratioOf(aspectId);

  const initialCrop = (aspect: string): PercentCrop => {
    const ratio = ratioOf(aspect);
    if (!ratio) return { unit: "%", x: 5, y: 5, width: 90, height: 90 };
    const wide = makeAspectCrop({ unit: "%", width: 90 }, ratio, width, height);
    const fitted =
      wide.height <= 100
        ? wide
        : makeAspectCrop({ unit: "%", height: 90 }, ratio, width, height);
    return centerCrop(fitted, width, height);
  };

  const startCrop = () => {
    setCrop(initialCrop(aspectId));
    setNotice(null);
  };
  const chooseAspect = (aspect: string) => {
    setAspectId(aspect);
    if (crop) setCrop(initialCrop(aspect));
  };
  const cropPx = crop
    ? {
        x: Math.round((crop.x * width) / 100),
        y: Math.round((crop.y * height) / 100),
        width: Math.max(1, Math.round((crop.width * width) / 100)),
        height: Math.max(1, Math.round((crop.height * height) / 100)),
      }
    : null;
  const setCropPx = (patch: Partial<NonNullable<typeof cropPx>>) => {
    if (!cropPx) return;
    const next = { ...cropPx, ...patch };
    if (aspectRatio && patch.width !== undefined)
      next.height = next.width / aspectRatio;
    if (aspectRatio && patch.height !== undefined)
      next.width = next.height * aspectRatio;
    next.width = Math.min(Math.max(1, next.width), width);
    next.height = Math.min(Math.max(1, next.height), height);
    next.x = Math.min(Math.max(0, next.x), width - next.width);
    next.y = Math.min(Math.max(0, next.y), height - next.height);
    setCrop({
      unit: "%",
      x: (next.x / width) * 100,
      y: (next.y / height) * 100,
      width: (next.width / width) * 100,
      height: (next.height / height) * 100,
    });
  };
  const applyCrop = () => {
    if (!current || !cropPx) return;
    commit(cropCanvas(current.canvas, cropPx));
    setCrop(null);
  };

  /* ── Geometry ─────────────────────────────────────────────────────── */

  const transform = (fn: (src: HTMLCanvasElement) => HTMLCanvasElement) => {
    if (!current) return;
    setCrop(null);
    commit(fn(current.canvas));
  };

  const trim = () => {
    if (!current) return;
    const bounds = opaqueBounds(current.canvas);
    if (!bounds) {
      setNotice({
        tone: "info",
        text: "Nothing to trim — the image is fully transparent.",
      });
    } else if (bounds.width === width && bounds.height === height) {
      setNotice({ tone: "info", text: "No transparent edges to trim." });
    } else {
      transform((src) => cropCanvas(src, bounds));
    }
  };

  const [resize, setResize] = React.useState({ w: "", h: "" });
  const [lockRatio, setLockRatio] = React.useState(true);
  React.useEffect(() => {
    if (width && height) setResize({ w: String(width), h: String(height) });
  }, [width, height]);
  const resizeW = Number(resize.w);
  const resizeH = Number(resize.h);
  const resizeValid =
    Number.isInteger(resizeW) &&
    Number.isInteger(resizeH) &&
    resizeW >= 1 &&
    resizeH >= 1 &&
    resizeW <= MAX_DIMENSION &&
    resizeH <= MAX_DIMENSION;
  const scaleTo = (factor: number) =>
    setResize({
      w: String(Math.max(1, Math.round(width * factor))),
      h: String(Math.max(1, Math.round(height * factor))),
    });
  const applyResize = async () => {
    if (!current || !resizeValid) return;
    setBusy("Resizing…");
    try {
      commit(await resizeCanvas(current.canvas, resizeW, resizeH));
    } catch (error) {
      setNotice({ tone: "error", text: `Resize failed: ${errorText(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const revert = () => {
    const first = historyRef.current?.stack.find((s) => s.original);
    if (!first) return;
    setCrop(null);
    commit(first.canvas, NO_ADJUSTMENTS);
  };

  /* ── Adjustments ──────────────────────────────────────────────────── */

  const setLive = (patch: Partial<Adjustments>) =>
    setAdjust({ ...adjustRef.current, ...patch });
  const commitAdjust = (next = adjustRef.current) => {
    if (current) commit(current.canvas, next);
  };
  const activePreset = ADJUSTMENT_PRESETS.find((p) =>
    sameAdjustments({ ...NO_ADJUSTMENTS, ...p.adjust }, adjust),
  )?.id;

  /* ── Export ───────────────────────────────────────────────────────── */

  const [exportFormat, setExportFormat] = React.useState<ImageFormat>(format);
  // Formats the browser can't write (HEIC, sometimes AVIF) aren't offered.
  React.useEffect(() => {
    if (exportFormats.length && !exportFormats.includes(exportFormat)) {
      setExportFormat("png");
    }
  }, [exportFormats, exportFormat]);
  const [quality, setQuality] = React.useState(90);
  const [background, setBackground] = React.useState("#ffffff");
  const exportInfo = IMAGE_FORMATS[exportFormat];

  const bake = () =>
    current ? applyAdjustments(current.canvas, adjustRef.current) : null;

  const exportBytes = async () => {
    const pixels = bake();
    if (!pixels) throw new Error("Nothing to export");
    return encodeImage(
      pixels,
      exportFormat,
      { quality: quality / 100, background },
      vectorScale,
    );
  };

  const runExport = async (target: "download" | "convert" | "copy") => {
    setBusy("Converting…");
    setNotice(null);
    try {
      const bytes = toArrayBuffer(await exportBytes());
      if (target === "download") {
        const fileName = `${baseName}.${exportInfo.ext}`;
        downloadFile(fileName, bytes, exportInfo.mime);
        setNotice({
          tone: "info",
          text: `Downloaded ${fileName} (${formatBytes(bytes.byteLength)}).`,
        });
      } else if (target === "convert") {
        // Replaces this file's image; the editor restarts on the new bytes.
        await dispatch(saveContent(id, bytes));
        onReplaced(bytes);
      } else {
        await dispatch(
          addFileWithContent(
            `${baseName}-${exportInfo.ext}.img`,
            parentId,
            bytes,
          ),
        );
      }
    } catch (error) {
      setNotice({ tone: "error", text: `Export failed: ${errorText(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setNotice(null);
    try {
      const pixels = bake();
      if (!pixels) return;
      const blob = await new Promise<Blob | null>((resolve) =>
        pixels.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("could not encode PNG");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      setNotice({ tone: "error", text: `Copy failed: ${errorText(error)}` });
    }
  };

  /* ── Pointer readout ──────────────────────────────────────────────── */

  const pointAt = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);
    if (!current || x < 0 || y < 0 || x >= width || y >= height) return null;
    const display = canvasRef.current;
    const usePreview = display && !(pristine && nativeDisplay);
    const scale = usePreview ? previewScaleRef.current : 1;
    const source = usePreview ? display : current.canvas;
    const sx = Math.min(source.width - 1, Math.floor(x * scale));
    const sy = Math.min(source.height - 1, Math.floor(y * scale));
    const [r, g, b, a] = context2d(source).getImageData(sx, sy, 1, 1).data;
    return { x, y, hex: toHex(r, g, b), alpha: a / 255 };
  };

  const copyColour = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setNotice({ tone: "info", text: `Copied ${hex}` });
    } catch {
      setNotice({ tone: "error", text: "Clipboard is not available." });
    }
  };

  /* ── Keyboard ─────────────────────────────────────────────────────── */

  const keyRef = React.useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      e.defaultPrevented ||
      target?.closest(
        "input, textarea, select, [contenteditable], [role=dialog]",
      )
    ) {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      go(e.shiftKey ? 1 : -1);
    } else if (mod && key === "y") {
      e.preventDefault();
      go(1);
    } else if (mod) {
      return;
    } else if (crop && e.key === "Enter") {
      e.preventDefault();
      applyCrop();
    } else if (crop && e.key === "Escape") {
      setCrop(null);
    } else if (e.key === "+" || e.key === "=") {
      zoomIn();
    } else if (e.key === "-") {
      zoomOut();
    } else if (e.key === "0") {
      setZoomSetting("fit");
    } else if (e.key === "1") {
      setZoomSetting(1);
    }
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Render ───────────────────────────────────────────────────────── */

  if (loadError) {
    return (
      <div
        className="image-pane__message"
        role="alert"
        data-testid="image-pane-error-message"
      >
        <IconAlertTriangle aria-hidden className="pane-icon" />
        {loadError}
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="image-pane-error-replace-button"
          onClick={onReplace}
        >
          <IconPhotoPlus aria-hidden className="pane-icon" />
          Import another image
        </Button>
      </div>
    );
  }
  if (!history || !current) {
    return (
      <div
        className="image-pane__message"
        data-testid="image-pane-loading-message"
      >
        Opening image…
      </div>
    );
  }

  const frame = (
    <div
      className="image-pane__frame"
      style={{ width: width * zoom, height: height * zoom }}
      data-testid="image-pane-preview-content"
      onPointerMove={(e) => setReadout(pointAt(e))}
      onPointerLeave={() => setReadout(null)}
      onClick={(e) => {
        if (crop) return;
        const point = pointAt(e);
        if (point) void copyColour(point.hex);
      }}
    >
      {pristine && nativeDisplay && originalUrl ? (
        <img
          className="image-pane__picture"
          src={originalUrl}
          alt={name}
          draggable={false}
        />
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={name}
          className={cn(
            "image-pane__picture",
            zoom >= 4 && "image-pane__picture--pixelated",
          )}
        />
      )}
    </div>
  );

  return (
    <>
      <FileBarSlot>
        <ButtonGroup aria-label="History">
          <BarIconButton
            label="Undo (⌘Z)"
            testId="image-pane-undo-button"
            disabled={!canUndo}
            onClick={() => go(-1)}
          >
            <IconArrowBackUp />
          </BarIconButton>
          <BarIconButton
            label="Redo (⇧⌘Z)"
            testId="image-pane-redo-button"
            disabled={!canRedo}
            onClick={() => go(1)}
          >
            <IconArrowForwardUp />
          </BarIconButton>
        </ButtonGroup>
        <ButtonGroup aria-label="Zoom">
          <BarIconButton
            label="Zoom out (−)"
            testId="image-pane-zoom-out-button"
            onClick={zoomOut}
          >
            <IconZoomOut />
          </BarIconButton>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(ui.paneToolbarBtn, "image-pane__zoom-label")}
            data-testid="image-pane-zoom-button"
            title={
              zoomSetting === "fit" ? "Show at 100% (1)" : "Fit to window (0)"
            }
            onClick={() => setZoomSetting(zoomSetting === "fit" ? 1 : "fit")}
          >
            {zoomSetting === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </Button>
          <BarIconButton
            label="Zoom in (+)"
            testId="image-pane-zoom-in-button"
            onClick={zoomIn}
          >
            <IconZoomIn />
          </BarIconButton>
        </ButtonGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="image-pane-replace-button"
          title="Import a different image into this file"
          onClick={onReplace}
        >
          <IconPhotoPlus aria-hidden className="pane-icon" />
          Replace
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ui.paneToolbarBtn}
          data-testid="image-pane-copy-button"
          title="Copy the edited image as PNG"
          onClick={() => void copy()}
        >
          {copied ? (
            <IconCheck aria-hidden className="pane-icon" />
          ) : (
            <IconCopy aria-hidden className="pane-icon" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          size="sm"
          className={ui.paneToolbarSolidBtn}
          data-testid="image-pane-save-button"
          disabled={!dirty}
          title={`Save edits to ${name} as ${IMAGE_FORMATS[saveFormat].label} (⌘S)`}
          onClick={() => void save()}
        >
          <IconDeviceFloppy aria-hidden className="pane-icon" />
          Save
        </Button>
      </FileBarSlot>

      <div
        className="image-pane"
        data-testid="image-pane"
        {...autosave.guardProps}
      >
        <div className="image-pane__viewer">
          <div ref={stageRef} className="image-pane__stage">
            <div className="image-pane__canvas-area">
              {/* Always mounted (disabled outside crop mode) so the preview
                  canvas keeps its pixels when cropping starts or ends. */}
              <ReactCrop
                crop={crop ?? undefined}
                disabled={!crop}
                aspect={aspectRatio}
                keepSelection
                ruleOfThirds
                className="image-pane__crop"
                style={{ maxWidth: "none" }}
                onChange={(_, percent) => setCrop(percent)}
              >
                {frame}
              </ReactCrop>
            </div>
          </div>

          <div className="image-pane__status" data-testid="image-pane-status">
            <span
              className="image-pane__status-item"
              data-testid="image-pane-size-message"
            >
              {width} × {height} px · {info.label}
              {current.original && originalBytes
                ? ` · ${formatBytes(originalBytes.byteLength)}`
                : ""}
            </span>
            {crop && cropPx ? (
              <span className="image-pane__status-item">
                Crop {cropPx.width} × {cropPx.height}
              </span>
            ) : null}
            {readout ? (
              <span
                className="image-pane__status-item"
                data-testid="image-pane-readout-message"
              >
                <span
                  aria-hidden
                  className="image-pane__swatch"
                  style={{
                    backgroundColor: readout.hex,
                    opacity: readout.alpha,
                  }}
                />
                {readout.hex}
                {readout.alpha < 1
                  ? ` · ${Math.round(readout.alpha * 100)}%`
                  : ""}{" "}
                · {readout.x}, {readout.y}
              </span>
            ) : null}
            <span className="image-pane__status-spacer" />
            {busy ? (
              <span className="image-pane__status-item" role="status">
                {busy}
              </span>
            ) : notice ? (
              <span
                className={cn(
                  "image-pane__status-item",
                  notice.tone === "error" && "image-pane__status-item--error",
                )}
                role={notice.tone === "error" ? "alert" : "status"}
                data-testid="image-pane-notice-message"
              >
                {notice.tone === "error" ? (
                  <IconAlertTriangle aria-hidden className="pane-icon" />
                ) : null}
                {notice.text}
              </span>
            ) : (
              <span className="image-pane__status-item image-pane__status-item--hint">
                Click to copy a colour · ⌘-scroll to zoom
              </span>
            )}
          </div>
        </div>

        <aside className="image-pane__side" aria-label="Image tools">
          {saveFormat !== format ? (
            <p
              className="image-pane__note"
              data-testid="image-pane-save-format-message"
            >
              <IconAlertTriangle aria-hidden className="pane-icon" />
              This browser can't write {info.label}, so edits are saved as{" "}
              {IMAGE_FORMATS[saveFormat].label}.
            </p>
          ) : format === "svg" ? (
            <p className="image-pane__note">
              Saving edits stores the picture as pixels inside the SVG.
            </p>
          ) : format === "gif" ? (
            <p className="image-pane__note">
              Saving edits keeps the first frame of an animated GIF.
            </p>
          ) : null}

          <Tabs defaultValue="edit" className="image-pane__tabs">
            <TabsList variant="line" className="image-pane__tab-list">
              <TabsTrigger
                value="edit"
                data-testid="image-pane-edit-tab-trigger"
              >
                Edit
              </TabsTrigger>
              <TabsTrigger
                value="adjust"
                data-testid="image-pane-adjust-tab-trigger"
              >
                Adjust
              </TabsTrigger>
              <TabsTrigger
                value="export"
                data-testid="image-pane-export-tab-trigger"
              >
                Export
              </TabsTrigger>
            </TabsList>

            {/* ── Edit ── */}
            <TabsContent value="edit" className="image-pane__panel">
              <Section title="Crop">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="image-pane__chips"
                  aria-label="Crop aspect ratio"
                  value={aspectId}
                  onValueChange={(value) => value && chooseAspect(value)}
                >
                  {ASPECTS.map((a) => (
                    <ToggleGroupItem
                      key={a.id}
                      value={a.id}
                      data-testid={`image-pane-aspect-${a.id.replace(":", "-")}-button`}
                    >
                      {a.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {crop && cropPx ? (
                  <>
                    <div className="image-pane__grid">
                      <NumberField
                        label="X"
                        testId="image-pane-crop-x-input"
                        value={cropPx.x}
                        onChange={(x) => setCropPx({ x })}
                      />
                      <NumberField
                        label="Y"
                        testId="image-pane-crop-y-input"
                        value={cropPx.y}
                        onChange={(y) => setCropPx({ y })}
                      />
                      <NumberField
                        label="Width"
                        testId="image-pane-crop-width-input"
                        value={cropPx.width}
                        onChange={(w) => setCropPx({ width: w })}
                      />
                      <NumberField
                        label="Height"
                        testId="image-pane-crop-height-input"
                        value={cropPx.height}
                        onChange={(h) => setCropPx({ height: h })}
                      />
                    </div>
                    <div className="image-pane__actions">
                      <Button
                        type="button"
                        size="sm"
                        data-testid="image-pane-crop-apply-button"
                        onClick={applyCrop}
                      >
                        <IconCheck aria-hidden className="pane-icon" />
                        Apply crop
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="image-pane-crop-cancel-button"
                        onClick={() => setCrop(null)}
                      >
                        <IconX aria-hidden className="pane-icon" />
                        Cancel
                      </Button>
                    </div>
                    <p className="pane-field__hint">
                      Drag the box or its handles. Enter applies, Esc cancels.
                    </p>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="image-pane-crop-button"
                    onClick={startCrop}
                  >
                    <IconCrop aria-hidden className="pane-icon" />
                    Crop…
                  </Button>
                )}
              </Section>

              <Section title="Transform">
                <div className="image-pane__grid">
                  <ToolButton
                    testId="image-pane-rotate-left-button"
                    onClick={() => transform((c) => rotateQuarter(c, -1))}
                  >
                    <IconRotate2 aria-hidden className="pane-icon" />
                    Rotate left
                  </ToolButton>
                  <ToolButton
                    testId="image-pane-rotate-right-button"
                    onClick={() => transform((c) => rotateQuarter(c, 1))}
                  >
                    <IconRotateClockwise2 aria-hidden className="pane-icon" />
                    Rotate right
                  </ToolButton>
                  <ToolButton
                    testId="image-pane-flip-horizontal-button"
                    onClick={() => transform((c) => flip(c, "horizontal"))}
                  >
                    <IconFlipVertical aria-hidden className="pane-icon" />
                    Flip H
                  </ToolButton>
                  <ToolButton
                    testId="image-pane-flip-vertical-button"
                    onClick={() => transform((c) => flip(c, "vertical"))}
                  >
                    <IconFlipHorizontal aria-hidden className="pane-icon" />
                    Flip V
                  </ToolButton>
                  <ToolButton testId="image-pane-trim-button" onClick={trim}>
                    <IconBorderCorners aria-hidden className="pane-icon" />
                    Trim edges
                  </ToolButton>
                </div>
              </Section>

              <Section title="Resize">
                <div className="image-pane__grid">
                  <NumberField
                    label="Width"
                    testId="image-pane-resize-width-input"
                    value={resize.w}
                    onChange={(w) =>
                      setResize({
                        w: String(w),
                        h:
                          lockRatio && w > 0
                            ? String(
                                Math.max(1, Math.round((w * height) / width)),
                              )
                            : resize.h,
                      })
                    }
                  />
                  <NumberField
                    label="Height"
                    testId="image-pane-resize-height-input"
                    value={resize.h}
                    onChange={(h) =>
                      setResize({
                        h: String(h),
                        w:
                          lockRatio && h > 0
                            ? String(
                                Math.max(1, Math.round((h * width) / height)),
                              )
                            : resize.w,
                      })
                    }
                  />
                </div>
                <label className="pane-field__check">
                  <Switch
                    size="sm"
                    checked={lockRatio}
                    onCheckedChange={setLockRatio}
                    data-testid="image-pane-lock-ratio-switch"
                  />
                  Keep aspect ratio
                </label>
                <div className="image-pane__actions">
                  {[0.25, 0.5, 2].map((f) => (
                    <Button
                      key={f}
                      type="button"
                      variant="outline"
                      size="xs"
                      data-testid={`image-pane-scale-${f * 100}-button`}
                      onClick={() => scaleTo(f)}
                    >
                      {f * 100}%
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !resizeValid ||
                    (resizeW === width && resizeH === height) ||
                    busy !== null
                  }
                  data-testid="image-pane-resize-apply-button"
                  onClick={() => void applyResize()}
                >
                  Resize to {resizeValid ? `${resizeW} × ${resizeH}` : "…"}
                </Button>
                {!resizeValid ? (
                  <p className="pane-field__hint">
                    Whole pixels from 1 to {MAX_DIMENSION}.
                  </p>
                ) : null}
              </Section>

              <Section title="History">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="image-pane-revert-button"
                  disabled={pristine}
                  onClick={revert}
                >
                  <IconRestore aria-hidden className="pane-icon" />
                  Revert to original
                </Button>
              </Section>
            </TabsContent>

            {/* ── Adjust ── */}
            <TabsContent value="adjust" className="image-pane__panel">
              <Section title="Presets">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="image-pane__chips"
                  aria-label="Look"
                  value={activePreset ?? ""}
                  onValueChange={(value) => {
                    const preset = ADJUSTMENT_PRESETS.find(
                      (p) => p.id === value,
                    );
                    if (preset)
                      commitAdjust({ ...NO_ADJUSTMENTS, ...preset.adjust });
                  }}
                >
                  {ADJUSTMENT_PRESETS.map((p) => (
                    <ToggleGroupItem
                      key={p.id}
                      value={p.id}
                      data-testid={`image-pane-preset-${p.id}-button`}
                    >
                      {p.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Section>
              <Section title="Light & colour">
                {SLIDERS.map((s) => (
                  <Slider
                    key={s.key}
                    size="sm"
                    label={s.label}
                    data-testid={`image-pane-${s.key}-slider`}
                    min={s.min}
                    max={s.max}
                    step={1}
                    value={adjust[s.key]}
                    formatValue={(v) =>
                      `${v > 0 && s.min < 0 ? "+" : ""}${v}${s.unit ?? ""}`
                    }
                    onValueChange={(v) => setLive({ [s.key]: v })}
                    onValueCommit={() => commitAdjust()}
                  />
                ))}
                <label className="pane-field__check">
                  <Switch
                    size="sm"
                    checked={adjust.invert}
                    onCheckedChange={(invert) =>
                      commitAdjust({ ...adjustRef.current, invert })
                    }
                    data-testid="image-pane-invert-switch"
                  />
                  Invert colours
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isIdentity(adjust)}
                  data-testid="image-pane-adjust-reset-button"
                  onClick={() => commitAdjust(NO_ADJUSTMENTS)}
                >
                  <IconRestore aria-hidden className="pane-icon" />
                  Reset adjustments
                </Button>
              </Section>
            </TabsContent>

            {/* ── Export ── */}
            <TabsContent value="export" className="image-pane__panel">
              <Section title="Convert">
                <div className="pane-field">
                  <span className="pane-field__label">Format</span>
                  <Select
                    value={exportFormat}
                    onValueChange={(v) => setExportFormat(v as ImageFormat)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="pane-field__select"
                      aria-label="Format"
                      data-testid="image-pane-format-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {exportFormats.map((f) => (
                        <SelectItem key={f} value={f}>
                          {IMAGE_FORMATS[f].label} (.{IMAGE_FORMATS[f].ext})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {exportInfo.lossy ? (
                  <Slider
                    size="sm"
                    label="Quality"
                    data-testid="image-pane-quality-slider"
                    min={10}
                    max={100}
                    step={1}
                    value={quality}
                    formatValue={(v) => `${v}%`}
                    onValueChange={setQuality}
                  />
                ) : null}
                {!exportInfo.alpha ? (
                  <div className="pane-field">
                    <span className="pane-field__label">
                      Background (for transparency)
                    </span>
                    <div className="pane-field__row">
                      <input
                        type="color"
                        className="pane-field__color"
                        aria-label="Background colour"
                        data-testid="image-pane-background-input"
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                      />
                      <span className="pane-field__hint">{background}</span>
                    </div>
                  </div>
                ) : null}
                {exportFormat === "ico" ? (
                  <p className="pane-field__hint">
                    Icons are scaled to fit 256 × 256.
                  </p>
                ) : exportFormat === "gif" ? (
                  <p className="pane-field__hint">
                    GIF keeps up to 256 colours.
                  </p>
                ) : exportFormat === "svg" ? (
                  <p className="pane-field__hint">
                    The SVG embeds the pixels as PNG.
                  </p>
                ) : null}
                <div className="image-pane__actions image-pane__actions--list">
                  <Button
                    type="button"
                    className="image-pane__action"
                    size="sm"
                    disabled={busy !== null}
                    data-testid="image-pane-export-download-button"
                    onClick={() => void runExport("download")}
                  >
                    <IconDownload aria-hidden className="pane-icon" />
                    Download
                  </Button>
                  <Button
                    type="button"
                    className="image-pane__action"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    data-testid="image-pane-export-convert-button"
                    title={`Store this file's image as ${exportInfo.label} (clears undo history)`}
                    onClick={() => void runExport("convert")}
                  >
                    <IconRefresh aria-hidden className="pane-icon" />
                    Convert this file
                  </Button>
                  <Button
                    type="button"
                    className="image-pane__action"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    data-testid="image-pane-export-save-copy-button"
                    title={`Add ${baseName}-${exportInfo.ext}.img next to this file`}
                    onClick={() => void runExport("copy")}
                  >
                    <IconFilePlus aria-hidden className="pane-icon" />
                    Save as new .img
                  </Button>
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </>
  );
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="image-pane__section">
      <h3 className="image-pane__heading">{title}</h3>
      {children}
    </section>
  );
}

function BarIconButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={label}
          data-testid={testId}
          disabled={disabled}
          className={cn(ui.paneToolbarBtn, "image-pane__bar-icon")}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolButton({
  testId,
  onClick,
  children,
}: {
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="image-pane__tool"
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Whole-number field; reports only valid numbers, keeps the draft text. */
function NumberField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: number | string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="pane-field">
      <span className="pane-field__label">{label}</span>
      <Input
        inputMode="numeric"
        data-testid={testId}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(next)) {
            onChange(Math.round(next));
          }
        }}
      />
    </label>
  );
}
