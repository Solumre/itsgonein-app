import { useState } from 'react';
import { api } from '../lib/api';
import { PICK_REACTIONS } from '../lib/game';
import { useToast } from './Toast';

// Reactions on a pick: the ones given so far, and (for a mate's pick) a button to add yours.
export default function PickReactions({ reactions = [], matchId, target, league, canReact, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const react = async (emoji) => {
    setBusy(true);
    try {
      await api('/api/picks/react', { method: 'POST', body: { matchId, target, emoji, league } });
      setOpen(false);
      await onChange?.();
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };
  if (!reactions.length && !canReact) return null;
  return (
    <span className="pick-rx">
      {reactions.map((r) => (
        <button key={r.emoji} className={`rx${r.mine ? ' on' : ''}`} disabled={!canReact || busy} onClick={() => react(r.emoji)} aria-label={`${r.emoji} ${r.count}`}>
          {r.emoji}{r.count > 1 && <small>{r.count}</small>}
        </button>
      ))}
      {canReact && (open ? (
        <span className="rx-pick" role="group" aria-label="React to this pick">
          {PICK_REACTIONS.map((e) => <button key={e} disabled={busy} onClick={() => react(e)}>{e}</button>)}
        </span>
      ) : (
        <button className="rx rx-add" onClick={() => setOpen(true)} aria-label="React to this pick">＋😀</button>
      ))}
    </span>
  );
}
