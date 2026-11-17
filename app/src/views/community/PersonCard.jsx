import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Skeleton } from "../../components/ui";
import { useLayer } from "../../components/overlay";
import InkPicture from "../../drip/InkPicture";
import { toast } from "../../store";
import { useLoad } from "./context";
import { errText, source } from "./source";
import { CREWS } from "./houses";
import { Note, useMedia } from "./parts";
import { Handle, Person } from "./dmParts";

const monthOf = (iso) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function PersonCard({ handle, anchor, onClose, onMessage }) {
  const phone = useMedia("(max-width: 640px)");
  const p = useLoad(() => source.dmProfile(handle), [handle]);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [blocked, setBlocked] = useState(null);
  useLayer(true, { onEscape: onClose });
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor?.contains?.(e.target)) onClose(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [anchor]);
  // Beside the name, kept on screen
  useLayoutEffect(() => {
    if (phone || !anchor) return;
    const r = anchor.getBoundingClientRect(), w = 320, h = ref.current?.offsetHeight || 300;
    const left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    const top = r.bottom + 8 + h > innerHeight - 12 ? Math.max(12, r.top - h - 8) : r.bottom + 8;
    setPos({ left, top });
  }, [phone, anchor, p.data]);
  useEffect(() => { ref.current?.querySelector("button")?.focus({ preventScroll: true }); }, [p.data]);

  const d = p.data;
  const isBlocked = blocked ?? d?.blocked;
  const unblock = async () => {
    try { await source.dmUnblock(d.handle); setBlocked(false); toast(`Unblocked ${d.handle}`); } catch (e) { toast(errText(e), { warn: true }); }
  };
  const card = (
    <div className="dm-pcard" role="dialog" aria-label={`${handle}'s card`} ref={ref} style={!phone && pos ? { position: "fixed", left: pos.left, top: pos.top } : !phone ? { position: "fixed", visibility: "hidden" } : undefined}>
      <div className="dm-pcard-cover" aria-hidden="true">{d?.cover ? <InkPicture src={d.cover} at="50% 30%" edge={false} /> : null}</div>
      <div className="dm-pcard-body">
        <span className="dm-pcard-av"><Person who={d || { handle }} size={56} /></span>
        {p.loading && !d && <Skeleton rows={2} kind="lines" label="Loading this trader" />}
        {p.error && !d && <Note>{errText(p.error, "Couldn't load this trader.")}</Note>}
        {d && (
          <>
            <Handle who={d} />
            <span className="dm-pcard-sub">{d.staff ? "Marble staff" : d.crew ? CREWS[d.crew]?.name || d.crew : "No crew"}{d.since ? ` · joined ${monthOf(d.since)}` : ""}</span>
            {d.bio && <p className="dm-pcard-line">{d.bio}</p>}
            {d.mine ? <span className="dm-pcard-fine">That's you.</span> : isBlocked ? (
              <>
                <span className="dm-pcard-fine">You've blocked {d.handle}. They can't message you, and their posts are hidden for you.</span>
                <div className="dm-pcard-actions"><button type="button" className="btn ghost" onClick={unblock}>Unblock</button></div>
              </>
            ) : d.open ? (
              <>
                <div className="dm-pcard-actions">
                  <button type="button" className="btn" onClick={() => onMessage(d.thread && d.state !== "left" ? `dm:${d.thread}` : `dm-new:${d.handle}`)}><Icon name="mail" size={15} /> Message</button>
                </div>
                {!d.thread && !d.staff && <span className="dm-pcard-fine">You haven't talked yet, so your first message arrives as a request.</span>}
              </>
            ) : <span className="dm-pcard-fine">{d.handle} isn't taking new messages.</span>}
          </>
        )}
      </div>
    </div>
  );
  return createPortal(phone ? <div className="dm-pcard-sheet cm-view">{card}</div> : <div className="cm-view dm-pcard-layer">{card}</div>, document.body);
}
