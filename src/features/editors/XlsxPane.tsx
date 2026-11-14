import * as React from "react";

import { XlsxEditorPreview } from "@/components/extend/xlsx-editor";
import { XlsxViewerPreview } from "@/components/extend/xlsx-viewer";
import { mimeOf } from "@/lib/file-types";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { TabMode } from "@/store/tabs-slice";
import {
  type GetDocumentBytes,
  SaveBridgeProvider,
} from "@/features/editors/save-bridge";
import { useObjectUrl } from "@/features/editors/use-file-content";
import {
  type PaneProps,
  useDocumentDark,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { EmptyBinary } from "@/features/editors/PdfPane";

export default function XlsxPane({
  id,
  name,
  content,
  isDark,
  mode,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const bridge = React.useRef<GetDocumentBytes | null>(null);
  const url = useObjectUrl(content, mimeOf(name));
  const [dark, setDark] = useDocumentDark(isDark);
  // State-backed ref: the host mounts only once the blob URL is ready.
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  useFocusCellEditor(host, mode === "edit");

  useSaveHandler(registerSave, async () => {
    if (mode !== "edit" || !bridge.current) return;
    const bytes = await bridge.current();
    if (bytes) await dispatch(saveContent(id, bytes));
  });

  if (!url) return <EmptyBinary name={name} />;

  return mode === "edit" ? (
    <SaveBridgeProvider bridgeRef={bridge}>
      <div ref={setHost} className="h-full">
      <XlsxEditorPreview
        className="h-full"
        src={url}
        fileName={name}
        isDark={dark}
        onIsDarkChange={setDark}
      />
      </div>
    </SaveBridgeProvider>
  ) : (
    <XlsxViewerPreview
      className="h-full"
      src={url}
      fileName={name}
      isDark={dark}
      onIsDarkChange={setDark}
      showUpload={false}
      showDownload={false}
    />
  );
}

const CELL_EDITOR = 'textarea[aria-label="Edit cell"]';

/**
 * Works around a react-xlsx focus bug: when editing starts by typing on a
 * selected cell, the library tries to focus its cell editor before the
 * textarea has mounted, so focus stays on the grid — the first character
 * lands and every following key is ignored. Watch for the editor textarea and
 * hand it focus (caret at the end) whenever it appears or receives a value
 * while the grid still holds focus.
 */
function useFocusCellEditor(host: HTMLDivElement | null, enabled: boolean) {
  React.useEffect(() => {
    if (!enabled || !host) return;

    const focusEditor = () => {
      const editor = host.querySelector<HTMLTextAreaElement>(CELL_EDITOR);
      if (!editor || document.activeElement === editor) return;
      // Only steal focus from the grid itself, never from the toolbar,
      // formula bar or a menu the user is working in.
      const active = document.activeElement;
      if (active && active !== document.body && !active.matches('[role="grid"]')) {
        return;
      }
      editor.focus({ preventScroll: true });
      const end = editor.value.length;
      editor.setSelectionRange(end, end);
    };

    const observer = new MutationObserver(() => {
      requestAnimationFrame(focusEditor);
    });
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host, enabled]);
}
