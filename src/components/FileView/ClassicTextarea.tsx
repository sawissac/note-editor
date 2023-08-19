import { px, useFrameStore } from "../../store/Frame";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useFileViewStore } from "./store";
import { debounce } from "lodash";

type ClassicTextareaInterface = {
  fileLayerId: string;
  focus: boolean;
};

const ClassicTextarea: React.FC<ClassicTextareaInterface> = ({
  fileLayerId,
  focus,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [fileData, setCurrentId, writeFile] = useFileViewStore((store) => [
    store.fileData,
    store.setCurrentId,
    store.writeFile,
  ]);
  const [FrameHeight, FrameWidth] = useFrameStore((store) => [
    store.height,
    store.width,
  ]);

  const fileWriteDebounceCallback = useMemo(
    () => debounce((id, value) => writeFile(id, value), 500),
    [writeFile],
  );

  useEffect(() => {
    if (focus && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [focus, textAreaRef]);

  useEffect(() => {
    const isExist = fileData.find((item) => item.id === fileLayerId);

    if (isExist) {
      setText(isExist.text);
    }
  }, [fileData, fileLayerId]);

  return (
    <div>
      <textarea
        id={fileLayerId}
        ref={textAreaRef}
        className="resize-none border-2 border-r-2 p-2 shadow-sm"
        onChange={(ev) => {
          setText(ev.target.value);
          fileWriteDebounceCallback(fileLayerId, ev.target.value);
        }}
        onFocus={() => setCurrentId(fileLayerId)}
        value={text}
        style={{
          width: px(FrameWidth / 2),
          height: px(FrameHeight - 83),
        }}
      />
    </div>
  );
};

export default ClassicTextarea;
