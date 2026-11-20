/**
 * Touch bridge for the app's HTML5 drag-and-drop (explorer rows, tabs,
 * bookmark cards, …).
 *
 * Touch screens never fire `dragstart`/`dragover`/`drop` for in-page
 * elements reliably (iPadOS lifts some natively, Chrome touch never does),
 * so this turns a **press-and-hold, then move** on any `[draggable="true"]`
 * element into the same DOM drag events a mouse produces. Every existing
 * `onDragStart` / `onDragOver` / `onDrop` handler then works unchanged.
 *
 * Gesture:
 * - Move before the hold fires → it is a scroll; the bridge steps aside.
 * - Hold {@link HOLD_MS} → the element lifts (`data-touch-drag="armed"`).
 *   Move now and the drag starts; a ghost copy follows the finger.
 * - Keep holding still and the Radix context menu's own long-press (700ms)
 *   opens instead — once a menu is open the drag is abandoned.
 * - Near a scroller's edge the scroller auto-scrolls.
 *
 * Why not `@dragdroptouch/drag-drop-touch`: its press-hold mode starts the
 * drag the instant the hold fires (no move needed), which swallows the
 * long-press context menu every row relies on, and it synthesises extra
 * mouse/click events that double-fire React handlers.
 */

/** Hold this long before a touch may turn into a drag. */
const HOLD_MS = 280;
/** Movement before the hold fires that marks the touch as a scroll. */
const SCROLL_SLOP = 10;
/** Movement after the hold that starts the drag. */
const START_SLOP = 4;
/** Distance from a scroller's edge that auto-scrolls it. */
const EDGE = 36;
/** Max auto-scroll per frame, px. */
const EDGE_SPEED = 14;

/** Minimal `DataTransfer` stand-in; only what the app's handlers use. */
class TouchDataTransfer {
  dropEffect: DataTransfer["dropEffect"] = "move";
  effectAllowed: DataTransfer["effectAllowed"] = "all";
  readonly files = Object.assign([] as File[], {
    item: () => null,
  }) as unknown as FileList;
  readonly items = [] as unknown as DataTransferItemList;
  image: { el: HTMLElement; x: number; y: number } | null = null;
  private data = new Map<string, string>();

  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(type: string, value: string) {
    this.data.set(type.toLowerCase(), value);
  }
  getData(type: string) {
    return this.data.get(type.toLowerCase()) ?? "";
  }
  clearData(type?: string) {
    if (type) this.data.delete(type.toLowerCase());
    else this.data.clear();
  }
  /** The app's custom previews are removed a frame later, so copy now. */
  setDragImage(el: Element, x: number, y: number) {
    this.image = { el: el.cloneNode(true) as HTMLElement, x, y };
  }
}

type Point = { clientX: number; clientY: number };

/** Dispatches a drag-family DOM event that React's root listener picks up. */
function fire(
  type: string,
  target: EventTarget,
  point: Point,
  dataTransfer: TouchDataTransfer,
  relatedTarget: EventTarget | null = null,
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: type !== "dragleave" && type !== "dragend",
    composed: true,
  });
  const props: Record<string, unknown> = {
    dataTransfer,
    relatedTarget,
    clientX: point.clientX,
    clientY: point.clientY,
    pageX: point.clientX + window.scrollX,
    pageY: point.clientY + window.scrollY,
    screenX: point.clientX,
    screenY: point.clientY,
    button: 0,
    buttons: 1,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { value });
  }
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function isEditable(el: Element) {
  return (
    el.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Nearest ancestor that can still scroll along either axis. */
function scrollerOf(el: Element | null): HTMLElement | null {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    const y = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const x = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (x || y) return node;
  }
  return null;
}

function contextMenuOpen() {
  return document.querySelector(
    '[data-slot="context-menu-content"], [data-slot="dropdown-menu-content"]',
  ) !== null;
}

type Session = {
  source: HTMLElement;
  start: Point;
  last: Point;
  armed: boolean;
  dragging: boolean;
  holdTimer: number;
  dataTransfer: TouchDataTransfer;
  ghost: HTMLElement | null;
  offset: { x: number; y: number };
  over: Element | null;
  canDrop: boolean;
  frame: number;
};

let session: Session | null = null;

function end(drop: boolean) {
  const s = session;
  if (!s) return;
  session = null;
  window.clearTimeout(s.holdTimer);
  cancelAnimationFrame(s.frame);
  delete s.source.dataset.touchDrag;
  if (s.dragging) {
    if (drop && s.over && s.canDrop) fire("drop", s.over, s.last, s.dataTransfer);
    else if (s.over) fire("dragleave", s.over, s.last, s.dataTransfer);
    // The source may have been virtualised away; its handlers still need
    // their cleanup, so fall back to the document.
    fire(
      "dragend",
      s.source.isConnected ? s.source : document,
      s.last,
      s.dataTransfer,
    );
  }
  s.ghost?.remove();
}

function makeGhost(s: Session) {
  const rect = s.source.getBoundingClientRect();
  const custom = s.dataTransfer.image;
  const ghost = custom ? custom.el : (s.source.cloneNode(true) as HTMLElement);
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.classList.add("touch-drag-ghost");
  ghost.setAttribute("aria-hidden", "true");
  if (custom) {
    s.offset = { x: custom.x, y: custom.y };
    ghost.style.position = "fixed";
  } else {
    s.offset = { x: s.start.clientX - rect.left, y: s.start.clientY - rect.top };
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
  }
  document.body.appendChild(ghost);
  s.ghost = ghost;
}

function moveGhost(s: Session) {
  if (!s.ghost) return;
  const x = s.last.clientX - s.offset.x;
  const y = s.last.clientY - s.offset.y;
  s.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

/** One drag step at the finger's position: enter/leave, then dragover. */
function step(s: Session) {
  const target =
    document.elementFromPoint(s.last.clientX, s.last.clientY) ?? document.body;
  fire("drag", s.source, s.last, s.dataTransfer);
  if (target !== s.over) {
    if (s.over) fire("dragleave", s.over, s.last, s.dataTransfer, target);
    fire("dragenter", target, s.last, s.dataTransfer, s.over);
    s.over = target;
  }
  s.canDrop = fire("dragover", target, s.last, s.dataTransfer);
  return target;
}

/** Keeps scrolling while the finger rests near a scroller's edge. */
function autoScroll() {
  const s = session;
  if (!s?.dragging) return;
  const scroller = scrollerOf(s.over);
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    const { clientX: x, clientY: y } = s.last;
    const speed = (d: number) => Math.ceil(((EDGE - d) / EDGE) * EDGE_SPEED);
    let dx = 0;
    let dy = 0;
    if (y - r.top < EDGE) dy = -speed(y - r.top);
    else if (r.bottom - y < EDGE) dy = speed(r.bottom - y);
    if (x - r.left < EDGE) dx = -speed(x - r.left);
    else if (r.right - x < EDGE) dx = speed(r.right - x);
    if (dx || dy) {
      scroller.scrollBy(dx, dy);
      step(s);
    }
  }
  s.frame = requestAnimationFrame(autoScroll);
}

function onTouchStart(e: TouchEvent) {
  end(false);
  if (e.touches.length !== 1) return;
  const target = e.target as Element | null;
  if (!target || !(target instanceof Element) || isEditable(target)) return;
  const source = target.closest<HTMLElement>('[draggable="true"]');
  if (!source) return;
  const touch = e.touches[0];
  const start = { clientX: touch.clientX, clientY: touch.clientY };
  const s: Session = {
    source,
    start,
    last: start,
    armed: false,
    dragging: false,
    holdTimer: 0,
    dataTransfer: new TouchDataTransfer(),
    ghost: null,
    offset: { x: 0, y: 0 },
    over: null,
    canDrop: false,
    frame: 0,
  };
  s.holdTimer = window.setTimeout(() => {
    s.armed = true;
    source.dataset.touchDrag = "armed";
  }, HOLD_MS);
  session = s;
}

function onTouchMove(e: TouchEvent) {
  const s = session;
  if (!s) return;
  if (e.touches.length !== 1) return end(false);
  const touch = e.touches[0];
  s.last = { clientX: touch.clientX, clientY: touch.clientY };
  const distance = Math.hypot(
    s.last.clientX - s.start.clientX,
    s.last.clientY - s.start.clientY,
  );

  if (!s.armed) {
    // Moved before the hold: the finger is scrolling.
    if (distance > SCROLL_SLOP) end(false);
    return;
  }

  if (!s.dragging) {
    if (contextMenuOpen()) return end(false);
    if (distance < START_SLOP) {
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (fire("dragstart", s.source, s.start, s.dataTransfer)) return end(false);
    s.dragging = true;
    s.source.dataset.touchDrag = "dragging";
    makeGhost(s);
    s.frame = requestAnimationFrame(autoScroll);
  }

  if (e.cancelable) e.preventDefault();
  moveGhost(s);
  step(s);
}

function onTouchEnd(e: TouchEvent) {
  const s = session;
  if (!s) return;
  // A finished drag must not also click whatever is under the finger.
  if (s.dragging && e.cancelable) e.preventDefault();
  end(e.type === "touchend");
}

let installed = false;

/**
 * Starts the bridge (idempotent). Cheap on mouse-only machines: the
 * listeners only ever react to touch events.
 */
export function installTouchDrag() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
  document.addEventListener("touchcancel", onTouchEnd, { passive: false, capture: true });
}
