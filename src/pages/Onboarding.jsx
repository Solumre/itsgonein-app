import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useSession, logOut } from '../lib/session';
import { AVATARS } from '../lib/game';
import ClubPicker from '../components/ClubPicker';
import Avatar from '../components/Avatar';
import Crest from '../components/Crest';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 70 }, (_, i) => thisYear - 6 - i);

export default function Onboarding() {
  const { setPreviewClub } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [club, setClub] = useState(null);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [birthMonth, setMonth] = useState('');
  const [birthYear, setYear] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pick = (c) => { setClub(c); setPreviewClub(c); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/profile', { method: 'POST', body: { nickname, avatar, club, birthYear: Number(birthYear), birthMonth: Number(birthMonth) } });
      setPreviewClub(null);
      let pending = null;
      try { pending = localStorage.getItem('igi-join'); } catch { /* ignore */ }
      navigate(pending ? `/join/${pending}` : '/predict', { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.status === 409 || /nickname/i.test(err.message)) setStep(1);
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <header className="ob-head">
        {step > 0 ? <button className="icon-btn" onClick={() => setStep(step - 1)} aria-label="Back"><ArrowLeft size={20} /></button> : <span />}
        <div className="ob-dots" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <button className="link-btn" onClick={logOut}>Sign out</button>
      </header>

      {step === 0 && (
        <section className="ob-step">
          <h1>Who do you support?</h1>
          <p className="page-sub">The app takes on your club's colours. You can change this later.</p>
          <ClubPicker value={club} onPick={pick} />
          <div className="ob-actions"><button className="btn" disabled={!club} onClick={() => setStep(1)}>Next</button></div>
        </section>
      )}

      {step === 1 && (
        <section className="ob-step">
          <h1>Make your player card</h1>
          <div className="player-card kit">
            <Avatar user={{ avatar, club }} size={72} />
            <div>
              <strong>{nickname || 'Your nickname'}</strong>
              <span><Crest team={club} size={18} /> {club?.name}</span>
            </div>
          </div>
          <label className="field">
            <span>Nickname</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} placeholder="e.g. GoalMachine9" autoComplete="off" />
            <small>Don't use your real full name. Your mates will see this.</small>
          </label>
          <fieldset className="field">
            <legend>Avatar</legend>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button type="button" key={a} className={a === avatar ? 'on' : ''} aria-pressed={a === avatar} onClick={() => setAvatar(a)}>{a}</button>
              ))}
            </div>
          </fieldset>
          {error && <p className="form-error">{error}</p>}
          <div className="ob-actions"><button className="btn" disabled={nickname.trim().length < 3} onClick={() => { setError(null); setStep(2); }}>Next</button></div>
        </section>
      )}

      {step === 2 && (
        <form className="ob-step" onSubmit={submit}>
          <h1>When's your birthday?</h1>
          <p className="page-sub">We only use this to check your age. If you're under 13, a parent or carer needs to say OK before you can join leagues and chat. Nobody else sees it.</p>
          <div className="field-row">
            <label className="field"><span>Month</span>
              <select value={birthMonth} onChange={(e) => setMonth(e.target.value)} required>
                <option value="" disabled>Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="field"><span>Year</span>
              <select value={birthYear} onChange={(e) => setYear(e.target.value)} required>
                <option value="" disabled>Year</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="ob-actions"><button className="btn" disabled={busy || !birthMonth || !birthYear}>{busy ? 'Saving…' : "Let's go!"}</button></div>
        </form>
      )}
    </div>
  );
}
