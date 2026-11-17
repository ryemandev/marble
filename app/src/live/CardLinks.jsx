import { useEffect, useState } from "react";
import { Card } from "../components/ui";
import { toast } from "../store";
import { linkOf, myLinks, takeLinkDown } from "./publicCards";

const NAMES = { trade: "A trade", day: "A closed day" };
const madeOn = (at) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Every link a trader has out, and the way to take one down. Shows nothing until there's one.
export function CardLinks() {
  const [links, setLinks] = useState([]);
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { let on = true; myLinks().then((l) => on && setLinks(l)).catch(() => {}); return () => { on = false; }; }, []);
  const down = async (id) => {
    if (asking !== id) { setAsking(id); return; }
    setBusy(id);
    try { await takeLinkDown(id); setLinks((l) => l.filter((x) => x.id !== id)); toast("Taken down"); }
    catch { toast("Couldn't take that down. Try again.", { warn: true }); }
    setBusy(null); setAsking(null);
  };
  if (!links.length) return null;
  return (
    <div className="grid g12">
      <Card className="c7">
        <h3>Card links</h3>
        <p className="muted xs" style={{ marginTop: 4 }}>Anyone with one of these links can see the card. Taking one down removes the picture and the link says so.</p>
        <ul className="card-links">
          {links.map((l) => (
            <li key={l.id}>
              <a className="link" href={linkOf(l.id)} target="_blank" rel="noopener noreferrer">{NAMES[l.kind] || "A card"}, {madeOn(l.made_at)}</a>
              <button type="button" className="btn ghost" onClick={() => down(l.id)} disabled={busy === l.id}>{busy === l.id ? "Taking down…" : asking === l.id ? "Take it down?" : "Take down"}</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
