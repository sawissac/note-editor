import type { ReactNode } from "react";

import { NotAvailable } from "@/features/workspace/NotAvailable";
import { useIsDesktop } from "@/lib/desktop-only";

/**
 * Covers the running app with the "not available" screen whenever the window
 * stops qualifying as a desktop (shrunk below 1024px, or switched to a touch
 * device in DevTools). The app stays mounted underneath, so unsaved state
 * survives and it comes back as soon as the window qualifies again.
 */
export function DesktopGate({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  return (
    <>
      {children}
      {!isDesktop && <NotAvailable />}
    </>
  );
}
