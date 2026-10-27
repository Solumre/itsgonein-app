import { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { useSession } from '../lib/session';
import { useToast } from './Toast';

// Shown to under-13s until a parent or carer approves: a link to send them.
export default function ParentCard() {
  const { priv } = useSession();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!priv) return null;
  if (priv.consent === 'approved') return <div className="card parent-ok">✅ A parent or carer has OK'd your account.</div>;
  if (priv.consent !== 'pending') return null;

  const link = `${window.location.origin}/parent/${priv.consentToken}`;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'ItsGoneIn', text: 'Can you OK my ItsGoneIn account so I can play with my mates?', url: link }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    toast('Link copied — send it to your parent or carer');
  };

  return (
    <section className="card parent-card">
      <div className="parent-emoji" aria-hidden="true">🔓</div>
      <h2>Ask a parent to unlock leagues</h2>
      <p>You're under 13, so a parent or carer needs to say OK before you can join leagues and chat with your mates. You can still make predictions in the meantime.</p>
      <ol>
        <li>Send them this link, or show them this screen.</li>
        <li>They sign in with <b>their own</b> Google account and tap OK.</li>
        <li>Leagues unlock straight away.</li>
      </ol>
      <div className="share-row">
        <code className="share-link">{link}</code>
        <button className="btn" onClick={share}>{navigator.share ? <><Share2 size={16} /> Send link</> : <><Copy size={16} /> {copied ? 'Copied!' : 'Copy link'}</>}</button>
      </div>
    </section>
  );
}
