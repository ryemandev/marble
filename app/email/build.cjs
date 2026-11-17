// node email/build.cjs: writes email/final, the six Supabase auth templates, their subjects and a sample of the
// welcome email. The look comes from supabase/functions/welcome-email/email.js, so every email stays the same.
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "final");

// Lands on the app, which signs in only when the trader taps (Gate.jsx). So Outlook opening it in its own browser, or
// a link scanner, uses up nothing. Invite and reset need this too: their {{ .ConfirmationURL }} comes back as an
// implicit redirect, which the app's PKCE client refuses.
const tapLink = (type) => `https://trademarble.app/desk/?token_hash={{ .TokenHash }}&type=${type}`;
// Change email keeps {{ .ConfirmationURL }}: Supabase checks it on the server. The trader is usually signed in by then,
// and the signed-in app throws a token_hash away unused.
const CONFIRMATION = "{{ .ConfirmationURL }}";

const OTHER_DEVICE = "On another device, or in the wrong app? Type this code on Marble's sign-in screen instead.";

const T = {
  "magic-link": {
    subject: "{{ .Token }} is your Marble sign-in code",
    note: "the code up front: Outlook threads same-subject emails, so an old code was easy to copy by mistake, and iPhones can offer to fill it in",
    title: "Sign in to Marble",
    pre: "Tap to sign in here, or type the code on another device.",
    head: ["Sign in", "to Marble."],
    body: "Tap the button to finish signing in. It works once and expires in an hour.",
    button: "Sign in", url: tapLink("email"),
    code: "{{ .Token }}", codeLabel: OTHER_DEVICE,
    why: "This went to {{ .Email }} because someone asked to sign in to Marble with it. If it wasn't you, ignore this. Nothing happens without the link or the code.",
  },
  "confirm-signup": {
    subject: "{{ .Token }} is your Marble code",
    note: "same reason as magic-link",
    title: "Confirm your email",
    pre: "One tap to confirm, then your desk opens.",
    head: ["Welcome", "to Marble."],
    body: "Confirm this is your email and your desk opens. The button works once and expires in an hour.",
    button: "Confirm my email", url: tapLink("email"),
    code: "{{ .Token }}", codeLabel: OTHER_DEVICE,
    why: "This went to {{ .Email }} because it was used to create a Marble account. If that wasn't you, ignore this and no account is made.",
  },
  invite: {
    subject: "You're invited to Marble",
    title: "You're invited to Marble",
    pre: "A place traders come. Accept and set up your desk in a minute.",
    head: ["You're", "invited."],
    body: "You've been invited to Marble, a place traders come. Accept and set up your desk in a minute.",
    button: "Accept the invite", url: tapLink("invite"), paste: true,
    why: "This went to {{ .Email }} because someone invited this address to Marble. If you weren't expecting it, ignore this. Nothing happens unless you accept.",
  },
  "change-email": {
    subject: "Confirm your new Marble email",
    title: "Confirm your new email",
    pre: "Confirm it and your sign-in links go to the new address.",
    head: ["Confirm your", "new email."],
    body: "You asked to change your Marble email from {{ .Email }} to {{ .NewEmail }}. Confirm it and your sign-in links go to the new address from now on.",
    button: "Confirm new email", url: CONFIRMATION, paste: true,
    why: "This is about the Marble account {{ .Email }}. If you didn't ask for this, ignore it and nothing changes.",
  },
  "reset-password": {
    subject: "Your link back into Marble",
    note: "Marble has no password screen, so this signs the trader in and says so",
    title: "Your link back into Marble",
    pre: "Tap the button and you're in. It works once.",
    head: ["Get back", "into Marble."],
    body: "Marble signs you in with a link, so there's no password to remember. Tap the button and you're in. It works once and expires in an hour.",
    button: "Sign in", url: tapLink("recovery"), paste: true,
    why: "This went to {{ .Email }} because someone asked to reset the password on this account. If it wasn't you, ignore this and nothing changes.",
  },
  reauthentication: {
    subject: "{{ .Token }} is your Marble confirmation code",
    note: "the code up front so phones can fill it in",
    title: "Your Marble code",
    pre: "Type this code in Marble to confirm it's you.",
    head: ["Confirm", "it's you."],
    body: "Type this code in Marble to carry on. It works once.",
    code: "{{ .Token }}",
    why: "This went to {{ .Email }} because someone asked to confirm a change on this Marble account. If it wasn't you, ignore this. Nothing happens without the code.",
  },
};

(async () => {
  const look = await import("../supabase/functions/welcome-email/email.js");
  const { button, codePanel, foot, loud, page, paste, say, renderWelcome } = look;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  for (const [key, t] of Object.entries(T)) {
    const body = [
      loud(t.head),
      say(t.body, t.button ? 26 : 0),
      t.button ? button(t.button, t.url) : "",
      t.code ? codePanel(t.codeLabel, t.code) : "",
      t.paste ? paste(t.url) : "",
    ].filter(Boolean).join("\n");
    fs.writeFileSync(path.join(OUT, `${key}.html`), page({ title: t.title, pre: t.pre, body, why: foot(t.why) }));
  }

  const lines = Object.entries(T).map(([key, t]) => `${key}: ${t.subject}${t.note ? `\n    (${t.note})` : ""}`);
  fs.writeFileSync(path.join(OUT, "subjects.txt"), `Supabase, Authentication, Emails. Paste each file into its template, with this subject:\n\n${lines.join("\n")}\n`);

  // A sample only: the function renders the real one for each trader
  const sample = renderWelcome({ name: "Alex Morgan", email: "alex@example.com", unsubscribe: "https://trademarble.app/unsubscribe?u=sample&t=sample" });
  fs.writeFileSync(path.join(OUT, "welcome.html"), sample.html);
  fs.writeFileSync(path.join(OUT, "welcome.txt"), `${sample.text}\n`);

  console.log(`built ${Object.keys(T).length} templates and the welcome sample in email/final`);
})();
