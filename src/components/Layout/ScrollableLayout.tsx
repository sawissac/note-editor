import React, { ReactNode } from "react";
import { useScrollModeStore } from "../../store/scrollMode";
import { twMerge } from "tailwind-merge";

type ScrollableLayoutInterface = {
  children: ReactNode;
};

const ScrollableLayout: React.FC<ScrollableLayoutInterface> = ({children}) => {
  const scrollDisable = useScrollModeStore((store) => store.scrollDisable);
  return (
    <div
      className={twMerge([
        "h-screen w-full overflow-x-hidden pb-40",
        scrollDisable ? "overflow-y-hidden" : "overflow-y-auto",
      ])}
    >
      {children}
    </div>
  );
};

export default ScrollableLayout;
