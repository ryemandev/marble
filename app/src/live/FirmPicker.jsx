import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FIRM_GROUPS, accountTitle, firmOf, logoBox, searchFirms } from "./firms";
import "./firms.css";

function useFloatingList(open, wrap, list) {
  const host = open ? wrap.current?.closest(".sheet") || null : null;
  useLayoutEffect(() => {
    if (!open || !host) return;
    let raf;
    const follow = () => {
      const el = list.current, field = wrap.current;
      if (el && field) {
        const r = field.getBoundingClientRect(), d = host.getBoundingClientRect();
        const body = field.closest(".sheet-body")?.getBoundingClientRect();
        const below = innerHeight - r.bottom - 16, above = r.top - 16;
        const up = below < 200 && above > below;
        const room = Math.max(120, Math.min(280, up ? above : below));
        el.style.left = `${r.left - d.left}px`;
        el.style.width = `${r.width}px`;
        el.style.maxHeight = `${room}px`;
        if (up) { el.style.top = "auto"; el.style.bottom = `${d.bottom - r.top + 6}px`; }
        else { el.style.bottom = "auto"; el.style.top = `${r.bottom - d.top + 6}px`; }
        el.style.visibility = body && (r.bottom < body.top || r.top > body.bottom) ? "hidden" : "";
      }
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [open, host]);
  return host;
}

const BASE = import.meta.env.BASE_URL || "/";
const logoUrl = (file) => `${BASE}site/logos/${file}`;

export function FirmLogo({ slug, size = 22, className = "" }) {
  const f = firmOf(slug);
  const box = f && logoBox(slug, size);
  if (!box) return null;
  return <img className={`firm-logo ${className}`} src={logoUrl(box.file)} width={box.w} height={box.h} alt={f.name} decoding="async" draggable="false" />;
}

export function AccountName({ account, size = 20, withLabel = true, className = "" }) {
  if (!account) return null;
  const f = firmOf(account.firm);
  if (!f || !logoBox(f.slug, size)) return <span className={`acct-name ${className}`} title={accountTitle(account)}>{account.name}{withLabel && account.label && !String(account.name).endsWith(account.label) ? ` ${account.label}` : ""}</span>;
  return (
    <span className={`acct-name has-logo ${className}`} aria-label={accountTitle(account)} title={accountTitle(account)}>
      <FirmLogo slug={f.slug} size={size} />
      {withLabel && account.label && <span className="acct-label" aria-hidden="true">{account.label}</span>}
    </span>
  );
}

export const accountNameFor = ({ firm, name, label }) => {
  const f = firmOf(firm);
  return (f ? [f.name, label?.trim()].filter(Boolean).join(" ") : (name || "").trim()).slice(0, 60);
};

export function FirmField({ value, onChange, placeholder = "Search firms, or type a name", autoFocus, world = "markets" }) {
  const { firm, name } = value;
  const picked = firmOf(firm);
  const [text, setText] = useState(picked ? picked.name : name || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const wrap = useRef(null);
  const list = useRef(null);
  // When the form hands in a different account, show it
  useEffect(() => { setText(picked ? picked.name : name || ""); }, [firm]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = picked && text === picked.name ? "" : text;
  const found = useMemo(() => searchFirms(typed, world), [typed, world]);
  const own = typed.trim() && !found.some((f) => f.name.toLowerCase() === typed.trim().toLowerCase());
  const options = useMemo(() => [...found.map((f) => ({ key: f.slug, firm: f })), ...(own ? [{ key: "__own", own: typed.trim() }] : [])], [found, own, typed]);
  useEffect(() => { setActive(0); }, [typed]);
  // Keep the highlighted option in view as the arrows move
  useEffect(() => { if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  // A click anywhere else closes the list
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrap.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  const host = useFloatingList(open && options.length > 0, wrap, list);

  const choose = (o) => {
    if (!o) return;
    if (o.firm) { setText(o.firm.name); onChange({ firm: o.firm.slug, name: o.firm.name }); }
    else { setText(o.own); onChange({ firm: null, name: o.own }); }
    setOpen(false);
  };
  const quiet = useRef(!!autoFocus);
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && open && options[active]) { e.preventDefault(); choose(options[active]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
  };
  let lastGroup = null;

  return (
    <div className={`firm-field ${picked ? "picked" : ""}`} ref={wrap}>
      {picked && <span className="firm-field-logo" aria-hidden="true"><FirmLogo slug={picked.slug} size={18} /></span>}
      <input
        className="input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-${options[active].key}` : undefined}
        value={text} placeholder={placeholder} maxLength={60} autoFocus={autoFocus} data-autofocus={autoFocus || undefined}
        onChange={(e) => { setText(e.target.value); setOpen(true); onChange({ firm: null, name: e.target.value }); }}
        onFocus={() => { if (quiet.current) quiet.current = false; else setOpen(true); }} onClick={() => setOpen(true)} onKeyDown={onKey}
      />
      {open && options.length > 0 && (() => {
        const ul = (
          <ul className={`firm-list ${host ? "floating" : ""}`} role="listbox" id={`${id}-list`} ref={list} aria-label="Firms and brokers">
            {options.map((o, i) => {
              const head = !typed && o.firm && o.firm.group !== lastGroup ? FIRM_GROUPS.find((g) => g.key === o.firm.group)?.title : null;
              if (o.firm) lastGroup = o.firm.group;
              return [
                head && <li key={`h-${o.firm.group}`} className="firm-group" role="presentation">{head}</li>,
                <li key={o.key} id={`${id}-${o.key}`} data-i={i} role="option" aria-selected={i === active} className={`firm-opt ${i === active ? "active" : ""}`}
                  onPointerDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => setActive(i)}>
                  {o.firm
                    ? <><span className="firm-opt-logo">{o.firm.logo ? <FirmLogo slug={o.firm.slug} size={18} /> : <span className="firm-opt-word">{o.firm.name}</span>}</span><span className="firm-opt-name">{o.firm.logo ? o.firm.name : o.firm.reads || ""}</span></>
                    : <span className="firm-opt-own">Use “{o.own}”</span>}
                </li>,
              ];
            })}
          </ul>
        );
        return host ? createPortal(ul, host) : ul;
      })()}
    </div>
  );
}

export function AccountPicker({ value, onChange, options, label, prefix = "", autoFocus }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const wrap = useRef(null);
  const btn = useRef(null);
  const list = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];
  const show = (o) => (o?.account ? <span className="acct-pick-row">{prefix && <span className="muted">{prefix}</span>}<AccountName account={o.account} size={16} /></span> : <span>{o?.text}</span>);
  const openAt = () => { setActive(Math.max(0, options.indexOf(current))); setOpen(true); };
  useEffect(() => { if (open) list.current?.focus(); }, [open]);
  useEffect(() => { if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrap.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  const host = useFloatingList(open, wrap, list);
  const choose = (o) => { onChange(o.value); setOpen(false); btn.current?.focus(); };
  // Typing a letter jumps to the next choice that starts with it
  const jump = (ch) => {
    const words = options.map((o) => (o.account ? accountTitle(o.account) : o.text || "").toLowerCase());
    for (let k = 1; k <= options.length; k++) { const i = (active + k) % options.length; if (words[i].startsWith(ch)) { setActive(i); return; } }
  };
  const onListKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(options[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) jump(e.key.toLowerCase());
  };
  return (
    <div className="acct-pick" ref={wrap}>
      <button type="button" ref={btn} className="input acct-pick-btn" data-autofocus={autoFocus || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={label ? `${label}: ${current?.account ? accountTitle(current.account) : current?.text || ""}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openAt(); } }}>
        {show(current)}
        <svg className="acct-pick-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (() => {
        const ul = (
          <ul className={`firm-list acct-pick-list ${host ? "floating" : ""}`} role="listbox" id={`${id}-list`} ref={list} tabIndex={-1} aria-label={label}
            aria-activedescendant={`${id}-${active}`} onKeyDown={onListKey}>
            {options.map((o, i) => (
              <li key={o.value || `o${i}`} id={`${id}-${i}`} data-i={i} role="option" aria-selected={o.value === value} className={`firm-opt ${i === active ? "active" : ""} ${o.value === value ? "chosen" : ""}`}
                onClick={() => choose(o)} onMouseMove={() => setActive(i)}>
                {show(o)}
              </li>
            ))}
          </ul>
        );
        return host ? createPortal(ul, host) : ul;
      })()}
    </div>
  );
}
