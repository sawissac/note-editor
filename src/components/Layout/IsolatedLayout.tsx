import React, { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

const IsolatedLayout: React.FC<{ children: ReactNode; className?: string }> = ({
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
