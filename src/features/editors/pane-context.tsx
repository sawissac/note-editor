import * as React from "react";

/** What every editor pane receives from the host. */
export type PaneProps = {
  id: string;
  name: string;
  content: string | ArrayBuffer | null;
  isDark: boolean;
  /** True once, right after the file was created — focus the caret. */
  autoFocus: boolean;
  /** Install the function ⌘/Ctrl+S and the toolbar's Save button call. */
  registerSave: (save: (() => Promise<void> | void) | null) => void;
};

/** Registers `save` for the lifetime of the calling pane. */
export function useSaveHandler(
  registerSave: PaneProps["registerSave"],
  save: () => Promise<void> | void,
) {
  const ref = React.useRef(save);
  ref.current = save;
  React.useEffect(() => {
    registerSave(() => ref.current());
    return () => registerSave(null);
  }, [registerSave]);
}

/**
 * Save functions of the editors currently on screen, by file id. Lets code
 * outside the pane (the unified export) flush edits that only reach storage
 * on an explicit save — DOCX / XLSX / PDF — before it reads the file.
 */
const openEditorSaves = new Map<string, () => Promise<void> | void>();

export function useOpenEditorSave(
  id: string,
  save: () => Promise<void> | void,
) {
  React.useEffect(() => {
    openEditorSaves.set(id, save);
    return () => {
      if (openEditorSaves.get(id) === save) openEditorSaves.delete(id);
    };
  }, [id, save]);
}

/** Saves any of `ids` that is open in an editor; failures are left to the
 *  editor's own save indicator so the caller still gets the stored copy. */
export async function saveOpenEditors(ids: Iterable<string>) {
  for (const id of ids) {
    try {
      await openEditorSaves.get(id)?.();
    } catch {
      // Reported by the pane's save state.
    }
  }
}

/** Night-mode toggle the Extend editors expose, seeded from the app theme. */
export function useDocumentDark(isDark: boolean) {
  const [dark, setDark] = React.useState(isDark);
  React.useEffect(() => setDark(isDark), [isDark]);
  return [dark, setDark] as const;
}
