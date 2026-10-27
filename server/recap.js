// Gameweek recaps: a personal summary once every game in a gameweek is done, and a
// "gameweek wrapped" message in each league's chat naming the week's podium.
import { db, FieldValue } from './firebase.js';
import { gameweekComplete, rankRows } from '../src/lib/game.js';

export { gameweekComplete };

// The most recent gameweek that has fully finished, if it ended in the last 8 days.
export function latestCompletedMatchday(matches, now = Date.now()) {
  const mds = [...new Set(matches.map((m) => m.matchday).filter(Boolean))].sort((a, b) => b - a);
  for (const md of mds) {
    if (!gameweekComplete(matches, md)) continue;
    const last = Math.max(...matches.filter((m) => m.matchday === md && m.status === 'finished').map((m) => new Date(m.kickoff).getTime()));
    return now - last < 8 * 86_400_000 ? md : null;
  }
  return null;
}

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

async function picksFor(uids, gwMatches) {
  const refs = uids.flatMap((u) => gwMatches.map((m) => db.collection('predictions').doc(`${u}_${m.id}`)));
  const out = new Map();
  for (let i = 0; i < refs.length; i += 300) {
    for (const d of await db.getAll(...refs.slice(i, i + 300))) if (d.exists) out.set(d.id, d.data());
  }
  return out;
}

// Everything the recap card shows, for one player and one finished gameweek.
export async function buildRecap(uid, md, matches) {
  const gwMatches = matches.filter((m) => m.matchday === md && m.status === 'finished');
  const me = await db.collection('users').doc(uid).get();
  const stats = me.data()?.stats || {};
  const picks = await picksFor([uid], gwMatches);

  let points = 0, exact = 0, results = 0, best = null;
  for (const m of gwMatches) {
    const p = picks.get(`${uid}_${m.id}`);
    if (!p) continue;
    const pts = p.points ?? 0;
    points += pts;
    if (p.kind === 'exact') exact++;
    if (p.kind === 'exact' || p.kind === 'result') results++;
    if (pts > 0 && (!best || pts > best.points)) {
      best = { points: pts, kind: p.kind, doubled: !!p.doubled, home: m.home, away: m.away, score: m.score, pick: { home: p.home, away: p.away } };
    }
  }

  // Leagues: where you finished this gameweek.
  const leagueDocs = (await db.collection('leagues').where('members', 'array-contains', uid).get()).docs;
  const memberIds = [...new Set(leagueDocs.flatMap((l) => l.data().members))];
  const memberDocs = memberIds.length ? await db.getAll(...memberIds.map((u) => db.collection('users').doc(u))) : [];
  // Only players with a settled pick that gameweek count (like the league's wrap message).
  const gwPoints = Object.fromEntries(memberDocs
    .filter((d) => d.exists && d.data().stats?.gw?.[md] != null)
    .map((d) => [d.id, { nickname: d.data().nickname, points: d.data().stats.gw[md] }]));
  const leagues = leagueDocs.map((l) => {
    const ranked = rankRows(l.data().members.filter((u) => gwPoints[u]).map((u) => ({ uid: u, ...gwPoints[u] })));
    const mine = ranked.find((r) => r.uid === uid);
    return { code: l.id, name: l.data().name, rank: mine?.rank ?? null, size: ranked.length, winner: ranked[0] ? { nickname: ranked[0].nickname, points: ranked[0].points } : null };
  }).sort((a, b) => (a.rank ?? 99) / a.size - (b.rank ?? 99) / b.size);

  // Everyone who played this gameweek: how many you beat.
  const all = (await db.collection('users').select('stats.gw').get()).docs
    .map((d) => d.data().stats?.gw?.[md])
    .filter((v) => v != null);
  const beat = all.filter((v) => v < points).length;
  const percentile = all.length > 1 ? Math.round((beat / (all.length - 1)) * 100) : null;
  const average = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null;

  return {
    matchday: md,
    nickname: me.data()?.nickname,
    avatar: me.data()?.avatar,
    club: me.data()?.club || null,
    points, exact, results, picked: picks.size, games: gwMatches.length,
    best, leagues, percentile, average, players: all.length,
    streak: stats.streak || 0, level: stats.level || 1, seasonPoints: stats.points || 0,
  };
}

const wrapped = new Set(); // gameweeks this server knows are done, to skip the database check

// Post "gameweek wrapped" into each league once, after its last game is settled.
export async function wrapGameweek(matches, { now = Date.now() } = {}) {
  const md = latestCompletedMatchday(matches, now);
  if (!md || wrapped.has(md)) return null;
  try {
    await db.collection('wraps').doc(String(md)).create({ at: FieldValue.serverTimestamp() });
  } catch (e) {
    if (e.code === 6) { wrapped.add(md); return null; } // already wrapped
    throw e;
  }
  wrapped.add(md);
  const gwMatches = matches.filter((m) => m.matchday === md && m.status === 'finished');
  const leagues = (await db.collection('leagues').get()).docs;
  let posted = 0;
  for (const l of leagues) {
    const { members } = l.data();
    const users = await db.getAll(...members.map((u) => db.collection('users').doc(u)));
    const played = users.filter((d) => d.exists && d.data().stats?.gw?.[md] != null);
    if (!played.length) continue;
    const picks = await picksFor(played.map((d) => d.id), gwMatches);
    const exacts = Object.fromEntries(played.map((d) => [d.id, gwMatches.filter((m) => picks.get(`${d.id}_${m.id}`)?.kind === 'exact').length]));
    const ranked = rankRows(played.map((d) => ({ uid: d.id, nickname: d.data().nickname, points: d.data().stats.gw[md] })));
    const winners = ranked.filter((r) => r.rank === 1);
    let text = `📊 Gameweek ${md} wrapped! 👑 ${winners.map((w) => w.nickname).join(' & ')} ${winners.length > 1 ? 'shared' : 'won'} the week with ${winners[0].points} pts.`;
    const podium = ranked.filter((r) => r.rank > 1 && r.rank <= 3).map((r) => `${ordinal(r.rank)} ${r.nickname} ${r.points}`);
    if (podium.length) text += ` ${podium.join(', ')}.`;
    const sniper = ranked.map((r) => ({ ...r, exact: exacts[r.uid] })).sort((a, b) => b.exact - a.exact)[0];
    if (sniper?.exact >= 2) text += ` 🎯 Sharpshooter: ${sniper.nickname} with ${sniper.exact} exact scores.`;
    text += ' Check your recap on the Predict tab!';
    await l.ref.collection('messages').doc(`gw_${md}`).set({
      type: 'system', event: 'wrap', text, matchday: md, createdAt: FieldValue.serverTimestamp(), reactions: {},
    });
    posted++;
  }
  console.log(`gameweek ${md} wrapped in ${posted} league(s)`);
  return { matchday: md, posted };
}
