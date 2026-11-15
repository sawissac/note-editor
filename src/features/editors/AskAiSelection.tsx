import { IconSparkles } from "@tabler/icons-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { CODE_SELECTION_EVENT, type CodeSelection } from "@/lib/ask-ai";
import { askAiAboutSelection } from "@/store/actions";
import { useAppDispatch } from "@/store";

type Picked = {
  text: string;
  where?: string;
  rect: DOMRect;
  /** Code editors report their own selection; DOM selections are polled. */
  source: "dom" | "code";
};

const BUTTON_WIDTH = 92;
const BUTTON_HEIGHT = 28;

/**
 * Floating "Ask AI" button over text selected inside a pane: a DOM
 * selection (Markdown, Word, PDF text…) or a code editor's selection
 * (reported through {@link CODE_SELECTION_EVENT}). Clicking hands the text
 * to a chat as a reference (see `askAiAboutSelection`).
 *
 * CSS: BEM block `ask-ai` (`src/styles/ask-ai.css`).
 */
export function AskAiSelection({
  fileId,
  containerRef,
}: {
  fileId: string;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const dispatch = useAppDispatch();
  const [picked, setPicked] = React.useState<Picked | null>(null);

  const ask = React.useCallback(
    (p: { text: string; where?: string }) => {
      dispatch(askAiAboutSelection(fileId, p.text, p.where));
      setPicked(null);
    },
    [dispatch, fileId],
  );

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const fromDom = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
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
    el.addEventListener(CODE_SELECTION_EVENT, fromCode);
    el.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", fromDom);
      el.removeEventListener(CODE_SELECTION_EVENT, fromCode);
      el.removeEventListener("scroll", onScroll, true);
    };
  }, [containerRef, ask]);

  if (!picked) return null;
  const pane = containerRef.current?.getBoundingClientRect();
  // Text: above the selection's end. Code: right after the last selected
  // line's text, on that line. Always kept inside the pane.
  const rawTop =
    picked.source === "code"
      ? picked.rect.top + picked.rect.height / 2 - BUTTON_HEIGHT / 2
      : picked.rect.top - BUTTON_HEIGHT - 6;
  const rawLeft =
    picked.source === "code"
      ? picked.rect.left + 16
      : picked.rect.right - BUTTON_WIDTH;
  const top = Math.min(
    Math.max((pane?.top ?? 0) + 4, rawTop),
    (pane?.bottom ?? window.innerHeight) - BUTTON_HEIGHT - 4,
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
      title="Ask AI about the selected text — it goes to a chat as a reference"
      data-testid="ask-ai-selection-button"
      // Keep the selection while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => ask(picked)}
    >
      <IconSparkles aria-hidden className="ask-ai__icon" />
      Ask AI
    </button>,
    document.body,
  );
}
