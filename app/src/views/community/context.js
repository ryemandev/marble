import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const CommunityContext = createContext(null);
export const useCm = () => useContext(CommunityContext);

export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const gen = useRef(0);
  const run = useCallback(() => {
    const g = ++gen.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve().then(fn).then(
      (data) => { if (g === gen.current) setState({ data, error: null, loading: false }); return data; },
      (error) => { if (g === gen.current) setState((s) => ({ data: s.data, error, loading: false })); console.warn("Community:", error?.message || error); },
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  const set = useCallback((data) => setState((s) => ({ ...s, data: typeof data === "function" ? data(s.data) : data })), []);
  return { ...state, reload: run, set };
}
