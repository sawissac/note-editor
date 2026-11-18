import * as React from "react";

import { DocxEditorPreview } from "@/components/extend/docx-editor";
import { mimeOf } from "@/lib/file-types";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import {
  type GetDocumentBytes,
  SaveBridgeProvider,
} from "@/features/editors/save-bridge";
import { useBinaryAutosave } from "@/features/editors/use-binary-autosave";
import { useObjectUrl } from "@/features/editors/use-file-content";
import {
  type PaneProps,
  useDocumentDark,
  useSaveHandler,
} from "@/features/editors/pane-context";
import { EmptyBinary } from "@/features/editors/PdfPane";

/** Word documents: always the editor — there is no separate preview mode. */
export default function DocxPane({
  id,
  name,
  content,
  isDark,
  autoFocus,
  registerSave,
}: PaneProps) {
  const dispatch = useAppDispatch();
  const bridge = React.useRef<GetDocumentBytes | null>(null);
  const url = useObjectUrl(content, mimeOf(name));
  const [dark, setDark] = useDocumentDark(isDark);

  const saveNow = async () => {
    if (!bridge.current) return;
    const bytes = await bridge.current();
    if (bytes) await dispatch(saveContent(id, bytes));
  };
  useSaveHandler(registerSave, saveNow);
  const autosave = useBinaryAutosave(saveNow);

  if (!url) return <EmptyBinary name={name} />;

  return (
    <SaveBridgeProvider bridgeRef={bridge} onChange={autosave.onChange}>
      <div className="h-full" {...autosave.guardProps}>
        <DocxEditorPreview
          autoFocus={autoFocus}
          className="h-full"
          src={url}
          fileName={name}
          isDark={dark}
          onIsDarkChange={setDark}
        />
      </div>
    </SaveBridgeProvider>
  );
}
