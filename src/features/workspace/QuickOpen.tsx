import * as React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileIcon } from "@/lib/file-icons";
import { openFile } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

/** ⌘/Ctrl+P: fuzzy-find any file by name or path. */
export function QuickOpen() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.quickOpen);
  const nodes = useAppSelector((s) => s.fs.nodes);
  const openIds = useAppSelector((s) => s.tabs.openIds);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        dispatch(uiActions.quickOpenSet(true));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dispatch]);

  const files = React.useMemo(() => {
    const list = Object.values(nodes)
      .filter((n) => n.type === "file")
      .map((n) => ({ node: n, path: getPath(nodes, n.id).join(" / ") }));
    // Open tabs first, then by most recently edited.
    return list.sort((a, b) => {
      const ao = openIds.includes(a.node.id) ? 0 : 1;
      const bo = openIds.includes(b.node.id) ? 0 : 1;
      return ao - bo || b.node.updatedAt - a.node.updatedAt;
    });
  }, [nodes, openIds]);

  // CommandDialog renders its sr-only title outside the panel; mount it only
  // while open so the hidden heading does not linger in the page.
  if (!open) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => dispatch(uiActions.quickOpenSet(next))}
      title="Quick open"
      description="Search files by name or folder"
    >
      <CommandInput placeholder="Search files by name…" />
      <CommandList>
        <CommandEmpty>No matching files.</CommandEmpty>
        <CommandGroup heading="Files">
          {files.map(({ node, path }) => (
            <CommandItem
              key={node.id}
              value={`${path} ${node.id}`}
              onSelect={() => {
                dispatch(openFile(node.id));
                dispatch(uiActions.quickOpenSet(false));
              }}
            >
              <FileIcon name={node.name} />
              <span className="truncate text-app-bright">{node.name}</span>
              <span className="ml-auto truncate font-mono text-[11px] text-app-dim">
                {path}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
