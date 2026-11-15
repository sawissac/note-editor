import * as React from "react";

import { type FileContent, storage } from "@/lib/storage";

type State =
  | { status: "loading" }
  | { status: "ready"; content: FileContent | null }
  | { status: "error"; error: string };

/** Loads one file's stored content. Re-reads when `id` or `reloadKey` changes. */
export function useFileContent(id: string, reloadKey?: string) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  React.useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    storage
      .getContent(id)
      .then((content) => live && setState({ status: "ready", content }))
      .catch((error: unknown) =>
        live && setState({ status: "error", error: String(error) }),
      );
    return () => {
      live = false;
    };
  }, [id, reloadKey]);
  return state;
}

/** A blob: URL for binary content, revoked when the content changes. */
export function useObjectUrl(content: FileContent | null, type: string) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    if (content == null || (typeof content !== "string" && content.byteLength === 0)) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(new Blob([content], { type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [content, type]);
  return url;
}

/** Quiet time after the last edit before any editor saves. */
export const SAVE_DEBOUNCE_MS = 300;

/**
 * Debounced save that also flushes when the editor unmounts (tab switch or
 * close), so the last keystrokes are never lost.
 */
export function useDebouncedSave(
  save: (value: string) => void,
  delay = SAVE_DEBOUNCE_MS,
) {
  const pending = React.useRef<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRef = React.useRef(save);
  saveRef.current = save;

  const flush = React.useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current !== null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  }, []);

  React.useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  return React.useCallback(
    (value: string) => {
      pending.current = value;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );
}
