// Head-to-head challenges: one-v-one against a mate from one of your leagues for a single
// round (a Premier League gameweek or a Champions League matchday). The challenged player
// accepts or declines; unanswered challenges expire at the round's first kickoff. Results
// settle when the round is done and build an all-time record for each pair.
import { db, FieldValue } from './firebase.js';
import { getMatches } from './football.js';
import { GAMES, roundLabel, gameweekComplete, scorePick, validDoubles } from '../src/lib/game.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status, expose: true }); };
const challenges = db.collection('challenges');
const rivalries = db.collection('rivalries');
const MAX_OPEN = 5; // pending challenges you can send per round

export const pairKey = (a, b) => [a, b].sort().join('_');
const label = (comp, md) => `${comp === 'CL' ? 'UCL ' : ''}${roundLabel(comp, md)}`;

// The next round nobody has kicked off in yet: { matchday, startsAt } or null.
export function openRound(matches, now = Date.now()) {
  const rounds = new Map();
  for (const m of matches) {
    if (m.matchday == null || m.status === 'postponed') continue;
    const r = rounds.get(m.matchday) || { matchday: m.matchday, startsAt: Infinity, started: false };
    r.startsAt = Math.min(r.startsAt, new Date(m.kickoff).getTime());
    if (m.status !== 'upcoming' || new Date(m.kickoff).getTime() <= now) r.started = true;
    rounds.set(m.matchday, r);
  }
  const open = [...rounds.values()].filter((r) => !r.started && r.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  return open[0] ? { matchday: open[0].matchday, startsAt: open[0].startsAt } : null;
}

async function postSystem(code, text, extra = {}) {
  if (!code) return;
  await db.collection('leagues').doc(code).collection('messages').add({
    type: 'system', event: 'h2h', text, createdAt: FieldValue.serverTimestamp(), reactions: {}, ...extra,
  });
}

export async function createChallenge({ from, fromUser, to, leagueCode, competition }) {
  if (!GAMES[competition]) fail(400, 'Unknown competition');
  if (!to || to === from) fail(400, 'Pick a mate to challenge.');
  const league = await db.collection('leagues').doc(String(leagueCode || '_')).get();
  if (!league.exists || !league.data().members.includes(from) || !league.data().members.includes(to)) {
    fail(403, 'You can only challenge people in your leagues.');
  }
  const [opp, oppPriv, myPriv, oppBan] = await Promise.all([
    db.collection('users').doc(to).get(), db.collection('private').doc(to).get(),
    db.collection('private').doc(from).get(), db.collection('bans').doc(to).get(),
  ]);
  if (!opp.exists || !oppPriv.exists || oppBan.exists) fail(400, "You can't challenge that player right now.");
  if (!['not_needed', 'approved'].includes(oppPriv.data().consent)) fail(400, "You can't challenge that player right now.");
  if ((oppPriv.data().blocked || []).includes(from) || (myPriv.data()?.blocked || []).includes(to)) fail(400, "You can't challenge that player.");

  const matches = await getMatches(competition);
  const round = openRound(matches);
  if (!round) fail(400, 'No round to play right now. Try again when the next fixtures are out.');
  const id = `${competition}_${round.matchday}_${pairKey(from, to)}`;
  const open = await challenges.where('from', '==', from).where('status', '==', 'pending').get();
  if (open.docs.filter((d) => d.data().competition === competition && d.data().matchday === round.matchday).length >= MAX_OPEN) {
    fail(400, `You can have ${MAX_OPEN} challenges waiting at once.`);
  }
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(challenges.doc(id));
    if (existing.exists && !['declined', 'cancelled'].includes(existing.data().status)) {
      fail(409, `You two already have a head-to-head for ${label(competition, round.matchday)}.`);
    }
    tx.set(challenges.doc(id), {
      competition, matchday: round.matchday, startsAt: new Date(round.startsAt),
      from, to, players: [from, to], league: league.id,
      names: { [from]: fromUser.nickname, [to]: opp.data().nickname },
      avatars: { [from]: fromUser.avatar || '⚽', [to]: opp.data().avatar || '⚽' },
      colors: { [from]: fromUser.club?.primary || null, [to]: opp.data().club?.primary || null },
      status: 'pending', createdAt: FieldValue.serverTimestamp(),
    });
  });
  await postSystem(league.id, `⚔️ ${fromUser.nickname} challenged ${opp.data().nickname} to a head-to-head for ${label(competition, round.matchday)}!`);
  return { id, matchday: round.matchday };
}

export async function respondChallenge({ id, uid, accept }) {
  const ref = challenges.doc(String(id));
  const c = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().to !== uid) fail(404, 'Challenge not found.');
    const data = snap.data();
    if (data.status !== 'pending') fail(400, 'That challenge has already been answered.');
    if (data.startsAt.toMillis() <= Date.now()) fail(400, 'Too late: the round has kicked off.');
    tx.update(ref, { status: accept ? 'accepted' : 'declined', respondedAt: FieldValue.serverTimestamp() });
    return data;
  });
  // Declines stay quiet, so nobody gets called out in front of the league.
  if (accept) await postSystem(c.league, `🤝 ${c.names[c.to]} accepted ${c.names[c.from]}'s challenge. ${label(c.competition, c.matchday)}: game on!`);
  return { status: accept ? 'accepted' : 'declined' };
}

export async function cancelChallenge({ id, uid }) {
  const ref = challenges.doc(String(id));
  const snap = await ref.get();
  if (!snap.exists || snap.data().from !== uid) fail(404, 'Challenge not found.');
  if (snap.data().status !== 'pending') fail(400, 'Only waiting challenges can be cancelled.');
  await ref.update({ status: 'cancelled' });
  return { status: 'cancelled' };
}

// Each player's points for a round: settled picks plus "if it ends now" on live games.
async function roundPoints(uids, gwMatches) {
  const refs = uids.flatMap((u) => gwMatches.map((m) => db.collection('predictions').doc(`${u}_${m.id}`)));
  const picks = new Map();
  if (refs.length) for (const d of await db.getAll(...refs)) if (d.exists) picks.set(d.id, d.data());
  const byId = new Map(gwMatches.map((m) => [m.id, { ...m, kickoff: new Date(m.kickoff).getTime() }]));
  const out = {};
  for (const u of uids) {
    const mine = gwMatches.map((m) => picks.get(`${u}_${m.id}`)).filter(Boolean);
    const doubles = validDoubles(mine, byId);
    let points = 0;
    for (const p of mine) {
      const m = byId.get(p.matchId);
      if (m.status === 'finished') points += p.points ?? scorePick(p, m.score, doubles.has(p.matchId));
      else if (m.status === 'live') points += scorePick(p, m.score, doubles.has(p.matchId));
    }
    out[u] = points;
  }
  return out;
}

// Everything on your head-to-head list, with live scores for rounds in progress.
export async function listChallenges(uid) {
  const snap = await challenges.where('players', 'array-contains', uid).get();
  const recentCutoff = Date.now() - 21 * 86_400_000;
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !['declined', 'cancelled'].includes(c.status) && (c.status !== 'done' && c.status !== 'expired' ? true : c.startsAt.toMillis() > recentCutoff));
  const feeds = {};
  for (const c of list.filter((x) => x.status === 'accepted')) {
    feeds[c.competition] ||= await getMatches(c.competition);
    const gw = feeds[c.competition].filter((m) => m.matchday === c.matchday && m.status !== 'postponed');
    c.live = gw.some((m) => m.status === 'live');
    c.started = gw.some((m) => m.status !== 'upcoming');
    if (c.started) c.score = await roundPoints(c.players, gw);
  }
  const rivals = await Promise.all([...new Set(list.map((c) => pairKey(c.from, c.to)))].map((k) => rivalries.doc(k).get()));
  const records = Object.fromEntries(rivals.filter((r) => r.exists).map((r) => [r.id, r.data()]));
  return list
    .map((c) => ({
      id: c.id, competition: c.competition, matchday: c.matchday, roundLabel: label(c.competition, c.matchday),
      status: c.status, startsAt: c.startsAt.toMillis(), from: c.from, to: c.to, names: c.names, avatars: c.avatars, colors: c.colors || {},
      league: c.league, live: !!c.live, started: !!c.started, score: c.score || c.result?.score || null,
      winner: c.result?.winner ?? null, record: records[pairKey(c.from, c.to)] || null,
    }))
    .sort((a, b) => b.startsAt - a.startsAt);
}

// Runs from the sync loop: expire unanswered challenges and settle finished rounds.
export async function settleChallenges(allMatches, { now = Date.now() } = {}) {
  const pending = await challenges.where('status', '==', 'pending').get();
  for (const d of pending.docs) if (d.data().startsAt.toMillis() <= now) await d.ref.update({ status: 'expired' });

  const accepted = await challenges.where('status', '==', 'accepted').get();
  let settled = 0;
  for (const d of accepted.docs) {
    const c = d.data();
    const matches = allMatches.filter((m) => m.competition === c.competition);
    if (!gameweekComplete(matches, c.matchday)) continue;
    const { statsKey } = GAMES[c.competition];
    const [a, b] = await db.getAll(db.collection('users').doc(c.from), db.collection('users').doc(c.to));
    const score = { [c.from]: a.data()?.[statsKey]?.gw?.[c.matchday] ?? 0, [c.to]: b.data()?.[statsKey]?.gw?.[c.matchday] ?? 0 };
    const winner = score[c.from] === score[c.to] ? null : score[c.from] > score[c.to] ? c.from : c.to;
    const key = pairKey(c.from, c.to);
    const record = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(d.ref);
      if (fresh.data().status !== 'accepted') return null; // another server got there first
      const r = await tx.get(rivalries.doc(key));
      const rec = r.exists ? r.data() : { players: [c.from, c.to].sort(), wins: { [c.from]: 0, [c.to]: 0 }, draws: 0 };
      rec.wins = { [c.from]: 0, [c.to]: 0, ...rec.wins };
      if (winner) rec.wins[winner] += 1; else rec.draws += 1;
      rec.last = { competition: c.competition, matchday: c.matchday, winner };
      tx.set(rivalries.doc(key), rec);
      tx.update(d.ref, { status: 'done', result: { score, winner }, settledAt: FieldValue.serverTimestamp() });
      return rec;
    });
    if (!record) continue;
    settled++;
    const [nf, nt] = [c.names[c.from], c.names[c.to]];
    let text = `⚔️ Head-to-head, ${label(c.competition, c.matchday)}: ${nf} ${score[c.from]} – ${score[c.to]} ${nt}. `;
    text += winner ? `${c.names[winner]} wins! ` : "It's a draw! ";
    const wf = record.wins[c.from], wt = record.wins[c.to];
    text += wf === wt ? `All square at ${wf}–${wt}${record.draws ? ` (${record.draws} drawn)` : ''}.`
      : `${wf > wt ? nf : nt} leads ${Math.max(wf, wt)}–${Math.min(wf, wt)}${record.draws ? ` (${record.draws} drawn)` : ''}.`;
    await postSystem(c.league, text);
  }
  return { settled };
}
