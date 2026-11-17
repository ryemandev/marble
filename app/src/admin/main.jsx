import "../site/vh";
import React from "react";
import { createRoot } from "react-dom/client";
import Admin from "./Admin";
import "../styles.css";
import "../design.css";
import "../pages.css";
import "../live/calm.css";
import "../live/gate.css";
import "../live/gate/looks.css";
import "./admin.css";
import "../drip/drip.css";

// The same calm motion as the desk: soft fades only
document.documentElement.classList.add("calm");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Admin />
  </React.StrictMode>
);
