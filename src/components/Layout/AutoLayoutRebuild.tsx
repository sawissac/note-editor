import React, { useEffect, useMemo } from "react";
import { useFrameStore } from "../../store/Frame";
import { debounce } from "lodash";

type AutoLayoutRebuildInterface = {
  children: React.ReactNode | React.ReactNode[];
};

const AutoLayoutRebuild: React.FC<AutoLayoutRebuildInterface> = ({
  children,
}) => {
  const [setFrame] = useFrameStore((store) => [store.setFrame]);

  const resizeDebounceCallback = useMemo(
    () => debounce((value) => setFrame(value), 120),
    [setFrame],
  );

  useEffect(() => {
    resizeDebounceCallback({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    
    window.addEventListener("resize", () => {
      resizeDebounceCallback({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    });
  }, [resizeDebounceCallback]);

  return <React.Fragment>{children}</React.Fragment>;
};

export default AutoLayoutRebuild;
