import * as React from "react";

import {
  PDFEditor,
  type PDFEditorHandle,
} from "@/components/extend/pdf-editor";
import { PDFViewer } from "@/components/extend/pdf-viewer";
import { saveContent } from "@/store/actions";
import { useAppDispatch } from "@/store";
import type { TabMode } from "@/store/tabs-slice";
import { useObjectUrl } from "@/features/editors/use-file-content";
import { type PaneProps, useSaveHandler } from "@/features/editors/pane-context";

export default function PdfPane({
  id,
  name,
  content,
  mode,
  registerSave,
}: PaneProps & { mode: TabMode }) {
  const dispatch = useAppDispatch();
  const editorRef = React.useRef<PDFEditorHandle>(null);
  const url = useObjectUrl(content, "application/pdf");
  // The engine may take ownership of the bytes it is given; hand it a copy.
  const bytes = React.useMemo(
    () => (content instanceof ArrayBuffer ? content.slice(0) : undefined),
    [content],
  );

  useSaveHandler(registerSave, async () => {
    if (mode !== "edit" || !editorRef.current) return;
    const buffer = await editorRef.current.getDocumentBuffer();
    await dispatch(saveContent(id, buffer));
  });

  if (!bytes || !url) return <EmptyBinary name={name} />;

  return mode === "edit" ? (
    <PDFEditor
      ref={editorRef}
      className="h-full"
      src={bytes}
      fileName={name}
      showUpload={false}
      showDownload={false}
    />
  ) : (
    <PDFViewer
      className="h-full"
      src={url}
      fileName={name}
      showUpload={false}
      showDownload={false}
    />
  );
}

export function EmptyBinary({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center font-description text-[12px] text-app-dim">
      {name} is empty. Import a file to replace it.
    </div>
  );
}
