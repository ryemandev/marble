import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, useLayer } from "../../components/overlay";
import { Icon } from "../../components/ui";
import { plural } from "../../data";
import { Money } from "../Money";
import { cash } from "./bits";
import { RowList } from "./Detail";
import { addDayPhoto, removeDayPhoto, useDayPhotos } from "./dayPhotos";

// A day from the calendar: its money, its photos and its trades. A photo added here shows in the day's box.
export default function DayBox({ day, tag, accounts, sel, member, onOpen, onMember, onClose, onFigure }) {
  const { of } = useDayPhotos();
  const photos = of(day.id);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(null);
  useLayer(!!big, { onEscape: () => setBig(null) });
  const add = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    for (const f of files) await addDayPhoto(day.id, f);
    setBusy(false);
  };
  const won = day.rows.filter((t) => t.pnl > 0).length;
  return (
    <Modal label={day.label} onClose={onClose} className="overlay jn-daybox-wrap">
      <div className="jn-daybox">
        <header className="jn-daybox-top">
          <div>
            <p className="jn-when">{day.label}</p>
            {day.rows.length > 0 ? (
              <button type="button" className="jn-figure" onClick={onFigure} aria-label={`${cash(day.net)}. See how it was built`}>
                <b style={{ "--len": cash(day.net, { decimals: 0 }).length }}><Money value={day.net} /></b>
              </button>
            ) : <h2 className="jn-daybox-none">No trades</h2>}
            <p className="jn-sub">{day.rows.length ? `${plural(day.rows.length, "trade")}, ${won} won · ` : ""}{tag}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" data-autofocus><Icon name="close" /></button>
        </header>

        <div className={`jn-shots ${photos.length ? "" : "empty"}`}>
          {photos.map((p, i) => (
            <figure key={p.path}>
              <button type="button" className="jn-shot" onClick={() => setBig(p)} aria-label={`Open photo ${i + 1}`}><img src={p.url} alt={`Your trade on ${day.label}, photo ${i + 1}`} /></button>
              <button type="button" className="jn-shot-x" onClick={() => removeDayPhoto(day.id, p.path)} aria-label={`Remove photo ${i + 1}`}><Icon name="close" size={14} /></button>
            </figure>
          ))}
          <button type="button" className="jn-shot-add" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="plus" size={20} />
            <span>{busy ? "Adding" : photos.length ? "Add another" : "Add a photo of your trade"}</span>
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
        </div>

        {day.rows.length > 0 && <div className="jn-group"><RowList rows={day.rows} sel={sel} member={member} onOpen={onOpen} onMember={onMember} accounts={accounts} /></div>}
      </div>
      {big && createPortal(
        <button type="button" className="jn-shot-big" onClick={() => setBig(null)} aria-label="Close the photo"><img src={big.url} alt="" /></button>,
        document.body,
      )}
    </Modal>
  );
}
