// Who gets a kick-off reminder, against the Firestore emulator with a fake push sender.
import { describe, it, expect, beforeAll } from 'vitest';

process.env.FIREBASE_PROJECT_ID = 'demo-itgonein';
let db, sendDueReminders;
const now = Date.parse('2026-11-07T14:15:00Z');
const kickoff = new Date(now + 45 * 60_000).toISOString();
const game = (id, home, away) => ({ id, status: 'upcoming', kickoff, home: { name: home, tla: home }, away: { name: away, tla: away } });
const matches = [game('r1', 'ARS', 'CHE'), game('r2', 'LIV', 'EVE'), { ...game('r3', 'MCI', 'TOT'), kickoff: new Date(now + 3 * 3600_000).toISOString() }];

beforeAll(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-itgonein/databases/(default)/documents`, { method: 'DELETE' });
  ({ db } = await import('../../server/firebase.js'));
  ({ sendDueReminders } = await import('../../server/reminders.js'));
  await db.doc('private/eager').set({ notifyKickoff: true, pushTokens: ['tok-eager'] });
  await db.doc('private/lazy').set({ notifyKickoff: true, pushTokens: ['tok-lazy', 'tok-dead'] });
  await db.doc('private/half').set({ notifyKickoff: true, pushTokens: ['tok-half'] });
  await db.doc('private/off').set({ notifyKickoff: false, pushTokens: ['tok-off'] });
  for (const id of ['r1', 'r2']) await db.doc(`predictions/eager_${id}`).set({ uid: 'eager', matchId: id, home: 1, away: 0 });
  await db.doc('predictions/half_r1').set({ uid: 'half', matchId: 'r1', home: 2, away: 2 });
});

describe('sendDueReminders', () => {
  it('reminds only players with missing picks, once, and drops dead tokens', async () => {
    const calls = [];
    const send = async (msg) => {
      calls.push(msg);
      return {
        successCount: msg.tokens.filter((t) => t !== 'tok-dead').length,
        responses: msg.tokens.map((t) => (t === 'tok-dead'
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true })),
      };
    };
    const first = await sendDueReminders({ matches, now, send });
    expect(first.sent).toBe(2);
    const byToken = Object.fromEntries(calls.map((c) => [c.tokens[0], c]));
    expect(Object.keys(byToken).sort()).toEqual(['tok-half', 'tok-lazy']); // eager picked both, off is off
    expect(byToken['tok-lazy'].notification.title).toBe('⏰ 2 games kick off at 15:00');
    expect(byToken['tok-half'].notification.title).toBe('⏰ LIV v EVE kicks off at 15:00');
    expect(byToken['tok-half'].webpush.fcmOptions.link).toMatch(/\/predict$/);
    expect((await db.doc('private/lazy').get()).data().pushTokens).toEqual(['tok-lazy']);

    const again = await sendDueReminders({ matches, now: now + 60_000, send });
    expect(again.sent).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
