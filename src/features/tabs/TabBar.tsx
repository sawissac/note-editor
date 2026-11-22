import {
  IconArrowBarToRight,
  IconChevronLeft,
  IconChevronRight,
  IconClearAll,
  IconFolderSearch,
  IconLayoutBottombar,
  IconLayoutColumns,
  IconLayoutRows,
  IconLayoutSidebarLeftExpand,
  IconSquare,
  IconPoint,
  IconSquareX,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, m } from "motion/react";
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
import {
  DURATION,
  EASE_STANDARD,
  enter,
  exit,
  glide,
} from "@/lib/motion";
import { Unfold } from "@/components/unfold";
import {
  clearDraggingTab,
  setTabPayload,
  TAB_MIME,
} from "@/features/explorer/dnd";
import * as ui from "@/lib/ui-styles";
import { openFile } from "@/store/actions";
import { useAppDispatch, useAppSelector } from "@/store";
import { getPath, selectHasNodes } from "@/store/selectors";
import { tabsActions } from "@/store/tabs-slice";
import { uiActions } from "@/store/ui-slice";


/**
 * Scroll arrows fold in and out on one unhurried, symmetric curve: the tabs
 * slide over to fill (or make) the space with it, so a quick exit would
 * read as a jump.
 */
const ARROW_FOLD = { duration: DURATION.slow, ease: EASE_STANDARD };

/**
 * Open files as a horizontal strip.
 *
 * - The vertical mouse wheel scrolls the strip sideways (and a trackpad's
 *   horizontal swipe keeps working).
 * - The active tab is kept in view.
 * - Each end with tabs hidden past it fades out and gets an arrow button
 *   beside the strip (scrolling it by most of its width). Arrows unfold in
 *   and out, so reaching an end folds its arrow away.
 * - Middle-click closes; drag a tab to reorder; right-click for bulk close.
 */
export function TabBar() {
  const dispatch = useAppDispatch();
  const openIds = useAppSelector((s) => s.tabs.openIds);
  const activeId = useAppSelector((s) => s.tabs.activeId);
  const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);
  // Empty workspace: no sidebar to show, so no "Show sidebar" button either.
  const hasNodes = useAppSelector(selectHasNodes);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = React.useState({ left: false, right: false });
  // Scrolled all the way to the end (and not also at the start).
  const atEndRef = React.useRef(false);

  const measure = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 2px slack: scrollLeft is fractional on HiDPI screens while the widths
    // are rounded, so "at the end" can read as ~1.5px short. Without it the
    // end arrow would fold away, the strip would widen, and the rounding
    // would bring the arrow straight back.
    const hidden = el.scrollWidth - el.clientWidth - el.scrollLeft;
    const left = el.scrollLeft > 2;
    const right = hidden > 2;
    atEndRef.current = left && !right;
    setOverflow({ left, right });
  }, []);

  // The strip resized — usually an arrow folding in or out beside it. If it
  // was scrolled to the end, keep it pinned there: otherwise a widen-then-
  // narrow (one arrow leaving a frame before the other arrives) leaves it
  // short of the end, and the end arrow pops back.
  const onResize = React.useCallback(() => {
    const el = scrollerRef.current;
    if (el && atEndRef.current) el.scrollLeft = el.scrollWidth;
    measure();
  }, [measure]);

  // React's onWheel is passive, so preventDefault needs a native listener.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      e.preventDefault();
      // Lines (Firefox) → pixels.
      el.scrollLeft += e.deltaMode === 1 ? delta * 32 : delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, [onResize]);

  const revealActive = React.useCallback(() => {
    if (!activeId) return;
    document
      .getElementById(`tab-${activeId}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [activeId, measure]);

  React.useEffect(revealActive, [revealActive, openIds.length]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <div
      data-testid="tab-bar"
      className="tab-bar"
    >
      {!sidebarOpen && hasNodes ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Show sidebar"
          title="Show sidebar"
          data-testid="tab-bar-show-sidebar-button"
          onClick={() => dispatch(uiActions.sidebarSet(true))}
          className="tab-bar__sidebar-button"
        >
          <IconLayoutSidebarLeftExpand className="tab-bar__sidebar-icon" />
        </Button>
      ) : null}
      <div className="tab-bar__body">
        <AnimatePresence initial={false}>
          {overflow.left ? (
            <ScrollButton
              key="start"
              side="start"
              onScroll={() => scrollBy(-1)}
            />
          ) : null}
        </AnimatePresence>
        {/* `layoutScroll`: layout animations inside account for the strip's
            horizontal scroll offset. */}
        <m.div
          ref={scrollerRef}
          layoutScroll
          role="tablist"
          aria-label="Open files"
          onScroll={measure}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(TAB_MIME)) e.preventDefault();
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(TAB_MIME);
            if (id)
              dispatch(tabsActions.moved({ id, toIndex: openIds.length - 1 }));
          }}
          className={cn(
            "tab-bar__strip",
            overflow.left && "tab-bar__strip--fade-start",
            overflow.right && "tab-bar__strip--fade-end",
          )}
        >
          <AnimatePresence initial={false}>
            {openIds.map((id, index) => (
              <Unfold
                key={id}
                className="tab-bar__slot"
                layout="position"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1, transition: enter }}
                exit={{
                  width: 0,
                  opacity: 0,
                  pointerEvents: "none",
                  transition: exit,
                }}
                transition={{ layout: glide }}
                // A tab is only full width once it has grown in (or gone
                // once it has shrunk out): re-check the edges then, and bring
                // the active one into view again.
                onAnimationComplete={id === activeId ? revealActive : measure}
              >
                <Tab id={id} index={index} active={id === activeId} />
              </Unfold>
            ))}
          </AnimatePresence>
        </m.div>
        <AnimatePresence initial={false}>
          {overflow.right ? (
            <ScrollButton key="end" side="end" onScroll={() => scrollBy(1)} />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Arrow beside one end of the tab strip that scrolls toward it, mounted only
 * while that end has tabs hidden past it. Grows in from zero width and folds
 * back out, so the strip eases over instead of jumping.
 */
function ScrollButton({
  side,
  onScroll,
}: {
  side: "start" | "end";
  onScroll: () => void;
}) {
  const Icon = side === "start" ? IconChevronLeft : IconChevronRight;
  const label = side === "start" ? "Scroll tabs left" : "Scroll tabs right";
  return (
    <Unfold
      className="tab-bar__scroll-slot"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: "auto", opacity: 1 }}
      exit={{ width: 0, opacity: 0, pointerEvents: "none" }}
      transition={ARROW_FOLD}
    >
      <div className={cn("tab-bar__scroll", `tab-bar__scroll--${side}`)}>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          // Mouse affordance: keyboard users move between tabs, which scrolls.
          tabIndex={-1}
          aria-label={label}
          title={label}
          data-testid={`tab-bar-scroll-${side === "start" ? "left" : "right"}-button`}
          className="tab-bar__scroll-button"
          onClick={onScroll}
        >
          <Icon aria-hidden className="tab-bar__scroll-icon" />
        </Button>
      </div>
    </Unfold>
  );
}

function Tab({
  id,
  index,
  active,
}: {
  id: string;
  index: number;
  active: boolean;
}) {
  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.fs.nodes);
  const saveState = useAppSelector((s) => s.ui.saveState[id]);
  const openCount = useAppSelector((s) => s.tabs.openIds.length);
  const split = useAppSelector((s) => s.tabs.split);
  // Shown in the split's other (unfocused) pane.
  const inOtherPane =
    !active && !!split && (split.start === id || split.end === id);
  // A lone file has nothing to split against.
  const canSplit = !!split || (!active && openCount > 1);
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
          onDragStart={(e) => setTabPayload(e, id)}
          onDragEnd={clearDraggingTab}
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
            "tab-bar__tab group",
            active && "tab-bar__tab--active",
            inOtherPane && "tab-bar__tab--split",
            dragOver && "tab-bar__tab--drop-target",
          )}
        >
          {active ? (
            <m.span
              aria-hidden
              layoutId="tab-bar-indicator"
              transition={glide}
              className="tab-bar__indicator"
            />
          ) : null}
          <FileIcon name={node.name} />
          <span className="tab-bar__name">{node.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            tabIndex={-1}
            aria-label={`Close ${node.name}`}
            title={
              saveState === "saving"
                ? "Saving… — click to close"
                : "Close (middle-click)"
            }
            data-testid={`tab-close-button-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              dispatch(tabsActions.closed(id));
            }}
            className={cn(
              "tab-bar__close",
              !active && saveState !== "saving" && "tab-bar__close--idle",
            )}
          >
            {saveState === "saving" ? (
              <IconPoint className="tab-bar__saving-icon" />
            ) : null}
            <IconX
              className={cn(
                "tab-bar__close-icon",
                saveState === "saving" && "tab-bar__close-icon--saving",
              )}
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
          disabled={!canSplit}
          data-testid={`tab-split-right-menu-item-${id}`}
          onSelect={() =>
            dispatch(
              tabsActions.splitOpened({ id, side: "end", orientation: "row" }),
            )
          }
        >
          <IconLayoutColumns />
          Open to the right
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canSplit}
          data-testid={`tab-split-down-menu-item-${id}`}
          onSelect={() =>
            dispatch(
              tabsActions.splitOpened({
                id,
                side: "end",
                orientation: "column",
              }),
            )
          }
        >
          <IconLayoutBottombar />
          Open below
        </ContextMenuItem>
        {split ? (
          <ContextMenuItem
            data-testid={`tab-split-orientation-menu-item-${id}`}
            onSelect={() => dispatch(tabsActions.splitOrientationToggled())}
          >
            {split.orientation === "row" ? (
              <IconLayoutRows />
            ) : (
              <IconLayoutColumns />
            )}
            {split.orientation === "row"
              ? "Split top and bottom"
              : "Split left and right"}
          </ContextMenuItem>
        ) : null}
        {split ? (
          <ContextMenuItem
            data-testid={`tab-close-split-menu-item-${id}`}
            onSelect={() => dispatch(tabsActions.splitClosed())}
          >
            <IconSquare />
            Close split
          </ContextMenuItem>
        ) : null}
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
