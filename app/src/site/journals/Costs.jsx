import { Arrow, SectionHead } from "../home/parts";
import { CHECKED, COSTS } from "./copy";
import "./journals.css";

const TOP = Math.max(...COSTS.map((c) => c.month));

// What other journals charge, dearest first, with Marble's nothing at the end. Used on the home page and /pricing.
export default function Costs() {
  return (
    <section className="hm-sec jc" aria-labelledby="jc-t">
      <div className="hm-wrap">
        <SectionHead id="jc-t" title="What journals charge." silver="Marble is $0." />
        <ol className="jc-list">
          {COSTS.map((c) => (
            <li key={c.name}>
              <div className="jc-name"><b>{c.name}</b><span>{c.note}</span></div>
              <i className="jc-bar" style={{ width: `${(c.month / TOP) * 100}%` }} aria-hidden="true" />
              <div className="jc-price"><b>{c.price}</b><span>a month</span></div>
            </li>
          ))}
          <li className="ours">
            <div className="jc-name"><b>Marble</b><span>Journal, imports, stats and prop firm rules</span></div>
            <div className="jc-price"><b>$0</b><span>forever</span></div>
          </li>
        </ol>
        <p className="jr-note">Lowest monthly price on each company's own page, read on {CHECKED}. Some of what they charge for isn't in Marble, such as live broker links: trades come into Marble from a file or by hand.</p>
        <Arrow href="/free-trading-journal">Compare every free plan</Arrow>
      </div>
    </section>
  );
}
