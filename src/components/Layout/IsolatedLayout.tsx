import React, { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type IsolatedLayoutInterface = { children: ReactNode; className?: string };

const IsolatedLayout: React.FC<IsolatedLayoutInterface> = ({
  children,
  className,
}) => {
  return (
    <div
      className={twMerge([
        "h-screen w-full select-none overflow-hidden",
        className,
      ])}
    >
      {children}
    </div>
  );
};

export default IsolatedLayout;
