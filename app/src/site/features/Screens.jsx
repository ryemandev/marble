import { useEffect } from "react";
import Lines from "../ink/Lines";
import { sectionUrl } from "../Header";
import { Arrow, Close } from "../home/parts";
import { COUNTS } from "../everything/features";
import "./screens.css";

const BASE = import.meta.env.BASE_URL;

const OLD_STOPS = { desk: ["day-plan", "day-news", "day-tilt"], journal: ["day-trade", "day-review"], analytics: ["day-month"], study: ["feature-playbook", "day-study"] };
const Aliases = ({ ids = [] }) => ids.map((id) => <span key={id} id={id} className="fp-alias" aria-hidden="true" />);


const FEATURES = [
  {
    id: "desk", label: "Desk", w: 1440, h: 900,
    title: "Your money on one screen.",
    line: "One total P&L by day, week, month, all time or a range you set, then the running total, the month's calendar, your numbers, latest trades, each account, and payouts against fees.",
    points: ["One total, in dollars", "All your accounts, several or just one", "The month's calendar, your numbers and latest trades", "Payouts against fees"],
    alt: "The Desk on sample data: your total in ink, each account, the daily close and your latest card",
  },
  {
    id: "journal", label: "Journal", w: 1440, h: 900,
    title: "Every trade, and what every day made.",
    line: "The calendar shows each day's P&L. Open a day to see its trades and add a photo of your trade.",
    points: ["Log a trade in seconds, or import", "Each trade drawn from entry to exit", "Search by symbol, setup or feeling"],
    alt: "The Journal on sample data: your days and the trades in them",
  },
  {
    id: "import", label: "Imports", w: 1440, h: 900,
    title: "Bring your trades in from your platform.",
    line: "Drop in the file your platform exports and Marble pairs the fills into trades.",
    points: ["Tradovate, Rithmic, NinjaTrader, MetaTrader, cTrader and more", "Fills paired into trades, duplicates skipped", "Or log any trade by hand"],
    alt: "Import trades: choose the account, the firm and the file your platform exports",
  },
  {
    id: "analytics", label: "Stats", w: 1440, h: 900,
    title: "See where your money is made and lost.",
    line: "Overview, Days, Time, Duration, Markets and Habits: every dollar, broken down.",
    points: ["P&L by day of the week and by hour", "P&L by setup, symbol and account", "Drawdown and month against month"],
    alt: "Stats on sample data: your biggest cost, the trades behind it and your running total",
  },
  {
    id: "study", label: "Study", w: 1440, h: 900,
    title: "Keep what you learn.",
    line: "One giant notepad, with the video at the top, your chart images in with it, and every session a tab away.",
    points: ["A video at the top as you write", "Your chart images saved with your notes", "Win rate and dollars made on every setup"],
    alt: "Study on sample data: the notepad with a video, notes and chart images",
  },
  {
    id: "community", label: "Floor", w: 1440, h: 900,
    title: "Traders who journal, in one place.",
    line: "Marble's live home: who's here, what's on, the feed, chat, crews, events and closed days, among traders who journal.",
    points: ["Post under your name or anonymously", "Chat in General, a topic room or your crew's room", "Your cards, ready to share"],
    alt: "The Floor on sample data: the live band, every space and room, and the feed",
  },
  {
    id: "money", label: "Fees and payouts", w: 1440, h: 900,
    title: "What prop firms cost you, and what they paid.",
    line: "Every evaluation, reset and activation fee against every payout, with your true return at the foot.",
    points: ["Fees and payouts by firm", "Your true return, and when you went ahead", "Your own figures, as you entered them"],
    alt: "Fees and payouts on sample data: a year's prop firm fees and payouts, with the true return at the foot",
  },
];

function Screen({ f, first }) {
  return (
    <figure className="fp-shot">
      <div className="fp-window">
      <picture>
        <source media="(max-width: 760px)" srcSet={`${BASE}site/screens/${f.id}-phone.webp 780w`} sizes="(max-width: 420px) calc(100vw - 32px), 390px" width="780" height="1100" />
        <img src={`${BASE}site/screens/${f.id}.webp`} srcSet={`${BASE}site/screens/${f.id}.webp ${f.w}w`} sizes="(max-width: 1240px) 56vw, 700px"
          width={f.w} height={f.h} alt={f.alt} loading={first ? "eager" : "lazy"} decoding="async" />
      </picture>
      </div>
      {f.id !== "import" && <figcaption className="fp-sample">Sample data</figcaption>}
    </figure>
  );
}

const Tick = () => <svg className="fp-tick" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" /></svg>;

export default function Screens() {
  useEffect(() => {
    let id = "";
    try { id = decodeURIComponent(location.hash.slice(1)); } catch {}
    const el = id && document.getElementById(id);
    if (!el || !el.closest(".fp")) return;
    const go = () => el.scrollIntoView({ block: "start" });
    go();
    document.fonts?.ready.then(go);
  }, []);
  return (
    <>
      <section id="features" className="fp" aria-label="Features">
        <ol className="fp-list">
          {FEATURES.map((f, i) => (
            <li key={f.id} id={`feature-${f.id}`} className={`fp-item ${i % 2 ? "flip" : ""}`}>
              <Aliases ids={OLD_STOPS[f.id]} />
              <div className="fp-text">
                <span className="fp-label">
                  <b className="num">{String(i + 1).padStart(2, "0")}</b><span>{f.label}</span>
                </span>
                <Lines className="fp-h2" text={f.title} />
                <p className="fp-line">{f.line}</p>
                <ul className="fp-points">
                  {f.points.map((p) => <li key={p}><Tick />{p}</li>)}
                </ul>
              </div>
              <Screen f={f} first={i === 0} />
            </li>
          ))}
        </ol>
        <div className="fp-rest">
                    <p>Also in Marble: a card for every closed day, asking your journal a question, private messages, Marble on your phone's home screen, and export or delete everything.</p>
          <Arrow href={sectionUrl("everything")}>See every feature</Arrow>
        </div>
      </section>
      <Close />
    </>
  );
}
