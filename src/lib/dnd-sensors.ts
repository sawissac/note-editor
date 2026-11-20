import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardSensorOptions,
} from "@dnd-kit/core";

/** Press-and-hold on a finger before a drag starts; shorter feels jumpy. */
export const TOUCH_HOLD_MS = 220;
/** Finger travel allowed during the hold before it counts as a scroll. */
export const TOUCH_TOLERANCE_PX = 8;

/**
 * dnd-kit sensors that work with a mouse, a finger and the keyboard.
 *
 * - Mouse: a few px of travel first, so clicks still click.
 * - Touch: press and hold {@link TOUCH_HOLD_MS}, then move. Moving sooner
 *   scrolls the page as usual — a plain `PointerSensor` would fight the
 *   browser's panning (the page scrolls *and* the item drags).
 * - Keyboard: Space/Enter lifts, arrows move, as configured.
 *
 * @param keyboard - Options for the `KeyboardSensor` (coordinate getter,
 *   key codes).
 * @param mouseDistance - Mouse travel (px) before a press becomes a drag.
 */
export function useDragSensors(
  keyboard: KeyboardSensorOptions = {},
  mouseDistance = 5,
) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: mouseDistance } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_HOLD_MS,
        tolerance: TOUCH_TOLERANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, keyboard),
  );
}
