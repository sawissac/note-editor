/**
 * "Ask AI" on selected text — the contract between editors and the button
 * EditorArea shows. Kept apart from CodeEditor so importing it never pulls
 * Monaco into the boot bundle.
 */

/** DOM event a code editor fires (bubbling) when its selection changes. */
export const CODE_SELECTION_EVENT = "app:code-selection";

/** `detail` of {@link CODE_SELECTION_EVENT}; null when nothing is selected. */
export type CodeSelection = {
  text: string;
  /** "line 4" / "lines 3–8". */
  where: string;
  /** Screen box just past the last selected line's text; the button sits to its right. */
  rect: DOMRect;
  /** From the context-menu action: ask right away. */
  ask: boolean;
  /** Swaps the selected range for new text (one undo step). */
  replace?: (text: string) => void;
};

/** What an inline "Ask AI" panel is about. */
export type AskAiRequest = {
  /** Text the AI gets as context: the selection, or the whole file. */
  context: string;
  /** Label for that context, e.g. "lines 2–3", "selection", "whole file". */
  where: string;
  /** Screen box to open next to; null opens at the pane's top right. */
  anchor: DOMRect | null;
  /** Present when the context is a selection the editor can replace. */
  replace?: (text: string) => void;
};

/**
 * The code inside an answer that is one fenced block (what a "rewrite
 * this" usually returns); otherwise the answer as it is.
 */
export function answerBody(answer: string) {
  const m = answer.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : answer.trim();
}
