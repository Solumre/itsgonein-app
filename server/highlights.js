// Match highlights and previews from official YouTube channels.
// - Each channel's public RSS feed (no key needed) lists its latest 15 uploads; every 15
//   minutes, a video whose title names both teams is saved as a game's highlights (posted
//   after kickoff) or preview (posted in the 4 days before, with "preview" in the title).
// - With YOUTUBE_API_KEY set, opening a game that has no video searches the channels for it,
//   so older games and previews get one too. Each search uses 100 of the free 10,000 daily
//   quota units, so they're counted and capped, and a miss isn't searched again for a while.
// Channels are tagged with the competitions they cover. An admin manages them and can set
// or hide a game's video by hand.
import { db, FieldValue } from './firebase.js';
import { getMatches, isCompetition } from './football.js';

const MOCK = process.env.FOOTBALL_DATA_MOCK === '1';
const API_KEY = process.env.YOUTUBE_API_KEY;
export const DEFAULT_CHANNELS = [
  { id: 'UCNAf1k0yIjyGu3k9BwAg3lg', name: 'Sky Sports Premier League', competitions: ['PL'] },
];
export const SEARCH_COST = 100;
export const DAILY_BUDGET = Number(process.env.YOUTUBE_DAILY_BUDGET) || 8000; // of 10,000 units
const highlights = db.collection('highlights');
const previews = db.collection('previews');
const settings = db.collection('settings').doc('highlights');
const quotaDoc = db.collection('settings').doc('youtubeQuota');
const KINDS = { highlight: highlights, preview: previews };

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

// Channels that cover a competition (a channel with no competitions covers them all).
export const channelsFor = (channels, competition) => channels.filter((c) => !c.competitions?.length || c.competitions.includes(competition));

// The best preview for a game: names both teams, says preview (or similar), posted in the
// 4 days before kickoff.
export function findPreview(match, videos) {
  const ko = new Date(match.kickoff).getTime();
  const fits = videos.filter((v) => {
    const t = norm(v.title);
    const at = new Date(v.published).getTime();
    return at < ko && at >= ko - 4 * 86400_000 && mentions(t, match.home) && mentions(t, match.away)
      && /\b(preview|build up|build-up|predictions?|team news)\b/.test(t) && !/\b(live|watchalong|highlights)\b/.test(t);
  });
  return fits.sort((a, b) => new Date(b.published) - new Date(a.published))[0] || null;
}

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
  return `<feed>${mockVideos(matches.filter((m) => Math.abs(Date.now() - new Date(m.kickoff)) < 4 * 86400_000)).slice(-15)
    .map((v) => `<entry><yt:videoId>${v.videoId}</yt:videoId><title>${v.title}</title><published>${v.published}</published></entry>`).join('')}</feed>`;
}
// Mock videos: highlights for finished games, a preview the day before upcoming ones.
function mockVideos(matches) {
  return matches.flatMap((m) => {
    const ko = new Date(m.kickoff).getTime();
    if (m.status === 'finished' && m.score) return [{ videoId: `mh${m.id}`.padEnd(11, 'x').slice(0, 11), title: `${m.home.name} ${m.score.home}-${m.score.away} ${m.away.name} | Highlights`, published: new Date(ko + 3 * 3600_000).toISOString() }];
    if (m.status === 'upcoming' && ko - Date.now() < 3 * 86400_000) return [{ videoId: `mp${m.id}`.padEnd(11, 'x').slice(0, 11), title: `${m.home.name} v ${m.away.name} | Match Preview`, published: new Date(Math.min(Date.now() - 60_000, ko - 86400_000)).toISOString() }];
    return [];
  });
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
// From the channel feeds: highlights for games that finished in the last 4 days and
// previews for games in the next 4, where there isn't one yet.
export async function findHighlights({ matches, force = false }) {
  if (!force && Date.now() - lastRun < 15 * 60_000) return null;
  lastRun = Date.now();
  const now = Date.now();
  const channels = await getChannels();
  // Other leagues a channel is tagged for (the game itself only syncs PL and CL).
  const have0 = new Set(matches.map((m) => m.competition));
  for (const code of new Set(channels.flatMap((c) => c.competitions || []))) {
    if (!have0.has(code) && isCompetition(code)) matches = [...matches, ...await getMatches(code).catch(() => [])];
  }
  const due = matches.filter((m) => (m.status === 'finished' && now - new Date(m.kickoff) < 4 * 86400_000)
    || (m.status === 'upcoming' && new Date(m.kickoff) - now < 4 * 86400_000));
  if (!due.length) return { found: 0 };
  const kindOf = (m) => (m.status === 'finished' ? 'highlight' : 'preview');
  const have = await Promise.all(due.map((m) => KINDS[kindOf(m)].doc(m.id).get()));
  const todo = due.filter((m, i) => !have[i].exists || (!have[i].data().videoId && !have[i].data().hidden));
  if (!todo.length) return { found: 0 };
  const feeds = new Map();
  let found = 0;
  for (const m of todo) {
    const videos = [];
    for (const ch of channelsFor(channels, m.competition)) {
      if (!feeds.has(ch.id)) feeds.set(ch.id, await fetchFeed(ch.id, matches).catch((e) => { console.error('highlights feed failed:', e.message); return []; }));
      videos.push(...feeds.get(ch.id).map((v) => ({ ...v, channel: ch.name })));
    }
    const kind = kindOf(m);
    const v = kind === 'highlight' ? findHighlight(m, videos) : findPreview(m, videos);
    if (!v) continue;
    await saveVideo(kind, m, { videoId: v.videoId, title: v.title, channel: v.channel, published: v.published, auto: true });
    found++;
  }
  if (found) console.log(`videos: found ${found}`);
  return { found };
}

// ---- YouTube search (needs YOUTUBE_API_KEY) ----

const pacificDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
// Take units from today's budget (YouTube's day starts at midnight Pacific). False if spent.
async function spend(units) {
  return db.runTransaction(async (tx) => {
    const q = (await tx.get(quotaDoc)).data() || {};
    const used = q.day === pacificDay() ? q.used || 0 : 0;
    if (used + units > DAILY_BUDGET) return false;
    tx.set(quotaDoc, { day: pacificDay(), used: used + units });
    return true;
  });
}
export async function quotaToday() {
  const q = (await quotaDoc.get()).data() || {};
  return { used: q.day === pacificDay() ? q.used || 0 : 0, budget: DAILY_BUDGET, enabled: !!API_KEY || MOCK };
}

async function searchChannel(channelId, q, after, before) {
  if (MOCK) return null; // the mock search is done in searchFor
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  Object.entries({ part: 'snippet', type: 'video', maxResults: '15', order: 'relevance', channelId, q, publishedAfter: after, publishedBefore: before, key: API_KEY })
    .forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`YouTube search ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).items || []).map((it) => ({ videoId: it.id?.videoId, title: decode(it.snippet?.title || ''), published: it.snippet?.publishedAt })).filter((v) => v.videoId);
}

// For the admin page: everything the game's channels return for it (a wider window, no
// filtering), marking the one the automatic matching would pick. Always searches.
export async function searchCandidates(m, kind) {
  if (!API_KEY && !MOCK) throw Object.assign(new Error('Add YOUTUBE_API_KEY on Render first.'), { status: 400, expose: true });
  const ko = new Date(m.kickoff).getTime();
  const [after, before] = kind === 'preview' ? [ko - 6 * 86400_000, ko] : [ko - 3600_000, ko + 7 * 86400_000];
  const q = `${m.home.name} ${m.away.name}`;
  const videos = [];
  const errors = [];
  for (const ch of channelsFor(await getChannels(), m.competition)) {
    if (!(await spend(SEARCH_COST))) { errors.push('Today\'s search budget is used up.'); break; }
    try {
      const found = MOCK ? mockVideos([{ ...m, status: kind === 'preview' ? 'upcoming' : 'finished', score: m.score || { home: 0, away: 0 } }]) : await searchChannel(ch.id, q, new Date(after).toISOString(), new Date(Math.min(before, Date.now())).toISOString());
      videos.push(...found.map((v) => ({ ...v, channel: ch.name })));
    } catch (e) {
      errors.push(`${ch.name}: ${e.message}`);
    }
  }
  const best = (kind === 'preview' ? findPreview : findHighlight)(m, videos);
  const seen = new Set();
  return {
    best: best?.videoId || null,
    candidates: videos.filter((v) => !seen.has(v.videoId) && seen.add(v.videoId)),
    errors,
  };
}

const searching = new Map(); // one search per game at a time
// Search the game's channels for its highlights (finished) or preview (next 4 days).
// Remembers misses: highlights aren't searched again for 12 hours, previews for 6.
export async function searchFor(m, { now = Date.now() } = {}) {
  const kind = m.status === 'finished' ? 'highlight' : m.status === 'upcoming' && new Date(m.kickoff) - now < 4 * 86400_000 ? 'preview' : null;
  if (!kind || (!API_KEY && !MOCK)) return null;
  const key = `${kind}:${m.id}`;
  if (searching.has(key)) return searching.get(key);
  const job = (async () => {
    const ref = KINDS[kind].doc(m.id);
    const cur = (await ref.get()).data();
    if (cur?.videoId || cur?.hidden) return null;
    if (cur?.searchedAt && now - cur.searchedAt < (kind === 'preview' ? 6 : 12) * 3600_000) return null;
    const channels = channelsFor(await getChannels(), m.competition);
    const ko = new Date(m.kickoff).getTime();
    const [after, before] = kind === 'highlight' ? [ko, ko + 4 * 86400_000] : [ko - 4 * 86400_000, Math.min(ko, now)];
    const q = `${m.home.name} ${m.away.name} ${kind === 'highlight' ? 'highlights' : 'preview'}`;
    const videos = [];
    for (const ch of channels) {
      if (!(await spend(SEARCH_COST))) { console.warn('YouTube search budget spent for today'); break; }
      const found = MOCK ? mockVideos([m]) : await searchChannel(ch.id, q, new Date(after).toISOString(), new Date(before).toISOString());
      videos.push(...found.map((v) => ({ ...v, channel: ch.name })));
      const v = kind === 'highlight' ? findHighlight(m, videos) : findPreview(m, videos);
      if (v) {
        await saveVideo(kind, m, { videoId: v.videoId, title: v.title, channel: v.channel, published: v.published, auto: true, searched: true });
        return { kind, ...v };
      }
    }
    await ref.set({ matchId: m.id, competition: m.competition, kickoff: m.kickoff, videoId: null, searchedAt: now }, { merge: true });
    return null;
  })().catch((e) => { console.error('YouTube search failed:', e.message); return null; }).finally(() => searching.delete(key));
  searching.set(key, job);
  return job;
}

export async function saveVideo(kind, m, video) {
  await KINDS[kind].doc(m.id).set({
    searchedAt: null, ...video, matchId: m.id, competition: m.competition, kickoff: m.kickoff,
    home: { name: m.home.name, tla: m.home.tla, crest: m.home.crest || null },
    away: { name: m.away.name, tla: m.away.tla, crest: m.away.crest || null },
    score: m.score || null, savedAt: FieldValue.serverTimestamp(),
  });
}
export const saveHighlight = (m, video) => saveVideo('highlight', m, video);

async function getVideo(kind, matchId) {
  const d = await KINDS[kind].doc(String(matchId)).get();
  if (!d.exists || d.data().hidden || !d.data().videoId) return null;
  const { savedAt, searchedAt, ...h } = d.data(); // eslint-disable-line no-unused-vars
  return h;
}
export const getHighlight = (matchId) => getVideo('highlight', matchId);
export const getPreview = (matchId) => getVideo('preview', matchId);

// Newest games' highlights, optionally for one competition.
export async function latestHighlights(limit = 10, competition = null) {
  // Filtered here rather than in the query, so no composite index is needed.
  const snap = await highlights.orderBy('kickoff', 'desc').limit(competition ? 300 : limit * 3).get();
  return snap.docs.map((d) => d.data()).filter((h) => !h.hidden && h.videoId && (!competition || h.competition === competition)).slice(0, limit)
    .map(({ savedAt, searchedAt, ...h }) => h); // eslint-disable-line no-unused-vars
}
