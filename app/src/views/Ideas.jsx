import { useMemo, useState } from "react";
import { Icon } from "../components/ui";
import { SAMPLE } from "../data";
import { openDialog, setState, toast, useStore } from "../store";
import { LIVE } from "../mode";

const SORTS = [["top", "Top"], ["new", "New"], ["planned", "Planned"], ["shipped", "Shipped"]];

function Poll({ poll, vote, onVote }) {
  const counts = poll.options.map(([, n], i) => n + (vote === i ? 1 : 0));
  const total = counts.reduce((a, n) => a + n, 0) || 1;
  const lead = counts.indexOf(Math.max(...counts));
  return (
    <div className="poll">
      <div className="poll-q">{poll.question}</div>
      <div className="poll-options" role="group" aria-label={poll.question}>
        {poll.options.map(([label], i) => {
          const pct = Math.round((counts[i] / total) * 100);
          return (
            <button key={`${i}-${label}`} type="button" className={`poll-opt ${vote != null ? "shown" : ""} ${vote === i ? "mine" : ""} ${vote != null && i === lead ? "lead" : ""}`}
              aria-pressed={vote === i} onClick={() => onVote(vote === i ? null : i)}>
              {vote != null && <span className="poll-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
              <span className="poll-label">{vote === i && <Icon name="check" size={13} />} {label}</span>
              {vote != null && <span className="poll-pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-foot">{counts.reduce((a, n) => a + n, 0).toLocaleString()} votes · {poll.ends} · by {poll.by}{vote != null ? " · tap your choice again to take it back" : ""}</div>
    </div>
  );
}

export default function Ideas() {
  const added = useStore((s) => s.ideas) || [];
  const myVotes = useStore((s) => s.ideaVotes) || {};
  const pollsAdded = useStore((s) => s.polls) || [];
  const pollVotes = useStore((s) => s.pollVotes) || {};
  const [sort, setSort] = useState("top");
  const ideas = useMemo(() => [...added, ...(LIVE ? [] : SAMPLE.IDEAS || [])].map((x) => ({ ...x, votes: x.votes + (myVotes[x.id] ? 1 : 0) })), [added, myVotes]);
  const shown = useMemo(() => {
    const at = (x) => x.at ?? Date.parse(`${x.when} 2026`);
    if (sort === "new") return ideas.filter((x) => x.status !== "Shipped").sort((a, b) => at(b) - at(a));
    if (sort === "planned") return ideas.filter((x) => x.status === "Planned" || x.status === "In progress").sort((a, b) => b.votes - a.votes);
    if (sort === "shipped") return ideas.filter((x) => x.status === "Shipped").sort((a, b) => b.votes - a.votes);
    return ideas.filter((x) => x.status !== "Shipped").sort((a, b) => b.votes - a.votes);
  }, [ideas, sort, added]);
  const upvote = (id) => setState((s) => ({ ideaVotes: { ...(s.ideaVotes || {}), [id]: !(s.ideaVotes || {})[id] } }));
  const votePoll = (id, i) => {
    setState((s) => ({ pollVotes: { ...(s.pollVotes || {}), [id]: i } }));
    if (i != null) toast("Vote counted");
  };
  const polls = [...pollsAdded, ...(LIVE ? [] : SAMPLE.POLLS || [])];

  return (
    <div className="ideas fl-ideas">
      <section>
        <div className="fl-ideas-head">
          <h2 className="loud">What's next</h2>
          <button type="button" className="btn ghost" onClick={() => openDialog("poll")}><Icon name="poll" size={14} /> Run a poll</button>
        </div>
        <div className="polls">
          {polls.length === 0 && <p className="fl-foot">No polls yet. Ask the community what Marble should build next.</p>}
          {polls.map((p) => <Poll key={p.id} poll={p} vote={pollVotes[p.id]} onVote={(i) => votePoll(p.id, i)} />)}
        </div>
      </section>

      <section>
        <div className="fl-ideas-head">
          <h2 className="loud">From traders</h2>
          <button type="button" className="btn" onClick={() => openDialog("idea")}><Icon name="bulb" size={14} /> Suggest an idea</button>
        </div>
        <div className="fl-chips" role="group" aria-label="Sort ideas">
          {SORTS.map(([k, l]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        <div className="idea-list" key={sort}>
          {shown.length === 0 && <p className="fl-foot">{LIVE && ideas.length === 0 ? "No ideas yet. Be the first to suggest one." : "Nothing here yet."}</p>}
          {shown.map((x, i) => (
            <article key={x.id} className="idea rise-in" style={{ "--i": Math.min(i, 8) }}>
              <button type="button" className={`idea-vote ${myVotes[x.id] ? "on" : ""}`} aria-pressed={!!myVotes[x.id]}
                aria-label={`${myVotes[x.id] ? "Remove your vote from" : "Vote for"} ${x.title}, ${x.votes} votes`} onClick={() => upvote(x.id)}>
                <Icon name="up" size={14} /><span>{x.votes}</span>
              </button>
              <div className="idea-body">
                <div className="idea-title">{x.title}</div>
                {x.body && <p className="idea-text">{x.body}</p>}
                <div className="idea-meta">
                  <span className="chip">{x.status}</span>
                  <span>{x.area} · by {x.by} · {x.when}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
