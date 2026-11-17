import React from "react";
import { bugContext, clean, sendBugReport } from "./bugs";
import { reportCrash } from "./crash-alerts";

const CRASH_TEST = import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("crashtest");
function Boom() { throw new Error("Crash test"); }

export default class Crash extends React.Component {
  state = { error: null, sent: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportCrash("app", error);
    const stack = String(info?.componentStack || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8).join(" < ");
    const context = { ...bugContext(location.hash.slice(1) || null), crash: { message: clean(String(error?.message || error)), where: clean(stack) } };
    sendBugReport({ message: `The app crashed: ${clean(String(error?.message || error)).slice(0, 200)}`, steps: "Saved automatically when the screen went blank.", context })
      .then(() => this.setState({ sent: true }))
      .catch(() => {});
  }

  render() {
    if (!this.state.error) return <>{this.props.children}{CRASH_TEST && <Boom />}</>;
    return (
      <div className="gate gate-center" role="alert">
        <div className="gate-card" style={{ textAlign: "center", alignItems: "center" }}>
          <h1 className="gate-title">Something went wrong.</h1>
          <p className="gate-sub">
            Marble hit an error and stopped this screen. Your journal is safe.
            {this.state.sent ? " We've been sent the details." : ""}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button type="button" className="btn" onClick={() => location.reload()}>Reload Marble</button>
            <button type="button" className="btn ghost" onClick={() => { location.hash = ""; location.reload(); }}>Back to my desk</button>
          </div>
        </div>
      </div>
    );
  }
}
