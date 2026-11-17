/* ---------- Numbers and dates ---------- */

export const count = (n) => Number(n || 0).toLocaleString("en-GB");
export const pct = (v, digits = 0) => `${(Number(v || 0) * 100).toFixed(digits)}%`;
export const plural = (n, one, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

export const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function ago(iso, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} day${s < 86400 * 2 ? "" : "s"} ago`;
  return day(iso);
}

/* ---------- Competitions and giveaways ---------- */

export function rulesFromText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [head, ...rest] = block.split("\n");
      return [head.trim(), rest.join("\n").trim()];
    });
}
export const rulesToText = (rules) => (Array.isArray(rules) ? rules : []).map(([h, t]) => (t ? `${h}\n${t}` : h)).join("\n\n");

// The rules in short: one per line
export const linesFromText = (text) => String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
export const linesToText = (lines) => (Array.isArray(lines) ? lines : []).join("\n");

export function prizesFromText(text, withPlace) {
  return linesFromText(text).map((line) => {
    const parts = line.split("|").map((x) => x.trim());
    if (withPlace) return { place: parts[0] || "", title: parts[1] || "", detail: parts.slice(2).join(" | ") };
    return { title: parts[0] || "", detail: parts.slice(1).join(" | ") };
  });
}
export const prizesToText = (prizes, withPlace) => (Array.isArray(prizes) ? prizes : [])
  .map((p) => [withPlace ? p.place : null, p.title, p.detail].filter((x) => x != null && x !== "").join(" | "))
  .join("\n");

export const slugOf = (title) => String(title || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export const COMPETITION_MOVES = {
  draft: [["open", "Publish"]],
  open: [["live", "Go live"], ["draft", "Back to draft"]],
  live: [["review", "Start the check"]],
  review: [["final", "Finalise results"]],
  final: [],
  cancelled: [],
};
export const GIVEAWAY_MOVES = {
  draft: [["seal", "Seal"], ["open", "Publish"]],
  open: [["closed", "Close entries"], ["draft", "Back to draft"]],
  closed: [["draw", "Run the draw"]],
  drawn: [["redraw", "Draw again"]],
  cancelled: [],
};
export const STATUS_WORD = {
  draft: "Draft", open: "Open", live: "Live", review: "In review", final: "Final", cancelled: "Cancelled",
  closed: "Entries closed", drawn: "Drawn",
};

export function competitionErrors(f) {
  const e = {};
  if (!f.title || f.title.trim().length < 3 || f.title.trim().length > 80) e.title = "3 to 80 characters";
  if (!/^[a-z0-9-]{3,60}$/.test(f.slug || "")) e.slug = "3 to 60 lower-case letters, numbers and dashes";
  if (!f.starts_on) e.starts_on = "Pick the first day";
  if (!f.ends_on) e.ends_on = "Pick the last day";
  else if (f.starts_on && f.ends_on < f.starts_on) e.ends_on = "After the first day";
  if (!f.entry_closes_at) e.entry_closes_at = "When entries close";
  if (f.tagline && f.tagline.length > 80) e.tagline = "Up to 80 characters";
  if (f.blurb && f.blurb.length > 240) e.blurb = "Up to 240 characters";
  if (f.art && !/^[a-z0-9/_-]{1,80}$/.test(f.art)) e.art = "A picture's path, like masters/sower-millet";
  if (!f.rules_version || f.rules_version.length > 12) e.rules_version = "1 to 12 characters";
  return e;
}
export function giveawayErrors(f) {
  const e = {};
  if (!f.title || f.title.trim().length < 3 || f.title.trim().length > 80) e.title = "3 to 80 characters";
  if (!/^[a-z0-9-]{3,60}$/.test(f.slug || "")) e.slug = "3 to 60 lower-case letters, numbers and dashes";
  if (!f.opens_at) e.opens_at = "When entries open";
  if (!f.closes_at) e.closes_at = "When entries close";
  else if (f.opens_at && f.closes_at <= f.opens_at) e.closes_at = "After it opens";
  if (!f.draw_at) e.draw_at = "When the draw runs";
  else if (f.closes_at && f.draw_at < f.closes_at) e.draw_at = "After entries close";
  const n = Number(f.winners_count);
  if (!Number.isInteger(n) || n < 1 || n > 100) e.winners_count = "1 to 100";
  const d = Number(f.claim_days);
  if (!Number.isInteger(d) || d < 1 || d > 90) e.claim_days = "1 to 90 days";
  if (f.tagline && f.tagline.length > 80) e.tagline = "Up to 80 characters";
  if (f.blurb && f.blurb.length > 240) e.blurb = "Up to 240 characters";
  if (!f.rules_version || f.rules_version.length > 12) e.rules_version = "1 to 12 characters";
  return e;
}

export const localInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

/* ---------- Reports ---------- */

export const RESOLUTION_WORD = { kept: "Kept", hidden: "Hidden", deleted: "Deleted" };
export const reportTarget = (card) => card?.post || card?.chat || card?.idea || null;

/* ---------- The admin log, in words ---------- */

const ACTIONS = {
  "competition.create": "Made a competition",
  "competition.edit": "Changed a competition",
  "competition.status": "Moved a competition",
  "competition.delete": "Deleted a draft competition",
  "giveaway.delete": "Deleted a draft giveaway",
  "competition.finalise": "Finalised a competition",
  "competition.disqualify": "Disqualified an entrant",
  "competition.reinstate": "Reinstated an entrant",
  "competition.prize": "Marked a prize",
  "giveaway.create": "Made a giveaway",
  "giveaway.edit": "Changed a giveaway",
  "giveaway.seal": "Sealed a giveaway",
  "giveaway.status": "Moved a giveaway",
  "giveaway.entry_invalid": "Marked an entry invalid",
  "giveaway.entry_valid": "Marked an entry valid",
  "giveaway.draw": "Ran a draw",
  "giveaway.winner": "Marked a winner",
  "report.keep": "Kept a reported item",
  "report.hide": "Hid a reported item",
  "report.unhide": "Showed a hidden item again",
  "report.delete": "Deleted a reported item",
  "bug.status": "Changed a bug report",
  "post.pin": "Pinned a post",
  "post.unpin": "Unpinned a post",
  "user.suspend": "Suspended an account",
  "user.unsuspend": "Lifted a suspension",
  "user.delete": "Deleted an account",
  "idea.status": "Changed an idea's status",
  "cost.add": "Added a cost",
  "cost.edit": "Changed a cost",
  "cost.delete": "Deleted a cost",
};

/* ---------- Users ---------- */

export const USER_FILTERS = [["all", "Everyone"], ["active", "Active this week"], ["quiet", "Gone quiet"]];
export const USER_SORTS = [["joined", "Newest"], ["active", "Last active"], ["trades", "Most trades"]];
export const FILTER_HINT = {
  active: "Opened the app in the last 7 days",
  quiet: "Joined over 14 days ago and hasn't opened the app in 14",
};

// Retention: of a week's new accounts, the share that came back in a later week (null: that week hasn't happened yet)
export const share = (n, size) => (n == null || !size ? null : n / size);

export const actionWord = (action) => ACTIONS[action] || action;

// Money for running costs, in pounds
export const gbp = (pence, digits = 0) =>
  `£${(Number(pence || 0) / 100).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const monthlyPence = (c) => (c.every === "year" ? Math.round(c.pence / 12) : c.pence);
export const costLive = (c, today = new Date().toISOString().slice(0, 10)) => c.since <= today && (!c.until || c.until >= today);
export function costErrors(f) {
  const e = {};
  if (!f.name || f.name.trim().length < 2 || f.name.trim().length > 60) e.name = "2 to 60 characters";
  const v = Number(f.pounds);
  if (f.pounds === "" || !Number.isFinite(v) || v < 0 || v >= 1e6) e.pounds = "An amount in pounds";
  if (f.until && f.since && f.until < f.since) e.until = "On or after the start";
  if (f.note && f.note.length > 200) e.note = "200 characters at most";
  return e;
}

// What a trader has done so far, in the order a new trader does it
export const STEPS = [["traded", "Logged a trade"], ["closed", "Closed a day"], ["back", "Came back"]];
export const IDEA_STATUSES = ["Under review", "Planned", "In progress", "Shipped"];
