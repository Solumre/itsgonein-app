// Keeps Firestore's copy of the game's fixtures current (the security rules read kickoff
// times from it to lock picks), settles finished games, and posts kickoff/full-time
// messages into league chats.
import { db, Timestamp, FieldValue } from './firebase.js';
import { getMatches, GAME_COMPETITION } from './football.js';
import { computeStats } from '../src/lib/game.js';
import { sendDueReminders } from './reminders.js';

const synced = new Map(); // matchId -> fingerprint of what Firestore holds
let loaded = false;
let running = null;
const ANNOUNCE_WINDOW = 6 * 3600_000; // don't announce games older than this (e.g. on first boot)

const fingerprint = (m) => `${m.status}|${m.kickoff}|${m.score?.home}-${m.score?.away}|${m.minute}|${m.paused}`;
const scoreKey = (s) => (s ? `${s.home}-${s.away}` : null);

export function toGameMatch(m) {
  return { ...m, kickoff: new Date(m.kickoff).getTime() };
}

async function loadSynced() {
  const snap = await db.collection('matches').where('competition', '==', GAME_COMPETITION).get();
  for (const d of snap.docs) {
    const x = d.data();
    synced.set(d.id, {
      fp: fingerprint({ ...x, kickoff: x.kickoff.toDate().toISOString() }),
      settledScore: x.settledScore ?? null,
      kickoffAnnounced: !!x.kickoffAnnounced,
      resultAnnounced: x.resultAnnounced ?? null,
    });
  }
  loaded = true;
}

export function syncNow() {
  if (!running) running = runSync().finally(() => { running = null; });
  return running;
}

async function runSync() {
  if (!loaded) await loadSynced();
  const matches = await getMatches(GAME_COMPETITION);
  const now = Date.now();
  const toSettle = [];
  const toAnnounceKickoff = [];
  const toAnnounceResult = [];

  let batch = db.batch();
  let writes = 0;
  const flush = async () => { if (writes) await batch.commit(); batch = db.batch(); writes = 0; };

  for (const m of matches) {
    const prev = synced.get(m.id) || { settledScore: null, kickoffAnnounced: false, resultAnnounced: null };
    const fp = fingerprint(m);
    const kickoffMs = new Date(m.kickoff).getTime();
    const started = m.status === 'live' || m.status === 'finished';
    const recent = now - kickoffMs < ANNOUNCE_WINDOW;
    const finalScore = m.status === 'finished' ? scoreKey(m.score) : null;
    const update = {};

    if (prev.fp !== fp) {
      Object.assign(update, {
        competition: m.competition, matchday: m.matchday, kickoff: Timestamp.fromMillis(kickoffMs),
        status: m.status, paused: m.paused, minute: m.minute, score: m.score, home: m.home, away: m.away,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (finalScore && prev.settledScore !== finalScore) toSettle.push(m);
    if (started && !prev.kickoffAnnounced) {
      update.kickoffAnnounced = true;
      if (recent) toAnnounceKickoff.push(m);
    }
    if (finalScore && prev.resultAnnounced !== finalScore) {
      update.resultAnnounced = finalScore;
      if (recent || prev.resultAnnounced) toAnnounceResult.push(m);
    }
    if (Object.keys(update).length) {
      batch.set(db.collection('matches').doc(m.id), update, { merge: true });
      if (++writes >= 400) await flush();
    }
    synced.set(m.id, { ...prev, fp, kickoffAnnounced: prev.kickoffAnnounced || started, resultAnnounced: finalScore ?? prev.resultAnnounced });
  }
  await flush();

  if (toSettle.length) await settle(toSettle, matches);
  for (const m of toAnnounceKickoff) await announceKickoff(m).catch((e) => console.error('kickoff announce', e));
  for (const m of toAnnounceResult) await announceResult(m).catch((e) => console.error('result announce', e));
  return { matches: matches.length, settled: toSettle.length };
}

async function picksFor(matchId) {
  const snap = await db.collection('predictions').where('matchId', '==', String(matchId)).get();
  return snap.docs.map((d) => d.data());
}

export async function recomputeUser(uid, matchesById) {
  const [picksSnap, userSnap] = await Promise.all([
    db.collection('predictions').where('uid', '==', uid).get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (!userSnap.exists) return;
  const picks = picksSnap.docs.map((d) => d.data());
  const { stats, perPick } = computeStats(picks, matchesById, { clubTla: userSnap.data().club?.tla });
  const batch = db.batch();
  for (const d of picksSnap.docs) {
    const r = perPick[d.data().matchId];
    if (r && (d.data().points !== r.points || d.data().kind !== r.kind)) {
      batch.update(d.ref, { points: r.points, kind: r.kind, doubled: r.double });
    }
  }
  batch.update(userSnap.ref, { stats });
  await batch.commit();
}

async function settle(finished, allMatches) {
  const matchesById = new Map(allMatches.map((m) => [m.id, toGameMatch(m)]));
  const uids = new Set();
  for (const m of finished) for (const p of await picksFor(m.id)) uids.add(p.uid);
  for (const uid of uids) await recomputeUser(uid, matchesById);
  const batch = db.batch();
  for (const m of finished) {
    batch.set(db.collection('matches').doc(m.id), { settledScore: scoreKey(m.score) }, { merge: true });
    synced.get(m.id).settledScore = scoreKey(m.score);
  }
  await batch.commit();
  console.log(`settled ${finished.length} match(es) for ${uids.size} player(s)`);
}

// Leagues that have at least one of these players, with the members' picks.
async function leaguesWith(uids) {
  const list = [...uids];
  const leagues = new Map();
  for (let i = 0; i < list.length; i += 30) {
    const snap = await db.collection('leagues').where('members', 'array-contains-any', list.slice(i, i + 30)).get();
    for (const d of snap.docs) leagues.set(d.id, d.data());
  }
  return leagues;
}

async function nicknames(uids) {
  const refs = [...uids].map((u) => db.collection('users').doc(u));
  if (!refs.length) return {};
  const docs = await db.getAll(...refs);
  return Object.fromEntries(docs.filter((d) => d.exists).map((d) => [d.id, d.data().nickname]));
}

const listNames = (names) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`);

async function postSystem(code, id, text, extra = {}) {
  await db.collection('leagues').doc(code).collection('messages').doc(id).set({
    type: 'system', text, createdAt: FieldValue.serverTimestamp(), reactions: {}, ...extra,
  });
}

async function announceKickoff(m) {
  const picks = await picksFor(m.id);
  if (!picks.length) return;
  const byUid = new Map(picks.map((p) => [p.uid, p]));
  const leagues = await leaguesWith(byUid.keys());
  for (const [code, league] of leagues) {
    const mine = league.members.map((u) => byUid.get(u)).filter(Boolean);
    if (!mine.length) continue;
    const home = mine.filter((p) => p.home > p.away).length;
    const away = mine.filter((p) => p.home < p.away).length;
    const draw = mine.length - home - away;
    const counts = {};
    for (const p of mine) counts[`${p.home}-${p.away}`] = (counts[`${p.home}-${p.away}`] || 0) + 1;
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    await postSystem(code, `ko_${m.id}`,
      `🔒 Picks locked for ${m.home.name} v ${m.away.name}! ${home} backing ${m.home.tla}, ${draw} for a draw, ${away} backing ${m.away.tla}. Most popular: ${top[0]}.`,
      { matchId: m.id, event: 'kickoff' });
  }
}

async function announceResult(m) {
  const picks = await picksFor(m.id);
  if (!picks.length) return;
  const byUid = new Map(picks.map((p) => [p.uid, p]));
  const leagues = await leaguesWith(byUid.keys());
  const names = await nicknames(byUid.keys());
  for (const [code, league] of leagues) {
    const mine = league.members.map((u) => byUid.get(u)).filter(Boolean);
    if (!mine.length) continue;
    const exact = mine.filter((p) => p.home === m.score.home && p.away === m.score.away).map((p) => names[p.uid]).filter(Boolean);
    const sign = (h, a) => Math.sign(h - a);
    const result = mine.filter((p) => sign(p.home, p.away) === sign(m.score.home, m.score.away)).length - exact.length;
    let text = `🏁 FT: ${m.home.name} ${m.score.home}-${m.score.away} ${m.away.name}.`;
    if (exact.length) text += ` 🎯 ${listNames(exact)} nailed the exact score!`;
    if (result > 0) text += ` ✅ ${result} got the result.`;
    if (!exact.length && result <= 0) text += ' 😬 Nobody saw that coming!';
    await postSystem(code, `ft_${m.id}`, text, { matchId: m.id, event: 'result' });
  }
}

// Background loop: quick while games are on, slow otherwise.
export function startSyncLoop() {
  const tick = async () => {
    let delay = 5 * 60_000;
    try {
      await syncNow();
      const matches = await getMatches(GAME_COMPETITION);
      await sendDueReminders({ matches }).catch((e) => console.error('reminders failed:', e.message));
      const now = Date.now();
      if (matches.some((m) => m.status === 'live' || (m.status === 'upcoming' && Math.abs(new Date(m.kickoff) - now) < 30 * 60_000))) delay = 60_000;
    } catch (e) {
      console.error('sync failed:', e.message);
    }
    setTimeout(tick, delay).unref?.();
  };
  tick();
}
