import shortUUID from "short-uuid";
import { FolderSystemConstant } from "./types";

export const FolderSystemType = {
  Folder: 0,
  File: 1,
};

const create = {
  file(name: string, topLevel: null | string): FolderSystemConstant {
    return {
      id: shortUUID.generate(),
      name,
      topLevel: topLevel,
      type: FolderSystemType.File,
    };
  },
  folder(name: string, topLevel: null | string): FolderSystemConstant {
    const id = shortUUID.generate()
    return {
      id,
      name,
      topLevel: topLevel,
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

const deleteF = (data: FolderSystemConstant[], idToRemove: string | null) => {
  const indexToRemove = data.findIndex(item => item.id === idToRemove);
  
  if (indexToRemove === -1) {
      return data;
  }

  const idsToRemove = [idToRemove];
  const stack = [idToRemove];
  
  while (stack.length > 0) {
      const currentId = stack.pop();

      for (const item of data) {
          if (item.topLevel === currentId) {
              idsToRemove.push(item.id);
              stack.push(item.id);
          }
      }
  }

  return data.filter(item => !idsToRemove.includes(item.id));
}

const FolderSystem = {
  create,
  rename,
  deleteF
};

export { FolderSystem };
