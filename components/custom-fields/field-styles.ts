/**
 * The control styling every custom-field input shares, including the Kinesis
 * Link picker. Kept in one place so a field rendered by the fields editor and
 * one rendered by quick capture cannot drift apart visually.
 *
 * A real border and real size (50px) at rest -- the same bordered/roomy
 * treatment every redesigned create/edit form uses -- in a neutral zinc
 * accent rather than any one module's colour, since this same control
 * renders inside To-Do (teal), Documents (blue), Goals (violet) and more.
 */
export const FIELD_INPUT_CLASS =
  "h-[50px] min-w-0 w-full rounded-xl border-[1.5px] border-zinc-200 bg-white px-3.5 text-base outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10 sm:text-sm";

/**
 * The modern checkbox -- native appearance stripped, filled dark when
 * checked, a Check icon layered on top by the caller (peer-checked:opacity-100).
 * `outline-none` plus a deliberately subtle focus-visible ring replaces the
 * browser's own default focus ring, which reads as a validation error (a
 * bright blue/red box around the field) rather than an ordinary focus state.
 */
export const CHECKBOX_INPUT_CLASS =
  "peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-zinc-300 bg-white outline-none transition checked:border-zinc-900 checked:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
