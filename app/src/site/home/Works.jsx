import Logo from "../works/Logo";
import { GROUPS, LINES } from "../works/firms";
import { SectionHead } from "./parts";
import "../works/works.css";

export default function Works() {
  const all = GROUPS.flatMap((g) => g.firms);
  return (
    <section id="works" className="hm-sec" aria-labelledby="hm-works-t">
      <div className="hm-wrap">
        <SectionHead id="hm-works-t" title="Your firm." silver="One journal." />
        <ul className="hm-logos" aria-label="Prop firms and platforms Marble imports from">
          {all.map((f) => <li key={f.slug}><Logo slug={f.slug} name={f.name} size={24} /></li>)}
        </ul>
        <p className="wk-small hm-small">{LINES.small}</p>
      </div>
    </section>
  );
}
