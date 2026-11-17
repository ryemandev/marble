import { StartFree } from "../heroes/shared";
import "./changes.css";

// What shipped, newest first, and what's planned. Planned items never carry a date.
const SHIPPED = [
  ["6 Nov 2026", [
    ["A link for your card", "A public page for a card that shows where its numbers came from and if they've changed. Take it down any time."],
    ["Chart photos on every trade", "Add up to three to any trade, by tap or by paste."],
    ["Tag a trade in a tap", "Setup, feeling and mistakes save as you press them. Press again to take one off."],
    ["What mistakes cost", "Stats shows the dollars on the trades you tagged with each mistake."],
    ["Two-step sign-in", "Ask for a code from an authenticator app each time you sign in."],
    ["Follow-ups in Ask", "Split the trades behind any answer by setup, symbol, side, hour, feeling or mistake."],
    ["Your card, your currency", "Show $, ¥, € or £ on a money card. Your number stays as you logged it."],
    ["Your whole record in one file", "Export your data, your trades as a spreadsheet and your photos in one zip."],
    ["Your Profile is your record", "Every closed day, on the same money as the calendar."],
    ["One line on the close", "Leave yourself a line when you close the day. It comes back at your next close."],
    ["Your close time, in your calendar", "A weekday reminder that lives in your own calendar and only says Close your day."],
    ["See your firm's rules", "Every rule for your firm account opens from the account on your Desk, with a way to tell us when one looks wrong."],
    ["Doesn't match your broker?", "Tap it on any figure, type your broker's number, and the trades behind it go with your report."],
    ["A first file checks itself", "After your first import, Marble shows the total and asks if it matches your broker."],
  ]],
  ["5 Nov 2026", [
    ["Trades that survive a closed tab", "A trade you log reaches Marble even if the tab closes first."],
    ["Real and simulated money, kept apart", "Live and funded dollars no longer share a total with evaluation or paper dollars."],
    ["Imports that stick to the file", "Marble only brings in what's in your broker's file."],
  ]],
  ["4 Nov 2026", [
    ["Dollars first", "Your money by day, week, month and account, with every total tied to its trades."],
    ["Free for everyone", "Every feature, for every trader."],
    ["A new look", "One Desk, Journal, Stats, Study and Floor, redrawn in black ink."],
  ]],
];

export default function Changes() {
  return (
    <div id="changes" className="ch-page">
      <div className="ch-wrap">
        {SHIPPED.map(([when, items]) => (
          <section key={when} className="ch-day" aria-label={when}>
            <h2 className="ch-when">{when}</h2>
            <ul>{items.map(([name, says]) => <li key={name}><b>{name}</b><span>{says}</span></li>)}</ul>
          </section>
        ))}
        <div className="ch-end"><StartFree /></div>
      </div>
    </div>
  );
}
