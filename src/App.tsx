import {
  ResizableGroup,
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { EditorArea } from "@/features/editors/EditorArea";
import { DeleteDialog } from "@/features/explorer/DeleteDialog";
import { Explorer } from "@/features/explorer/Explorer";
import { ImportDialog } from "@/features/explorer/ImportDialog";
import { UnifiedExportDialog } from "@/features/export/UnifiedExportDialog";
import { TabBar } from "@/features/tabs/TabBar";
import { QuickOpen } from "@/features/workspace/QuickOpen";
import { StatusBar } from "@/features/workspace/StatusBar";
import { useAppSelector } from "@/store";

export default function App() {
  const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);

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
      <ImportDialog />
      <UnifiedExportDialog />
    </div>
  );
}
