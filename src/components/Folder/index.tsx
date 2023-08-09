import { useFolderStore } from "./store";
import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import FolderButton from "./FolderButton";
import TopNav from "./TopNav";
import CopyDest from "./CopyDest";

const Folder = () => {
  const [data, copy, currentId, setCurrentIndex, rename] = useFolderStore(
    (store) => [
      store.data,
      store.copy,
      store.currentId,
      store.setCurrentId,
      store.rename,
    ],
  );

  

  return (
    <IsolatedLayout className="fixed bottom-0 left-0 right-0 w-[300px] bg-neutral-50">
      <TopNav />
      {copy && <CopyDest />}
      <ScrollableLayout>
        {data.map((i) => (
          <FolderButton
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
