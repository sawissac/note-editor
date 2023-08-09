import {
  IconFolderPlus,
  IconFilePlus,
  IconCopy,
  IconClipboardList,
} from "@tabler/icons-react";
import { useFolderStore } from "./store";

const TopNav = () => {
  const [createFolder, createFile] = useFolderStore((store) => [store.createFolder, store.createFile]);
  const ActionIcon = [
    {
      Icon: IconFolderPlus,
      action: () => {
        createFolder("Folder Name");
      },
    },
    {
      Icon: IconFilePlus,
      action: () => {
        createFile("File Name")
      },
    },
    {
      Icon: IconCopy,
      action: () => {},
    },
    {
      Icon: IconClipboardList,
      action: () => {},
    },
  ];
  return (
    <div className="flex flex-row items-center justify-start gap-4 border-b-2 border-neutral-100 p-4">
      {ActionIcon.map((Data, index) => {
        return (
          <Data.Icon
            key={index}
            size={20}
            className="cursor-pointer text-neutral-500"
            onClick={Data.action}
          />
        );
      })}
    </div>
  );
};

export default TopNav;
