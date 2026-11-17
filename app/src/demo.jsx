import React from "react";
import { createRoot } from "react-dom/client";
import "./sample";
import "./styles";
import App, { firstView } from "./App";
import { getState, loadState } from "./store";
import { paintWorld } from "./world";
import { SAMPLE } from "./data";
import "./app.css";

document.documentElement.dataset.theme = "light";
paintWorld(getState().world);

const start = () => createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.DEV) {
  import("./crypto/sample").then(({ CRYPTO }) => {
    SAMPLE.CRYPTO = CRYPTO;
    loadState({ crypto: { plan: CRYPTO.PLAN, rules: CRYPTO.RULES, checklist: CRYPTO.TICKS, deskAccount: null } });
    start();
  });
} else firstView.then(start);
