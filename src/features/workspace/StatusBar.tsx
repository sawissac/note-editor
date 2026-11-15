import { IconClock, IconSearch } from "@tabler/icons-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { FileIcon } from "@/lib/file-icons";
import { KIND_LABEL, kindOf } from "@/lib/file-types";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";

/**
 * Bottom strip: the active file's type and last edit on the left, "Go to
 * file" (quick open) on the right.
 *
 * CSS: BEM block `status-bar` (`src/styles/status-bar.css`).
 */
export function StatusBar() {
  const dispatch = useAppDispatch();
  const node = useAppSelector((s) =>
    s.tabs.activeId ? s.fs.nodes[s.tabs.activeId] : undefined,
  );
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+";
  const edited = node ? new Date(node.updatedAt) : undefined;

  return (
    <footer className="status-bar" data-testid="status-bar">
      {node && edited ? (
        <>
          <span
            className="status-bar__item"
            title="File type — decides which editor opens"
          >
            <FileIcon name={node.name} />
            {KIND_LABEL[kindOf(node.name)]}
          </span>
          <span
            className="status-bar__item"
            title={`Last edited ${edited.toLocaleString()}`}
          >
            <IconClock aria-hidden className="status-bar__icon" />
            Edited {edited.toLocaleString()}
          </span>
        </>
      ) : null}
      <span className="status-bar__spacer" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-testid="status-bar-quick-open-button"
            aria-label={`Go to file (${mod}P)`}
            className="status-bar__action"
            onClick={() => dispatch(uiActions.quickOpenSet(true))}
          >
            <IconSearch aria-hidden className="status-bar__icon" />
            Go to file
            <Kbd className="status-bar__key">{mod}P</Kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Find or create files · &gt; commands · # search inside files
        </TooltipContent>
      </Tooltip>
    </footer>
  );
}
