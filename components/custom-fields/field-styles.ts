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
