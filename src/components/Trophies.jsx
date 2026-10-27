import { useApi } from '../lib/hooks';
import { TROPHIES } from '../lib/game';

const ORDER = ['champion', 'ucl_champion', 'boot', 'month', 'gw', 'ucl_round'];

// The trophy cabinet on the Me tab: a shelf of every trophy type, then the recent wins.
export default function TrophyCabinet() {
  const { data } = useApi('/api/me/trophies');
  const list = data?.trophies || [];
  const counts = Object.fromEntries(ORDER.map((t) => [t, list.filter((x) => x.type === t).length]));
  const total = list.length;
  return (
    <section className="cabinet">
      <h2 className="section-title">🏆 Trophy cabinet <small>{total}</small></h2>
      <div className="cabinet-glass">
        <div className="cabinet-shelf">
          {ORDER.map((t) => (
            <div key={t} className={`trophy${counts[t] ? ' got' : ''}`} title={TROPHIES[t].desc}>
              <span className="trophy-emoji" aria-hidden="true">{TROPHIES[t].emoji}</span>
              {counts[t] > 1 && <span className="trophy-count">×{counts[t]}</span>}
              <strong>{TROPHIES[t].name}</strong>
              <small>{counts[t] ? `${counts[t]} won` : TROPHIES[t].desc}</small>
            </div>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <p className="hint">Top your league in a gameweek to win your first trophy. 🏅</p>
      ) : (
        <ul className="trophy-list">
          {list.slice(0, 8).map((t) => (
            <li key={t.id}>
              <span className="trophy-emoji" aria-hidden="true">{t.emoji}</span>
              <span className="who"><strong>{t.name} · {t.label}</strong><small>{t.leagueName}{t.points != null ? ` · ${t.points} ${t.type === 'boot' ? 'exact scores' : 'pts'}` : ''}</small></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
