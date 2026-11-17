import { useMemo, useState } from "react";
import { firmShort } from "../../lib/firm-rules/catalog";
import { firmDailyLimit, money } from "../../lib/firm-rules/track";
import { INSTRUMENTS, instrumentOf, positionSize } from "./math";
import { SIZER } from "./copy";
import { Checked, Disputed, PlanPicker, Questions, ToolEnd, clean, startPick, usePlan } from "./shared";
import "./tools.css";

const pct = (x) => `${Math.round(x * 100).toLocaleString("en-US")}%`;

export default function Sizer() {
  const [market, setMarket] = useState("NQ");
  const [unit, setUnit] = useState("points");
  const [stop, setStop] = useState("20");
  const [risk, setRisk] = useState("500");
  const [withFirm, setWithFirm] = useState(true);
  const [pick, setPick] = useState(() => startPick("topstep"));
  const { file, plan, phase } = usePlan(pick);
  const ins = instrumentOf(market);
  const fx = !!ins.fx;
  const out = useMemo(() => positionSize({ risk, stop, instrument: ins, unit: fx ? "ticks" : unit }), [risk, stop, ins, unit, fx]);
  const name = firmShort(pick.firm);
  const size = withFirm && phase?.size && !phase.size.c ? phase.size : null;
  const dll = withFirm && plan && phase ? firmDailyLimit(plan, phase) : null;
  const dd = withFirm && phase?.dd && !phase.dd.c ? (phase.dd.a ?? (phase.dd.pct != null ? (phase.dd.pct * plan.size) / 100 : null)) : null;
  // A micro counts as a tenth of a mini at most firms
  const asMinis = out && !fx && size?.max != null ? (ins.micro ? out.size / (size.ratio || 10) : out.size) : null;
  const sizeText = out ? out.size.toLocaleString("en-US", fx ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}) : "–";
  const underTick = !out && !fx && +risk > 0 && +stop > 0;
  const stopWords = fx ? `${+stop} ${ins.id === "XAUUSD" ? "cent" : "pip"}${+stop === 1 ? "" : "s"}` : `${+stop} ${unit === "points" ? (+stop === 1 ? "point" : "points") : (+stop === 1 ? "tick" : "ticks")}`;

  return (
    <>
      <section className="tl-tool tl-wrap" aria-label="Position size calculator">
        <p className="sr-only" aria-live="polite">{out ? `${sizeText} ${fx ? "lots" : out.unit}, ${money(out.atStop)} at the stop.` : ""}</p>
        <div className="tl-desk">
          <div className="tl-panel">
            <div className="tl-inputs">
              <div className="tl-pick">
                <label className="tl-field wide"><span className="tl-label">Market</span>
                  <select value={market} onChange={(e) => setMarket(e.target.value)}>
                    <optgroup label="Futures">{INSTRUMENTS.filter((x) => !x.fx).map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}</optgroup>
                    <optgroup label="Forex and CFDs">{INSTRUMENTS.filter((x) => x.fx).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                  </select>
                </label>
                <label className="tl-field"><span className="tl-label">At risk</span>
                  <span className="tl-money"><span aria-hidden="true">$</span><input inputMode="decimal" value={risk} onChange={(e) => setRisk(clean(e.target.value))} /></span>
                </label>
                <label className="tl-field"><span className="tl-label">Stop distance</span>
                  <span className="tl-money"><input inputMode="decimal" value={stop} onChange={(e) => setStop(clean(e.target.value))} /><span>{fx ? (ins.id === "XAUUSD" ? "cents" : "pips") : unit}</span></span>
                </label>
                {!fx && (
                  <div className="tl-field"><span className="tl-label">Stop in</span>
                    <div className="tl-toggle" role="group" aria-label="Stop in">
                      {["points", "ticks"].map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "points" ? "Points" : "Ticks"}</button>)}
                    </div>
                  </div>
                )}
              </div>
              <div className="tl-toggle" role="group" aria-label="Check against a firm">
                <button type="button" aria-pressed={withFirm} onClick={() => setWithFirm(true)}>Against my firm</button>
                <button type="button" aria-pressed={!withFirm} onClick={() => setWithFirm(false)}>No firm</button>
              </div>
              {withFirm && <PlanPicker pick={pick} onChange={setPick} plan={plan} file={file} />}
            </div>
          </div>
          <div className="tl-result">
            <span className="hx-kicker">{fx ? "Lots" : "Contracts"}</span>
            <div className={`tl-big num ${sizeText.length > 5 ? "long" : ""}`}>{sizeText}</div>
            {underTick && <p className="tl-sub">A stop has to be at least one tick away{unit === "points" ? `: ${ins.tick} points on ${ins.id}` : ""}.</p>}
            {out && (
              <div className="tl-words">
                <p>At a <b className="num">{stopWords}</b> stop, one {fx ? "lot" : "contract"} of {fx ? ins.name : ins.id} loses <b className="num">{money(out.perOne)}</b>{fx ? "" : ` (${(+out.ticks.toFixed(2)).toLocaleString("en-US")} ticks of ${money(ins.value)})`}. With <b className="num">{money(+risk)}</b> at risk, that's <b className="num">{sizeText}</b> {fx ? "lots" : out.unit}, and the loss at the stop is <b className="num">{money(out.atStop)}</b>.</p>
                {out.size === 0 && <p className="tl-sub">One {fx ? "0.01 lot" : "contract"} at this stop loses more than {money(+risk)}.</p>}
                {asMinis != null && <p className="tl-sub">{name}'s limit on this plan is <b className="num">{size.max}</b> {size.max === 1 ? "contract" : "contracts"}{size.ratio ? ` (${size.ratio * size.max} micros)` : ""} at once{size.scale ? ", lower at first on its scaling plan" : ""}. This size is <b className="num">{(+asMinis.toFixed(2)).toLocaleString("en-US")}</b> of {size.max}{asMinis > size.max ? ", over the limit" : ""}.</p>}
                {dll ? <p className="tl-sub">The loss at the stop is <b className="num">{pct(out.atStop / dll)}</b> of {name}'s <b className="num">{money(dll)}</b> daily loss limit.</p>
                  : dd ? <p className="tl-sub">The loss at the stop is <b className="num">{pct(out.atStop / dd)}</b> of {name}'s <b className="num">{money(dd)}</b> max drawdown.</p> : null}
              </div>
            )}
            {out && asMinis != null && <Disputed name={name} what="the contract limit" rule={phase?.size} />}
            {out && (dll ? <Disputed name={name} what="the daily loss limit" rule={phase?.dll} /> : dd ? <Disputed name={name} what="the max drawdown" rule={phase?.dd} /> : null)}
            {withFirm && <Checked slug={pick.firm} />}
          </div>
        </div>
      </section>
      <div className="tl-wrap"><Questions faq={SIZER.faq} id="sz" /></div>
      <ToolEnd line="Log a trade with its prices and Marble works out the dollars for you, and the Desk shows each account's room to its drawdown." />
    </>
  );
}
