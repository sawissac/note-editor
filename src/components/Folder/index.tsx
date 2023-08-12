import { useFolderStore } from "./store";
import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import FolderLayer from "./FolderLayer";
import FolderNav from "./FolderNav";
import CopyNav from "./CopyNav";
import ShowIf from "../ShowIf";

const Folder = () => {
  const [data, copy,currentDir, currentId, setCurrentIndex, rename] = useFolderStore(
    (store) => [
      store.data,
      store.copy,
      store.currentDir,
      store.currentId,
      store.setCurrentId,
      store.rename,
    ],
  );

  const currentDirData = data.filter(data=>data.topLevel === currentDir)

  return (
    <IsolatedLayout className="fixed bottom-0 left-0 right-0 w-[300px] bg-neutral-50">
      <FolderNav />
      <ShowIf if={copy !== null} show={<CopyNav />} />
      <ScrollableLayout>
        {currentDirData.map((i) => (
          <FolderLayer
            key={i.id}
            folderData={i}
            active={currentId === i.id}
            onClick={() => {
              setCurrentIndex(i.id);
            }}
            onInputKeyEnter={(_, inputValue) => {
              rename(inputValue);
            }}
          />
        ))}
      </ScrollableLayout>
    </IsolatedLayout>
  );
};

export default Folder;
