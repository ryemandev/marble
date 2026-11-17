import { FOOTER_PAGES, HOME_URL, Roll, SECTION_LINKS, legalUrl, sectionUrl } from "./Header";
import { Wordmark } from "../components/Logo";
import { TOOLS } from "./tools/copy";
import "./faq/index.css";

// The legal documents, each a plain anchor on the legal page
const LEGAL = [["terms", "Terms"], ["privacy", "Privacy"], ["refunds", "Refunds"], ["risk", "Risk"], ["community", "Community rules"], ["cookies", "Cookies"]];
// The static reading pages (scripts/build-guides.mjs, build-firms.mjs)
const LEARN = [["/free-trading-journal", "Free trading journals compared"], ["/guides/", "Guides"], ["/prop-firms/", "Every prop firm's rules"]];

const home = !document.body.dataset.page;
const here = document.body.dataset.page;

export default function Footer() {
  return (
    <footer className="qi-foot ink-section">
      <div className="qi-foot-in">
        <div className="qi-foot-row">
          <a href={home ? "#top" : HOME_URL} className="qi-brand" aria-label={home ? "Marble, back to the top" : "Marble, the home page"}><Wordmark fontSize={26} /></a>
          <nav aria-label="Footer">
            <ul className="qi-foot-links">
              {SECTION_LINKS.map(([id, label]) => (
                <li key={id}><a href={sectionUrl(id)}><Roll>{label}</Roll><span className="sr-only">{label}</span></a></li>
              ))}
            </ul>
          </nav>
        </div>
        <nav className="qi-legal qi-company" aria-label="Marble">
          <span className="qi-legal-k">Marble</span>
          <ul>
            {FOOTER_PAGES.map(([id, label]) => <li key={id}><a href={sectionUrl(id)} aria-current={here === id ? "page" : undefined}>{label}</a></li>)}
          </ul>
        </nav>
        <nav className="qi-legal qi-company" aria-label="Free tools">
          <span className="qi-legal-k">Free tools</span>
          <ul>
            {TOOLS.map((t) => <li key={t.slug}><a href={sectionUrl(t.slug)} aria-current={here === t.slug ? "page" : undefined}>{t.name}</a></li>)}
          </ul>
        </nav>
        <nav className="qi-legal qi-company" aria-label="Learn">
          <span className="qi-legal-k">Learn</span>
          <ul>
            {LEARN.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}
          </ul>
        </nav>
        <nav className="qi-legal" aria-label="Legal">
          <span className="qi-legal-k">Legal</span>
          <ul>
            {LEGAL.map(([id, label]) => <li key={id}><a href={legalUrl(id)}>{label}</a></li>)}
          </ul>
        </nav>
        <p className="qi-foot-note">Marble is a trading journal, not financial advice. Trading carries risk, and what a trade made in the past says nothing about the next one.</p>
        <div className="qi-foot-row qi-foot-base">
          <span>© {new Date().getFullYear()} Marble · Built in Scotland</span>
          <a href="#top" className="qi-top"><Roll>Back to top</Roll><span className="sr-only">Back to top</span><span className="qi-arrow up" aria-hidden="true">↑</span></a>
        </div>
      </div>
    </footer>
  );
}
