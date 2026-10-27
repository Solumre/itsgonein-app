import { describe, it, expect } from 'vitest';
import { parseFeed, findHighlight, videoIdFrom, teamNames } from '../../server/highlights.js';

const t = (name, tla) => ({ name, tla });
const match = { id: '1', kickoff: '2026-10-31T12:30:00Z', status: 'finished', home: t('Chelsea', 'CHE'), away: t('Man United', 'MUN'), score: { home: 0, away: 1 } };
const v = (title, hoursAfter, videoId = 'abcdefghijk') => ({ videoId, title, published: new Date(Date.parse(match.kickoff) + hoursAfter * 3600_000).toISOString() });

describe('parseFeed', () => {
  it('reads videos out of a YouTube channel feed', () => {
    const xml = `<?xml version="1.0"?><feed><title>Sky Sports</title>
      <entry><id>yt:video:aaaaaaaaaaa</id><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Chelsea 0-1 Man Utd | Premier League Highlights &amp; more</title><published>2026-10-31T16:00:00+00:00</published></entry>
      <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Pep&#39;s press conference</title><published>2026-10-30T10:00:00+00:00</published></entry>
    </feed>`;
    expect(parseFeed(xml)).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'Chelsea 0-1 Man Utd | Premier League Highlights & more', published: '2026-10-31T16:00:00+00:00' },
      { videoId: 'bbbbbbbbbbb', title: "Pep's press conference", published: '2026-10-30T10:00:00+00:00' },
    ]);
  });
});

describe('findHighlight', () => {
  it('picks the highlights video naming both teams, using common nicknames', () => {
    const got = findHighlight(match, [
      v('Chelsea v Man Utd | Match Preview', -20, 'preview0000'),
      v('Chelsea 0-1 Man Utd | Premier League Highlights', 3, 'highlights1'),
      v('Arsenal 2-0 Spurs | Premier League Highlights', 5, 'otherggame1'),
      v('Chelsea 0-1 Manchester United | EXTENDED Highlights', 30, 'extended001'),
      v("'We were robbed' | Maresca reaction after Chelsea v Man Utd", 3, 'reaction001'),
    ]);
    expect(got.videoId).toBe('extended001'); // extended beats the short one
  });
  it('ignores videos posted before kickoff or long after, and other games', () => {
    expect(findHighlight(match, [v('Chelsea 0-1 Man Utd highlights', -2), v('Chelsea 0-1 Man Utd highlights', 24 * 6), v('Chelsea 3-0 Everton highlights', 3)])).toBeNull();
  });
  it('does not mistake one club for another', () => {
    const villa = { ...match, home: t('Aston Villa', 'AVL'), away: t('Brighton Hove', 'BHA') };
    expect(findHighlight(villa, [v('Villarreal 2-1 Brighton highlights', 3)])).toBeNull();
    expect(findHighlight(villa, [v('Villa 2-1 Brighton | Premier League Highlights', 3)]).videoId).toBe('abcdefghijk');
  });
});

describe('teamNames', () => {
  it('adds the short form of a club name', () => {
    expect(teamNames(t('Norwich City', 'NOR'))).toEqual(['norwich city', 'norwich']);
  });
});

describe('videoIdFrom', () => {
  it('understands the usual YouTube links', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ']) {
      expect(videoIdFrom(url)).toBe('dQw4w9WgXcQ');
    }
    expect(videoIdFrom('https://example.com/video')).toBeNull();
  });
});
