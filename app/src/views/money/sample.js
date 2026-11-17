const APEX_50 = { id: "apex-50", name: "Apex 50K", firm: "apex", label: "50K", kind: "Evaluation", status: "eval", archived: true };
const TOPSTEP_150 = { id: "topstep-150", name: "Topstep 150K", firm: "topstep", label: "150K", kind: "Evaluation", status: "eval", archived: true };

const row = (id, day, account, firm, kind, dollars, note = "", acct = null) => ({ id, day, account, firm, kind, minor: Math.round(dollars * 100), currency: "USD", note, ...(acct ? { acct } : {}) });

export const MONEY_SAMPLE = [
  row("pm01", "2026-01-06", "apex-50", "apex", "eval", 35, "Half-price code", APEX_50),
  row("pm02", "2026-01-13", "apex-50", "apex", "reset", 64, "", APEX_50),
  row("pm03", "2026-02-02", "topstep", "topstep", "eval", 39),
  row("pm04", "2026-03-02", "topstep", "topstep", "eval", 39, "Second month"),
  row("pm05", "2026-03-09", "topstep", "topstep", "activation", 119),
  row("pm06", "2026-04-14", "topstep", "topstep", "payout", 1480, "First payout"),
  row("pm07", "2026-05-05", "topstep-150", "topstep", "eval", 119, "", TOPSTEP_150),
  row("pm08", "2026-05-12", "topstep", "topstep", "payout", 1620),
  row("pm09", "2026-05-22", "topstep-150", "topstep", "reset", 99, "", TOPSTEP_150),
  row("pm10", "2026-08-18", "ftmo", "ftmo", "eval", 465, "Refunded with the first payout, if there is one"),
  row("pm11", "2026-09-04", "apex", "apex", "eval", 79),
  row("pm12", "2026-09-21", "apex", "apex", "reset", 64),
  row("pm13", "2026-10-04", "apex", "apex", "eval", 79),
];
