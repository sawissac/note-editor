import { useFolderStore } from "./store";
import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import FolderButton from "./FolderButton";
import TopNav from "./TopNav";

const Folder = () => {
  const [data, currentIndex, setCurrentIndex, rename] = useFolderStore(
    (store) => [
      store.data,
      store.currentIndex,
      store.setCurrentIndex,
      store.rename,
    ],
  );

  return (
    <IsolatedLayout className="fixed bottom-0 left-0 right-0 w-[300px] bg-neutral-50">
      <TopNav />
      <ScrollableLayout>
        {data.map((i, index) => (
          <FolderButton
            key={i.id}
            folderData={i}
            active={currentIndex === index}
            onClick={() => {
              setCurrentIndex(index);
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
