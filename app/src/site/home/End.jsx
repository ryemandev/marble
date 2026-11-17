import { sectionUrl } from "../Header";
import Footer from "../Footer";
import { GROUPS as FAQ } from "../faq/answers";
import { Arrow, Close, SectionHead } from "./parts";

const TOP = [["free", 0], ["free", 1], ["journal", 0], ["journal", 1], ["data", 0]].map(([g, i]) => FAQ.find((x) => x.key === g).items[i]);
const ALL = FAQ.reduce((n, g) => n + g.items.length, 0);
const MORE = [
  [sectionUrl("faq"), "Every question answered"],
  [sectionUrl("everything"), "Everything in Marble"],
];

export default function End() {
  return (
    <>
      <section id="faq" className="hm-sec" aria-labelledby="hm-q-t">
        <div className="hm-wrap">
          <SectionHead id="hm-q-t" title="Straight answers," silver="before you start." />
          <div className="hm-qs">
            {TOP.map((q) => (
              <details key={q.q} className="hm-q">
                <summary>{q.q}<i aria-hidden="true" /></summary>
                <p>{q.a}</p>
              </details>
            ))}
          </div>
          <Arrow href={sectionUrl("faq")} className="hm-all">{`All ${ALL} answers`}</Arrow>
          <nav className="hm-more" aria-label="More about Marble">
            <ul>
              {MORE.map(([href, label]) => <li key={label}><a href={href}>{label}<span aria-hidden="true">→</span></a></li>)}
            </ul>
          </nav>
        </div>
      </section>

      <Close />
      <Footer />
    </>
  );
}
