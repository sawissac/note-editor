import { px, useFrameStore } from "../../store/Frame";
import { useFileViewStore } from "./store";
import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import ClassicTextarea from "./ClassicTextarea";
import FileNav from "./FileNav";

const FileView = () => {
  const [FrameHeight] = useFrameStore((store) => [store.height]);
  const [data, currentId] = useFileViewStore((store) => [
    store.data,
    store.currentId,
  ]);

  return (
    <IsolatedLayout className="pl-[300px]" style={{ height: px(FrameHeight) }}>
      <FileNav />
      <ScrollableLayout
        scrollType="x"
        style={{ height: px(FrameHeight - 65) }}
        className="flex"
      >
        {data.map((item) => (
          <ClassicTextarea
            key={item}
            fileLayerId={item}
            focus={item === currentId}
          />
        ))}
      </ScrollableLayout>
    </IsolatedLayout>
  );
};

export default FileView;
