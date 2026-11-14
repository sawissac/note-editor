import * as React from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { IMPORT_ACCEPT } from "@/lib/file-types";
import * as ui from "@/lib/ui-styles";
import { importFiles } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

/** Pick or drop Markdown, CSV, PDF, Word and Excel files into a folder. */
export function ImportDialog() {
  const dispatch = useAppDispatch();
  const parentId = useAppSelector((s) => s.ui.importParentId);
  const nodes = useAppSelector((s) => s.fs.nodes);
  const [error, setError] = React.useState<string | null>(null);
  const open = parentId !== undefined;
  const where = parentId ? getPath(nodes, parentId).join(" / ") : "the root";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          dispatch(uiActions.importClosed());
          setError(null);
        }
      }}
    >
      <DialogContent className="w-[min(520px,92vw)]" data-testid="import-dialog">
        <DialogHeader>
          <DialogTitle>Import files</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <DialogDescription className={ui.help}>
            Files are copied into <strong className="text-app-bright">{where}</strong>{" "}
            and stored in this browser. Name clashes get a numbered suffix.
          </DialogDescription>
          <FileUpload
            data-testid="import-upload"
            accept={IMPORT_ACCEPT}
            maxSize={100 * 1024 * 1024}
            title="Click or drop files to import"
            onFilesAdded={async (files) => {
              await dispatch(importFiles(files, parentId ?? null));
              dispatch(uiActions.importClosed());
              setError(null);
            }}
            onFilesRejected={(rejections) =>
              setError(
                `Not imported: ${rejections.map((r) => r.file.name).join(", ")}`,
              )
            }
          />
          {error ? (
            <p role="alert" className="font-description text-[11px] text-app-error">
              {error}
            </p>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
