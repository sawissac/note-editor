import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import App from "@/App";
import { TooltipProvider as ShadcnTooltipProvider } from "@/components/shadcn/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyAppTheme } from "@/lib/color-themes";
import { createAppStore } from "@/store";
import { seedWorkspace } from "@/store/actions";

async function boot() {
  applyAppTheme();
  const { store, isFirstRun } = await createAppStore();
  if (isFirstRun) await store.dispatch(seedWorkspace());

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Provider store={store}>
        <TooltipProvider>
          <ShadcnTooltipProvider>
            <App />
          </ShadcnTooltipProvider>
        </TooltipProvider>
      </Provider>
    </StrictMode>,
  );
}

void boot();
