import { test } from "node:test";
import assert from "node:assert/strict";
import { linkParts } from "../src/live/links.js";

const links = (t) => linkParts(t).filter((p) => p.href);

test("ordinary links become links that show their real host", () => {
  const [l] = links("See https://www.tradingview.com/chart/abc?x=1 for the setup.");
  assert.equal(l.host, "www.tradingview.com");
  assert.equal(l.rest, "/chart/abc?x=1");
  assert.equal(l.href, "https://www.tradingview.com/chart/abc?x=1");
});

test("a user part before the host (trademarble.app@evil.com) stays plain text", () => {
  for (const t of ["https://trademarble.app@evil.com", "https://trademarble.app:pw@evil.com/login", "http://a@b.co/x"]) {
    assert.equal(links(t).length, 0, t);
    assert.equal(linkParts(t).map((p) => p.text).join(""), t);
  }
});

test("only http and https: javascript:, data: and friends are never links", () => {
  for (const t of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "JaVaScRiPt:alert(1)", "ftp://x.com/a"]) {
    assert.equal(links(t).length, 0, t);
  }
});

test("trailing punctuation isn't part of the link, and text around it is kept", () => {
  const parts = linkParts("Read https://example.com/a. Then go.");
  assert.equal(parts[0].text, "Read ");
  assert.equal(parts[1].href, "https://example.com/a");
  assert.equal(parts[2].text, ". Then go.");
});
