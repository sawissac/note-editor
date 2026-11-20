import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import App from "@/App";
import { MotionProvider } from "@/components/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyAppTheme } from "@/lib/color-themes";
import { installTouchDrag } from "@/lib/touch-drag";
import { createAppStore } from "@/store";
import { seedWorkspace } from "@/store/actions";

/**
 * In production the entry stylesheet loads without blocking first paint
 * (see `nonBlockingEntryCss` in vite.config.ts). Resolve once it applies so
 * React never renders unstyled. Dev injects CSS from JS: no link, no wait.
 */
function appStylesReady(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>("link[data-app-css]");
  if (!link || link.media === "all") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      link.media = "all";
      resolve();
    };
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
  });
}

/**
 * Keep the index.html boot splash on screen at least this long. Note: the
 * app (and so LCP) paints no earlier than this, which costs Lighthouse score.
 */
const MIN_SPLASH_MS = 2000;

async function boot() {
  // Timer starts now so store + CSS loading run in parallel, not after it.
  const splashDone = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
  applyAppTheme();
  // Long-press-and-move drags rows, tabs and cards on touch screens.
  installTouchDrag();
  const { store, isFirstRun } = await createAppStore();
  if (isFirstRun) await store.dispatch(seedWorkspace());
  await Promise.all([appStylesReady(), splashDone]);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Provider store={store}>
        <MotionProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </MotionProvider>
      </Provider>
    </StrictMode>,
  );
}

void boot();
