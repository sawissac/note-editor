import React, { useState, useRef, useEffect } from "react";
import { FolderSystemConstant } from "../../util/types";
import { FolderSystemType } from "../../util/FolderSystem";
import { twMerge } from "tailwind-merge";
import {
  IconFolderFilled,
  IconFile,
  IconCircleArrowRightFilled,
} from "@tabler/icons-react";
import ShowIf from "../ShowIf";
import { useFolderStore } from "./store";

type FolderLayerInterface = {
  active: boolean;
  folderData: FolderSystemConstant;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  onInputKeyEnter: (
    ev: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
  ) => void;
};

const FolderLayer: React.FC<FolderLayerInterface> = ({
  active,
  folderData,
  onClick,
  onInputKeyEnter,
}) => {
  const { id, name, type } = folderData;
  const [value, setValue] = useState(name);
  const [disableInput, setDisableInput] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setCurrentDir = useFolderStore(store=>store.setCurrentDir)

  useEffect(() => {
    if (inputRef.current && disableInput === false) {
      inputRef.current.focus();
    }
  }, [inputRef, disableInput]);

  return (
    <div
      role="button"
      className={twMerge([
        "flex w-full cursor-pointer select-none items-center justify-start gap-4 border-b-2 border-neutral-100 p-4 py-2 text-left hover:bg-neutral-200",
        active && "bg-neutral-200",
      ])}
      onClick={onClick}
      onDoubleClick={() => {
        setDisableInput(false);
      }}
      onBlur={() => {
        setValue(name);
        setDisableInput(true);
        window.getSelection()?.removeAllRanges();
      }}
    >
      <ShowIf
        if={type === FolderSystemType.File}
        show={<IconFile size={20} className="text-neutral-500" />}
        else={<IconFolderFilled size={20} className="text-neutral-500" />}
      />

      <input
        ref={inputRef}
        className="w-36 max-w-fit select-none bg-transparent"
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        disabled={disableInput}
        onKeyDown={(ev) => {
          if (ev.code === "Enter") {
            onInputKeyEnter(ev, value);
            if (value.length !== 0) setDisableInput(true);
          }
        }}
      />

      <ShowIf
        if={type !== FolderSystemType.File}
        show={
          <IconCircleArrowRightFilled
            size={25}
            className="ml-auto text-neutral-400"
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              setCurrentDir(id)
            }}
          />
        }
      />
    </div>
  );
};

export default FolderLayer;
