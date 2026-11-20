import * as React from "react"

/**
 * Touch gesture guard for the Extend document surfaces (react-docx pages,
 * react-xlsx grid).
 *
 * Both libraries start a text / cell-range selection on `pointerdown` and
 * extend it on every `pointermove`, without looking at `pointerType`. With a
 * finger that means a swipe meant to scroll the page also drags a selection
 * across everything it passes (and, in the Word editor, focuses the hidden
 * input — popping the on-screen keyboard — on every scroll).
 *
 * This guard sits in front of them for touch pointers only (mouse and pen
 * pass straight through, so desktop behaviour is unchanged):
 *
 * - **Tap** (lift before {@link HOLD_MS}, within {@link SLOP}) → the press is
 *   replayed to the library on lift, so it places the caret / selects the
 *   cell exactly as a click does.
 * - **Swipe** (move before the hold fires) → plain native scrolling; the
 *   library never sees the pointer.
 * - **Press and hold, then drag** → the press is handed to the library when
 *   the hold fires, native scrolling is blocked, and the drag extends the
 *   selection (text range / cell range).
 * - **Press and hold, lift without moving** → opens the surface's context
 *   menu at the finger (a `contextmenu` event, as a right-click would), which
 *   is the only way to reach the libraries' table / row / column / image
 *   actions without a mouse.
 *
 * Listeners sit on `window` in the capture phase so they run before React's
 * root listeners (the libraries use both bubble and capture React handlers).
 */

/** Hold this long before a touch becomes a selection drag / long-press. */
const HOLD_MS = 450
/** Movement before the hold fires that marks the touch as a scroll. */
const SLOP = 8

/** Events we dispatch ourselves — the guard lets these through. */
const replayed = new WeakSet<Event>()

type Mode = "pending" | "scroll" | "select"
type Gesture = {
  pointerId: number
  target: Element
  mode: Mode
  startX: number
  startY: number
  moved: boolean
  timer: number
  /** A native long-press `contextmenu` already fired (Android Chrome). */
  nativeMenu: boolean
  init: PointerEventInit
}

/**
 * The libraries call `setPointerCapture` on the replayed press. On lift the
 * touch pointer is no longer active, which throws `NotFoundError` and aborts
 * their handler halfway; swallow that while a replay is dispatched.
 */
function dispatchReplay(target: Element, event: Event) {
  const proto = Element.prototype
  const setCapture = proto.setPointerCapture
  const releaseCapture = proto.releasePointerCapture
  proto.setPointerCapture = function (pointerId: number) {
    try {
      setCapture.call(this, pointerId)
    } catch {
      /* pointer already lifted */
    }
  }
  proto.releasePointerCapture = function (pointerId: number) {
    try {
      releaseCapture.call(this, pointerId)
    } catch {
      /* pointer already lifted */
    }
  }
  try {
    replayed.add(event)
    target.dispatchEvent(event)
  } finally {
    proto.setPointerCapture = setCapture
    proto.releasePointerCapture = releaseCapture
  }
}

function pointerInit(event: PointerEvent): PointerEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    width: event.width,
    height: event.height,
    button: 0,
  }
}

/** True when `target` or an ancestor up to `host` opts out of panning. */
function inNoPanZone(target: Element, host: Element) {
  for (
    let node: Element | null = target;
    node && node !== host;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).touchAction === "none") return true
  }
  return false
}

export type TouchSelectionGuardOptions = {
  /** Only guard presses the library would turn into a selection drag. */
  shouldGuard: (target: Element) => boolean
  /** Turn the guard off (e.g. read-only text keeps native selection). */
  disabled?: boolean
}

/**
 * Applies the touch gesture guard (see module doc) to `host`. Elements the
 * library marks `touch-action: none` (resize handles, move grips) are never
 * guarded — they are drag surfaces by design.
 */
export function useTouchSelectionGuard(
  host: HTMLElement | null,
  { shouldGuard, disabled = false }: TouchSelectionGuardOptions
) {
  const shouldGuardRef = React.useRef(shouldGuard)
  React.useEffect(() => {
    shouldGuardRef.current = shouldGuard
  }, [shouldGuard])

  React.useEffect(() => {
    if (!host || disabled) return
    let gesture: Gesture | null = null

    const end = () => {
      if (gesture) window.clearTimeout(gesture.timer)
      gesture = null
    }

    const onDown = (event: PointerEvent) => {
      if (replayed.has(event) || event.pointerType !== "touch") return
      const target = event.target
      if (!(target instanceof Element) || !host.contains(target)) return
      // A second finger (pinch): drop the pending press, leave it native.
      if (gesture) {
        if (gesture.pointerId !== event.pointerId) {
          if (gesture.mode === "pending") gesture.mode = "scroll"
          event.stopImmediatePropagation()
        }
        return
      }
      if (inNoPanZone(target, host) || !shouldGuardRef.current(target)) return
      event.stopImmediatePropagation()
      const next: Gesture = {
        pointerId: event.pointerId,
        target,
        mode: "pending",
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        timer: 0,
        nativeMenu: false,
        init: pointerInit(event),
      }
      next.timer = window.setTimeout(() => {
        if (gesture !== next || next.mode !== "pending") return
        next.mode = "select"
        // Hand the press over while the finger is still down, so the
        // library's pointer capture and drag tracking work as with a mouse.
        dispatchReplay(
          next.target,
          new PointerEvent("pointerdown", { ...next.init, buttons: 1 })
        )
      }, HOLD_MS)
      gesture = next
    }

    const onMove = (event: PointerEvent) => {
      if (replayed.has(event) || !gesture) return
      if (event.pointerId !== gesture.pointerId) return
      const far =
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY
        ) > SLOP
      if (gesture.mode === "select") {
        if (far) gesture.moved = true
        return // the library extends its selection
      }
      if (far && gesture.mode === "pending") {
        gesture.mode = "scroll"
        window.clearTimeout(gesture.timer)
      }
      event.stopImmediatePropagation()
    }

    const onUp = (event: PointerEvent) => {
      if (replayed.has(event) || !gesture) return
      if (event.pointerId !== gesture.pointerId) return
      const current = gesture
      end()
      if (current.mode === "select") {
        // Let the real lift reach the library, then open the menu if the
        // finger never moved (long-press = right-click).
        if (!current.moved && !current.nativeMenu) {
          const { clientX, clientY } = current.init
          window.setTimeout(() => {
            const menuTarget =
              document.elementFromPoint(clientX ?? 0, clientY ?? 0) ??
              current.target
            menuTarget.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                button: 2,
                buttons: 0,
                clientX,
                clientY,
              })
            )
          }, 0)
        }
        return
      }
      event.stopImmediatePropagation()
      if (current.mode === "pending") {
        // A tap: replay it as a complete press so the library places the
        // caret / selects the cell.
        dispatchReplay(
          current.target,
          new PointerEvent("pointerdown", { ...current.init, buttons: 1 })
        )
        dispatchReplay(
          current.target,
          new PointerEvent("pointerup", { ...current.init, buttons: 0 })
        )
      }
    }

    const onCancel = (event: PointerEvent) => {
      if (replayed.has(event) || !gesture) return
      if (event.pointerId !== gesture.pointerId) return
      const current = gesture
      end()
      if (current.mode !== "select") event.stopImmediatePropagation()
    }

    const onContextMenu = (event: MouseEvent) => {
      if (event.isTrusted && gesture) gesture.nativeMenu = true
    }

    // Block native panning only while a held press is dragging a selection.
    const onTouchMove = (event: TouchEvent) => {
      if (gesture?.mode === "select" && event.cancelable) event.preventDefault()
    }

    const capture = { capture: true }
    window.addEventListener("pointerdown", onDown, capture)
    window.addEventListener("pointermove", onMove, capture)
    window.addEventListener("pointerup", onUp, capture)
    window.addEventListener("pointercancel", onCancel, capture)
    window.addEventListener("contextmenu", onContextMenu, capture)
    host.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => {
      end()
      window.removeEventListener("pointerdown", onDown, capture)
      window.removeEventListener("pointermove", onMove, capture)
      window.removeEventListener("pointerup", onUp, capture)
      window.removeEventListener("pointercancel", onCancel, capture)
      window.removeEventListener("contextmenu", onContextMenu, capture)
      host.removeEventListener("touchmove", onTouchMove)
    }
  }, [host, disabled])
}

/**
 * Wraps a synthetic press for code that fakes a click on a library surface
 * (e.g. placing the caret programmatically): `setPointerCapture` throws for
 * a pointer id that is not active — always the case on a touch-only device,
 * which has no mouse pointer — and would abort the library's handler.
 */
export function dispatchSyntheticPointer(target: Element, event: Event) {
  dispatchReplay(target, event)
}
