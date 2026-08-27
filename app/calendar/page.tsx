import { CalendarView } from "./CalendarView";
import { getCalendarItems } from "@/lib/data/calendar";

function validMonth(value?: string) { return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : new Date().toISOString().slice(0, 7); }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = validMonth((await searchParams).month);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const gridStart = new Date(monthStart); gridStart.setUTCDate(gridStart.getUTCDate() - ((gridStart.getUTCDay() + 6) % 7));
  const gridEnd = new Date(gridStart); gridEnd.setUTCDate(gridEnd.getUTCDate() + 41); gridEnd.setUTCHours(23, 59, 59, 999);
  return <CalendarView items={await getCalendarItems(gridStart, gridEnd)} month={month}/>;
}
