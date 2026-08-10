import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  compare,
  dayFromNumber,
  dayNumber,
  daysBetween,
  hhmm,
  isDay,
  parseHhmm,
  plusMinutes,
  weekday,
} from "../src/shop/time.ts";

test("the origin of the count is 1970-01-01", () => {
  assert.equal(dayNumber("1970-01-01"), 0);
  assert.equal(dayFromNumber(0), "1970-01-01");
});

test("a day and its number round trip, across leap years and centuries", () => {
  const days = [
    "1970-01-01",
    "1999-12-31",
    "2000-02-29", // leap, divisible by 400
    "2026-08-10",
    "2100-03-01", // not leap, divisible by 100
    "2400-02-29",
  ];
  for (const day of days) {
    assert.equal(dayFromNumber(dayNumber(day)), day, day);
  }
});

test("february is counted without a special case", () => {
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2); // 2024 is leap
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
  assert.equal(daysBetween("2100-02-28", "2100-03-01"), 1); // 2100 is not
});

test("adding days crosses months and years", () => {
  assert.equal(addDays("2026-08-10", 1), "2026-08-11");
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("weekday counts from domingo", () => {
  assert.equal(weekday("2026-08-09"), 0); // domingo
  assert.equal(weekday("2026-08-10"), 1); // segunda
  assert.equal(weekday("2026-08-15"), 6); // sábado
  assert.equal(weekday("1970-01-01"), 4); // quinta, the reference
});

test("a date that does not exist is not a day", () => {
  assert.ok(isDay("2026-08-10"));
  assert.ok(isDay("2024-02-29"));
  assert.ok(!isDay("2026-02-30"));
  assert.ok(!isDay("2026-13-01"));
  assert.ok(!isDay("2026-8-10"));
  assert.ok(!isDay("amanhã"));
});

test("minutes and hh:mm round trip", () => {
  assert.equal(hhmm(570), "09:30");
  assert.equal(hhmm(0), "00:00");
  assert.equal(hhmm(1140), "19:00");
  assert.equal(parseHhmm("09:30"), 570);
  assert.equal(parseHhmm("9h30"), 570);
  assert.equal(parseHhmm("9h"), 540);
  assert.equal(parseHhmm("15"), 900);
});

test("an hour that does not exist is not an hour", () => {
  assert.equal(parseHhmm("25:00"), null);
  assert.equal(parseHhmm("10:70"), null);
  assert.equal(parseHhmm("mais tarde"), null);
});

test("moments compare by day first", () => {
  const monday = { day: "2026-08-10", at: 1140 };
  const tuesday = { day: "2026-08-11", at: 540 };
  assert.ok(compare(monday, tuesday) < 0);
  assert.ok(compare(tuesday, monday) > 0);
  assert.equal(compare(monday, { ...monday }), 0);
});

test("adding minutes rolls into the next day", () => {
  assert.deepEqual(plusMinutes({ day: "2026-08-10", at: 1410 }, 60), {
    day: "2026-08-11",
    at: 30,
  });
  assert.deepEqual(plusMinutes({ day: "2026-08-10", at: 30 }, -60), {
    day: "2026-08-09",
    at: 1410,
  });
});
