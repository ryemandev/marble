import React, { useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../vh";
import Header, { HOME_URL, LINKS, sectionUrl } from "../Header";
import { Wordmark } from "../../components/Logo";
import Lines from "../ink/Lines";
import { DOCS } from "./docs";
import { OWNER, UPDATED, isPlaceholder } from "./owner";
import "../site.css";
import "../heroes/heroes.css";
import "./legal.css";

const FILL = { name: OWNER.name, address: OWNER.address, email: OWNER.email, ico: OWNER.ico };

function Text({ children }) {
  return children.split(/(\{(?:name|address|email|ico)\}|\[\[\w+\|[^\]]+\]\])/).map((part, i) => {
    const field = /^\{(\w+)\}$/.exec(part);
    if (field) {
      const v = FILL[field[1]];
      return isPlaceholder(v) ? <mark key={i} className="lg-ph" title="Fill this in before launch (src/site/legal/owner.js)">{v}</mark> : <span key={i}>{v}</span>;
    }
    const link = /^\[\[(\w+)\|([^\]]+)\]\]$/.exec(part);
    if (link) return <a key={i} className="lg-ref" href={`#${link[1]}`}>{link[2]}</a>;
    return part;
  });
}

function Doc({ doc, n }) {
  return (
    <section id={doc.id} className="lg-doc" aria-labelledby={`${doc.id}-t`}>
      <span className="lg-kicker">{String(n).padStart(2, "0")} · Last updated {UPDATED}</span>
      <h2 className="lg-title" id={`${doc.id}-t`}>{doc.title}</h2>
      <p className="lg-lede">{doc.lede}</p>
      <ol className="lg-clauses">
        {doc.clauses.map((c, i) => (
          <li key={c.h} className="lg-clause">
            <h3 className="lg-h"><span className="lg-num" aria-hidden="true">{n}.{i + 1}</span>{c.h}</h3>
            {c.p.map((p, j) => (Array.isArray(p)
              ? <ul key={j} className="lg-list">{p.map((li) => <li key={li}><Text>{li}</Text></li>)}</ul>
              : <p key={j}><Text>{p}</Text></p>))}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Which document you're reading, for the index
function useCurrent() {
  const [cur, setCur] = useState(DOCS[0].id);
  useEffect(() => {
    let t = 0;
    const check = () => {
      t = 0;
      let at = DOCS[0].id;
      for (const d of DOCS) { const el = document.getElementById(d.id); if (el && el.getBoundingClientRect().top <= innerHeight * 0.3) at = d.id; }
      setCur(at);
    };
    const on = () => { if (!t) t = setTimeout(check, 60); };
    check();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { clearTimeout(t); removeEventListener("scroll", on); removeEventListener("resize", on); };
  }, []);
  return cur;
}

function useLandOnHash() {
  useLayoutEffect(() => {
    const go = () => { const id = location.hash.slice(1); const el = id && document.getElementById(id); if (el) el.scrollIntoView({ block: "start", behavior: "instant" }); };
    go();
    document.fonts?.ready.then(go);
    const t = setTimeout(go, 500);
    return () => clearTimeout(t);
  }, []);
}

function Page() {
  const cur = useCurrent();
  useLandOnHash();
  const unfilled = Object.values(FILL).filter(isPlaceholder).length;
  return (
    <>
      <Header away skipTo="legal" />
      <main id="legal" className="lg">
        <div className="lg-wrap">
          <header className="lg-head">
            <span className="hx-kicker">Legal</span>
            <Lines as="h1" className="lg-h1" text="The small print," silver="written to be read." now />
            <p className="hx-sub lg-sub">How Marble works with you: what you agree to, what we do with your data, and the rules that keep the community good.</p>
            {unfilled > 0 && <p className="lg-draft" role="note">Draft: {unfilled} detail{unfilled === 1 ? "" : "s"} outlined below still to fill in before launch.</p>}
          </header>
          <div className="lg-grid">
            <nav className="lg-index" aria-label="Documents">
              <ol>
                {DOCS.map((d, i) => (
                  <li key={d.id}>
                    <a href={`#${d.id}`} className={cur === d.id ? "on" : ""} aria-current={cur === d.id ? "true" : undefined}>
                      <span className="lg-index-no" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{d.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="lg-docs">
              {DOCS.map((d, i) => <Doc key={d.id} doc={d} n={i + 1} />)}
            </div>
          </div>
        </div>
        <footer className="lg-foot">
          <div className="lg-foot-in">
            <a href={HOME_URL} className="lg-brand" aria-label="Marble, back to the website"><Wordmark fontSize={26} /></a>
            <ul className="lg-foot-links">
              {LINKS.map(([id, label]) => <li key={id}><a href={sectionUrl(id)}>{label}</a></li>)}
            </ul>
          </div>
          <div className="lg-foot-in lg-foot-base">
            <span>© {new Date().getFullYear()} Marble · Built in Scotland</span>
            <a href="#legal">Back to top ↑</a>
          </div>
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
