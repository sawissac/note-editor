import { FolderSystemType } from "../../util/FolderSystem";
import { useFolderStore } from "./store";
import {
  IconArrowBigRightLine,
  IconFile,
  IconFolder,
  IconX,
} from "@tabler/icons-react";

const CopyDest = () => {
  const [copy, data, currentId, resetCopy] = useFolderStore((store) => [
    store.copy,
    store.data,
    store.currentId,
    store.resetCopy
  ]);
  const copiedFileName = data.find((data) => data.id === copy);
  const copyDest = data.find((data) => data.id === currentId);

  const copyName = copiedFileName?.name;
  const copyDestName = data.find((data) => data.id === copyDest?.topLevel)
    ?.name;

  const showLabelLength = 5;

  return (
    <div className="flex flex-row items-center justify-start gap-4 border-b-2 border-neutral-100 p-4 py-2">
      {copiedFileName?.type === FolderSystemType.File ? (
        <IconFile size={20} className="text-neutral-500" />
      ) : (
        <IconFolder size={20} className="text-neutral-500" />
      )}
      <p>{copyName?.substring(0, showLabelLength)}...</p>
      <IconArrowBigRightLine size={20} className="text-neutral-500" />
      {copyDest?.type === FolderSystemType.File ? (
        <IconFile size={20} className="text-neutral-500" />
      ) : (
        <IconFolder size={20} className="text-neutral-500" />
      )}
      <p>
        {copyDestName
          ? copyDestName?.substring(0, showLabelLength) + "..."
          : "Home"}
      </p>
      <IconX size={20} className="ml-auto cursor-pointer text-neutral-500" onClick={resetCopy}/>
    </div>
  );
};

export default CopyDest;
