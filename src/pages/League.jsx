import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, Share2, Settings, Flag, Ban, Trash2, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useApi, useMessages, useMyPicks, useMatches } from '../lib/hooks';
import { QUICK_CHAT, REACTIONS, roundLabel } from '../lib/game';
import { ago, ordinal } from '../lib/format';
import { useGameMatches } from '../App';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Crest from '../components/Crest';
import Sheet from '../components/Sheet';
import { Spinner, ErrorBox, Segmented, Empty } from '../components/Bits';
import { ChallengeButton } from '../components/H2H';

const boardLive = (d) => d?.matches?.some((m) => m.status === 'live');

function Table({ board, me, code }) {
  const [mode, setMode] = useState('season');
  const rows = [...board.rows].sort((a, b) => (mode === 'season' ? b.season - a.season || b.gw - a.gw : b.gw - a.gw || b.season - a.season));
  const live = board.rows.some((r) => r.live > 0);
  const scoreOf = (r) => (mode === 'season' ? r.season : r.gw);
  // Equal points share a position.
  const ranks = rows.map((r, i) => (i > 0 && scoreOf(r) === scoreOf(rows[i - 1]) ? null : i + 1));
  for (let i = 1; i < ranks.length; i++) if (ranks[i] === null) ranks[i] = ranks[i - 1];
  return (
    <section>
      <div className="table-head">
        <Segmented label="Table" value={mode} onChange={setMode} options={[{ value: 'season', label: board.competition === 'CL' ? 'Overall' : 'Season' }, { value: 'gw', label: roundLabel(board.competition, board.matchday) }]} />
        {live && <span className="live-pill">LIVE</span>}
      </div>
      <ol className="standings">
        {rows.map((r, i) => {
          const score = scoreOf(r);
          const rank = ranks[i];
          return (
            <li key={r.uid} className={`${r.uid === me ? 'me' : ''} ${rank === 1 ? 'top' : ''}`}>
              <span className="pos">{rank === 1 ? '👑' : rank}</span>
              <Avatar user={r} size={34} />
              <span className="who">
                <strong>{r.nickname}</strong>
                <small>{r.club?.name || 'Neutral'} · LV {r.level}{r.streak >= 3 ? ` · ${r.streak}🔥` : ''}</small>
              </span>
              {r.live > 0 && <span className="live-delta">+{r.live}</span>}
              {r.uid !== me && <ChallengeButton opponent={r} league={code} competition={board.competition} />}
              <span className="pts">{score}</span>
            </li>
          );
        })}
      </ol>
      <p className="hint center">Points with a green +number are live: they'll count if the games end like this.</p>
    </section>
  );
}

function Picks({ board }) {
  const members = [...board.rows].sort((a, b) => b.gw - a.gw);
  return (
    <section className="picks-wrap">
      <div className="picks-grid" style={{ '--cols': members.length }}>
        <div className="pg-corner" />
        {members.map((r) => <div key={r.uid} className="pg-player" title={r.nickname}><Avatar user={r} size={28} /><span>{r.nickname}</span></div>)}
        {board.matches.map((m) => {
          const row = board.picks.find((p) => p.matchId === m.id)?.picks || {};
          return [
            <div key={m.id} className="pg-match">
              <Crest team={m.home} size={18} /><Crest team={m.away} size={18} />
              <span>{m.score ? `${m.score.home}–${m.score.away}` : `${m.home.tla} v ${m.away.tla}`}</span>
            </div>,
            ...members.map((r) => {
              const p = row[r.uid];
              const cls = !p ? 'none' : p.hidden ? 'hidden' : p.points == null ? '' : p.points >= 3 ? 'exact' : p.points > 0 ? 'result' : 'miss';
              return (
                <div key={`${m.id}-${r.uid}`} className={`pg-cell ${cls}`}>
                  {!p ? '·' : p.hidden ? <Lock size={13} aria-label="Hidden until kickoff" /> : `${p.home}-${p.away}`}
                  {p?.double && <sup>✌️</sup>}
                </div>
              );
            }),
          ];
        })}
      </div>
      <p className="hint center">🔒 Picks stay hidden until kickoff.</p>
    </section>
  );
}

function Chat({ code, board, myUid }) {
  const { priv, profile } = useSession();
  const { data: messages, loading } = useMessages(code);
  const { data: game } = useGameMatches();
  const myPicks = useMyPicks(myUid);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [safetySeen, setSafetySeen] = useState(() => { try { return !!localStorage.getItem('igi-chat-safety'); } catch { return false; } });
  const toast = useToast();
  const blocked = new Set(priv?.blocked || []);
  const list = useMemo(() => [...(messages || [])].reverse(), [messages]);
  const names = Object.fromEntries((board?.rows || []).map((r) => [r.uid, r.nickname]));

  // Follow new messages, unless you've scrolled up to read older ones.
  const seenCount = useRef(0);
  useEffect(() => {
    const doc = document.documentElement;
    const nearBottom = window.innerHeight + window.scrollY > doc.scrollHeight - 320;
    if (seenCount.current === 0 || nearBottom) window.scrollTo({ top: doc.scrollHeight, behavior: seenCount.current ? 'smooth' : 'auto' });
    seenCount.current = list.length;
  }, [list.length]);

  const send = async (body) => {
    setBusy(true); setError(null);
    try {
      await api(`/api/leagues/${code}/messages`, { method: 'POST', body });
      if (body.text) setText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn, ok) => {
    try { await fn(); if (ok) toast(ok, 'good'); } catch (e) { toast(e.message, 'bad'); }
    setSelected(null);
  };

  const shareable = (game?.matches || [])
    .filter((m) => myPicks[m.id] && m.status === 'upcoming')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .slice(0, 10);

  return (
    <section className="chat">
      {!safetySeen && (
        <div className="banner banner-info">
          <span>💬 Chat is just for this league. Be kind, keep personal stuff (where you live, school, phone, other apps) private, and long-press or tap a message to report it.</span>
          <button className="btn btn-sm" onClick={() => { setSafetySeen(true); try { localStorage.setItem('igi-chat-safety', '1'); } catch { /* ignore */ } }}>Got it</button>
        </div>
      )}
      <div className="chat-scroll">
        {loading ? <Spinner /> : list.length === 0 ? <Empty emoji="💬" title="No messages yet">Say hello, or share your pick for the next game.</Empty> : list.map((m) => {
          if (m.type === 'system') {
            return <div key={m.id} className={`sys-msg sys-${m.event || 'info'}`}>{m.text}</div>;
          }
          if (blocked.has(m.uid)) return <div key={m.id} className="sys-msg muted">Message from a blocked player</div>;
          const mine = m.uid === myUid;
          const reactions = Object.entries(m.reactions || {}).filter(([, u]) => u.length);
          return (
            <div key={m.id} className={`msg${mine ? ' mine' : ''}${m.type === 'pick' ? ' pick' : ''}`}>
              {!mine && <Avatar user={m} size={30} />}
              <div className="msg-col">
                {!mine && <span className="msg-name" style={{ color: m.color || undefined }}>{m.nickname}</span>}
                <button className="bubble" onClick={() => !m.deleted && setSelected(m)} disabled={m.deleted}>
                  {m.deleted ? <i className="muted">Message deleted</i> : <>{m.type === 'pick' && <span className="pick-tag">🔮 My pick</span>}{m.text}</>}
                </button>
                <div className="msg-meta">
                  {reactions.map(([e, u]) => (
                    <button key={e} className={`reaction${u.includes(myUid) ? ' on' : ''}`} onClick={() => act(() => api(`/api/leagues/${code}/messages/${m.id}/react`, { method: 'POST', body: { emoji: e } }))}>
                      {e} {u.length}
                    </button>
                  ))}
                  <time>{ago(m.createdAt?.toDate?.())}</time>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="composer">
        <div className="quick-row" role="toolbar" aria-label="Quick chat">
          {Object.entries(QUICK_CHAT).map(([id, t]) => <button key={id} className="chip" disabled={busy} onClick={() => send({ quick: id })}>{t}</button>)}
        </div>
        {error && <p className="form-error">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ text }); }} className="composer-row">
          <button type="button" className="icon-btn" onClick={() => setSharing(true)} aria-label="Share your pick" title="Share your pick">🔮</button>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={`Message as ${profile?.nickname}…`} aria-label="Message" />
          <button className="send" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
        </form>
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.uid === myUid ? 'Your message' : `${selected?.nickname}'s message`}>
        {selected && (
          <div className="msg-actions">
            <p className="quote">{selected.text}</p>
            <div className="react-row">
              {REACTIONS.map((e) => <button key={e} onClick={() => act(() => api(`/api/leagues/${code}/messages/${selected.id}/react`, { method: 'POST', body: { emoji: e } }))}>{e}</button>)}
            </div>
            {selected.uid !== myUid && (
              <>
                <h4>Something not OK?</h4>
                {[['mean', 'Being mean or bullying'], ['personal_info', 'Sharing personal info'], ['inappropriate', 'Inappropriate'], ['spam', 'Spam']].map(([reason, label]) => (
                  <button key={reason} className="action" onClick={() => act(() => api('/api/reports', { method: 'POST', body: { code, messageId: selected.id, reason } }), 'Thanks, reported. An adult will check it.')}>
                    <Flag size={16} /> Report: {label}
                  </button>
                ))}
                <button className="action" onClick={() => act(() => api('/api/me/block', { method: 'POST', body: { uid: selected.uid } }), `Blocked ${names[selected.uid] || selected.nickname}. You won't see their messages.`)}>
                  <Ban size={16} /> Block {selected.nickname}
                </button>
              </>
            )}
            {(selected.uid === myUid || board?.owner === myUid) && (
              <button className="action danger" onClick={() => act(() => api(`/api/leagues/${code}/messages/${selected.id}`, { method: 'DELETE' }), 'Message deleted')}>
                <Trash2 size={16} /> Delete message
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={sharing} onClose={() => setSharing(false)} title="Share your pick">
        {shareable.length === 0 ? <Empty emoji="🔮" title="No picks to share">Make some picks on the Predict tab first.</Empty> : (
          <div className="share-picks">
            <p className="hint">Your picks are hidden until kickoff. Sharing one shows it to this league now.</p>
            {shareable.map((m) => (
              <button key={m.id} className="action" onClick={() => { setSharing(false); send({ pickMatchId: m.id }); }}>
                <Crest team={m.home} size={20} /> {m.home.tla} <b>{myPicks[m.id].home}–{myPicks[m.id].away}</b> {m.away.tla} <Crest team={m.away} size={20} />
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </section>
  );
}

function Manage({ board, code, myUid, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const isOwner = board.owner === myUid;
  const leave = async () => {
    if (!window.confirm(`Leave ${board.name}?`)) return;
    try { await api(`/api/leagues/${code}/leave`, { method: 'POST' }); navigate('/leagues', { replace: true }); } catch (e) { toast(e.message, 'bad'); }
  };
  const kick = async (r) => {
    if (!window.confirm(`Remove ${r.nickname} from the league? They won't be able to rejoin.`)) return;
    try { await api(`/api/leagues/${code}/kick`, { method: 'POST', body: { uid: r.uid } }); toast(`${r.nickname} removed`); onClose(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="manage">
      <h4>Players ({board.rows.length})</h4>
      <ul className="member-list">
        {board.rows.map((r) => (
          <li key={r.uid}>
            <Avatar user={r} size={28} /> <span>{r.nickname}{r.uid === board.owner && ' 👑'}</span>
            {isOwner && r.uid !== myUid && <button className="link-btn danger" onClick={() => kick(r)}>Remove</button>}
          </li>
        ))}
      </ul>
      <button className="action danger" onClick={leave}>Leave league</button>
    </div>
  );
}

export default function League() {
  const { code } = useParams();
  const { user } = useSession();
  const [tab, setTab] = useState('table');
  const [comp, setCompState] = useState(() => { try { return localStorage.getItem('igi-comp') === 'CL' ? 'CL' : 'PL'; } catch { return 'PL'; } });
  const setComp = (c) => { setCompState(c); try { localStorage.setItem('igi-comp', c); } catch { /* ignore */ } };
  const [mdBy, setMdBy] = useState({});
  const md = mdBy[comp] ?? null;
  const setMd = (n) => setMdBy((x) => ({ ...x, [comp]: n }));
  const [manage, setManage] = useState(false);
  const toast = useToast();
  const { data: plGame } = useGameMatches();
  const { data: clGame } = useMatches(comp === 'CL' ? 'CL' : null);
  const game = comp === 'CL' ? clGame : plGame;
  const path = `/api/leagues/${code}/board?competition=${comp}${md ? `&matchday=${md}` : ''}`;
  const { data: board, error, loading, reload } = useApi(path, { refresh: 3 * 60_000, fastRefresh: 45_000, isLive: boardLive });
  const maxMd = Math.max(1, ...(game?.matches || []).map((m) => m.matchday || 1));

  const invite = async () => {
    const url = `${window.location.origin}/join/${code}`;
    const text = `Join my ItsGoneIn league "${board?.name}". Code: ${code}`;
    if (navigator.share) { try { await navigator.share({ title: 'ItsGoneIn', text, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(`${text} ${url}`);
    toast('Invite link copied!');
  };

  if (loading && !board) return <Spinner />;
  if (error && !board) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  const me = board.rows.find((r) => r.uid === user.uid);
  const myRank = [...board.rows].sort((a, b) => b.season - a.season).findIndex((r) => r.uid === user.uid) + 1;
  const gw = board.matchday;
  const isCL = board.competition === 'CL';
  const short = isCL ? ({ 9: 'Play-offs', 10: 'R16', 11: 'QF', 12: 'SF', 13: 'Final' }[gw] || `MD ${gw}`) : `GW ${gw}`;

  return (
    <div className={`page league${tab === 'chat' ? ' league-chat' : ''}`}>
      <header className="league-hero kit">
        <div>
          <span className="eyebrow">League · {board.rows.length} players</span>
          <h1>{board.name}</h1>
          {me && <p className="league-rank">You're <b>{ordinal(myRank)}</b> with <b>{me.season}</b> pts{isCL ? ' in the ⭐ UCL table' : ''}</p>}
        </div>
        <div className="league-actions">
          <button className="btn btn-sm" onClick={invite}><Share2 size={16} /> Invite</button>
          <button className="icon-btn" onClick={() => setManage(true)} aria-label="League settings"><Settings size={20} /></button>
        </div>
        <button className="code-chip" onClick={invite} aria-label={`League code ${code}. Tap to share.`}>CODE <b>{code}</b></button>
      </header>

      <div className="league-tabs">
        <Segmented label="League" value={tab} onChange={setTab} options={[{ value: 'table', label: 'Table' }, { value: 'chat', label: 'Chat' }, { value: 'picks', label: 'Picks' }]} />
        {tab !== 'chat' && (
          <div className="gw-mini">
            <button className="icon-btn" aria-label="Previous round" disabled={gw <= 1} onClick={() => setMd(gw - 1)}><ChevronLeft size={18} /></button>
            <span>{short}</span>
            <button className="icon-btn" aria-label="Next round" disabled={gw >= maxMd} onClick={() => setMd(gw + 1)}><ChevronRight size={18} /></button>
          </div>
        )}
      </div>
      {tab !== 'chat' && (
        <Segmented label="Competition" value={comp} onChange={setComp} options={[
          { value: 'PL', label: 'Premier League' },
          { value: 'CL', label: '⭐ Champions League' },
        ]} />
      )}

      {tab === 'table' && <Table board={board} me={user.uid} code={code} />}
      {tab === 'picks' && <Picks board={board} />}
      {tab === 'chat' && <Chat code={code} board={board} myUid={user.uid} />}

      <Sheet open={manage} onClose={() => setManage(false)} title={board.name}>
        <Manage board={board} code={code} myUid={user.uid} onClose={() => { setManage(false); reload(); }} />
      </Sheet>
    </div>
  );
}
