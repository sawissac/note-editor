import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { EditorArea } from "@/features/editors/EditorArea";
import { DeleteDialog } from "@/features/explorer/DeleteDialog";
import { Explorer } from "@/features/explorer/Explorer";
import { TabBar } from "@/features/tabs/TabBar";
import { QuickOpen } from "@/features/workspace/QuickOpen";
import { StatusBar } from "@/features/workspace/StatusBar";
import { TimerDock } from "@/features/workspace/TimerDock";
import { AnimatePresence, m } from "motion/react";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

import { enter, exit } from "@/lib/motion";
import { BREAKPOINT, useMediaQuery } from "@/lib/use-media-query";
import { type RootState, useAppDispatch, useAppSelector } from "@/store";
import { selectSidebarVisible } from "@/store/selectors";
import { uiActions } from "@/store/ui-slice";

// Dialogs only needed on demand: kept out of the boot bundle (dnd-kit,
// react-dropzone, export CSS) and fetched the first time they open.
const ImportDialog = lazy(() =>
  import("@/features/explorer/ImportDialog").then((m) => ({ default: m.ImportDialog })),
);
const UnifiedExportDialog = lazy(() =>
  import("@/features/export/UnifiedExportDialog").then((m) => ({
    default: m.UnifiedExportDialog,
  })),
);

/**
 * Mounts a lazy dialog once `isOpen` first turns true, then keeps it mounted
 * so its close animation and internal state behave as if it were eager.
 */
function LazyDialog({
  isOpen,
  component: Component,
}: {
  isOpen: (s: RootState) => boolean;
  component: ComponentType;
}) {
  const open = useAppSelector(isOpen);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

const isImportOpen = (s: RootState) => s.ui.importParentId !== undefined;
const isExportOpen = (s: RootState) => s.ui.unifiedExportOpen;

const BASE_TITLE = document.title;

/** "<file> · Bento" while a file is open, the SEO title from index.html otherwise. */
function useDocumentTitle() {
  const activeName = useAppSelector((s) =>
    s.tabs.activeId ? s.fs.nodes[s.tabs.activeId]?.name : undefined,
  );
  useEffect(() => {
    document.title = activeName ? `${activeName} · Bento` : BASE_TITLE;
  }, [activeName]);
}

/**
 * The explorer as an overlay drawer, for layouts too narrow to dock it
 * beside the editor (tablet portrait, split view). Tapping the scrim or
 * pressing Escape closes it; so does opening a file (see `App`).
 *
 * Uses BEM block `app-drawer` (`src/styles/app-shell.css`).
 */
function ExplorerDrawer({ open }: { open: boolean }) {
  const dispatch = useAppDispatch();
  const close = () => dispatch(uiActions.sidebarSet(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        dispatch(uiActions.sidebarSet(false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  return (
    <AnimatePresence>
      {open ? (
        <div key="drawer" className="app-drawer" data-testid="explorer-drawer">
          <m.button
            type="button"
            aria-label="Close sidebar"
            data-testid="explorer-drawer-scrim"
            className="app-drawer__scrim"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: enter }}
            exit={{ opacity: 0, transition: exit }}
          />
          <m.aside
            aria-label="Explorer"
            className="app-drawer__panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0, transition: enter }}
            exit={{ x: "-100%", transition: exit }}
          >
            <Explorer />
          </m.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Narrow layouts: the drawer gets out of the way once a file is picked from
 * it, so the editor is what the user lands on.
 */
function useCloseDrawerOnOpen(compact: boolean) {
  const dispatch = useAppDispatch();
  const activeId = useAppSelector((s) => s.tabs.activeId);
  useEffect(() => {
    if (compact && activeId) dispatch(uiActions.sidebarSet(false));
  }, [compact, activeId, dispatch]);
}

export default function App() {
  const sidebarOpen = useAppSelector(selectSidebarVisible);
  const compact = useMediaQuery(BREAKPOINT.compact);
  useDocumentTitle();
  useCloseDrawerOnOpen(compact);
  const docked = sidebarOpen && !compact;

  return (
    <div className="app-shell">
      <ResizableGroup orientation="horizontal" className="min-h-0 flex-1">
        {docked ? (
          <>
            <ResizablePanel id="sidebar" defaultSize="22%" minSize={200} maxSize="45%">
              {/* Slides in from the edge when the sidebar is shown. */}
              <m.div
                className="h-full"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={enter}
              >
                <Explorer />
              </m.div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        ) : null}
        <ResizablePanel id="main" minSize="30%">
          <main className="flex h-full min-w-0 flex-col">
            <TabBar />
            <EditorArea />
          </main>
        </ResizablePanel>
      </ResizableGroup>
      <StatusBar />
      {compact ? <ExplorerDrawer open={sidebarOpen} /> : null}
      <QuickOpen />
      <DeleteDialog />
      <LazyDialog isOpen={isImportOpen} component={ImportDialog} />
      <LazyDialog isOpen={isExportOpen} component={UnifiedExportDialog} />
      <TimerDock />
    </div>
  );
}
