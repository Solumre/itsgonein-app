import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, LogIn, Users, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useMyLeagues } from '../lib/hooks';
import { useToast } from '../components/Toast';
import Sheet from '../components/Sheet';
import { Spinner, Empty, PageHead } from '../components/Bits';
import ParentCard from '../components/ParentCard';

export default function Leagues() {
  const { user, canSocial } = useSession();
  const { data: leagues, loading } = useMyLeagues(user.uid, canSocial);
  const [sheet, setSheet] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const open = (kind) => { setSheet(kind); setValue(''); setError(null); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = sheet === 'create'
        ? await api('/api/leagues', { method: 'POST', body: { name: value } })
        : await api('/api/leagues/join', { method: 'POST', body: { code: value } });
      toast(sheet === 'create' ? '🏟️ League created! Share the code with your mates.' : `👋 You're in ${res.name}!`, 'good');
      navigate(`/leagues/${res.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canSocial) {
    return (
      <div className="page">
        <PageHead title="Leagues" sub="Play against your mates" />
        <ParentCard />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Leagues" sub="Play against your mates">
        <div className="head-actions">
          <button className="btn btn-sm" onClick={() => open('create')}><Plus size={16} /> Create</button>
          <button className="btn btn-ghost btn-sm" onClick={() => open('join')}><LogIn size={16} /> Join</button>
        </div>
      </PageHead>

      {loading ? <Spinner /> : !leagues?.length ? (
        <Empty emoji="🏆" title="No leagues yet">
          Create a league and share the code, or join one with a code from a friend.
          <span className="empty-actions">
            <button className="btn" onClick={() => open('create')}>Create a league</button>
            <button className="btn btn-ghost" onClick={() => open('join')}>I have a code</button>
          </span>
        </Empty>
      ) : (
        <div className="league-list">
          {leagues.map((l) => (
            <Link key={l.id} to={`/leagues/${l.id}`} className="league-card">
              <div className="league-badge" aria-hidden="true">{l.name.slice(0, 1).toUpperCase()}</div>
              <div className="league-info">
                <strong>{l.name}</strong>
                <span><Users size={14} /> {l.memberCount} player{l.memberCount === 1 ? '' : 's'} · code {l.id}</span>
              </div>
              <ChevronRight size={20} className="chev" />
            </Link>
          ))}
        </div>
      )}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'create' ? 'Create a league' : 'Join a league'}>
        <form onSubmit={submit} className="sheet-form">
          <label className="field">
            <span>{sheet === 'create' ? 'League name' : 'League code'}</span>
            {sheet === 'create'
              ? <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={30} placeholder="e.g. Year 8 Legends" autoFocus />
              : <input value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" className="code-input" autoCapitalize="characters" autoComplete="off" autoFocus />}
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-block" disabled={busy || (sheet === 'create' ? value.trim().length < 3 : value.length !== 6)}>
            {busy ? 'Hang on…' : sheet === 'create' ? 'Create league' : 'Join league'}
          </button>
        </form>
      </Sheet>
    </div>
  );
}
