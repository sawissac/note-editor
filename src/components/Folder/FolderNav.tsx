import React from "react";
import {
  IconFolderPlus,
  IconFilePlus,
  IconCopy,
  IconClipboardList,
  IconHome,
} from "@tabler/icons-react";
import { useFolderStore } from "./store";

const TopNav = () => {
  const [setCurrentDir, createFolder, createFile, copyFile] = useFolderStore((store) => [
    store.setCurrentDir,
    store.createFolder,
    store.createFile,
    store.copyFile,
  ]);

  const ActionIcon = React.useMemo(
    () => [
      {
        Icon: IconHome,
        action: () => {
          setCurrentDir(null)
        },
      },
      {
        Icon: IconFolderPlus,
        action: () => {
          createFolder("Folder Name");
        },
      },
      {
        Icon: IconFilePlus,
        action: () => {
          createFile("File Name");
        },
      },
      {
        Icon: IconCopy,
        action: () => {
          copyFile();
        },
      },
      {
        Icon: IconClipboardList,
        action: () => {},
      },
    ],
    [copyFile, createFile, createFolder, setCurrentDir],
  );

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
