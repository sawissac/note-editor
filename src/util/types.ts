type FolderType = 0 | number;
type FileType = 1 | number;
type FolderSystemAcceptType = FolderType | FileType;

export type FolderSystemConstant = {
  id: string;
  name: string;
  topLevel: string | null;
  type: FolderSystemAcceptType;
};
