import React from "react";
import {
  IconFolderPlus,
  IconFilePlus,
  IconCopy,
  IconHome,
  IconTrash,
  IconArrowLeft,
} from "@tabler/icons-react";
import { useFolderStore } from "./store";

const TopNav = () => {
  const [
    setCurrentDir,
    createFolder,
    createFile,
    copyFile,
    deleteFile,
    dirBack,
  ] = useFolderStore((store) => [
    store.setCurrentDir,
    store.createFolder,
    store.createFile,
    store.copyFile,
    store.deleteFile,
    store.dirBack,
  ]);
  const ActionIcon = React.useMemo(
    () => [
      {
        Icon: IconHome,
        action: () => {
          setCurrentDir(null, true);
        },
      },
      {
        Icon: IconArrowLeft,
        action: () => {
          dirBack();
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
        Icon: IconTrash,
        action: () => {
          deleteFile();
        },
      },
    ],
    [copyFile, createFile, createFolder, deleteFile, dirBack, setCurrentDir],
  );

  return (
    <div className="flex flex-row items-center justify-start gap-4 border-b-2 border-neutral-100 px-4 h-[65px]">
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
