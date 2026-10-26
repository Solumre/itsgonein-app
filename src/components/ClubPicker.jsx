import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { teamToClub, DEFAULT_CLUB } from '../lib/clubs';
import Crest from './Crest';
import { Spinner, ErrorBox } from './Bits';

export default function ClubPicker({ value, onPick }) {
  const { data, error, loading, reload } = useApi('/api/teams');
  const [q, setQ] = useState('');
  const groups = useMemo(() => (data?.groups || []).map((g) => ({
    ...g,
    teams: g.teams.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
  })), [data, q]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="club-picker">
      <label className="search">
        <Search size={18} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clubs" aria-label="Search clubs" />
      </label>
      {groups.map((g) => g.teams.length > 0 && (
        <section key={g.name}>
          <h3 className="group-label">{g.name}</h3>
          <div className="club-grid">
            {g.teams.map((t) => {
              const club = teamToClub(t);
              const on = value?.tla === club.tla;
              return (
                <button key={t.id} className={`club-tile${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onPick(club)}
                  style={{ '--tile': club.primary, '--tile-2': club.secondary }}>
                  <Crest team={club} size={40} />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <button className={`club-tile club-neutral${value?.tla === 'FAN' ? ' on' : ''}`} onClick={() => onPick(DEFAULT_CLUB)}>
        <span className="neutral-ball" aria-hidden="true">⚽</span>
        <span>No club / another team</span>
      </button>
    </div>
  );
}
