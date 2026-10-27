import { describe, it, expect } from 'vitest';
import { pageMeta, renderPage, sitemap } from '../../server/seo.js';

const html = `<html><head><title>Old</title><meta name="description" content="old" /><link rel="canonical" href="https://itsgonein.com/" /><meta property="og:url" content="https://itsgonein.com/" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /></head><body></body></html>`;
const t = (name, tla) => ({ name, tla });

describe('seo', () => {
  it('gives the how-to page its own tags and FAQ data', () => {
    const out = renderPage(html, '/how-to', pageMeta('/how-to'));
    expect(out).toContain('<title>How to play ItsGoneIn');
    expect(out).toContain('<link rel="canonical" href="https://itsgonein.com/how-to"');
    expect(out).toContain('"@type":"FAQPage"');
    expect(out).not.toContain('content="old"');
  });
  it('describes a game by its score', () => {
    const m = { id: '1', competition: 'CL', status: 'finished', home: t('Man City', 'MCI'), away: t('AEK Athens', 'AEK'), score: { home: 5, away: 1 } };
    const meta = pageMeta('/match/1', { match: m });
    expect(meta.title).toBe('Man City 5-1 AEK Athens: highlights, goals and stats · ItsGoneIn');
    expect(meta.description).toContain('Champions League');
    expect(pageMeta('/match/2', { match: { ...m, status: 'upcoming', score: null } }).title).toBe('Man City v AEK Athens: preview and predictions · ItsGoneIn');
  });
  it('escapes and leaves other pages alone', () => {
    expect(renderPage(html, '/predict', pageMeta('/predict'))).toBe(html);
    const m = { competition: 'PL', status: 'upcoming', home: t('Brighton & Hove', 'BHA'), away: t('<Spurs>', 'TOT'), score: null };
    expect(renderPage(html, '/match/3', pageMeta('/match/3', { match: m }))).toContain('Brighton &amp; Hove v &lt;Spurs&gt;');
  });
  it('lists the main pages and this fortnight\'s games', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const g = (id, days) => ({ id, competition: 'PL', status: days < 0 ? 'finished' : 'upcoming', kickoff: new Date(now + days * 86400_000).toISOString() });
    const xml = sitemap([g('a', -3), g('b', 5), g('c', -30), g('d', 40)], now);
    expect(xml).toContain('<loc>https://itsgonein.com/</loc>');
    expect(xml).toContain('<loc>https://itsgonein.com/how-to</loc>');
    expect(xml).toContain('/match/a?c=PL');
    expect(xml).toContain('/match/b?c=PL');
    expect(xml).not.toContain('/match/c');
    expect(xml).not.toContain('/match/d');
  });
});
