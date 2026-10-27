import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, LogOut, Moon, Sun, MonitorSmartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useSession, logOut } from '../lib/session';
import { BADGES, levelFor, AVATARS } from '../lib/game';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Crest from '../components/Crest';
import Sheet from '../components/Sheet';
import ClubPicker from '../components/ClubPicker';
import ParentCard from '../components/ParentCard';
import { Segmented } from '../components/Bits';

function EditProfile({ profile, onDone }) {
  const { setPreviewClub } = useSession();
  const [club, setClub] = useState(profile.club);
  const [nickname, setNickname] = useState(profile.nickname);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api('/api/profile', { method: 'POST', body: { club, avatar, ...(nickname !== profile.nickname && { nickname }) } });
      setPreviewClub(null);
      toast('Saved!', 'good');
      onDone();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <div className="edit-profile">
      <label className="field"><span>Nickname</span><input value={nickname} maxLength={16} onChange={(e) => setNickname(e.target.value)} /></label>
      <fieldset className="field"><legend>Avatar</legend>
        <div className="avatar-grid">{AVATARS.map((a) => <button key={a} type="button" className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}</div>
      </fieldset>
      <h4>Club</h4>
      <ClubPicker value={club} onPick={(c) => { setClub(c); setPreviewClub(c); }} />
      {error && <p className="form-error">{error}</p>}
      <div className="sticky-save"><button className="btn btn-block" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    </div>
  );
}

export default function Me() {
  const { profile, priv, themePref, setThemePref, setPreviewClub } = useSession();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const s = profile.stats || {};
  const lvl = levelFor(s.xp || 0);
  const earned = new Set(s.badges || []);

  const del = async () => {
    try {
      await api('/api/me', { method: 'DELETE' });
      await logOut();
      navigate('/', { replace: true });
    } catch (e) { toast(e.message, 'bad'); }
  };

  return (
    <div className="page me">
      <section className="player-hero kit">
        <button className="icon-btn edit" onClick={() => setEditing(true)} aria-label="Edit profile"><Pencil size={18} /></button>
        <Avatar user={profile} size={84} />
        <h1>{profile.nickname}</h1>
        <p className="club-line"><Crest team={profile.club} size={20} /> {profile.club?.name}</p>
        <div className="level">
          <div className="level-top"><b>LV {lvl.level} · {lvl.name}</b><span>{lvl.next ? `${lvl.xp} / ${lvl.next} XP` : `${lvl.xp} XP · max level!`}</span></div>
          <div className="xp-bar"><i style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></div>
        </div>
      </section>

      <section className="stat-grid">
        <div><b>{s.points || 0}</b><span>points</span></div>
        <div><b>{s.exact || 0}</b><span>exact scores</span></div>
        <div><b>{s.results || 0}/{s.played || 0}</b><span>right results</span></div>
        <div><b>{s.bestStreak || 0}🔥</b><span>best streak</span></div>
      </section>

      <section>
        <h2 className="section-title">Badges <small>{earned.size}/{BADGES.length}</small></h2>
        <div className="badge-grid">
          {BADGES.map((b) => (
            <div key={b.id} className={`badge${earned.has(b.id) ? ' got' : ''}`}>
              <span className="badge-emoji" aria-hidden="true">{earned.has(b.id) ? b.emoji : '🔒'}</span>
              <strong>{b.name}</strong>
              <small>{b.desc}</small>
            </div>
          ))}
        </div>
      </section>

      {priv?.under13 && <ParentCard />}

      <section className="card settings">
        <h2 className="section-title">Settings</h2>
        <div className="setting">
          <span>Theme</span>
          <Segmented label="Theme" value={themePref} onChange={setThemePref} options={[
            { value: 'dark', label: <><Moon size={14} /> Dark</> },
            { value: 'light', label: <><Sun size={14} /> Light</> },
            { value: 'system', label: <><MonitorSmartphone size={14} /> Auto</> },
          ]} />
        </div>
        <button className="action" onClick={() => setEditing(true)}><Pencil size={16} /> Change club, nickname or avatar</button>
        <button className="action" onClick={logOut}><LogOut size={16} /> Sign out</button>
      </section>

      <details className="card how">
        <summary>Staying safe</summary>
        <ul>
          <li>Only people in your leagues can see your messages and picks.</li>
          <li>Never share where you live, your school, your phone number or other apps.</li>
          <li>If something upsets you, tap the message to report or block, and tell an adult you trust.</li>
          <li>You can delete your account and everything in it at any time.</li>
        </ul>
      </details>

      <button className="link-btn danger center-block" onClick={() => setDeleting(true)}>Delete my account</button>

      <Sheet open={editing} onClose={() => { setEditing(false); setPreviewClub(null); }} title="Edit profile">
        <EditProfile profile={profile} onDone={() => setEditing(false)} />
      </Sheet>
      <Sheet open={deleting} onClose={() => setDeleting(false)} title="Delete account?">
        <p>This deletes your profile, picks and points for good, and removes you from your leagues. Type <b>{profile.nickname}</b> to confirm.</p>
        <label className="field"><input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type your nickname" /></label>
        <button className="btn btn-danger btn-block" disabled={confirm !== profile.nickname} onClick={del}>Delete everything</button>
      </Sheet>
    </div>
  );
}
