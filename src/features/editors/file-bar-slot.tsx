import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";

const FileBarSlotContext = React.createContext<HTMLElement | null>(null);

/** Supplies the file bar's slot element to the editor rendered below it. */
export function FileBarSlotProvider({
  slot,
  children,
}: {
  slot: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <FileBarSlotContext.Provider value={slot}>
      {children}
    </FileBarSlotContext.Provider>
  );
}

/**
 * An editor's own top bar, merged into the app's file bar. Inside a pane the
 * children are portalled into the file bar's slot (so the pane shows one bar
 * instead of two stacked ones); anywhere else they render in place inside a
 * div with the original `className`. React context — tooltips, editor state —
 * flows through the portal unchanged.
 */
export function FileBarSlot({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const slot = React.useContext(FileBarSlotContext);
  if (slot) {
    return createPortal(
      <div
        data-slot="file-bar-slot-content"
        className="flex min-w-0 flex-1 items-center justify-end gap-1.5"
      >
        {children}
      </div>,
      slot,
    );
  }
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
}
