import {
  IconAlertTriangle,
  IconFileTypePng,
  IconFileTypeSvg,
  IconLoader2,
} from "@tabler/icons-react";
import * as React from "react";

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
      <div className="min-h-0 flex-1 overflow-auto p-8">
        {svg ? (
          <div
            className="mx-auto flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
            // Mermaid output, sanitized by securityLevel "strict".
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : state.status === "idle" ? (
          <p
            data-testid="mermaid-pane-empty-message"
            className="font-description text-app-dim pt-16 text-center text-[12px]"
          >
            Nothing to render yet — write a diagram in Edit mode.
          </p>
        ) : null}
      </div>
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
      <ResizableGroup orientation="horizontal">
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
