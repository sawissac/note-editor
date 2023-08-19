import { IconX } from "@tabler/icons-react";
import React, { useEffect } from "react";
import { twMerge } from "tailwind-merge";
import { useFolderStore } from "../Folder/store";
import { useFileViewStore } from "./store";

type FileLayerInterface = {
  fileLayerId: string;
  active: boolean;
};

const FileLayer: React.FC<FileLayerInterface> = ({ fileLayerId, active }) => {
  const [data] = useFolderStore((store) => [store.data]);
  const [setCurrentId, deleteTab] = useFileViewStore((store) => [
    store.setCurrentId,
    store.deleteTab,
  ]);
  
  const fileData = data.find((item) => item.id === fileLayerId);

  useEffect(() => {
    if (!fileData) {
      deleteTab(fileLayerId);
    }
  }, [deleteTab, fileData, fileLayerId]);

  return (
    <div
      className={twMerge([
        "flex h-[35px] min-w-[150px] max-w-[150px] items-center justify-start rounded-md border border-l-4 border-neutral-200 border-l-neutral-500 bg-neutral-50 shadow-sm",
        active && "border-l-blue-500",
      ])}
    >
      <p
        className="h-full w-full truncate pl-2 leading-8 hover:bg-neutral-200"
        onClick={() => {
          document.getElementById(fileLayerId)?.scrollIntoView();
          setCurrentId(fileLayerId);
        }}
      >
        {fileData?.name}
      </p>
      <div className="flex h-full w-[50px] items-center justify-center hover:bg-neutral-200">
        <IconX
          size={20}
          className="mx-0 p-0"
          onClick={() => {
            deleteTab(fileLayerId);
          }}
        />
      </div>
    </div>
  );
};

export default FileLayer;
