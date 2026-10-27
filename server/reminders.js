// Kick-off reminders: about an hour before each batch of games kicks off, nudge players
// who turned reminders on and still haven't picked those games. No pick missing, no ping.
import { getMessaging } from 'firebase-admin/messaging';
import { db, FieldValue } from './firebase.js';

export const LEAD_MS = 60 * 60_000;
const APP_URL = (process.env.APP_URL || 'https://itsgonein.com').replace(/\/$/, '');
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

// Games kicking off at the same moment form a slot; return the slots inside the window.
export function dueSlots(matches, now, lead = LEAD_MS) {
  const slots = new Map();
  for (const m of matches) {
    if (m.status !== 'upcoming') continue;
    const at = new Date(m.kickoff).getTime();
    if (at <= now || at - now > lead) continue;
    if (!slots.has(at)) slots.set(at, []);
    slots.get(at).push(m);
  }
  return [...slots].sort((a, b) => a[0] - b[0]).map(([at, ms]) => ({ key: `ko_${at}`, at, matches: ms }));
}

export function reminderText(missing, at) {
  const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  if (missing.length === 1) {
    const [m] = missing;
    return { title: `⏰ ${m.home.name} v ${m.away.name} kicks off at ${time}`, body: "You haven't made your pick yet. Get it in before it locks!" };
  }
  return { title: `⏰ ${missing.length} games kick off at ${time}`, body: `You haven't picked ${missing.map((m) => `${m.home.tla} v ${m.away.tla}`).join(', ')}. Get your picks in before they lock!` };
}

const defaultSend = (message) => getMessaging().sendEachForMulticast(message);

async function getAllChunked(refs) {
  const out = [];
  for (let i = 0; i < refs.length; i += 300) out.push(...(await db.getAll(...refs.slice(i, i + 300))));
  return out;
}

export async function sendDueReminders({ matches, now = Date.now(), send = defaultSend }) {
  let sent = 0;
  for (const slot of dueSlots(matches, now)) {
    // Claim the slot first so a restart or a second server never sends it twice.
    try {
      await db.collection('reminders').doc(slot.key).create({ at: new Date(slot.at), createdAt: FieldValue.serverTimestamp() });
    } catch (e) {
      if (e.code === 6) continue; // ALREADY_EXISTS
      throw e;
    }

    const players = (await db.collection('private').where('notifyKickoff', '==', true).get()).docs
      .filter((d) => d.data().pushTokens?.length);
    if (!players.length) continue;
    const refs = players.flatMap((p) => slot.matches.map((m) => db.collection('predictions').doc(`${p.id}_${m.id}`)));
    const picked = new Set((await getAllChunked(refs)).filter((d) => d.exists).map((d) => d.id));

    let reached = 0;
    for (const p of players) {
      const missing = slot.matches.filter((m) => !picked.has(`${p.id}_${m.id}`));
      if (!missing.length) continue;
      const tokens = p.data().pushTokens;
      const { title, body } = reminderText(missing, slot.at);
      const res = await send({
        tokens,
        notification: { title, body },
        webpush: {
          notification: { icon: `${APP_URL}/icon-192.png`, badge: `${APP_URL}/icon-192.png`, tag: slot.key },
          fcmOptions: { link: `${APP_URL}/predict` },
        },
        data: { type: 'kickoff', link: '/predict' },
      }).catch((e) => { console.error('push failed', e.message); return null; });
      if (!res) continue;
      reached += res.successCount;
      const dead = tokens.filter((_, i) => !res.responses[i].success && DEAD_TOKEN.has(res.responses[i].error?.code));
      if (dead.length) await p.ref.update({ pushTokens: FieldValue.arrayRemove(...dead) });
    }
    sent += reached;
    await db.collection('reminders').doc(slot.key).update({ devices: reached });
    if (reached) console.log(`kick-off reminder ${slot.key}: ${reached} device(s)`);
  }
  return { sent };
}
