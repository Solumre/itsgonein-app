import { useState } from 'react';
import { Swords } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useNow } from '../lib/hooks';
import { useSession } from '../lib/session';
import { countdown } from '../lib/format';
import { GAMES } from '../lib/game';
import { useToast } from './Toast';
import Sheet from './Sheet';
import Avatar from './Avatar';

const anyLive = (d) => d?.challenges?.some((c) => c.live);
export const useChallenges = () => useApi('/api/challenges', { refresh: 2 * 60_000, fastRefresh: 45_000, isLive: anyLive });

function recordLine(c, me) {
  const r = c.record;
  if (!r) return null;
  const other = c.from === me ? c.to : c.from;
  const mine = r.wins?.[me] || 0, theirs = r.wins?.[other] || 0;
  const draws = r.draws ? `, ${r.draws} drawn` : '';
  if (mine === theirs) return `All square ${mine}–${theirs}${draws}`;
  return `${mine > theirs ? 'You lead' : `${c.names[other]} leads`} ${Math.max(mine, theirs)}–${Math.min(mine, theirs)}${draws}`;
}

function ChallengeCard({ c, me, onChange }) {
  const toast = useToast();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const other = c.from === me ? c.to : c.from;
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok, 'good'); onChange(); } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };
  const score = c.score || {};
  const showScore = c.status === 'done' || c.started;
  const won = c.status === 'done' && c.winner === me;
  const lost = c.status === 'done' && c.winner && c.winner !== me;
  let status;
  if (c.status === 'pending' && c.to === me) status = `${c.names[c.from]} wants a head-to-head`;
  else if (c.status === 'pending') status = `Waiting for ${c.names[c.to]} · ${countdown(c.startsAt - now)} left to answer`;
  else if (c.status === 'expired') status = 'Not answered in time';
  else if (c.status === 'done') status = won ? '🏆 You won!' : lost ? `${c.names[c.winner]} won` : "🤝 It's a draw";
  else if (c.live) status = 'Live now';
  else if (c.started) status = 'In progress';
  else status = `Starts in ${countdown(c.startsAt - now)}`;

  return (
    <article className={`h2h-card${c.live ? ' is-live' : ''}${won ? ' won' : ''}${lost ? ' lost' : ''}${c.competition === 'CL' ? ' cl' : ''}`}>
      <header>
        <span className="eyebrow">⚔️ {c.roundLabel}</span>
        {c.live && <span className="live-pill">LIVE</span>}
      </header>
      <div className="h2h-row">
        <div className="h2h-side"><Avatar user={{ avatar: c.avatars?.[me], color: c.colors?.[me] }} size={40} /><b>You</b></div>
        <div className="h2h-score">{showScore ? <>{score[me] ?? 0}<span>–</span>{score[other] ?? 0}</> : <span className="vs">VS</span>}</div>
        <div className="h2h-side"><Avatar user={{ avatar: c.avatars?.[other], color: c.colors?.[other] }} size={40} /><b>{c.names[other]}</b></div>
      </div>
      <p className="h2h-status">{status}</p>
      {recordLine(c, me) && <p className="h2h-record">{recordLine(c, me)}</p>}
      {c.status === 'pending' && c.to === me && (
        <div className="h2h-actions">
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api(`/api/challenges/${c.id}/respond`, { method: 'POST', body: { accept: true } }), "⚔️ You're on!")}>Accept</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api(`/api/challenges/${c.id}/respond`, { method: 'POST', body: { accept: false } }))}>No thanks</button>
        </div>
      )}
      {c.status === 'pending' && c.from === me && (
        <div className="h2h-actions">
          <button className="link-btn" disabled={busy} onClick={() => run(() => api(`/api/challenges/${c.id}`, { method: 'DELETE' }), 'Challenge cancelled')}>Cancel challenge</button>
        </div>
      )}
    </article>
  );
}

// The head-to-head list at the top of the Leagues page.
export function H2HSection() {
  const { user } = useSession();
  const { data, reload } = useChallenges();
  const list = data?.challenges || [];
  if (!list.length) {
    return (
      <section className="card h2h-empty">
        <Swords size={22} aria-hidden="true" />
        <p><b>Head-to-heads:</b> open a league and tap ⚔️ next to a mate to go one-v-one for the next round.</p>
      </section>
    );
  }
  const incoming = list.filter((c) => c.status === 'pending' && c.to === user.uid);
  const active = list.filter((c) => c.status === 'accepted');
  const sent = list.filter((c) => c.status === 'pending' && c.from === user.uid);
  const results = list.filter((c) => c.status === 'done' || c.status === 'expired').slice(0, 6);
  const group = (title, items) => items.length > 0 && (
    <div className="h2h-group">
      <h3 className="group-label">{title}</h3>
      <div className="h2h-list">{items.map((c) => <ChallengeCard key={c.id} c={c} me={user.uid} onChange={reload} />)}</div>
    </div>
  );
  return (
    <section className="h2h">
      <h2 className="section-title">⚔️ Head-to-heads</h2>
      {group('Waiting for you', incoming)}
      {group('On now and coming up', active)}
      {group('Sent', sent)}
      {group('Results', results)}
    </section>
  );
}

// The ⚔️ button next to a player in a league table.
export function ChallengeButton({ opponent, league, competition }) {
  const { profile } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await api('/api/challenges', { method: 'POST', body: { to: opponent.uid, league, competition } });
      toast(`⚔️ Challenge sent to ${opponent.nickname}!`, 'good');
      setOpen(false);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <>
      <button className="icon-btn h2h-btn" onClick={() => setOpen(true)} aria-label={`Challenge ${opponent.nickname} to a head-to-head`} title="Head-to-head">
        <Swords size={18} />
      </button>
      <Sheet open={open} onClose={() => { setOpen(false); setError(null); }} title="Head-to-head">
        <div className="h2h-confirm">
          <div className="h2h-row">
            <div className="h2h-side"><Avatar user={profile} size={48} /><b>You</b></div>
            <div className="h2h-score"><span className="vs">VS</span></div>
            <div className="h2h-side"><Avatar user={opponent} size={48} /><b>{opponent.nickname}</b></div>
          </div>
          <p>Challenge <b>{opponent.nickname}</b> to a one-v-one in the next {GAMES[competition].name} round. Whoever scores more points from their picks wins. They have until kickoff to accept.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-block" disabled={busy} onClick={send}>{busy ? 'Sending…' : '⚔️ Send challenge'}</button>
        </div>
      </Sheet>
    </>
  );
}
