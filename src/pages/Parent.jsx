import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession, signIn, logOut } from '../lib/session';
import { useApi } from '../lib/hooks';
import { Spinner, ErrorBox } from '../components/Bits';
import Avatar from '../components/Avatar';

// Where a parent or carer OKs an under-13's account, signed in with their own Google account.
export default function Parent() {
  const { token } = useParams();
  const { user, priv } = useSession();
  const { data, error, loading, reload } = useApi(`/api/consent/${token}`);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const decide = async (approve) => {
    setBusy(true); setErr(null);
    try { await api(`/api/consent/${token}`, { method: 'POST', body: { approve, confirm } }); await reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (loading && !data) return <Spinner />;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  const isChild = user && priv?.consentToken === token;

  return (
    <div className="page parent-page">
      <section className="card">
        <span className="eyebrow">For parents and carers</span>
        <h1>Is it OK for {data.nickname} to join leagues?</h1>
        <div className="parent-kid"><Avatar user={{ avatar: data.avatar }} size={44} /><div><b>{data.nickname}</b><small>{data.club} fan</small></div></div>
        <p>ItsGoneIn is a free Premier League score-prediction game. There's no betting, no prizes and no adverts. Because {data.nickname} is under 13, they need your OK before they can join private leagues and chat with friends.</p>
        <h3>How we keep it safe</h3>
        <ul>
          <li>Chat is only between friends in the same private league, joined with an invite code. There's no public chat and no private messages.</li>
          <li>Players use nicknames and emoji avatars. Real names, photos and emails are never shown.</li>
          <li>Swearing, links, phone numbers, emails and social media handles are blocked automatically.</li>
          <li>Any message can be reported or blocked. Reports are checked by an adult moderator.</li>
          <li>We only keep their nickname, club, birthday month and year, picks and league messages. Their account and data can be deleted at any time from the Me tab.</li>
        </ul>

        {data.status === 'approved' ? (
          <div className="parent-done">
            <p>✅ You've said OK. {data.nickname} can now join leagues.</p>
            {user && !isChild && <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>Withdraw my OK</button>}
          </div>
        ) : isChild ? (
          <p className="banner banner-warn">This is your own account. A parent or carer needs to open this link and sign in with <b>their</b> Google account.</p>
        ) : !user ? (
          <button className="btn" onClick={() => signIn()}>Sign in with your Google account</button>
        ) : (
          <div className="parent-approve">
            <p className="hint">Signed in as {user.email}. <button className="link-btn" onClick={logOut}>Not you?</button></p>
            <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I'm {data.nickname}'s parent or carer and I'm happy for them to join leagues and chat with friends.</label>
            <button className="btn" disabled={!confirm || busy} onClick={() => decide(true)}>{busy ? 'Saving…' : 'Say OK'}</button>
          </div>
        )}
        {err && <p className="form-error">{err}</p>}
      </section>
    </div>
  );
}
