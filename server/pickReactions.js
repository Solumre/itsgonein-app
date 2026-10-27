// Emoji reactions on other players' picks, once a game has kicked off (when picks are shown).
// One document per pick holds who reacted with what; viewers only ever see reactions from
// their own league mates. Adding one posts a line in the league chat.
import { db, FieldValue } from './firebase.js';
import { PICK_REACTIONS } from '../src/lib/game.js';

export { PICK_REACTIONS };
const col = db.collection('pickReactions');

const possessive = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
export function reactionText(emoji, who, target, pick, m) {
  const p = `${possessive(target)} ${pick.home}-${pick.away} pick for ${m.home.tla} v ${m.away.tla}`;
  return {
    '🔥': `🔥 ${who} rates ${p}`,
    '😂': `😂 ${who} laughed at ${p}`,
    '🤡': `🤡 ${who} reckons ${p} is a bold one`,
    '🎯': `🎯 ${who} says ${p} is spot on`,
    '👀': `👀 ${who} has clocked ${p}`,
  }[emoji];
}

// Reactions as a viewer sees them: only from people in `allowed` (their league mates and
// themselves), as [{ emoji, count, mine }] in a fixed order.
export function visible(reactions = {}, allowed, me) {
  return PICK_REACTIONS.map((emoji) => {
    const who = (reactions[emoji] || []).filter((u) => allowed.has(u));
    return { emoji, count: who.length, mine: who.includes(me) };
  }).filter((r) => r.count > 0);
}

export async function reactionsFor(keys) {
  if (!keys.length) return new Map();
  const docs = await db.getAll(...keys.map(([matchId, target]) => col.doc(`${matchId}_${target}`)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, d.data().reactions || {}]));
}

// Toggle one reaction. Returns whether it's now on.
export async function togglePickReaction({ uid, nickname, target, targetName, match, pick, emoji, league }) {
  const ref = col.doc(`${match.id}_${target}`);
  const on = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() || { matchId: match.id, target, competition: match.competition, matchday: match.matchday, reactions: {} };
    const list = cur.reactions[emoji] || [];
    const adding = !list.includes(uid);
    tx.set(ref, { ...cur, reactions: { ...cur.reactions, [emoji]: adding ? [...list, uid] : list.filter((u) => u !== uid) } });
    return adding;
  });
  // One chat line per person per pick: the latest reaction replaces the last.
  const msg = league.collection('messages').doc(`pr_${match.id}_${target}_${uid}`);
  if (on) {
    await msg.set({
      type: 'system', event: 'pickreact', emoji, text: reactionText(emoji, nickname, targetName, pick, match),
      matchId: match.id, matchComp: match.competition, matchLabel: `${match.home.tla} v ${match.away.tla}`,
      createdAt: FieldValue.serverTimestamp(), reactions: {},
    });
  } else {
    const old = await msg.get();
    if (old.exists && old.data().emoji === emoji) await msg.delete();
  }
  return on;
}
