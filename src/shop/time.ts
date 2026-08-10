/**
 * Wall clock time, without `Date`.
 *
 * The barbershop only ever thinks in local wall clock time: "quarta às 15:30".
 * `Date` cannot express that without dragging in a timezone, and a timezone is
 * exactly what turns a booking bug into an afternoon of debugging. So a day is
 * the string the barber would write, an hour is a count of minutes, and the
 * arithmetic is done here by hand.
 *
 * `Date` appears once in this project, in `src/sim/clock.ts`, to ask the
 * browser what day it is. Nothing below that boundary knows a timezone exists.
 */

/** A civil date, `YYYY-MM-DD`. */
export type Day = string;

/** Minutes since midnight. 570 is 09:30. */
export type Minutes = number;

/** A point in time: a day and an hour of that day. */
export type Moment = { day: Day; at: Minutes };

/** 0 is domingo, 6 is sábado. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DayParts = { year: number; month: number; day: number };

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Days since 1970-01-01, by the days-from-civil algorithm.
 *
 * The trick is shifting the year to start in March, so the leap day lands at
 * the end of the year and stops being a special case. After the shift, a year
 * is five month-lengths repeating (153 days every 5 months), which is the
 * `(153 * mp + 2) / 5` term, and the leap rule is three plain divisions over
 * the 400 year era. No month length table, no `if` on February.
 */
export function dayNumber(day: Day): number {
  const { year, month, day: d } = parts(day);
  return dayNumberOf(year, month, d);
}

function dayNumberOf(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400; // [0, 399]
  const monthShifted = month + (month > 2 ? -3 : 9); // March is 0
  const dayOfYear = Math.floor((153 * monthShifted + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468; // 719468 shifts the origin to 1970-01-01
}

/** The inverse of `dayNumber`, the same algorithm read backwards. */
export function dayFromNumber(n: number): Day {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097; // [0, 146096]
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100));
  const monthShifted = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthShifted + 2) / 5) + 1;
  const month = monthShifted + (monthShifted < 10 ? 3 : -9);
  return format({ year: year + (month <= 2 ? 1 : 0), month, day });
}

/** `2026-08-10` plus 3 days is addition, not calendar code. */
export function addDays(day: Day, n: number): Day {
  return dayFromNumber(dayNumber(day) + n);
}

export function daysBetween(from: Day, to: Day): number {
  return dayNumber(to) - dayNumber(from);
}

/** 1970-01-01 was a Thursday, so shifting by 4 puts domingo at 0. */
export function weekday(day: Day): Weekday {
  const n = dayNumber(day);
  return (((n + 4) % 7) + 7) % 7 as Weekday;
}

export function parts(day: Day): DayParts {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`dia inválido: ${day}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function format({ year, month, day }: DayParts): Day {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * A day is valid when it survives the round trip.
 *
 * `2026-02-30` parses fine and `dayNumberOf` happily counts it as two days
 * after the end of February, so the cheap check is to count the days and count
 * back: a date that does not exist comes back as a different string.
 */
export function isDay(text: string): text is Day {
  const match = DAY_PATTERN.exec(text);
  if (!match) return false;
  return dayFromNumber(dayNumberOf(Number(match[1]), Number(match[2]), Number(match[3]))) === text;
}

/** 570 becomes `09:30`. Digits only, so it is not wording and lives here. */
export function hhmm(at: Minutes): string {
  return `${pad(Math.floor(at / 60), 2)}:${pad(at % 60, 2)}`;
}

/** `09:30` and `9h30` and `9h` all become 570. Anything else is null. */
export function parseHhmm(text: string): Minutes | null {
  const match = /^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Negative when `a` is earlier, so it sorts. */
export function compare(a: Moment, b: Moment): number {
  const days = dayNumber(a.day) - dayNumber(b.day);
  return days !== 0 ? days : a.at - b.at;
}

export function plusMinutes(moment: Moment, n: Minutes): Moment {
  const total = moment.at + n;
  return {
    day: addDays(moment.day, Math.floor(total / (24 * 60))),
    at: ((total % (24 * 60)) + 24 * 60) % (24 * 60),
  };
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, "0");
}
