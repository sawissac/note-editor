import FileView from "./components/FileView";
import Folder from "./components/Folder";
import IsolatedLayout from "./components/Layout/IsolatedLayout";
import { frame } from "./util/Frame";

function App() {
  return (
    <IsolatedLayout style={{
      height: frame.height() 
    }}>
      <Folder />
      <FileView />
    </IsolatedLayout>
  );
}

export default App;
