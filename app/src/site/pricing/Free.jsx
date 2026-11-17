import { sectionUrl } from "../Header";
import { GROUPS as FEATURES } from "../everything/features";
import { GROUPS as FAQ } from "../faq/answers";
import Statement from "../home/Pricing";
import { Arrow, Close, SectionHead } from "../home/parts";
import "./free.css";

// /pricing keeps its address and now says the one thing there is to say, then what that covers
const ALL_OF_IT = FEATURES.filter((g) => g.id !== "free");
const ANSWERS = FAQ.find((g) => g.key === "free").items;

export default function Free() {
  return (
    <>
      <Statement as="h1" />
      <section className="hm-sec" aria-labelledby="fr-all-t">
        <div className="hm-wrap">
          <SectionHead id="fr-all-t" title="Every feature." silver="The same for everyone." />
          <ul className="fr-groups">
            {ALL_OF_IT.map((g) => <li key={g.id}><b>{g.name}</b><span>{g.line}</span></li>)}
          </ul>
          <Arrow href={sectionUrl("everything")}>See every feature</Arrow>
        </div>
      </section>
      <section className="hm-sec" aria-labelledby="fr-q-t">
        <div className="hm-wrap">
          <SectionHead id="fr-q-t" title="Straight answers." />
          <div className="hm-qs">
            {ANSWERS.map((q) => (
              <details key={q.q} className="hm-q">
                <summary>{q.q}<i aria-hidden="true" /></summary>
                <p>{q.a}</p>
              </details>
            ))}
          </div>
          <Arrow href={sectionUrl("faq")} className="hm-all">Every question answered</Arrow>
        </div>
      </section>
      <Close />
    </>
  );
}
