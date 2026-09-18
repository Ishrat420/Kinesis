"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { useFormatPreferences } from "@/lib/format/context";

/**
 * The same "formatted text behind an invisible native date input" picker the
 * newer forms use (AddTodoButton, CreateGoalButton, CaptureDetailsDialog),
 * sized down to sit inline beside Save/Cancel in a compact row -- replacing
 * the plain `<input type="date">` every reschedule/edit-due-date row here
 * used to show its raw browser chrome with. The native input is still what
 * actually submits (via `name`), just visually replaced by the formatted
 * text and icons on top of it.
 */
export function InlineDatePicker({ name, defaultValue, ariaLabel }: { name: string; defaultValue: string; ariaLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const { locale } = useFormatPreferences();

  return (
    <div
      onClick={() => inputRef.current?.showPicker?.()}
      className={`relative flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border-[1.5px] bg-white px-2.5 transition ${focused ? "border-violet-500 ring-4 ring-violet-500/15" : "border-zinc-200"}`}
    >
      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <span className="text-xs font-medium text-zinc-900">{value ? formatDate(value, locale) : "Select a date"}</span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <input
        ref={inputRef}
        type="date"
        name={name}
        required
        autoFocus
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
