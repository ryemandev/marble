// A weekday reminder for the trader's own calendar. It sits there and not in Marble: no push, and nothing in it can see
// the trader's day, so it reads the same after a red day as a green one. The time is the trader's own wall clock.
const LINK = "https://trademarble.app/desk/";
const two = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;

const nextWeekday = (from) => {
  const d = new Date(from);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};

export function closeReminder(time, now = new Date()) {
  const [h, m] = /^\d\d:\d\d$/.test(time) ? time.split(":") : ["17", "00"];
  const utc = now.toISOString().replace(/[-:]|\.\d+/g, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Marble//Close your day//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:close-${utc}@trademarble.app`, `DTSTAMP:${utc}`,
    `DTSTART:${stamp(nextWeekday(now))}T${h}${m}00`, "DURATION:PT15M", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    "SUMMARY:Close your day", "DESCRIPTION:Trades or no trades.", `URL:${LINK}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Close your day", "TRIGGER:PT0S", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
