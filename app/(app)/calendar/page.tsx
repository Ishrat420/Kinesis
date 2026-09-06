import { CalendarView } from "./CalendarView";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { getCalendarItems } from "@/lib/data/calendar";
import { formatDateInput } from "@/lib/dates";
import { getToday } from "@/lib/format/server";

/** The month to show when none is asked for: the one the owner is currently in. */
function validMonth(value: string | undefined, today: Date) { return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : formatDateInput(today).slice(0, 7); }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = validMonth((await searchParams).month, await getToday());
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const gridStart = new Date(monthStart); gridStart.setUTCDate(gridStart.getUTCDate() - ((gridStart.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart); gridEnd.setUTCDate(gridEnd.getUTCDate() + 41); gridEnd.setUTCHours(23, 59, 59, 999);
  return (
    <ModuleContent width="full">
      <CalendarView items={await getCalendarItems(gridStart, gridEnd)} month={month}/>
    </ModuleContent>
  );
}
