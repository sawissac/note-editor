import { IconTrash } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileIcon, FolderIcon } from "@/lib/file-icons";
import * as ui from "@/lib/ui-styles";
import { deleteNode } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getDescendantIds, getPath } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

/** Confirms a delete, spelling out how much a folder takes with it. */
export function DeleteDialog() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const targetId = useAppSelector((s) => s.ui.deleteTargetId);
  const node = targetId ? nodes[targetId] : undefined;
  const inside = node ? getDescendantIds(nodes, node.id).length - 1 : 0;
  const isFolder = node?.type === "folder";
  const confirmRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={Boolean(node)}
      onOpenChange={(open) => {
        if (!open) dispatch(uiActions.deleteRequested(null));
      }}
    >
      <DialogContent
        data-testid="delete-dialog"
        // Land on Delete so Enter confirms (Radix would pick the close X).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isFolder ? "Delete folder?" : "Delete file?"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {node ? (
            <div className={`${ui.card} flex items-center gap-2 px-2.5 py-2`}>
              {isFolder ? <FolderIcon open={false} /> : <FileIcon name={node.name} />}
              <span className="min-w-0 truncate font-title text-[12px] font-semibold text-app-bright">
                {getPath(nodes, node.id).join(" / ")}
              </span>
            </div>
          ) : null}
          <DialogDescription className={ui.help}>
            {isFolder && inside > 0
              ? `This folder and the ${inside} ${inside === 1 ? "item" : "items"} inside it will be removed from this browser. This can't be undone.`
              : "It will be removed from this browser. This can't be undone."}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            ref={confirmRef}
            variant="destructive"
            data-testid="delete-confirm-button"
            onClick={() => node && dispatch(deleteNode(node.id))}
          >
            <IconTrash />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
