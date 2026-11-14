import * as React from "react";

import { DocxEditorPreview } from "@/components/extend/docx-editor";
import { DocxViewerPreview } from "@/components/extend/docx-viewer";
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

export default function DocxPane({
  id,
  name,
  content,
  isDark,
  mode,
  autoFocus,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const bridge = React.useRef<GetDocumentBytes | null>(null);
  const url = useObjectUrl(content, mimeOf(name));
  const [dark, setDark] = useDocumentDark(isDark);

  useSaveHandler(registerSave, async () => {
    if (mode !== "edit" || !bridge.current) return;
    const bytes = await bridge.current();
    if (bytes) await dispatch(saveContent(id, bytes));
  });

  if (!url) return <EmptyBinary name={name} />;

  return mode === "edit" ? (
    <SaveBridgeProvider bridgeRef={bridge}>
      <DocxEditorPreview
        autoFocus={autoFocus}
        className="h-full"
        src={url}
        fileName={name}
        isDark={dark}
        onIsDarkChange={setDark}
      />
    </SaveBridgeProvider>
  ) : (
    <DocxViewerPreview
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
