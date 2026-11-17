import { useEffect, useMemo, useRef, useState } from "react";
import { findMessages, findPages, findPosts, findTrades, ready, wordsOf } from "../lib/search";
import { useAllTrades, useFolded, useStore } from "../store";
import { LIVE } from "../mode";
import { supabase } from "../live/supabase";
import { dmOwner, source } from "../views/community/source";
import { seenThreads } from "../views/community/dmSeen";

const demoPosts = async () => (await source.feed({})).filter((p) => p && typeof p.body === "string" && !p.team)
  .map((p) => ({ id: String(p.id), parent_id: null, body: p.body, created_at: p.at || null, author_handle: p.anonymous ? null : p.author?.handle || null, anonymous: !!p.anonymous }));

const livePosts = async (q) => { const { data, error } = await supabase.rpc("search_posts", { p_q: q, p_limit: 30 }); if (error) throw error; return data || []; };

export function useSearch(q, open) {
  const trades = useFolded(useAllTrades());
  const notebooks = useStore((s) => s.notebooks);
  const pages = useStore((s) => s.pages);
  const words = useMemo(() => wordsOf(q), [q]);
  const on = open && ready(q);
  const local = useMemo(() => (on ? { trades: findTrades(trades, words, 50), pages: findPages(notebooks, pages, q, 50) } : { trades: [], pages: [] }), [on, trades, notebooks, pages, words, q]);

  const [inboxAt, setInboxAt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    source.dmInbox?.().then(() => live && setInboxAt(Date.now())).catch(() => {});
    return () => { live = false; };
  }, [open]);
  const messages = useMemo(() => (on ? findMessages(seenThreads(dmOwner()), words, 50) : []), [on, words, inboxAt]);

  // Posts: 250ms after the last key, the latest answer only
  const [posts, setPosts] = useState({ q: "", rows: [], busy: false, failed: false });
  const asked = useRef(0);
  useEffect(() => {
    if (!on) { setPosts({ q: "", rows: [], busy: false, failed: false }); return; }
    const n = ++asked.current;
    setPosts((p) => ({ ...p, busy: true }));
    const t = setTimeout(async () => {
      try {
        const rows = LIVE ? await livePosts(q) : await demoPosts();
        if (n === asked.current) setPosts({ q, rows, busy: false, failed: false });
      } catch {
        if (n === asked.current) setPosts({ q, rows: [], busy: false, failed: true });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [on, q]);
  const postHits = useMemo(() => (on ? findPosts(posts.rows, words, 30) : []), [on, posts.rows, words]);

  const groups = [
    { kind: "trade", label: "Trades", items: local.trades },
    { kind: "page", label: "Study", items: local.pages },
    { kind: "post", label: "Community", items: postHits },
    { kind: "dm", label: "Messages", items: messages },
  ];
  const count = groups.reduce((a, g) => a + g.items.length, 0);
  // What was looked through, for "nothing found"
  const searched = { trades: trades.length, pages: pages.length, conversations: seenThreads(dmOwner()).length };
  return { ready: on, words, groups, count, postsBusy: posts.busy, postsFailed: posts.failed, searched };
}
