import * as React from "react";

import { SAVE_DEBOUNCE_MS } from "@/features/editors/use-file-content";

/**
 * Autosave for the Word / Excel / PDF editors, whose bytes are produced on
 * demand. `onChange` (wired to the editor's change signal) schedules `save`
 * after {@link SAVE_DEBOUNCE_MS} of quiet; a pending save is flushed when the
 * pane unmounts (tab switch or close).
 *
 * Editors re-normalise a document while loading it, which looks like an
 * edit. Changes only count once the user has pressed a key or pointer inside
 * the editor — spread `guardProps` onto the element wrapping it.
 */
export function useBinaryAutosave(save: () => Promise<void> | void) {
  const saveRef = React.useRef(save);
  saveRef.current = save;
  const interacted = React.useRef(false);
  const pending = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = React.useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    void Promise.resolve(saveRef.current()).catch(() => {
      // Reported by the pane's save indicator.
    });
  }, []);

  React.useEffect(() => flush, [flush]);

  const onChange = React.useCallback(() => {
    if (!interacted.current) return;
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const markInteracted = React.useCallback(() => {
    interacted.current = true;
  }, []);

  return {
    onChange,
    guardProps: {
      onPointerDownCapture: markInteracted,
      onKeyDownCapture: markInteracted,
      onPasteCapture: markInteracted,
      onDropCapture: markInteracted,
    },
  };
}
