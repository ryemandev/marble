import { useMemo, useState } from "react";
import { firmShort } from "../../lib/firm-rules/catalog";
import { firmDailyLimit, money } from "../../lib/firm-rules/track";
import { floorOf, ladder, lossesToDaily, lossesToFloor } from "./math";
import { DRAWDOWN } from "./copy";
import { Checked, Disputed, PlanPicker, Questions, ToolEnd, clean, startPick, usePlan } from "./shared";
import "./tools.css";

const TYPES = [["static", "Static"], ["trailing_eod", "Trailing, end of day"], ["trailing_intraday", "Trailing, intraday"]];
const num = (v) => (v === "" || v == null || !Number.isFinite(+v) ? NaN : +v);

function fromPlan(plan, phase) {
  if (!plan || !phase) return null;
  const dd = phase.dd && !phase.dd.c ? phase.dd : null;
  const amount = dd ? (dd.a ?? (dd.pct != null ? (dd.pct * plan.size) / 100 : null)) : null;
  const firmStart = phase.start ?? plan.size;
  const lock = dd?.lockAt == null ? null : dd.lockAt < firmStart / 2 && firmStart > 1000 ? plan.size + dd.lockAt : plan.size + (dd.lockAt - firmStart);
  return { size: plan.size, dd: amount, type: dd?.type || "static", lock, onOpen: dd?.on === "peak_unrealized_equity", unknown: dd?.type === "trailing", dll: firmDailyLimit(plan, phase), breach: phase.dll?.breach };
}

export default function Drawdown() {
  const [mode, setMode] = useState("firm");
  const [pick, setPick] = useState(() => startPick("topstep"));
  const { file, plan, phase } = usePlan(pick);
  const [own, setOwn] = useState({ size: "50000", dd: "2000", type: "trailing_eod", dll: "1000" });
  const [acct, setAcct] = useState({ balance: "", peak: "", risk: "400" });
  const firm = mode === "firm" ? fromPlan(plan, phase) : null;
  const rules = firm || { size: num(own.size), dd: num(own.dd), type: own.type, lock: null, dll: num(own.dll) > 0 ? num(own.dll) : null };
  const name = mode === "firm" ? firmShort(pick.firm) : null;

  const out = useMemo(() => {
    const balance = Number.isFinite(num(acct.balance)) ? num(acct.balance) : rules.size;
    const peak = Math.max(balance, Number.isFinite(num(acct.peak)) ? num(acct.peak) : balance);
    const risk = num(acct.risk);
    const floor = floorOf({ start: rules.size, drawdown: rules.dd, peak, type: rules.type, lockAt: rules.lock });
    if (floor == null || !(risk > 0)) return null;
    const left = balance - floor;
    return { balance, peak, risk, floor, left, n: lossesToFloor(left, risk), m: rules.dll ? lossesToDaily(rules.dll, risk) : null, steps: ladder(balance, floor, risk, 14) };
  }, [acct, rules.size, rules.dd, rules.type, rules.lock, rules.dll]);

  const inputs = (
    <div className="tl-inputs">
      <div className="tl-toggle" role="group" aria-label="Where the rules come from">
        <button type="button" aria-pressed={mode === "firm"} onClick={() => setMode("firm")}>My firm's plan</button>
        <button type="button" aria-pressed={mode === "own"} onClick={() => setMode("own")}>My own numbers</button>
      </div>
      {mode === "firm"
        ? <PlanPicker pick={pick} onChange={setPick} plan={plan} file={file} />
        : (
          <div className="tl-pick">
            <Num label="Account size" value={own.size} onChange={(v) => setOwn({ ...own, size: v })} />
            <Num label="Max drawdown" value={own.dd} onChange={(v) => setOwn({ ...own, dd: v })} />
            <label className="tl-field"><span className="tl-label">Drawdown</span>
              <select value={own.type} onChange={(e) => setOwn({ ...own, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <Num label="Daily loss limit" value={own.dll} onChange={(v) => setOwn({ ...own, dll: v })} hint="Blank for none" />
          </div>
        )}
      <div className="tl-pick">
        <Num label="Balance now" value={acct.balance} placeholder={String(rules.size || "")} onChange={(v) => setAcct({ ...acct, balance: v })} />
        {rules.type !== "static" && <Num label={rules.type === "trailing_eod" ? "Highest close" : "Highest balance"} value={acct.peak} placeholder={acct.balance || String(rules.size || "")} onChange={(v) => setAcct({ ...acct, peak: v })} />}
        <Num label="One losing trade" value={acct.risk} onChange={(v) => setAcct({ ...acct, risk: v })} />
      </div>
    </div>
  );

  const words = out && <Sentence out={out} rules={rules} name={name} />;
  const checked = mode === "firm" && <Checked slug={pick.firm} />;
  const open = mode === "firm" && phase?.dd?.c ? phase.dd : null;
  const note = open ? <p className="tl-note">{name}'s pages {open.c === "not_found" ? "don't publish this drawdown" : "leave this drawdown open"}, so it isn't worked out here. {open.s && <><a href={open.s} target="_blank" rel="noopener noreferrer">Their page</a> has the details, or </>}switch to your own numbers.</p>
    : firm?.onOpen ? <p className="tl-note">{name} trails the highest open profit during a trade, which this can't see, so its floor can sit higher than shown.</p>
    : firm?.unknown ? <p className="tl-note">{name} doesn't publish whether this drawdown trails the end-of-day or the intraday balance; this treats it as trailing your highest balance.</p> : null;

  return (
    <>
      <section className="tl-tool tl-wrap" aria-label="Drawdown calculator">
        <p className="sr-only" aria-live="polite">{out ? `${out.n} ${out.n === 1 ? "loss" : "losses"} in a row to the floor${out.m != null ? `, ${out.m} to the daily loss limit` : ""}.` : ""}</p>
        <div className="tl-desk">
          <div className="tl-panel">{inputs}</div>
          <div className="tl-result">
            <span className="hx-kicker">Losses in a row to the floor</span>
            <div className="tl-big num">{out?.n ?? "–"}</div>
            {words}
            {out && <Slabs out={out} />}
            {note}
            {mode === "firm" && <Disputed name={name} what="this drawdown" rule={phase?.dd} />}
            {mode === "firm" && out?.m != null && <Disputed name={name} what="the daily loss limit" rule={phase?.dll} />}
            {checked}
          </div>
        </div>
      </section>
      <div className="tl-wrap"><Questions faq={DRAWDOWN.faq} id="dd" /></div>
      <ToolEnd line="Pick your account's firm and plan and the Desk shows your room to the drawdown, worked out from your own trades." />
    </>
  );
}

function Num({ label, value, onChange, placeholder, hint }) {
  return (
    <label className="tl-field"><span className="tl-label">{label}{hint && <span className="tl-hint"> · {hint}</span>}</span>
      <span className="tl-money"><span aria-hidden="true">$</span><input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(clean(e.target.value))} /></span>
    </label>
  );
}

function Sentence({ out, rules, name }) {
  const firmWords = name ? `${name}'s` : "the";
  return (
    <div className="tl-words">
      <p>{out.n === 0
        ? <>The balance is already at the floor of <b className="num">{money(out.floor)}</b>.</>
        : <><b className="num">{out.n}</b> {out.n === 1 ? "loss" : "losses"} of <b className="num">{money(out.risk)}</b> {out.n === 1 ? "takes" : "in a row take"} the balance from <b className="num">{money(out.balance)}</b> to {firmWords} drawdown floor of <b className="num">{money(out.floor)}</b>, <b className="num">{money(out.left)}</b> away.</>}</p>
      {out.m != null && <p className="tl-sub">In one day, <b className="num">{out.m}</b> {out.m === 1 ? "loss reaches" : "losses reach"} {firmWords} <b className="num">{money(rules.dll)}</b> daily loss limit{rules.breach === "fail_account" ? ", where the account ends" : rules.breach ? ", where the day ends" : ""}.</p>}
      {rules.type !== "static" && <p className="tl-sub">The floor only moves up, with the {rules.type === "trailing_eod" ? "highest closing balance" : "highest balance"}{rules.lock != null ? `, and stops at ${money(rules.lock)}` : ""}. Losses never lower it.</p>}
    </div>
  );
}

// One slab per loss, the last one on the floor
function Slabs({ out }) {
  return (
    <ol className="tl-slabs" aria-label="The balance after each loss">
      {out.steps.map((b, i) => <li key={i} className={b <= out.floor ? "floor" : ""}><span className="num">{money(b)}</span></li>)}
      {out.n > out.steps.length && <li className="more"><span className="num">+{out.n - out.steps.length} more</span></li>}
    </ol>
  );
}
