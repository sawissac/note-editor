import "@/styles/mermaid-zoom.css";
import {
  IconAlertTriangle,
  IconFileTypePng,
  IconFileTypeSvg,
  IconLoader2,
  IconMaximize,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import * as React from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { MERMAID_STARTER } from "@/lib/blank-documents";
import { cn } from "@/lib/cn";
import { renderMermaidPng, renderMermaidSvg } from "@/lib/mermaid-render";
import { downloadFile } from "@/lib/storage";
import * as ui from "@/lib/ui-styles";
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { TabMode } from "@/store/tabs-slice";
import { FileBarSlot } from "@/features/editors/file-bar-slot";
import { LazyCodeEditor } from "@/features/editors/LazyCodeEditor";
import { useDebouncedSave } from "@/features/editors/use-file-content";
import {
  type PaneProps,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { DiagramSkeleton } from "@/features/editors/PaneSkeleton";

type Rendered =
  | { status: "idle" }
  | { status: "ok"; svg: string }
  | { status: "error"; error: string; svg?: string };

/**
 * Renders mermaid source to SVG, debounced. Keeps the last good diagram on
 * screen while the source has a syntax error.
 */
function useMermaidSvg(source: string, isDark: boolean, delay = 250) {
  const [state, setState] = React.useState<Rendered>({ status: "idle" });
  React.useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      if (!source.trim()) {
        setState({ status: "idle" });
        return;
      }
      try {
        const svg = await renderMermaidSvg(source, {
          theme: isDark ? "dark" : "default",
        });
        if (live) setState({ status: "ok", svg });
      } catch (error) {
        if (!live) return;
        const message = error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          status: "error",
          error: message,
          svg: prev.status === "idle" ? undefined : prev.svg,
        }));
      }
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [source, isDark, delay]);
  return state;
}

/** The diagram's own size, from the SVG's viewBox (zoom 100%). */
function svgSize(svg: string) {
  const box = svg.match(
    /viewBox="(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+)"/,
  );
  const width = box ? Number(box[3]) : 0;
  const height = box ? Number(box[4]) : 0;
  return width > 0 && height > 0
    ? { width, height }
    : { width: 800, height: 600 };
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** Room kept around the diagram when fitting it to the pane. */
const FIT_PADDING = 32;

/**
 * Pan / zoom stage for the rendered SVG: wheel or pinch to zoom at the
 * cursor, drag (one finger on touch) to pan, double-click / double-tap to
 * zoom in. Opens fitted to the pane
 * (never above 100%); the transform survives re-renders while editing.
 */
function MermaidZoom({ svg }: { svg: string }) {
  const zoom = React.useRef<ReactZoomPanPinchRef>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const size = svgSize(svg);

  const fit = React.useCallback(
    (animate = true) => {
      const box = stage.current?.getBoundingClientRect();
      if (!zoom.current || !box?.width || !box.height) return;
      const s = Math.max(
        MIN_ZOOM,
        Math.min(
          1,
          (box.width - FIT_PADDING * 2) / size.width,
          (box.height - FIT_PADDING * 2) / size.height,
        ),
      );
      zoom.current.centerView(s, animate ? 200 : 0);
    },
    [size.width, size.height],
  );

  // Open fitted once the stage and the zoom instance exist (the wrapper's
  // onInit fires before its ref is attached). Later edits keep the view.
  const fitted = React.useRef(false);
  React.useEffect(() => {
    if (fitted.current) return;
    const frame = requestAnimationFrame(() => {
      fitted.current = true;
      fit(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [fit]);

  return (
    <div ref={stage} className="mermaid-zoom" data-testid="mermaid-pane-zoom">
      <TransformWrapper
        ref={zoom}
        minScale={MIN_ZOOM}
        maxScale={MAX_ZOOM}
        limitToBounds={false}
        wheel={{ step: 0.002 }}
        doubleClick={{ step: 0.7 }}
        onTransform={(_, state) => setScale(state.scale)}
      >
        <TransformComponent
          wrapperClass="mermaid-zoom__viewport"
          wrapperStyle={{ width: "100%", height: "100%" }}
        >
          <div
            className="mermaid-zoom__diagram"
            style={{ width: size.width, height: size.height }}
            // Mermaid output, sanitized by securityLevel "strict".
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </TransformComponent>
      </TransformWrapper>
      <div
        className="mermaid-zoom__controls"
        role="toolbar"
        aria-label="Zoom"
        data-testid="mermaid-pane-zoom-controls"
      >
        <button
          type="button"
          className="mermaid-zoom__button"
          aria-label="Zoom out"
          title="Zoom out"
          data-testid="mermaid-pane-zoom-out-button"
          onClick={() => zoom.current?.zoomOut(0.25)}
        >
          <IconZoomOut />
        </button>
        <button
          type="button"
          className="mermaid-zoom__level"
          aria-label="Reset zoom to 100%"
          title="Reset to 100%"
          data-testid="mermaid-pane-zoom-reset-button"
          onClick={() => zoom.current?.centerView(1, 200)}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="mermaid-zoom__button"
          aria-label="Zoom in"
          title="Zoom in"
          data-testid="mermaid-pane-zoom-in-button"
          onClick={() => zoom.current?.zoomIn(0.25)}
        >
          <IconZoomIn />
        </button>
        <button
          type="button"
          className="mermaid-zoom__button"
          aria-label="Fit to view"
          title="Fit to view"
          data-testid="mermaid-pane-zoom-fit-button"
          onClick={() => fit()}
        >
          <IconMaximize />
        </button>
      </div>
    </div>
  );
}

function MermaidPreview({
  source,
  isDark,
}: {
  source: string;
  isDark: boolean;
}) {
  const state = useMermaidSvg(source, isDark);
  const svg = state.status === "idle" ? undefined : state.svg;
  return (
    <div
      data-testid="mermaid-pane-preview-content"
      className="bg-app-bg relative flex h-full flex-col"
    >
      {svg ? (
        <MermaidZoom svg={svg} />
      ) : state.status === "idle" && source.trim() ? (
        // Mermaid is still loading or drawing the first frame.
        <DiagramSkeleton />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-8">
          {state.status === "idle" ? (
            <p
              data-testid="mermaid-pane-empty-message"
              className="font-description text-app-dim pt-16 text-center text-[12px]"
            >
              Nothing to render yet — write a diagram in Edit mode.
            </p>
          ) : null}
        </div>
      )}
      {state.status === "error" ? (
        <pre
          data-testid="mermaid-pane-error-message"
          className="border-app-border bg-app-panel text-app-error max-h-40 shrink-0 overflow-auto border-t px-4 py-2 font-mono text-[11px] whitespace-pre-wrap"
        >
          {state.error}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * "Download as image" in the file bar: PNG (2× resolution) or SVG, both in
 * the light theme on white so they read anywhere they are pasted.
 */
function MermaidImageActions({
  name,
  source,
}: {
  name: string;
  source: string;
}) {
  const [busy, setBusy] = React.useState<"png" | "svg" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const base = name.replace(/\.[^.]+$/, "") || "diagram";

  const download = async (format: "png" | "svg") => {
    setBusy(format);
    setError(null);
    try {
      if (format === "png") {
        const { png } = await renderMermaidPng(source, 2);
        downloadFile(`${base}.png`, png.slice().buffer, "image/png");
      } else {
        const svg = await renderMermaidSvg(source, {
          theme: "default",
          htmlLabels: false,
        });
        downloadFile(`${base}.svg`, svg, "image/svg+xml");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const disabled = !source.trim() || busy !== null;
  return (
    <ButtonGroup aria-label="Download as image">
      {error ? (
        <span
          data-testid="mermaid-pane-image-error-message"
          title={error}
          className="text-app-error flex items-center gap-1 px-1.5 font-mono text-[11px]"
        >
          <IconAlertTriangle className="size-3.5" /> Fix diagram
        </span>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        data-testid="mermaid-pane-download-png-button"
        title="Download as PNG image"
        disabled={disabled}
        className={cn(ui.paneToolbarBtn)}
        onClick={() => void download("png")}
      >
        {busy === "png" ? (
          <IconLoader2 className="animate-spin" />
        ) : (
          <IconFileTypePng />
        )}
        PNG
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="mermaid-pane-download-svg-button"
        title="Download as SVG image"
        disabled={disabled}
        className={cn(ui.paneToolbarBtn)}
        onClick={() => void download("svg")}
      >
        {busy === "svg" ? (
          <IconLoader2 className="animate-spin" />
        ) : (
          <IconFileTypeSvg />
        )}
        SVG
      </Button>
    </ButtonGroup>
  );
}

/**
 * Mermaid diagrams: edit mode splits raw source and a live preview; view mode
 * shows the rendered diagram alone. The text is the source of truth.
 */
export default function MermaidPane({
  id,
  name,
  content,
  mode,
  isDark,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const [text, setText] = React.useState(
    typeof content === "string" ? content : "",
  );
  const [focusOnMount] = React.useState(autoFocus);
  const save = useDebouncedSave(
    (value) => void dispatch(saveContent(id, value)),
  );
  useSaveHandler(registerSave, () => dispatch(saveContent(id, text)));
  // A tablet held upright is too narrow for source | preview side by side:
  // stack them (source above). Orientation only, so both stay mounted.
  const stacked = useMediaQuery(`${BREAKPOINT.compact} and ${BREAKPOINT.coarse}`);

  const actions = (
    <FileBarSlot>
      <MermaidImageActions name={name} source={text} />
    </FileBarSlot>
  );

  if (mode === "view") {
    return (
      <>
        {actions}
        <MermaidPreview source={text} isDark={isDark} />
      </>
    );
  }

  return (
    <>
      {actions}
      <ResizableGroup orientation={stacked ? "vertical" : "horizontal"}>
        <ResizablePanel defaultSize="50%" minSize="240px">
          <LazyCodeEditor
            path={`${id}.mermaid`}
            language="mermaid"
            aria-label="Mermaid source"
            data-testid="mermaid-pane-raw-input"
            placeholder={MERMAID_STARTER}
            autoFocus={focusOnMount}
            defaultValue={text}
            onChange={(value) => {
              setText(value);
              save(value);
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize="240px">
          <MermaidPreview source={text} isDark={isDark} />
        </ResizablePanel>
      </ResizableGroup>
    </>
  );
}
