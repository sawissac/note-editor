import { MonitorSmartphone } from "lucide-react";

/**
 * Full-screen "not available" screen for phones, tablets and windows
 * narrower than 1024px. `main.tsx` renders it alone when the device isn't a
 * desktop at boot (the store and editors never load); `DesktopGate` lays it
 * over the running app when the window stops qualifying later.
 *
 * Test id: `not-available-screen` (root).
 */
export function NotAvailable() {
  return (
    <main className="not-available" data-testid="not-available-screen">
      <MonitorSmartphone className="not-available__icon" aria-hidden />
      <h1 className="not-available__title">Not available on this device</h1>
      <p className="not-available__message">Open Bento on a desktop.</p>
    </main>
  );
}
