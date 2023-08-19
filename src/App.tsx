import FileView from "./components/FileView";
import Folder from "./components/Folder";
import AutoLayoutRebuild from "./components/Layout/AutoLayoutRebuild";
import IsolatedLayout from "./components/Layout/IsolatedLayout";
import { px, useFrameStore } from "./store/Frame";

function App() {
  const [FrameHeight] = useFrameStore((store) => [store.height]);
  return (
    <AutoLayoutRebuild>
      <IsolatedLayout style={{ height: px(FrameHeight) }}>
        <Folder />
        <FileView />
      </IsolatedLayout>
    </AutoLayoutRebuild>
  );
}

export default App;
