// Chat and nickname checks. The app is for 10-15 year olds, so as well as swearing we
// block anything that shares contact details or moves the chat elsewhere.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

const CONTACT = [
  [/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co|uk|net|org|io|gg|me|tv|app|ly|xyz)\b/i, 'Links aren\'t allowed in chat.'],
  [/[\w.+-]+@[\w-]+\.\w+/, 'No email addresses — keep personal stuff private.'],
  [/(\+?\d[\s-]?){9,}/, 'No phone numbers — keep personal stuff private.'],
  [/(^|\s)@\w{3,}/, 'No social media handles in chat.'],
  [/\b(snap(chat)?|insta(gram)?|tiktok|whats ?app|discord|telegram|kik)\b/i, 'Keep the chat here — no moving to other apps.'],
  [/\b(my|our) (address|postcode|house|school is)\b/i, 'Keep personal stuff private.'],
];

// Cut text to `n` characters without splitting an emoji in half.
export const clip = (s, n) => {
  const t = String(s ?? '');
  if (t.length <= n) return t;
  const seg = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t)].map((x) => x.segment) : Array.from(t);
  let out = '';
  for (const g of seg) { if (out.length + g.length > n) break; out += g; }
  return out;
};

export function checkText(text, { max = 200 } = {}) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, reason: 'Say something first!' };
  if (t.length > max) return { ok: false, reason: `Keep it under ${max} characters.` };
  if (matcher.hasMatch(t)) return { ok: false, reason: 'Keep it clean — no swearing.' };
  for (const [re, reason] of CONTACT) if (re.test(t)) return { ok: false, reason };
  if (/(.)\1{9,}/.test(t)) return { ok: false, reason: 'No spamming!' };
  return { ok: true, text: t };
}

export function checkNickname(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (n.length < 3 || n.length > 16) return { ok: false, reason: 'Nicknames are 3–16 characters.' };
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) return { ok: false, reason: 'Letters, numbers, spaces, _ . - only.' };
  if (matcher.hasMatch(n)) return { ok: false, reason: 'Pick a cleaner nickname.' };
  if (/admin|moderator|official|itsgonein/i.test(n)) return { ok: false, reason: 'That nickname is reserved.' };
  return { ok: true, nickname: n };
}

export { QUICK_CHAT, REACTIONS } from '../src/lib/game.js';

// Simple per-key rate limit (in memory; fine for one server).
const hits = new Map();
export function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  return true;
}
