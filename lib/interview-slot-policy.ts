export function roundToNextSlotBoundary(now: Date, slotIntervalMinutes: number): Date {
  const rounded = new Date(now);
  const remainder = rounded.getMinutes() % slotIntervalMinutes;
  const hasSubMinute = rounded.getSeconds() !== 0 || rounded.getMilliseconds() !== 0;

  if (remainder !== 0 || hasSubMinute) {
    rounded.setMinutes(rounded.getMinutes() + (slotIntervalMinutes - remainder), 0, 0);
  } else {
    rounded.setSeconds(0, 0);
  }

  return rounded;
}

export function isValidSlotBoundary(date: Date, slotIntervalMinutes: number): boolean {
  return (
    date.getMinutes() % slotIntervalMinutes === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

export function isEmailMatchCaseInsensitive(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function getSlotJoinDeadline(
  slotStartEpochMs: number,
  joinGraceMinutes: number
): number {
  return slotStartEpochMs + joinGraceMinutes * 60000;
}

