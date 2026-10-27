import { useState } from 'react';
import { clubColors, textOn } from '../lib/clubs';

// Club crest, or a shield in the club's colours when there's no image (or it fails to load).
export default function Crest({ team, size = 32 }) {
  const [failed, setFailed] = useState(false);
  if (!team) return null;
  if (team.crest && !failed) {
    return <img className="crest" src={team.crest} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />;
  }
  const [a, b] = team.primary ? [team.primary, team.secondary] : clubColors(team);
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 4 6v9c0 7.5 5.2 12.6 12 15 6.8-2.4 12-7.5 12-15V6L16 2Z" fill={a} stroke={b} strokeWidth="1.6" />
      <text x="16" y="19.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" fill={textOn(a)}>{team.tla}</text>
    </svg>
  );
}
