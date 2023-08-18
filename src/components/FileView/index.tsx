import IsolatedLayout from "../Layout/IsolatedLayout";
import ScrollableLayout from "../Layout/ScrollableLayout";
import ClassicTextarea from "./ClassicTextarea";
import FileNav from "./FileNav";

const FileView = () => {
  return (
    <IsolatedLayout className="pl-[300px]">
      <FileNav />
      <ScrollableLayout scrollType="xy" className="h-full">
        <ClassicTextarea />
      </ScrollableLayout>
    </IsolatedLayout>
  );
};

export default FileView;
