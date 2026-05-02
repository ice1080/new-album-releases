/**
 * Parses Tidal `releaseDate` into a `Date` without shifting the calendar day.
 *
 * - `YYYY-MM-DD` is treated as local midnight (prevents "one day behind")
 * - `YYYY-MM-DDTHH:mm(:ss(.sss))?` without timezone is treated as local time
 * - ISO strings with an explicit timezone (`Z` or `+/-HH:mm`) are parsed normally
 */
export function parseReleaseDate(releaseDate: string): Date | null {
  const trimmed = releaseDate.trim();
  if (!trimmed) return null;

  // Date-only: YYYY-MM-DD
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month - 1, day);
  }

  // Datetime without timezone suffix: treat as local time
  const dateTimeNoTzMatch = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(
    trimmed
  );
  if (dateTimeNoTzMatch) {
    const year = Number(dateTimeNoTzMatch[1]);
    const month = Number(dateTimeNoTzMatch[2]);
    const day = Number(dateTimeNoTzMatch[3]);
    const hour = Number(dateTimeNoTzMatch[4]);
    const minute = Number(dateTimeNoTzMatch[5]);
    const second = dateTimeNoTzMatch[6] ? Number(dateTimeNoTzMatch[6]) : 0;
    const fraction = dateTimeNoTzMatch[7] ? dateTimeNoTzMatch[7] : '0';
    const millisecond =
      fraction.length === 1
        ? Number(fraction) * 100
        : fraction.length === 2
          ? Number(fraction) * 10
          : Number(fraction);

    return new Date(year, month - 1, day, hour, minute, second, millisecond);
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) return null;
  return new Date(parsedMs);
}

