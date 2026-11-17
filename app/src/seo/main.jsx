import React, { Suspense, lazy, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../site/vh";
import Header, { OFF_HOME, sectionUrl } from "../site/Header";
import Footer from "../site/Footer";
import { PAGES } from "./pages";
import { OWNER } from "../site/legal/owner";
import "../site/site.css";
import "../site/heroes/heroes.css";
import "./pages.css";
import Lines from "../site/ink/Lines";

const SECTIONS = {
  features: () => import("../site/features/Screens"),
  works: () => import("../site/works/Works"),
  journal: () => import("../site/journal/Anatomy"),
  pricing: () => import("../site/pricing/Free"),
  "free-journals": () => import("../site/journals/Journals"),
  founder: () => import("../site/founder/Letter"),
  faq: () => import("../site/faq/Index"),
  everything: () => import("../site/everything/Everything"),
  changes: () => import("../site/changes/Changes"),
  "tools-compare": () => import("../site/tools/Compare"),
  "tools-drawdown": () => import("../site/tools/Drawdown"),
  "tools-sizer": () => import("../site/tools/Sizer"),
};

const page = PAGES.find((p) => p.slug === document.body.dataset.page) || PAGES[0];

function useJumpsHome() {
  useLayoutEffect(() => {
    let raf = 0;
    const fix = () => {
      raf = 0;
      document.querySelectorAll('#root a[href^="#"]').forEach((a) => {
        const id = decodeURIComponent(a.getAttribute("href").slice(1));
        if (id && id !== "top" && !document.getElementById(id)) a.setAttribute("href", OFF_HOME.has(id) || id === "founder" ? sectionUrl(id) : `/#${id}`);
      });
    };
    fix();
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(fix); });
    mo.observe(document.getElementById("root"), { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
}

const loads = page.sections.map((id) => SECTIONS[id]().catch(() => ({ default: () => null })));
const parts = loads.map((m) => lazy(() => m));
const allIn = Promise.all(loads);

function Page() {
  useJumpsHome();
  const [ready, setReady] = useState(false);
  useEffect(() => { allIn.then(() => setReady(true)); }, []);
  const [first, second] = page.h1;
  return (
    <>
      <Header away skipTo="main" />
      <main id="main">
        {!page.ownIntro && (
          <div className="pg-intro">
            <nav className="pg-crumbs" aria-label="Breadcrumb">
              <a href="/">Marble</a><span aria-hidden="true">/</span><span aria-current="page">{page.name}</span>
            </nav>
            <Lines as="h1" className="pg-title" text={first} silver={second} now />
            <p className="pg-lede">{page.intro}{page.ask && <> If yours isn't here, ask Jules at <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.</>}</p>
          </div>
        )}
        <Suspense fallback={null}>{parts.map((Part, i) => <Part key={i} />)}</Suspense>
      </main>
      {ready && !page.sections.includes("faq") && <Footer />}
    </>
  );
}

if (!document.title) document.title = page.title;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
