/**
 * Announces a to-do the phone's capture sheet just created (KD-057), so the
 * top bar shows the same confirmation -- Undo, Add details -- as for its own
 * captures, instead of a second confirmation of its own.
 */
export const CAPTURED_EVENT = "kinesis:captured";
export type CapturedDetail = { id: string; name: string };

export function announceCaptured(todo: CapturedDetail) {
  window.dispatchEvent(new CustomEvent<CapturedDetail>(CAPTURED_EVENT, { detail: todo }));
}
