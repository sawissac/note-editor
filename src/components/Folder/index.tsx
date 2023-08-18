import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import FolderLayer from "./FolderLayer";
import FolderNav from "./FolderNav";
import { useFolderStore } from "./store";
import { FolderSystemType } from "../../util/FolderSystem";
import { FolderSystemConstant } from "../../util/types";
import { frame } from "../../util/Frame";

const Folder = () => {
  const [data, currentDir, currentId, setCurrentIndex, rename] = useFolderStore(
    (store) => [
      store.data,
      store.currentDir,
      store.currentId,
      store.setCurrentId,
      store.rename,
    ],
  );

  const sortAlphaBat = (a: FolderSystemConstant, b: FolderSystemConstant) => {
    if (a.name < b.name) {
      return -1;
    } else if (a.name > b.name) {
      return 1;
    } else {
      return 0;
    }
  };

  const currentDirData = data.filter((data) => data.topLevel === currentDir);
  const folderData = currentDirData
    .filter((data) => data.type === FolderSystemType.Folder)
    .sort(sortAlphaBat);
  const fileData = currentDirData
    .filter((data) => data.type === FolderSystemType.File)
    .sort(sortAlphaBat);
  const renderData = [...folderData, ...fileData];

  return (
    <IsolatedLayout
      className="fixed bottom-0 left-0 right-0 w-[300px] bg-neutral-50 shadow-md"
      style={{
        height: frame.height(),
      }}
    >
      <FolderNav />
      <ScrollableLayout scrollType="y" style={{
        height: 0
      }}>
        {renderData.map((i) => (
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
