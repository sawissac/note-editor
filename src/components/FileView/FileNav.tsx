import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import { useFileViewStore } from "./store";
import FileLayer from "./FileLayer";

const FileTab = () => {
  const [data, currentId] = useFileViewStore((store) => [
    store.data,
    store.currentId,
  ]);

  return (
    <IsolatedLayout className="h-[65px] border-b-2 border-neutral-100 bg-neutral-50">
      <ScrollableLayout
        scrollType="x"
        className="flex h-full items-center gap-2 p-2 pb-0 "
      >
        {data.map((id) => (
          <FileLayer key={id} active={currentId === id} fileLayerId={id} />
        ))}
      </ScrollableLayout>
    </IsolatedLayout>
  );
};

export default FileTab;
