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
};
