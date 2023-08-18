import React, { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type IsolatedLayoutInterface = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

const IsolatedLayout: React.FC<IsolatedLayoutInterface> = ({
  children,
  className,
  style,
}) => {
  return (
    <div
      className={twMerge(["w-full select-none overflow-hidden", className])}
      style={style}
    >
      {children}
    </div>
  );
};

export default IsolatedLayout;
