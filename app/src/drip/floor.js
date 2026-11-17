import { useEffect, useState } from "react";
import { SAMPLE } from "../data";
import { LIVE } from "../mode";
import { getState, useStore } from "../store";
import { supabase } from "../live/supabase";
import { source } from "../views/community/source";

// Who's on the Floor right now. Live this is presence: each open app says it's here while it's open and
// nothing is stored. The demo uses its made-up room.
export function useFloor() {
  const [here, setHere] = useState(() => (LIVE ? { count: 0, faces: [] } : demoHere()));
  const [latest, setLatest] = useState(null);
  const me = useStore((s) => s.me?.id);
  useEffect(() => {
    let gone = false;
    source.feed({}).then((posts) => {
      if (!gone) setLatest((posts || []).find((p) => !p.pinned && !p.team && p.body) || null);
    }).catch(() => {});
    return () => { gone = true; };
  }, []);
  useEffect(() => {
    if (!LIVE || !me) return undefined;
    const channel = supabase.channel("floor", { config: { presence: { key: me } } });
    channel.on("presence", { event: "sync" }, () => {
      const people = Object.values(channel.presenceState()).map((list) => list[0]);
      setHere({ count: people.length, faces: people.slice(0, 5) });
    }).subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      const p = getState().profile;
      channel.track({ name: p.name, handle: p.handle, src: p.avatar || null });
    });
    return () => { supabase.removeChannel(channel); };
  }, [me]);
  return { here, latest };
}

function demoHere() {
  const { HERE = {}, TRADERS = [] } = SAMPLE.COMMUNITY || {};
  return {
    count: HERE.general || 0,
    faces: TRADERS.slice(0, 5).map((t) => ({ name: t.name || t.handle, handle: t.handle, src: t.avatar || null })),
  };
}
