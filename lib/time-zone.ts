const DEFAULT_TIME_ZONE = "Asia/Tokyo";

function parseDateText(dateText: string): { year: number; month: number; day: number } | null {
  const match = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (![year, month, day].every(Number.isFinite)) {
    return null;
  }

  return { year, month, day };
}

function getDateTimeParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((item) => item.type === type)?.value;
    return part ? Number(part) : 0;
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDateTimeParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );
  return localAsUtc - date.getTime();
}

export function getAppTimeZone(): string {
  return process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() || DEFAULT_TIME_ZONE;
}

export function formatDateInTimeZone(epochSecond: number, timeZone = getAppTimeZone()): string {
  const parts = getDateTimeParts(new Date(epochSecond * 1000), timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDayStartEpoch(dateText: string, timeZone = getAppTimeZone()): number | null {
  const parts = parseDateText(dateText);
  if (!parts) {
    return null;
  }

  const targetUtcLike = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  let epochMs = targetUtcLike;

  for (let i = 0; i < 3; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(epochMs), timeZone);
    const nextEpochMs = targetUtcLike - offsetMs;
    if (nextEpochMs === epochMs) {
      break;
    }
    epochMs = nextEpochMs;
  }

  return Math.floor(epochMs / 1000);
}

export function getDayEndEpoch(dateText: string, timeZone = getAppTimeZone()): number | null {
  const start = getDayStartEpoch(dateText, timeZone);
  if (start === null) {
    return null;
  }
  return start + 86400 - 1;
}

export function getTodayStartEpoch(timeZone = getAppTimeZone()): number {
  const parts = getDateTimeParts(new Date(), timeZone);
  const todayText = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return getDayStartEpoch(todayText, timeZone) ?? Math.floor(Date.now() / 1000);
}

export function getWeekKey(epochSecond: number, timeZone = getAppTimeZone()): string {
  const parts = getDateTimeParts(new Date(epochSecond * 1000), timeZone);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayOfWeek = utcDate.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - mondayOffset);
  return utcDate.toISOString().slice(0, 10);
}