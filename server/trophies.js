// Trophies, won inside a league: round winners (from the "wrapped" step), Player of the
// Month, and end-of-season champion, Golden Boot and UCL champion. Each award has a fixed
// id, so running a step twice never awards anything twice.
import { db, FieldValue } from './firebase.js';
import { TROPHIES, GAMES, rankRows, monthToAward, monthName, seasonLabel, roundLabel } from '../src/lib/game.js';

const trophies = db.collection('trophies');
const runs = db.collection('trophyRuns');
const done = new Set(); // runs this server knows are finished
// Document ids can't contain "/" (season labels like 2026/27 do).
const safe = (s) => String(s).replace(/\//g, '-');

// Award one trophy. Returns true if it's new.
export async function award({ uid, type, competition, league, leagueName, period, label, points = null }) {
  const id = safe(`${type}_${competition}_${period}_${league}_${uid}`);
  try {
    await trophies.doc(id).create({
      uid, type, competition, league, leagueName, period, label, points,
      emoji: TROPHIES[type].emoji, name: TROPHIES[type].name, awardedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 6) return false; // already awarded
    throw e;
  }
  await db.collection('users').doc(uid).set({ trophies: { [type]: FieldValue.increment(1) } }, { merge: true });
  return true;
}

// Called by the gameweek wrap for each league's winners.
export async function awardRoundWinners({ competition, md, league, leagueName, winners }) {
  const type = competition === 'CL' ? 'ucl_round' : 'gw';
  for (const w of winners) {
    if (w.points <= 0) continue;
    await award({ uid: w.uid, type, competition, league, leagueName, period: `md${md}`, label: roundLabel(competition, md), points: w.points });
  }
}

async function claim(rawId) {
  const id = safe(rawId);
  if (done.has(id)) return false;
  try {
    await runs.doc(id).create({ at: FieldValue.serverTimestamp() });
  } catch (e) {
    if (e.code === 6) { done.add(id); return false; }
    throw e;
  }
  done.add(id);
  return true;
}

async function forEachLeague(fn) {
  for (const l of (await db.collection('leagues').get()).docs) {
    const users = (await db.getAll(...l.data().members.map((u) => db.collection('users').doc(u)))).filter((d) => d.exists);
    await fn(l, users);
  }
}

async function post(league, id, text) {
  await db.collection('leagues').doc(league).collection('messages').doc(id).set({
    type: 'system', event: 'trophy', text, createdAt: FieldValue.serverTimestamp(), reactions: {},
  });
}

const names = (rows) => rows.map((r) => r.nickname).join(' & ');
const possessive = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

// Player of the Month: most Premier League points from the gameweeks played that month.
export async function awardMonthly(allMatches, { now = Date.now() } = {}) {
  const pl = allMatches.filter((m) => m.competition === 'PL');
  const due = monthToAward(pl, now);
  if (!due || !(await claim(`month_PL_${due.month}`))) return null;
  const label = monthName(due.month);
  let awarded = 0;
  await forEachLeague(async (l, users) => {
    const rows = users.map((d) => ({
      uid: d.id, nickname: d.data().nickname,
      points: due.mds.reduce((s, md) => s + (d.data().stats?.gw?.[md] || 0), 0),
      played: due.mds.some((md) => d.data().stats?.gw?.[md] != null),
    })).filter((r) => r.played);
    const ranked = rankRows(rows);
    const winners = ranked.filter((r) => r.rank === 1 && r.points > 0);
    if (rows.length < 2 || !winners.length) return;
    for (const w of winners) {
      if (await award({ uid: w.uid, type: 'month', competition: 'PL', league: l.id, leagueName: l.data().name, period: due.month, label, points: w.points })) awarded++;
    }
    await post(l.id, `month_${due.month}`, `🥇 ${names(winners)} ${winners.length > 1 ? 'are' : 'is'} ${possessive(l.data().name)} Player of the Month for ${label} with ${winners[0].points} pts! Trophy added to the cabinet.`);
  });
  console.log(`Player of the Month (${label}): ${awarded} trophies`);
  return { month: due.month, awarded };
}

// End of season: once every game in a competition is done.
export async function awardSeason(allMatches) {
  const results = [];
  for (const competition of Object.keys(GAMES)) {
    const matches = allMatches.filter((m) => m.competition === competition);
    if (!matches.length || !matches.every((m) => m.status === 'finished' || m.status === 'postponed')) continue;
    const season = seasonLabel(matches);
    if (!(await claim(`season_${competition}_${season}`))) continue;
    const { statsKey } = GAMES[competition];
    let awarded = 0;
    await forEachLeague(async (l, users) => {
      const rows = users.map((d) => ({ uid: d.id, nickname: d.data().nickname, s: d.data()[statsKey] || {} }))
        .filter((r) => (r.s.played || 0) > 0 || (r.s.points || 0) > 0);
      if (rows.length < 2) return;
      const champs = rankRows(rows.map((r) => ({ ...r, points: r.s.points || 0 }))).filter((r) => r.rank === 1 && r.points > 0);
      const type = competition === 'CL' ? 'ucl_champion' : 'champion';
      for (const c of champs) if (await award({ uid: c.uid, type, competition, league: l.id, leagueName: l.data().name, period: season, label: season, points: c.points })) awarded++;
      let text = `${competition === 'CL' ? '🌟 ⭐ UCL' : '🏆'} ${season} champion${champs.length > 1 ? 's' : ''} of ${l.data().name}: ${names(champs)} with ${champs[0]?.points} pts!`;
      if (competition === 'PL') {
        const boots = rankRows(rows.map((r) => ({ ...r, points: r.s.exact || 0 }))).filter((r) => r.rank === 1 && r.points > 0);
        for (const b of boots) if (await award({ uid: b.uid, type: 'boot', competition, league: l.id, leagueName: l.data().name, period: season, label: season, points: b.points })) awarded++;
        if (boots.length) text += ` 👟 Golden Boot: ${names(boots)} with ${boots[0].points} exact scores.`;
      }
      if (champs.length) await post(l.id, `season_${competition}_${season.replace('/', '-')}`, text);
    });
    console.log(`${competition} ${season} season trophies: ${awarded}`);
    results.push({ competition, season, awarded });
  }
  return results;
}

export async function listTrophies(uid) {
  const snap = await trophies.where('uid', '==', uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), awardedAt: d.data().awardedAt?.toMillis?.() || 0 }))
    .sort((a, b) => b.awardedAt - a.awardedAt);
}
