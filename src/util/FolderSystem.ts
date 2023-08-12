import shortUUID from "short-uuid";
import { FolderSystemConstant } from "./types";

export const FolderSystemType = {
  Folder: 0,
  File: 1,
};

const create = {
  file(name: string): FolderSystemConstant {
    return {
      id: shortUUID.generate(),
      name,
      topLevel: null,
      type: FolderSystemType.File,
    };
  },
  folder(name: string): FolderSystemConstant {
    const id = shortUUID.generate()
    return {
      id,
      name,
      topLevel: null,
      type: FolderSystemType.Folder,
    };
  },
};

const rename = (
  data: FolderSystemConstant,
  rename: string,
): FolderSystemConstant => {
  return {
    ...data,
    name: rename,
  };
};

const FolderSystem = {
  create,
  rename,
};

export { FolderSystem };
