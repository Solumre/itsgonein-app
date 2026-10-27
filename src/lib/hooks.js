import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';
import { db } from './firebase';
import { api } from './api';

export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

// GET an API path, refreshing every `refresh` ms (or `fastRefresh` while `isLive(data)`).
export function useApi(path, { refresh = 0, fastRefresh = 60_000, isLive } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const liveRef = useRef(false);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const data = await api(path);
      liveRef.current = isLive ? isLive(data) : false;
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!path) return undefined;
    setState((s) => ({ ...s, loading: true }));
    let timer;
    let cancelled = false;
    const loop = async () => {
      await load();
      if (cancelled) return;
      const next = liveRef.current ? fastRefresh : refresh;
      if (next) timer = setTimeout(loop, next);
    };
    loop();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [path, load, refresh, fastRefresh]);

  return { ...state, reload: load };
}

const anyLive = (d) => d?.matches?.some((m) => m.status === 'live'
  || (m.status === 'upcoming' && Math.abs(new Date(m.kickoff) - Date.now()) < 20 * 60_000));

// Pass null to skip fetching (e.g. a competition that isn't on screen).
export function useMatches(competition = 'PL') {
  return useApi(competition ? `/api/matches?competition=${competition}` : null, { refresh: 5 * 60_000, isLive: anyLive });
}

// Live Firestore query or doc (memoised by the caller). A null/false ref watches nothing.
export function useSnapshot(ref) {
  const [state, setState] = useState({ ref: null, data: null, error: null });
  useEffect(() => {
    if (!ref) return undefined;
    return onSnapshot(ref,
      (snap) => setState({
        ref,
        data: 'docs' in snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : snap.exists() ? { id: snap.id, ...snap.data() } : null,
        error: null,
      }),
      (error) => setState({ ref, data: null, error }));
  }, [ref]);
  if (!ref) return { data: null, loading: false, error: null };
  const current = state.ref === ref;
  return { data: current ? state.data : null, loading: !current, error: current ? state.error : null };
}

export const useMyPicks = (uid) => {
  const ref = useMemo(() => uid && query(collection(db, 'predictions'), where('uid', '==', uid)), [uid]);
  const { data } = useSnapshot(ref);
  const map = {};
  for (const p of data || []) map[p.matchId] = p;
  return map;
};

export const useMyLeagues = (uid, enabled = true) =>
  useSnapshot(useMemo(() => uid && enabled && query(collection(db, 'leagues'), where('members', 'array-contains', uid)), [uid, enabled]));

export const useMessages = (code) =>
  useSnapshot(useMemo(() => code && query(collection(db, 'leagues', code, 'messages'), orderBy('createdAt', 'desc'), limit(80)), [code]));

const tickerRef = doc(db, 'settings', 'ticker');
export const useTicker = () => useSnapshot(tickerRef);
