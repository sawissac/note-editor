import {
  IconArrowBarToRight,
  IconClearAll,
  IconFolderSearch,
  IconLayoutSidebarLeftExpand,
  IconPoint,
  IconSquareX,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/cn";
import { FileIcon } from "@/lib/file-icons";
import * as ui from "@/lib/ui-styles";
import { openFile } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath } from "@/store/selectors";
import { tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";

const TAB_MIME = "application/x-note-editor-tab";

/**
 * Open files as a horizontal strip.
 *
 * - The vertical mouse wheel scrolls the strip sideways (and a trackpad's
 *   horizontal swipe keeps working).
 * - The active tab is kept in view.
 * - Middle-click closes; drag a tab to reorder; right-click for bulk close.
 */
export function TabBar() {
  const dispatch = useAppDispatch();
  const openIds = useAppSelector((s) => s.tabs.openIds);
  const activeId = useAppSelector((s) => s.tabs.activeId);
  const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = React.useState({ left: false, right: false });

  const measure = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  // React's onWheel is passive, so preventDefault needs a native listener.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      e.preventDefault();
      // Lines (Firefox) → pixels.
      el.scrollLeft += e.deltaMode === 1 ? delta * 32 : delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, [measure]);

  React.useEffect(() => {
    if (!activeId) return;
    document
      .getElementById(`tab-${activeId}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [activeId, openIds.length, measure]);

  return (
    <div
      data-testid="tab-bar"
      className="flex h-9 shrink-0 items-stretch border-b border-app-border bg-app-sidebar"
    >
      {!sidebarOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Show sidebar"
          title="Show sidebar"
          onClick={() => dispatch(uiActions.sidebarSet(true))}
          className="text-app-dim hover:text-app-accent my-0.5 ml-1"
        >
          <IconLayoutSidebarLeftExpand className="size-4" />
        </Button>
      ) : null}
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Open files"
          onScroll={measure}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(TAB_MIME)) e.preventDefault();
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(TAB_MIME);
            if (id) dispatch(tabsActions.moved({ id, toIndex: openIds.length - 1 }));
          }}
          className="flex h-full items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {openIds.map((id, index) => (
            <Tab key={id} id={id} index={index} active={id === activeId} />
          ))}
        </div>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 left-0 w-px bg-app-border-accent opacity-0 transition-opacity",
            overflow.left && "opacity-100",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 right-0 w-px bg-app-border-accent opacity-0 transition-opacity",
            overflow.right && "opacity-100",
          )}
        />
      </div>
    </div>
  );
}

function Tab({ id, index, active }: { id: string; index: number; active: boolean }) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const saveState = useAppSelector((s) => s.ui.saveState[id]);
  const openCount = useAppSelector((s) => s.tabs.openIds.length);
  const node = nodes[id];
  const [dragOver, setDragOver] = React.useState(false);
  if (!node) return null;
  const path = getPath(nodes, id).join(" / ");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`tab-${id}`}
          role="tab"
          data-testid={`tab-${id}`}
          aria-selected={active}
          data-active={active || undefined}
          tabIndex={active ? 0 : -1}
          title={path}
          draggable
          onClick={() => dispatch(openFile(id))}
          onMouseDown={(e) => {
            if (e.button === 1) e.preventDefault();
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              dispatch(tabsActions.closed(id));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Delete") dispatch(tabsActions.closed(id));
          }}
          onDragStart={(e) => {
            e.dataTransfer.setData(TAB_MIME, id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TAB_MIME)) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
            const dragged = e.dataTransfer.getData(TAB_MIME);
            if (dragged && dragged !== id) {
              dispatch(tabsActions.moved({ id: dragged, toIndex: index }));
            }
          }}
          className={cn(
            "group relative flex max-w-56 min-w-28 shrink-0 cursor-pointer items-center gap-1.5 border-r border-app-border pr-1 pl-3 text-[12px] text-app-dim select-none",
            "transition-colors duration-(--motion-duration-fast) hover:bg-app-hover hover:text-app-text",
            "focus-visible:ring-1 focus-visible:ring-app-accent focus-visible:outline-none focus-visible:ring-inset",
            active &&
              "bg-app-bg text-app-bright after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-app-accent hover:bg-app-bg",
            dragOver && "bg-app-accent-faint",
          )}
        >
          <FileIcon name={node.name} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label={`Close ${node.name}`}
            title={saveState === "saving" ? "Saving… — click to close" : "Close (middle-click)"}
            data-testid={`tab-close-button-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(tabsActions.closed(id));
            }}
            className={cn(
              "text-app-dim size-5 rounded-sm",
              !active && "opacity-0 group-hover:opacity-100",
              saveState === "saving" && "opacity-100",
            )}
          >
            {saveState === "saving" ? (
              <IconPoint className="size-3 text-app-accent group-hover:hidden" />
            ) : null}
            <IconX
              className={cn("size-3.5", saveState === "saving" && "hidden group-hover:block")}
            />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <ContextMenuItem onSelect={() => dispatch(tabsActions.closed(id))}>
          <IconX />
          Close
          <ContextMenuShortcut>Middle-click</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={openCount < 2}
          onSelect={() => dispatch(tabsActions.closedOthers(id))}
        >
          <IconSquareX />
          Close others
        </ContextMenuItem>
        <ContextMenuItem
          disabled={index === openCount - 1}
          onSelect={() => dispatch(tabsActions.closedToRight(id))}
        >
          <IconArrowBarToRight />
          Close to the right
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => dispatch(tabsActions.closedAll())}>
          <IconClearAll />
          Close all
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            dispatch(uiActions.sidebarSet(true));
            dispatch(openFile(id));
          }}
        >
          <IconFolderSearch />
          Reveal in explorer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
