import { sectionUrl } from "../Header";
import { GROUPS as FEATURES } from "../everything/features";
import { Arrow, Close, SectionHead } from "../home/parts";
import { CHECKED, CHECKS, FAQ, JOURNALS } from "./copy";
import "../pricing/free.css";
import "./journals.css";

const ALL_OF_IT = FEATURES.filter((g) => g.id !== "free");

export default function Journals() {
  return (
    <>
      <section className="hm-sec jr-first" aria-label="Free trading journals side by side">
        <div className="hm-wrap">
          <div className="jr-table" role="table" aria-label="What each trading journal gives for free">
            <div className="jr-row jr-head" role="row">
              <span role="columnheader">Journal</span>
              <span role="columnheader">Free plan</span>
              <span role="columnheader">What's capped</span>
              <span role="columnheader">Paid from</span>
            </div>
            {JOURNALS.map((j) => (
              <div key={j.name} className={`jr-row${j.ours ? " ours" : ""}`} role="row">
                <b role="cell">{j.src ? <a href={j.src} rel="nofollow noopener" target="_blank">{j.name}</a> : j.name}</b>
                <span role="cell" data-k="Free plan">{j.free}</span>
                <span role="cell" data-k="What's capped">{j.capped}</span>
                <span role="cell" data-k="Paid from">{j.paid}</span>
              </div>
            ))}
          </div>
          <p className="jr-note">Read from each company's own pricing page on {CHECKED}. TraderSync's page turned us away, so its row comes from a copy archived on 11 October 2026. Prices change, so check before you decide.</p>
        </div>
      </section>
      <section className="hm-sec" aria-labelledby="jr-honest-t">
        <div className="hm-wrap jr-honest">
          <SectionHead id="jr-honest-t" title="What Marble doesn't do." />
          <p>Trades come into Marble from a file or by hand. It has no live link to your broker, so if you want trades to appear on their own, a paid journal may suit you better.</p>
        </div>
      </section>
      <section className="hm-sec" aria-labelledby="jr-checks-t">
        <div className="hm-wrap">
          <SectionHead id="jr-checks-t" title="Three things to check." silver="Before you pick a free journal." />
          <ul className="fr-groups">
            {CHECKS.map(([name, line]) => <li key={name}><b>{name}</b><span>{line}</span></li>)}
          </ul>
        </div>
      </section>
      <section className="hm-sec" aria-labelledby="jr-all-t">
        <div className="hm-wrap">
          <SectionHead id="jr-all-t" title="What's free in Marble." silver="All of it." />
          <ul className="fr-groups">
            {ALL_OF_IT.map((g) => <li key={g.id}><b>{g.name}</b><span>{g.line}</span></li>)}
          </ul>
          <Arrow href={sectionUrl("everything")}>See every feature</Arrow>
        </div>
      </section>
      <section className="hm-sec" aria-labelledby="jr-q-t">
        <div className="hm-wrap">
          <SectionHead id="jr-q-t" title="Straight answers." />
          <div className="hm-qs">
            {FAQ.map((q) => (
              <details key={q.q} className="hm-q">
                <summary>{q.q}<i aria-hidden="true" /></summary>
                <p>{q.a}</p>
              </details>
            ))}
          </div>
          <Arrow href="/guides/trading-journal-spreadsheet-template/" className="hm-all">Build your own in a spreadsheet</Arrow>
        </div>
      </section>
      <Close />
    </>
  );
}
