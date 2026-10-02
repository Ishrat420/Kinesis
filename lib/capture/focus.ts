/**
 * Asks the top bar's command bar to take focus, so the phone tab bar's +
 * opens the existing quick capture instead of a second one (KD-054).
 *
 * Dispatched synchronously from the tap itself: iOS only raises the keyboard
 * for a focus() that happens inside the user's gesture, and an event handled
 * in the same call stack still counts as that gesture.
 */
export const FOCUS_CAPTURE_EVENT = "kinesis:focus-capture";

export function requestCaptureFocus() {
  window.dispatchEvent(new Event(FOCUS_CAPTURE_EVENT));
}
