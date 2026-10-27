import { textOn } from '../lib/clubs';

export default function Avatar({ user, size = 36 }) {
  const bg = user?.club?.primary || user?.color || '#2A2F3A';
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.52, background: bg, color: textOn(bg), borderColor: user?.club?.secondary || 'transparent' }} aria-hidden="true">
      {user?.avatar || '⚽'}
    </span>
  );
}
