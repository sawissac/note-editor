import React, { ReactNode } from "react";

const Debugger: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="fixed bottom-0 left-0 z-50 flex w-[400px] overflow-x-auto overflow-y-hidden">
      {children}
    </div>
  );
};

export default Debugger;
