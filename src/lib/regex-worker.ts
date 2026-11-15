import { optimize } from "regexp-tree";

import { type RegexRun, runRegex } from "@/lib/regex";

/**
 * Runs a pattern off the main thread. A regular expression cannot be
 * interrupted once it starts, so the pane times this worker out and
 * terminates it when a pattern backtracks without end.
 */

export type RegexRequest = {
  id: number;
  pattern: string;
  flags: string;
  text: string;
};
export type RegexResponse = { id: number; run: RegexRun };

/**
 * A shorter spelling of the same pattern from regexp-tree's optimizer
 * (`[0-9]` → `\d`, `aa*` → `a+`, `(?:a|b)` → `[ab]`, …). Offered only when it
 * is really shorter and finds exactly the same matches and groups in `text`.
 */
function simpler(pattern: string, flags: string, text: string, run: RegexRun) {
  if (!run.ok) return undefined;
  try {
    const regex = new RegExp(pattern, flags);
    const candidate = optimize(regex).getSource();
    if (candidate.length >= regex.source.length || candidate === pattern) {
      return undefined;
    }
    const check = runRegex(candidate, flags, text);
    if (!check.ok || check.total !== run.total) return undefined;
    const same = JSON.stringify(check.matches) === JSON.stringify(run.matches);
    return same ? candidate : undefined;
  } catch {
    // Syntax the optimizer does not know (v flag, modifiers) — no suggestion.
    return undefined;
  }
}

self.onmessage = (event: MessageEvent<RegexRequest>) => {
  const { id, pattern, flags, text } = event.data;
  const run = runRegex(pattern, flags, text);
  if (run.ok) run.simpler = simpler(pattern, flags, text, run);
  const response: RegexResponse = { id, run };
  self.postMessage(response);
};
