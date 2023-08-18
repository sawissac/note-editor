import React, { ReactNode } from "react";
import { useScrollModeStore } from "../../store/scrollMode";
import { twMerge } from "tailwind-merge";

type ScrollableLayoutInterface = {
  children: ReactNode;
  scrollType?: "x" | "y" | "xy";
  className?: string;
  style?: React.CSSProperties
};

const ScrollableLayout: React.FC<ScrollableLayoutInterface> = ({
  children,
  scrollType = "y",
  className,
  style
}) => {
  const scrollDisable = useScrollModeStore((store) => store.scrollDisable);
  return (
    <div
      className={twMerge([
        "w-full pb-40 overflow-hidden",
        className,
        scrollDisable && scrollType === "y"
          ? "overflow-y-hidden"
          : scrollType === "y" && "overflow-y-auto",
        scrollDisable && scrollType === "x"
          ? "overflow-x-hidden"
          : scrollType === "x" && "overflow-x-auto",
        scrollDisable && scrollType === "xy"
          ? "overflow-x-hidden overflow-y-hidden"
          : scrollType === "xy" && "overflow-x-auto overflow-y-auto",
      ])}
      style={style}
    >
      {children}
    </div>
  );
};

export default ScrollableLayout;
