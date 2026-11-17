import assert from "node:assert/strict";
import { test } from "node:test";
import { closeReminder } from "../src/lib/calendar.js";

const friday = new Date(2026, 10, 6, 9, 0), saturday = new Date(2026, 10, 7, 9, 0);

test("a reminder repeats on weekdays at the trader's own time", () => {
  const ics = closeReminder("17:30", friday);
  assert.match(ics, /DTSTART:20261106T173000\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n/);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("a weekend start moves to Monday", () => {
  assert.match(closeReminder("17:30", saturday), /DTSTART:20261109T173000/);
});

test("a bad time falls back to five o'clock", () => {
  assert.match(closeReminder("soon", friday), /T170000/);
});

test("nothing in it mentions money or markets", () => {
  assert.doesNotMatch(closeReminder("17:30", friday), /\$|P&L|market|profit|loss|streak/i);
});

test("no line runs past the calendar format's limit", () => {
  for (const line of closeReminder("17:30", friday).split("\r\n")) assert.ok(line.length <= 75, line);
});
