const DAY_MS = 86_400_000;

export type GoalHealth = {
  status: "STAY ON TRACK" | "ON TRACK" | "AT RISK" | "AHEAD";
  message: string;
  tone: "neutral" | "good" | "risk";
  requiredPace: number;
  actualPace: number | null;
  period: "day" | "week" | "month";
};

type Snapshot = { value: number; recordedAt: Date };

function periodFor(daysRemaining: number) {
  if (daysRemaining < 14) return { name: "day" as const, days: 1 };
  if (daysRemaining < 60) return { name: "week" as const, days: 7 };
  return { name: "month" as const, days: 365.2425 / 12 };
}

function valueLabel(value: number, unit: string | null) {
  // Significant digits keep small goals useful (for example, 3 books over
  // 8 months is 0.375/month) without adding noisy cents to large targets.
  const amount = new Intl.NumberFormat("en-AU", { maximumSignificantDigits: 3 }).format(Math.abs(value));
  return unit?.startsWith("$") ? `${unit} ${amount}` : `${amount}${unit ? ` ${unit}` : ""}`;
}

function monthDifference(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (DAY_MS * 365.2425 / 12)));
}

export function calculateGoalHealth({ targetValue, currentValue, targetDate, unit, history, now = new Date() }: {
  targetValue: number;
  currentValue: number;
  targetDate: Date;
  unit: string | null;
  history: Snapshot[];
  now?: Date;
}): GoalHealth | null {
  const daysRemaining = (targetDate.getTime() - now.getTime()) / DAY_MS;
  if (daysRemaining <= 0 || targetValue === currentValue) return null;

  const period = periodFor(daysRemaining);
  const direction = Math.sign(targetValue - currentValue);
  const requiredPace = Math.abs(targetValue - currentValue) / daysRemaining * period.days;
  const ordered = [...history].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const first = ordered[0];
  const last = ordered.at(-1);
  const elapsedDays = first && last ? (last.recordedAt.getTime() - first.recordedAt.getTime()) / DAY_MS : 0;

  if (!first || !last || ordered.length < 2 || elapsedDays <= 0) {
    return {
      status: "STAY ON TRACK",
      message: `You need to reach about ${valueLabel(requiredPace, unit)}/${period.name} to reach this goal.`,
      tone: "neutral",
      requiredPace,
      actualPace: null,
      period: period.name,
    };
  }

  const rawDailyPace = (last.value - first.value) / elapsedDays;
  const actualPace = direction * rawDailyPace * period.days;
  const ratio = actualPace / requiredPace;
  if (ratio >= 1.1) {
    const remainingDaysAtPace = Math.abs(targetValue - currentValue) / (direction * rawDailyPace);
    const expectedFinish = new Date(now.getTime() + remainingDaysAtPace * DAY_MS);
    const monthsAhead = monthDifference(expectedFinish, targetDate);
    return { status: "AHEAD", message: monthsAhead > 0 ? `You're approximately ${monthsAhead} month${monthsAhead === 1 ? "" : "s"} ahead.` : "You're ahead of the pace needed to reach this goal.", tone: "good", requiredPace, actualPace, period: period.name };
  }
  if (ratio >= 0.9) {
    return { status: "ON TRACK", message: `Your average pace of ${valueLabel(actualPace, unit)}/${period.name} is on track.`, tone: "good", requiredPace, actualPace, period: period.name };
  }

  const projected = currentValue + rawDailyPace * daysRemaining;
  const date = targetDate.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  return { status: "AT RISK", message: `At your current pace, you're projected to reach about ${valueLabel(projected, unit)} by ${date}.`, tone: "risk", requiredPace, actualPace, period: period.name };
}
