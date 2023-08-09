import React, { useState, useRef, useEffect } from "react";
import { IconFolderFilled, IconFile, IconCircleArrowRightFilled } from "@tabler/icons-react";
import { FolderSystemConstant } from "../../util/types";
import { FolderSystemType } from "../../util/FolderSystem";
import { twMerge } from "tailwind-merge";

const FolderButton: React.FC<{
  folderData: FolderSystemConstant;
  active: boolean;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  onInputKeyEnter: (
    ev: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
  ) => void;
}> = ({ folderData, active, onClick, onInputKeyEnter }) => {
  const { name, type } = folderData;
  const [value, setValue] = useState(name);
  const [disableInput, setDisableInput] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current && disableInput === false) {
      inputRef.current.focus();
    }
  }, [inputRef, disableInput]);

  return (
    <div
      role="button"
      className={twMerge([
        "flex w-full cursor-pointer select-none items-center justify-start gap-4 border-b-2 border-neutral-100 p-4 text-left hover:bg-neutral-200",
        active && "bg-neutral-200",
      ])}
      onBlur={() => {
        setValue(name);
        setDisableInput(true);
        window.getSelection()?.removeAllRanges()
      }}
      onDoubleClick={() => {
          setDisableInput(false);
      }}
      onClick={onClick}
    >
      {type === FolderSystemType.File ? (
        <IconFile size={20} className="text-neutral-500" />
      ) : (
        <IconFolderFilled size={20} className="text-neutral-500" />
      )}

      <input
        ref={inputRef}
        className="max-w-fit w-36 select-none bg-transparent"
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        disabled={disableInput}
        onKeyDown={(ev) => {
          if (ev.code === "Enter") {
            onInputKeyEnter(ev, value);
            setDisableInput(true);
          }
        }}
      />
      {
        type !== FolderSystemType.File && <IconCircleArrowRightFilled size={25} className="text-neutral-400 ml-auto" onDoubleClick={(ev)=>{
          ev.stopPropagation();

        }}/>
      }
      
    </div>
  );
};

export default FolderButton;
