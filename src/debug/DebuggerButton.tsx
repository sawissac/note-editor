import React, { MouseEventHandler, ReactNode } from "react";

const DebuggerButton: React.FC<{
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
}> = ({ children, onClick }) => {
  return (
    <button className="bg-slate-500 p-4" onClick={onClick}>
      {children}
    </button>
  );
};

export default DebuggerButton;
