import React from "react";
import { createRoot } from "react-dom/client";
import "./styles";
import Gate from "./live/Gate";
import { LIVE } from "./mode";
import { captureErrors } from "./live/bugs";
import { getState } from "./store";
import { paintWorld } from "./world";
import Crash from "./live/Crash";
import { startPwa } from "./live/pwa";
import { watchForNewBuild } from "./live/stale";
import "./app.css";

if (LIVE) watchForNewBuild();
if (LIVE) captureErrors();
if (LIVE) document.documentElement.classList.add("calm");
if (LIVE) startPwa();

document.documentElement.dataset.theme = "light";
try { localStorage.removeItem("marble-theme"); } catch {}
paintWorld(getState().world);

// The sign-in screens don't wait for the app's code; it's fetched once someone is signed in
let App = null;
const loadApp = () => import("./App").then((m) => { App = m.default; return m.firstView; });
const Desk = () => {
  if (!App) throw new Error("Marble's app didn't download. Check the connection and refresh.");
  return <App />;
};

const root = createRoot(document.getElementById("root"));
const show = (el) => root.render(<React.StrictMode>{el}</React.StrictMode>);
if (LIVE) show(<Crash><Gate loadDesk={loadApp}><Desk /></Gate></Crash>);
else loadApp().then(() => show(<App />));
