import { IconTrash, IconX } from "@tabler/icons-react";
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
import { deleteNodes, topLevelIds } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getDescendantIds, getPath } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

/** Rows listed by name before the rest collapse into "and N more". */
const LIST_LIMIT = 5;

/**
 * Confirms a delete — one item or a whole multi-selection — spelling out how
 * much the folders among them take along.
 */
export function DeleteDialog() {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const requested = useAppSelector((s) => s.ui.deleteTargetIds);
  const targets = React.useMemo(
    () => topLevelIds(nodes, requested).map((id) => nodes[id]),
    [nodes, requested],
  );
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const single = targets.length === 1 ? targets[0] : undefined;
  const isFolder = single?.type === "folder";
  // Everything removed besides the listed rows themselves.
  const inside =
    targets.reduce((n, t) => n + getDescendantIds(nodes, t.id).length, 0) -
    targets.length;

  const title = single
    ? isFolder
      ? "Delete folder?"
      : "Delete file?"
    : `Delete ${targets.length} items?`;
  const subject = single
    ? isFolder
      ? "This folder"
      : "It"
    : `These ${targets.length} items`;
  const message =
    inside > 0
      ? `${subject} and the ${inside} ${inside === 1 ? "item" : "items"} inside will be removed from this browser. This can't be undone.`
      : `${subject} will be removed from this browser. This can't be undone.`;

  return (
    <Dialog
      open={targets.length > 0}
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {targets.length ? (
            <ul className={`${ui.card} flex flex-col gap-1 px-2.5 py-2`}>
              {targets.slice(0, LIST_LIMIT).map((node) => (
                <li key={node.id} className="flex min-w-0 items-center gap-2">
                  {node.type === "folder" ? (
                    <FolderIcon open={false} />
                  ) : (
                    <FileIcon name={node.name} />
                  )}
                  <span className="min-w-0 truncate font-title text-[12px] font-semibold text-app-bright">
                    {getPath(nodes, node.id).join(" / ")}
                  </span>
                </li>
              ))}
              {targets.length > LIST_LIMIT ? (
                <li className={ui.meta}>and {targets.length - LIST_LIMIT} more</li>
              ) : null}
            </ul>
          ) : null}
          <DialogDescription className={ui.help}>{message}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <IconX />
              Cancel
            </Button>
          </DialogClose>
          <Button
            ref={confirmRef}
            variant="destructive"
            data-testid="delete-confirm-button"
            onClick={() => dispatch(deleteNodes(targets.map((t) => t.id)))}
          >
            <IconTrash />
            {single ? "Delete" : `Delete ${targets.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
