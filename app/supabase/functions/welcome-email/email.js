// The welcome email, and the look every Marble email shares. The function deploys on its own, so the look lives here
// and email/build.cjs borrows it for the Supabase templates. No imports: it bundles as it is.

export const FROM = "Marble <support@example.com>";
export const REPLY_TO = "support@example.com";
export const SUBJECT = "Welcome to Marble";

const SITE = "https://trademarble.app";
const DESK = `${SITE}/desk/`;
const PICTURES = `${SITE}/email/`;
const ADDRESS = "Marble, Scotland";
const SANS = "Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const LOUD = "Unbounded,'Arial Black',Arial,sans-serif";
const INK = "#000000", TEXT = "#5a5a58", QUIET = "#6e6e6c", PANEL = "#f3f3f2";
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const attr = (s) => String(s).replace(/&/g, "&amp;");

// Two lines, the second quiet, like the app's page headings
export const loud = ([one, two]) => `<h1 class="h" style="margin:0 0 16px;font:800 38px/1.12 ${LOUD};letter-spacing:-.03em;color:${INK}">${one}<br><span style="color:${QUIET}">${two}</span></h1>`;
export const say = (html, gap = 16) => `<p style="margin:0 0 ${gap}px;font:400 16px/1.6 ${SANS};color:${TEXT}">${html}</p>`;

export const button = (label, url) => `<table ${TABLE} class="b"><tr><td bgcolor="${INK}" align="center" style="border-radius:999px">
<!--[if mso]><v:roundrect href="${attr(url)}" style="height:52px;v-text-anchor:middle;width:240px" arcsize="50%" fillcolor="${INK}" stroke="f"><center style="color:#ffffff;font:600 16px Arial">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="a" href="${attr(url)}" target="_blank" style="display:inline-block;padding:16px 34px;font:600 16px/20px ${SANS};color:#ffffff;text-decoration:none;border-radius:999px">${label}</a><!--<![endif]-->
</td></tr></table>`;

// A grey shape holding the code, easy to select in one go
export const codePanel = (label, code) => `<table ${TABLE} width="100%" style="margin:26px 0 0"><tr><td bgcolor="${PANEL}" style="padding:22px 24px;border-radius:24px">
${label ? `<p style="margin:0 0 12px;font:400 14px/1.5 ${SANS};color:${TEXT}">${label}</p>` : ""}<p class="c" style="margin:0;font:800 34px/1.1 ${LOUD};letter-spacing:.05em;color:${INK};white-space:nowrap;-webkit-user-select:all;user-select:all">${code}</p>
</td></tr></table>`;

export const paste = (url) => `<p style="margin:22px 0 0;font:400 13px/1.6 ${SANS};color:${QUIET}">Button not working? Paste this into your browser:<br><a href="${attr(url)}" style="color:${TEXT};word-break:break-all">${attr(url)}</a></p>`;

export const foot = (why) => `<p style="margin:0;font:400 13px/1.6 ${SANS};color:${QUIET}">${why}</p>
<p style="margin:10px 0 0;font:400 13px/1.6 ${SANS};color:${QUIET}">${ADDRESS} &middot; <a href="${SITE}" style="color:${QUIET};text-decoration:none">trademarble.app</a></p>`;

// Light only: both colour-scheme tags, then the CSS for clients that read that instead. The media query sits in its
// own style block because Gmail throws away a whole block over a selector it dislikes.
export const page = ({ title, pre, body, why }) => `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&amp;family=Unbounded:wght@800&amp;display=swap" rel="stylesheet"><!--<![endif]-->
<style>@media (max-width:520px){.h{font-size:30px!important}.c{font-size:30px!important}.b{width:100%!important}.a{display:block!important}}</style>
<style>:root{color-scheme:light only;supported-color-schemes:light only}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}[data-ogsb] .w{background:#fff!important}</style>
<!--[if mso]><style>td,p,a{font-family:Arial,sans-serif!important}.h,.c{font-family:'Arial Black',Arial,sans-serif!important;font-weight:400!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0">${pre}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</div>
<table ${TABLE} width="100%" bgcolor="#ffffff" class="w"><tr><td align="center">
<!--[if mso]><table ${TABLE} width="600"><tr><td><![endif]-->
<table ${TABLE} width="100%" style="max-width:600px">
<tr><td style="padding:28px 24px 22px"><img src="${PICTURES}logo.png" width="208" height="66" alt="Marble" style="display:block;border:0;font:800 30px ${LOUD};color:${INK}"></td></tr>
<tr><td><img src="${PICTURES}hall-wanderer.jpg" width="600" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:14px 24px 0">
${body}
</td></tr>
<tr><td style="padding:44px 24px 36px">
${why}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>
`;

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "there";

// Jules's words, in one place so the HTML and the plain text can't drift apart
const STORY = "I'm Jules, and I built Marble. I traded for years with no one around me who got it, so I made the room I wanted. It's a place traders come, to keep their trades and talk to each other.";
const START = "Start with one thing. Log your first trade, or bring in your history from your platform.";
const THEN = "Marble is free forever, every feature. If you get stuck or just want to say hello, reply to this. It comes straight to me.";

export function renderWelcome({ name, email, unsubscribe }) {
  if (!unsubscribe) throw new Error("The welcome email needs an unsubscribe link");
  const hi = `Hi ${firstName(name)},`;
  const why = `You're getting this because you signed up to Marble with ${email}. It goes out once.`;
  const html = page({
    title: SUBJECT,
    pre: "A note from Jules, who built it. Your desk is ready.",
    body: [
      loud(["Glad", "you&#39;re here."]),
      say(esc(hi)),
      say(esc(STORY)),
      say(esc(START), 24),
      button("Open my desk", DESK),
      `<div style="height:24px;line-height:24px;font-size:1px">&nbsp;</div>`,
      say(esc(THEN), 24),
      `<p style="margin:0;font:600 16px/1.4 ${SANS};color:${INK}">Jules</p><p style="margin:0;font:400 14px/1.5 ${SANS};color:${QUIET}">Marble</p>`,
    ].join("\n"),
    why: foot(`${esc(why)} Don't want notes from me? <a href="${esc(unsubscribe)}" style="color:${TEXT};text-decoration:underline">Unsubscribe in one click</a>.`),
  });
  const text = [
    hi, "", STORY, "", START, "", `Open my desk: ${DESK}`, "", THEN, "", "Jules", "Marble", "", "--",
    why, `Unsubscribe in one click: ${unsubscribe}`, ADDRESS,
  ].join("\n");
  return { subject: SUBJECT, html, text };
}
