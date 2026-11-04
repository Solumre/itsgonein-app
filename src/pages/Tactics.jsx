import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi, useMyLeagues, useTitle } from '../lib/hooks';
import { useSession } from '../lib/session';
import { clubColors } from '../lib/clubs';
import { FORMATIONS, FORMATION_NAMES, autoFill, posGroup, slotGroup } from '../lib/tactics';
import { dayLabel, timeLabel } from '../lib/format';
import { useToast } from '../components/Toast';
import Crest from '../components/Crest';
import Sheet from '../components/Sheet';
import Pitch from '../components/Pitch';
import { Spinner, ErrorBox, Segmented } from '../components/Bits';

const GROUPS = [['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards'], [null, 'Others']];

// Move players into a new formation's spots, keeping who's picked.
function reshape(board, formation) {
  const spots = FORMATIONS[formation];
  return { ...board, formation, players: spots.map(([x, y], i) => ({ name: board.players[i]?.name || null, x, y })) };
}

export default function Tactics() {
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const competition = params.get('c') || 'PL';
  const { user, profile } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/tactics/${matchId}?competition=${competition}`);
  const { data: leagues } = useMyLeagues(user?.uid);
  const [sidePicked, setSidePicked] = useState(null);
  const [edits, setEdits] = useState({}); // side -> board being edited
  const [mode, setMode] = useState('move');
  const [picking, setPicking] = useState(null); // spot index
  const [busy, setBusy] = useState(false);
  const [shareTo, setShareTo] = useState(null);
  const m = data?.match;
  useTitle(m ? `Tactics: ${m.home.tla} v ${m.away.tla}` : 'Tactics');

  const defaultSide = m && profile?.club?.tla === m.away.tla ? 'away' : 'home';
  const side = sidePicked || defaultSide;
  const squad = useMemo(() => data?.squads?.[side] || [], [data, side]);
  const saved = data?.boards?.[side] || null;
  const board = edits[side] || saved || (squad.length ? { formation: '4-3-3', players: autoFill('4-3-3', squad).map(({ name, x, y }) => ({ name, x, y })), arrows: [] } : null);
  const dirty = !!edits[side];

  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;

  const team = m[side];
  const colors = clubColors(team);
  const locked = data.locked;
  const cmp = data.compare?.[side];
  const lineup = data.lineups?.[side];
  const set = (b) => setEdits({ ...edits, [side]: b });

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/tactics/${matchId}`, { method: 'POST', body: { competition, side, ...board } });
      toast('💾 Board saved', 'good');
      await reload();
      setEdits({ ...edits, [side]: undefined });
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };
  const share = async (league) => {
    setShareTo(null);
    try {
      await api(`/api/tactics/${matchId}/share`, { method: 'POST', body: { competition, side, league } });
      toast('📣 Shared in your league chat', 'good');
    } catch (e) { toast(e.message, 'bad'); }
  };
  const putPlayer = (name) => {
    const players = board.players.map((p) => ({ ...p }));
    const was = name ? players.findIndex((p) => p.name === name) : -1;
    if (was >= 0) players[was].name = players[picking].name; // already picked: swap spots
    players[picking].name = name;
    set({ ...board, players });
    setPicking(null);
  };
  const used = new Set(board?.players.map((p) => p.name).filter(Boolean));
  const filled = board?.players.filter((p) => p.name).length || 0;

  return (
    <div className="page tactics">
      <Link to={`/match/${matchId}?c=${competition}`} className="link-btn mc-back">‹ Match centre</Link>
      <header className="tac-head">
        <p className="eyebrow">🧠 Tactics board · {dayLabel(m.kickoff)} {timeLabel(m.kickoff)}</p>
        <h1><Crest team={m.home} size={26} /> {m.home.tla} v {m.away.tla} <Crest team={m.away} size={26} /></h1>
        <p className="hint">{locked ? 'Kicked off. Your board is locked.' : 'Predict the starting XI and shape. Locks at kickoff, then we check it against the real line-up.'}</p>
      </header>

      <Segmented label="Team" value={side} onChange={(s) => { setSidePicked(s); setPicking(null); }} options={[{ value: 'home', label: m.home.name }, { value: 'away', label: m.away.name }]} />

      {locked && (
        <section className="card tac-result">
          {!data.boards?.[side] ? <p className="hint">You didn&apos;t save a board for {team.name}.</p>
            : !cmp ? <p className="hint">The line-ups aren&apos;t out yet. Check back around kickoff.</p>
              : (
                <>
                  <b className="tac-score">{cmp.correct}/11</b>
                  <p>of your {team.tla} XI started{cmp.correct >= 9 ? ' 🔥 Proper scout!' : cmp.correct >= 7 ? ' 👏 Nice' : ''}. Formation: {cmp.formation ? (cmp.formationRight ? `✅ ${cmp.formation}` : `❌ they played ${cmp.formation}`) : 'not given'}.</p>
                </>
              )}
        </section>
      )}

      {board ? (
        <>
          {!locked && (
            <div className="tac-tools">
              <div className="chips-row" role="tablist" aria-label="Formation">
                {FORMATION_NAMES.map((f) => <button key={f} role="tab" aria-selected={board.formation === f} className={`chip chip-sm${board.formation === f ? ' on' : ''}`} onClick={() => set(reshape(board, f))}>{f}</button>)}
              </div>
              <Segmented label="Tool" value={mode} onChange={setMode} options={[{ value: 'move', label: '✋ Move' }, { value: 'run', label: '➰ Runs' }, { value: 'pass', label: '➡️ Passes' }]} />
            </div>
          )}
          <Pitch board={board} colors={colors} mode={mode} hits={locked ? cmp?.hits : null}
            onChange={locked ? undefined : set} onPick={locked ? undefined : setPicking} />
          {!locked && (
            <div className="tac-actions">
              <p className="hint">{mode === 'move' ? 'Tap a player to change them, drag to move them.' : `Drag on the pitch to draw a ${mode}.`} {filled}/11 picked.</p>
              <div className="row-form">
                <button className="btn btn-ghost btn-sm" onClick={() => set({ ...board, players: autoFill(board.formation, squad).map(({ name, x, y }) => ({ name, x, y })) })}>🪄 Auto-fill</button>
                {board.arrows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => set({ ...board, arrows: board.arrows.slice(0, -1) })}>↩️ Undo arrow</button>}
                {board.arrows.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => set({ ...board, arrows: [] })}>🧽 Clear arrows</button>}
              </div>
              <div className="row-form">
                <button className="btn" disabled={busy || (!dirty && !!saved)} onClick={save}>{saved && !dirty ? '✅ Saved' : '💾 Save board'}</button>
                {saved && leagues?.length > 0 && <button className="btn btn-ghost" disabled={dirty} onClick={() => (leagues.length === 1 ? share(leagues[0].id) : setShareTo(true))}>📣 Share</button>}
              </div>
            </div>
          )}
          {locked && lineup && (
            <section className="card">
              <h2 className="section-title">Real {team.tla} XI {lineup.formation && `(${lineup.formation})`}</h2>
              <p className="tac-real">{lineup.starting.map((p) => p.name).join(', ')}</p>
            </section>
          )}
        </>
      ) : <p className="hint">No squad list for {team.name} yet.</p>}

      <Sheet open={picking != null} onClose={() => setPicking(null)} title={picking != null ? `Pick a ${{ GK: 'goalkeeper', DEF: 'defender', MID: 'midfielder', FWD: 'forward' }[slotGroup(board.players[picking].y, picking)]}` : ''}>
        {picking != null && (
          <div className="squad-list">
            {GROUPS.map(([g, label]) => {
              const list = squad.filter((p) => posGroup(p.position) === g);
              if (!list.length) return null;
              return (
                <div key={label}>
                  <h4>{label}</h4>
                  {list.map((p) => (
                    <button key={p.name} className={`squad-pick${used.has(p.name) ? ' used' : ''}${board.players[picking].name === p.name ? ' current' : ''}`} onClick={() => putPlayer(p.name)}>
                      <span className="shirt">{p.shirt ?? ''}</span>{p.name}{used.has(p.name) && board.players[picking].name !== p.name && <small>picked: swaps</small>}
                    </button>
                  ))}
                </div>
              );
            })}
            {board.players[picking].name && <button className="link-btn" onClick={() => putPlayer(null)}>Leave this spot empty</button>}
          </div>
        )}
      </Sheet>

      <Sheet open={!!shareTo} onClose={() => setShareTo(null)} title="Share to which league?">
        {(leagues || []).map((l) => <button key={l.id} className="action" onClick={() => share(l.id)}>{l.name}</button>)}
      </Sheet>
    </div>
  );
}
