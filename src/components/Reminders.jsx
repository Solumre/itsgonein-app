import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useSession } from '../lib/session';
import { pushStatus, permissionGranted, enableReminders, disableReminders, listenInApp } from '../lib/push';
import { useToast } from './Toast';

const HINTS = {
  'ios-install': 'On iPhone, reminders only work from the Home Screen app. In Safari tap Share → Add to Home Screen, open ItsGoneIn from there, then turn them on.',
  denied: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.',
  unsupported: "This browser can't show reminders. Try Chrome, or the Home Screen app on iPhone.",
};

function useReminders() {
  const { priv } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setStatus); }, []);
  const on = !!priv?.notifyKickoff && permissionGranted();
  const toggle = async (want) => {
    setBusy(true);
    try {
      if (want) {
        await enableReminders();
        toast('🔔 Reminders on: we’ll nudge you an hour before kick-off if you haven’t picked.', 'good');
      } else {
        await disableReminders();
        toast('Reminders off');
      }
    } catch (e) {
      toast(e.message, 'bad');
      setStatus(await pushStatus());
    }
    setBusy(false);
  };
  return { status, on, busy, toggle };
}

// Settings row on the Me page.
export function ReminderSwitch() {
  const { status, on, busy, toggle } = useReminders();
  if (!status) return null;
  return (
    <div className="setting setting-col">
      <label className="switch-row">
        <span><Bell size={16} /> Kick-off reminders</span>
        <input type="checkbox" role="switch" className="switch" checked={on} disabled={busy || status !== 'ok'} onChange={(e) => toggle(e.target.checked)} />
      </label>
      <small className="hint">{status === 'ok' ? 'A nudge an hour before kick-off, only if you haven’t picked yet.' : HINTS[status]}</small>
    </div>
  );
}

// One-off card on Predict, shown once someone has started picking.
export function ReminderPrompt({ show }) {
  const { status, on, busy, toggle } = useReminders();
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem('igi-reminder-prompt'); } catch { return true; } });
  if (!show || on || dismissed || !status || status === 'unsupported' || status === 'denied') return null;
  const close = () => { setDismissed(true); try { localStorage.setItem('igi-reminder-prompt', '1'); } catch { /* ignore */ } };
  return (
    <section className="card reminder-card">
      <div className="reminder-bell" aria-hidden="true">🔔</div>
      <div className="reminder-text">
        <strong>Never miss a deadline</strong>
        <p>{status === 'ios-install' ? HINTS['ios-install'] : 'Get a nudge an hour before kick-off if you haven’t made your picks.'}</p>
      </div>
      <div className="reminder-actions">
        {status === 'ok' && <button className="btn btn-sm" disabled={busy} onClick={() => toggle(true).then(close)}><Bell size={15} /> Turn on</button>}
        <button className="btn btn-ghost btn-sm" onClick={close}><BellOff size={15} /> {status === 'ok' ? 'No thanks' : 'Got it'}</button>
      </div>
    </section>
  );
}

// Reminders that arrive while the app is open become toasts.
export function PushListener() {
  const { user } = useSession();
  const toast = useToast();
  useEffect(() => {
    if (!user) return undefined;
    let off = () => {};
    let cancelled = false;
    listenInApp((text) => toast(text, 'good')).then((fn) => { if (cancelled) fn(); else off = fn; });
    return () => { cancelled = true; off(); };
  }, [user, toast]);
  return null;
}
