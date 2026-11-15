import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyAppTheme } from "@/lib/color-themes";
import { createAppStore } from "@/store";
import { seedWorkspace } from "@/store/actions";

/** Keep the index.html boot splash on screen at least this long. */
const MIN_SPLASH_MS = 2000;

async function boot() {
  // Timer starts now so store loading runs in parallel, not after it.
  const splashDone = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
  applyAppTheme();
  const { store, isFirstRun } = await createAppStore();
  if (isFirstRun) await store.dispatch(seedWorkspace());
  await splashDone;

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Provider store={store}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </Provider>
    </StrictMode>,
  );
}

void boot();
