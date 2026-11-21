/**
 * iPadOS keyboard clean-up.
 *
 * Two things iPadOS can leave behind after the on-screen keyboard (or the
 * hardware-keyboard shortcut bar) closes, both showing as a blank strip
 * under the status bar:
 *
 * 1. The page stays scrolled: on focus iPadOS scrolls the page itself to
 *    keep the caret visible, and the app — a fixed, non-scrolling shell —
 *    never scrolls it back.
 * 2. The layout viewport stays short: `position: fixed; bottom: 0` and
 *    `100%` keep measuring the keyboard-sized viewport.
 *
 * So once no text field is focused (keyboard gone), this scrolls the page
 * back to 0,0 and publishes the real visible height as `--app-height`,
 * which `.app-shell` (src/styles/app-shell.css) uses for its height.
 * While a field is focused nothing changes, so the shell never jumps under
 * the user's fingers mid-typing.
 *
 * Desktop: the page never scrolls and the visual viewport equals the
 * window, so this only ever writes the window height.
 */

function editableFocused() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLInputElement &&
      ![
        "button",
        "checkbox",
        "radio",
        "range",
        "color",
        "file",
        "submit",
        "reset",
      ].includes(el.type))
  );
}

function sync() {
  // Still typing (keyboard up, or focus moved to another field).
  if (editableFocused()) return;
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  const root = document.scrollingElement;
  if (root && (root.scrollTop !== 0 || root.scrollLeft !== 0)) {
    root.scrollTop = 0;
    root.scrollLeft = 0;
  }
  const vv = window.visualViewport;
  // Pinch-zoomed: the visual viewport is a magnified window, not the
  // screen; keep the last good height.
  if (vv && Math.abs(vv.scale - 1) > 0.01) return;
  const height = Math.round(
    Math.max(vv?.height ?? 0, window.innerHeight),
  );
  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

let installed = false;

/** Starts the listeners (idempotent) and sets the first height. */
export function installViewportReset() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let timer = 0;
  const later = () => {
    window.clearTimeout(timer);
    // After the keyboard's close animation, when the viewport has settled.
    timer = window.setTimeout(sync, 120);
  };
  document.addEventListener("focusout", later);
  window.visualViewport?.addEventListener("resize", later);
  // Desktop window drags: follow at once, no settle delay.
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", later);
  sync();
}
