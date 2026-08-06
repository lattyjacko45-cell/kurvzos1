/**
 * Dependency-free IANA timezone conversion.
 *
 * Scheduling needs an exact instant: the user picks "3:00 PM" in their zone and
 * YouTube needs the corresponding UTC timestamp. Rather than add a date
 * library, we use Intl to read the zone's offset at the candidate instant.
 */

/** Offset (ms) that `timeZone` is ahead of UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - instant.getTime();
}

/**
 * Converts a wall-clock `YYYY-MM-DDTHH:mm` in `timeZone` to a UTC Date.
 * The second pass settles DST boundaries, where the offset at the guessed
 * instant differs from the offset at the true instant.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const naiveUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );

  let instant = naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone);
  instant = naiveUtc - zoneOffsetMs(new Date(instant), timeZone);

  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Formats a UTC instant back into the user's zone for display. */
export function formatInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
