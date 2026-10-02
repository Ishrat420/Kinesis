/**
 * A ref for a `<form action={...}>` that stays on screen after it saves:
 * `<form action={formAction} ref={keepFormValues}>`.
 *
 * React resets a form once its action finishes, through the browser's own
 * form.reset(). That's harmless for a text field React controls, whose
 * default React keeps in step, but a controlled checkbox snaps back to
 * unchecked and a controlled <select> to its first option -- while React's
 * state still holds the real value, so the screen quietly disagrees with
 * what was saved, and the next save sends what's on screen (KD-053's time
 * zone became Africa/Abidjan this way). Cancelling the reset keeps every field
 * showing what was just saved.
 *
 * A native listener, because React's own onReset never gets the chance to
 * cancel a reset React itself started.
 */
export function keepFormValues(form: HTMLFormElement | null) {
  if (!form) return;
  const cancel = (event: Event) => event.preventDefault();
  form.addEventListener("reset", cancel);
  return () => form.removeEventListener("reset", cancel);
}
