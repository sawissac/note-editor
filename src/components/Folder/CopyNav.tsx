import { FolderSystemType } from "../../util/FolderSystem";
import { useFolderStore } from "./store";
import {
  IconArrowBigRightLine,
  IconFile,
  IconFolder,
  IconX,
} from "@tabler/icons-react";
import ShowIf from "../ShowIf";

const CopyNav = () => {
  const [copy, data, currentId, resetCopy] = useFolderStore((store) => [
    store.copy,
    store.data,
    store.currentId,
    store.resetCopy,
  ]);

  const copyFileData = data.find((data) => data.id === copy);
  const copyToFileData = data.find((data) => data.id === currentId);

  const copyFileName = copyFileData?.name;
  const rootDirName = data.find((data) => data.id === copyToFileData?.topLevel)
    ?.name;

  return (
    <div className="flex flex-row items-center justify-start gap-4 border-b-2 border-neutral-100 p-4 py-2">
      <ShowIf
        if={copyFileData?.type === FolderSystemType.File}
        show={<IconFile size={20} className="text-neutral-500" />}
        else={<IconFolder size={20} className="text-neutral-500" />}
      />
      <p className="w-14 text-left truncate ml-1">{copyFileName}</p>

      <IconArrowBigRightLine size={20} className="text-neutral-500" />

      <ShowIf
        if={copyToFileData?.type === FolderSystemType.File && rootDirName === null}
        show={<IconFile size={20} className="text-neutral-500" />}
        else={<IconFolder size={20} className="text-neutral-500" />}
      />

      <p className="w-14 text-left truncate ml-1">{rootDirName ? rootDirName : "Home"}</p>

      <IconX
        size={20}
        className="ml-auto cursor-pointer text-neutral-500"
        onClick={resetCopy}
      />
    </div>
  );
};

export default CopyNav;
