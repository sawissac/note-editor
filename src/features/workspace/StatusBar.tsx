import { IconSearch } from "@tabler/icons-react";

import { cn } from "@/lib/cn";
import { KIND_LABEL, kindOf } from "@/lib/file-types";
import * as ui from "@/lib/ui-styles";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";

/** Bottom strip: file type and last edit on the left, quick open on the right. */
export function StatusBar() {
  const dispatch = useAppDispatch();
  const node = useAppSelector((s) =>
    s.tabs.activeId ? s.fs.nodes[s.tabs.activeId] : undefined,
  );
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-app-border bg-app-sidebar px-2 text-app-dim">
      {node ? (
        <>
          <span className={ui.meta}>{KIND_LABEL[kindOf(node.name)]}</span>
          <span className={ui.meta}>
            Edited {new Date(node.updatedAt).toLocaleString()}
          </span>
        </>
      ) : null}
      <span className="flex-1" />
      <button
        type="button"
        className={cn(ui.meta, "flex h-6 items-center gap-1 rounded-sm px-1.5 hover:bg-app-hover hover:text-app-accent")}
        onClick={() => dispatch(uiActions.quickOpenSet(true))}
      >
        <IconSearch className="size-3" />
        {mod}P
      </button>
    </footer>
  );
}
