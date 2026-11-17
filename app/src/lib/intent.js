// The website's "Start journaling" links open the app on Create your account, not Sign in
export const startLink = (app) => `${app}${app.includes("?") ? "&" : "?"}start=1`;
export const wantsStart = (search = "") => new URLSearchParams(search).get("start") === "1";
