// Match highlights from official YouTube channels. Each channel's public RSS feed (no key
// needed) lists its latest uploads; a video whose title names both teams, posted soon after
// the game, is saved as that match's highlight. An admin can add channels or set a video by
// hand. Saved in Firestore because a feed only holds the latest 15 videos.
import { db, FieldValue } from './firebase.js';

const MOCK = process.env.FOOTBALL_DATA_MOCK === '1';
export const DEFAULT_CHANNELS = [
  { id: 'UCNAf1k0yIjyGu3k9BwAg3lg', name: 'Sky Sports Premier League' },
];
const highlights = db.collection('highlights');
const settings = db.collection('settings').doc('highlights');

// ---- pure helpers (unit tested) ----

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    videoId: e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
    title: decode(e.match(/<title>([^<]*)<\/title>/)?.[1] || ''),
    published: e.match(/<published>([^<]+)<\/published>/)?.[1],
  })).filter((v) => v.videoId && v.title);
}

// The usual ways a club is written in video titles (by football-data's short code).
const ALIASES = {
  MUN: ['man utd', 'man united', 'manchester united'], MCI: ['man city', 'manchester city'],
  TOT: ['spurs', 'tottenham'], WOL: ['wolves', 'wolverhampton'], NOT: ['forest', "nott'm forest", 'nottingham'],
  NFO: ['forest', "nott'm forest", 'nottingham'], BHA: ['brighton'], NEW: ['newcastle'], WHU: ['west ham'],
  AVL: ['aston villa', 'villa'], CRY: ['crystal palace', 'palace'], LEE: ['leeds'], IPS: ['ipswich'],
  LEI: ['leicester'], SOU: ['southampton'], COV: ['coventry'], HUL: ['hull'], SUN: ['sunderland'],
};
const norm = (s) => ` ${String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ')} `;
export function teamNames(t) {
  const names = new Set([t.name, t.shortName, ...(ALIASES[t.tla] || [])]
    .filter(Boolean)
    .map((n) => n.toLowerCase().replace(/\b(fc|afc|cf)\b/g, '').trim()));
  // "Norwich City" is often just "Norwich".
  for (const n of [...names]) {
    const short = n.replace(/ (united|city|town|hove|albion|athletic|rovers|wanderers|hotspur)$/, '');
    if (short !== n && short.length >= 5) names.add(short);
  }
  return [...names].filter((n) => n.length >= 3);
}
const mentions = (title, team) => teamNames(team).some((n) => title.includes(norm(n)));

// The best video for a finished match: names both teams, posted from kickoff to 4 days after.
export function findHighlight(match, videos) {
  const ko = new Date(match.kickoff).getTime();
  const fits = videos.filter((v) => {
    const t = norm(v.title);
    const at = new Date(v.published).getTime();
    return at >= ko && at <= ko + 4 * 86400_000 && mentions(t, match.home) && mentions(t, match.away)
      && !/\b(preview|press conference|reaction|live|watchalong)\b/.test(t);
  });
  const score = (v) => (/highlight/i.test(v.title) ? 2 : 0) + (/extended/i.test(v.title) ? 1 : 0);
  return fits.sort((a, b) => score(b) - score(a) || new Date(a.published) - new Date(b.published))[0] || null;
}

export function videoIdFrom(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ---- feeds ----

const feedCache = new Map(); // channel id -> { at, videos }
async function fetchFeed(channelId, matches) {
  const hit = feedCache.get(channelId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.videos;
  const xml = MOCK ? mockFeedXml(matches) : await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`).then((r) => {
    if (!r.ok) throw new Error(`YouTube feed ${channelId}: ${r.status}`);
    return r.text();
  });
  const videos = parseFeed(xml);
  feedCache.set(channelId, { at: Date.now(), videos });
  return videos;
}

// In mock mode, a highlights video for each game that finished in the last few days.
function mockFeedXml(matches) {
  const recent = matches.filter((m) => m.status === 'finished' && Date.now() - new Date(m.kickoff) < 4 * 86400_000).slice(-15);
  return `<feed>${recent.map((m) => `<entry><yt:videoId>${(`mock${m.id}`).padEnd(11, 'x').slice(0, 11)}</yt:videoId><title>${m.home.name} ${m.score.home}-${m.score.away} ${m.away.name} | Premier League Highlights</title><published>${new Date(new Date(m.kickoff).getTime() + 3 * 3600_000).toISOString()}</published></entry>`).join('')}</feed>`;
}

export async function getChannels() {
  const s = await settings.get();
  return s.exists && Array.isArray(s.data().channels) ? s.data().channels : DEFAULT_CHANNELS;
}

export async function setChannels(channels) {
  await settings.set({ channels }, { merge: true });
  feedCache.clear();
}

// Turn a channel link, @handle or id into { id, name }.
export async function resolveChannel(input) {
  const s = String(input || '').trim();
  const direct = s.match(/(UC[\w-]{22})/);
  if (direct) return { id: direct[1], name: s.includes('/') ? direct[1] : s };
  const handle = s.match(/@([\w.-]+)/)?.[1] || (/^[\w.-]+$/.test(s) ? s : null);
  if (!handle || MOCK) return null;
  const html = await fetch(`https://www.youtube.com/@${handle}`, { headers: { 'accept-language': 'en-GB' } }).then((r) => (r.ok ? r.text() : ''));
  const id = html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/)?.[1];
  const name = decode(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || `@${handle}`);
  return id ? { id, name } : null;
}

// ---- finding and saving ----

let lastRun = 0;
// Look for highlights of games that finished in the last 4 days and don't have one yet.
export async function findHighlights({ matches, force = false }) {
  if (!force && Date.now() - lastRun < 15 * 60_000) return null;
  lastRun = Date.now();
  const due = matches.filter((m) => m.status === 'finished' && Date.now() - new Date(m.kickoff) < 4 * 86400_000);
  if (!due.length) return { found: 0 };
  const have = new Set((await db.getAll(...due.map((m) => highlights.doc(m.id)))).filter((d) => d.exists).map((d) => d.id));
  const todo = due.filter((m) => !have.has(m.id));
  if (!todo.length) return { found: 0 };
  const videos = [];
  for (const ch of await getChannels()) {
    try {
      videos.push(...(await fetchFeed(ch.id, matches)).map((v) => ({ ...v, channel: ch.name })));
    } catch (e) {
      console.error('highlights feed failed:', e.message);
    }
  }
  let found = 0;
  for (const m of todo) {
    const v = findHighlight(m, videos);
    if (!v) continue;
    await saveHighlight(m, { videoId: v.videoId, title: v.title, channel: v.channel, published: v.published, auto: true });
    found++;
  }
  if (found) console.log(`highlights: found ${found}`);
  return { found };
}

export async function saveHighlight(m, video) {
  await highlights.doc(m.id).set({
    ...video, matchId: m.id, competition: m.competition, kickoff: m.kickoff,
    home: { name: m.home.name, tla: m.home.tla, crest: m.home.crest || null },
    away: { name: m.away.name, tla: m.away.tla, crest: m.away.crest || null },
    score: m.score || null, savedAt: FieldValue.serverTimestamp(),
  });
}

export async function getHighlight(matchId) {
  const d = await highlights.doc(String(matchId)).get();
  if (!d.exists || d.data().hidden) return null;
  const { savedAt, ...h } = d.data(); // eslint-disable-line no-unused-vars
  return h;
}

export async function latestHighlights(limit = 10) {
  const snap = await highlights.orderBy('kickoff', 'desc').limit(limit * 2).get();
  return snap.docs.map((d) => d.data()).filter((h) => !h.hidden && h.videoId).slice(0, limit)
    .map(({ savedAt, ...h }) => h); // eslint-disable-line no-unused-vars
}
