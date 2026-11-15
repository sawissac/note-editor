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
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";

import { type RootState, useAppSelector } from "@/store";
import { selectSidebarVisible } from "@/store/selectors";

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

export default function App() {
  const sidebarOpen = useAppSelector(selectSidebarVisible);
  useDocumentTitle();

  return (
    <div className="flex h-full flex-col">
      <ResizableGroup orientation="horizontal" className="min-h-0 flex-1">
        {sidebarOpen ? (
          <>
            <ResizablePanel id="sidebar" defaultSize="22%" minSize={200} maxSize="45%">
              <Explorer />
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
      <QuickOpen />
      <DeleteDialog />
      <LazyDialog isOpen={isImportOpen} component={ImportDialog} />
      <LazyDialog isOpen={isExportOpen} component={UnifiedExportDialog} />
      <TimerDock />
    </div>
  );
}
