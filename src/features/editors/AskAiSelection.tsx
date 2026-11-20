import { IconSparkles } from "@tabler/icons-react";
import * as React from "react";
import { createPortal } from "react-dom";

import {
  type AskAiRequest,
  CODE_SELECTION_EVENT,
  type CodeSelection,
} from "@/lib/ask-ai";
import { useCoarsePointer } from "@/lib/use-media-query";

type Picked = {
  text: string;
  where?: string;
  rect: DOMRect;
  replace?: (text: string) => void;
  /** Code editors report their own selection; DOM selections are polled. */
  source: "dom" | "code";
};

/** Button box (px), mouse / touch — keep in step with `.ask-ai` in ask-ai.css. */
const BUTTON_SIZE = {
  fine: { width: 92, height: 28 },
  coarse: { width: 104, height: 36 },
} as const;
/**
 * Touch: room under a text selection for the end grab handle, so the button
 * clears it (iOS puts its own Copy / Look Up callout above the selection).
 */
const HANDLE_CLEARANCE = 18;

/**
 * Floating "Ask AI" button over text selected inside a pane: a DOM
 * selection (Markdown, Word, PDF text…) or a code editor's selection
 * (reported through {@link CODE_SELECTION_EVENT}). Clicking opens the
 * inline Ask AI panel about that text (`onAsk`).
 *
 * Works for touch selections too: it follows `selectionchange` (plus
 * `pointerup`, when a drag-select ends), not mouse events. On a touch screen
 * the button is finger-sized and sits *below* a text selection, clear of the
 * system's own callout, and a press on it holds the current selection so the
 * tap cannot dismiss the button before it lands.
 *
 * CSS: BEM block `ask-ai` (`src/styles/ask-ai.css`).
 */
export function AskAiSelection({
  containerRef,
  onAsk,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  onAsk: (request: AskAiRequest) => void;
}) {
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const onAskRef = React.useRef(onAsk);
  onAskRef.current = onAsk;
  const coarse = useCoarsePointer();
  // True from a press on the button until its click: on touch screens the
  // tap itself can collapse the selection, which must not unmount the button.
  const holdRef = React.useRef(false);

  const ask = React.useCallback(
    (p: {
      text: string;
      where?: string;
      rect: DOMRect;
      replace?: (t: string) => void;
    }) => {
      onAskRef.current({
        context: p.text,
        where: p.where ?? "selection",
        anchor: p.rect,
        replace: p.replace,
      });
      holdRef.current = false;
      setPicked(null);
    },
    [],
  );

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const fromDom = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (holdRef.current) return;
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        const text = sel?.toString() ?? "";
        if (
          !range ||
          sel!.isCollapsed ||
          !text.trim() ||
          !el.contains(range.commonAncestorContainer)
        ) {
          setPicked((p) => (p?.source === "dom" ? null : p));
          return;
        }
        setPicked({ text, rect: range.getBoundingClientRect(), source: "dom" });
      }, 150);
    };

    const fromCode = (e: Event) => {
      const detail = (e as CustomEvent<CodeSelection | null>).detail;
      if (!detail) {
        setPicked((p) => (p?.source === "code" ? null : p));
        return;
      }
      if (detail.ask) {
        ask(detail);
        return;
      }
      setPicked({ ...detail, source: "code" });
    };

    // Stale box once the page scrolls under it; DOM selections re-measure.
    const onScroll = (e: Event) => {
      if (!el.contains(e.target as Node)) return;
      setPicked((p) => (p?.source === "dom" ? null : p));
      fromDom();
    };

    document.addEventListener("selectionchange", fromDom);
    // Ending a drag-select (mouse or finger): measure the final range.
    el.addEventListener("pointerup", fromDom);
    el.addEventListener(CODE_SELECTION_EVENT, fromCode);
    el.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", fromDom);
      el.removeEventListener("pointerup", fromDom);
      el.removeEventListener(CODE_SELECTION_EVENT, fromCode);
      el.removeEventListener("scroll", onScroll, true);
    };
  }, [containerRef, ask]);

  if (!picked) return null;
  const { width: BUTTON_WIDTH, height: BUTTON_HEIGHT } =
    BUTTON_SIZE[coarse ? "coarse" : "fine"];
  const pane = containerRef.current?.getBoundingClientRect();
  const paneBottom = pane?.bottom ?? window.innerHeight;
  // Text: above the selection's end (below it on touch, clear of the end
  // handle and the system callout; above when there is no room below).
  // Code: right after the last selected line's text, on that line. Always
  // kept inside the pane.
  const below = picked.rect.bottom + HANDLE_CLEARANCE;
  const rawTop =
    picked.source === "code"
      ? picked.rect.top + picked.rect.height / 2 - BUTTON_HEIGHT / 2
      : coarse && below + BUTTON_HEIGHT <= paneBottom - 4
        ? below
        : picked.rect.top - BUTTON_HEIGHT - 6;
  const rawLeft =
    picked.source === "code"
      ? picked.rect.left + 16
      : picked.rect.right - BUTTON_WIDTH;
  const top = Math.min(
    Math.max((pane?.top ?? 0) + 4, rawTop),
    paneBottom - BUTTON_HEIGHT - 4,
  );
  const left = Math.min(
    Math.max((pane?.left ?? 0) + 4, rawLeft),
    (pane?.right ?? window.innerWidth) - BUTTON_WIDTH - 4,
  );
  return createPortal(
    <button
      type="button"
      className="ask-ai"
      style={{ top, left }}
      title="Ask AI about the selected text"
      data-testid="ask-ai-selection-button"
      // Keep the selection (and the button) while pressing.
      onPointerDown={() => {
        holdRef.current = true;
      }}
      // Dragged off or cancelled: let the selection decide again.
      onPointerLeave={() => {
        holdRef.current = false;
      }}
      onPointerCancel={() => {
        holdRef.current = false;
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => ask(picked)}
    >
      <IconSparkles aria-hidden className="ask-ai__icon" />
      Ask AI
    </button>,
    document.body,
  );
}
