import { describe, it, expect } from 'vitest';
import { parseFeed, findHighlight, findPreview, channelsFor, videoIdFrom, teamNames, scanUploads, isHighlightTitle, searchName } from '../../server/highlights.js';

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

describe('findPreview', () => {
  it('picks a preview naming both teams from the days before kickoff', () => {
    const got = findPreview(match, [
      v('Chelsea v Man Utd | Premier League Preview', -30, 'preview0001'),
      v('Chelsea v Man Utd | Match Preview', -6 * 24, 'tooearly001'),
      v('Chelsea 0-1 Man Utd | Highlights', 3, 'highlights1'),
      v('Arsenal v Spurs preview', -10, 'othergame01'),
      v('Chelsea v Man Utd LIVE watchalong', -1, 'watchalong1'),
    ]);
    expect(got.videoId).toBe('preview0001');
    expect(findPreview(match, [v('Chelsea v Man Utd | Highlights', -2)])).toBeNull(); // not a preview
  });
});

describe('channelsFor', () => {
  it('uses channels tagged for the competition, or tagged for none', () => {
    const chs = [{ id: 'a', competitions: ['PL'] }, { id: 'b', competitions: ['CL'] }, { id: 'c', competitions: [] }, { id: 'd' }];
    expect(channelsFor(chs, 'PL').map((c) => c.id)).toEqual(['a', 'c', 'd']);
    expect(channelsFor(chs, 'PD').map((c) => c.id)).toEqual(['c', 'd']);
  });
});

describe('only real highlights', () => {
  it('turns down clips and analysis that mention both teams', () => {
    const villa = { ...match, home: t('Aston Villa', 'AVL'), away: t('Arsenal', 'ARS'), score: { home: 0, away: 1 } };
    expect(findHighlight(villa, [v('"It\'s the dream of every coach!" | Gary Neville\'s verdict on Villa v Arsenal', 3)])).toBeNull();
    expect(findHighlight(villa, [v('Arteta reacts to Villa 0-1 Arsenal', 3)])).toBeNull();
    expect(isHighlightTitle('Aston Villa 0-1 Arsenal | Premier League Highlights')).toBe(true);
    expect(isHighlightTitle('Neville and Carragher analysis: Villa v Arsenal')).toBe(false);
  });
  it('prefers the one with the right score', () => {
    const got = findHighlight(match, [
      v('Chelsea 1-1 Man Utd | Premier League Highlights (2024)', 2, 'wrongscore1'),
      v('Chelsea 0-1 Man Utd | Premier League Highlights', 4, 'rightscore1'),
    ]);
    expect(got.videoId).toBe('rightscore1');
  });
});

describe('scanUploads', () => {
  const vid = (n, daysAgo) => ({ videoId: `v${n}`, title: `video ${n}`, published: new Date(Date.parse('2026-10-31T12:00:00Z') - daysAgo * 86400_000).toISOString() });
  const pages = [
    { items: [vid(9, 0), vid(8, 1), vid(7, 2)], next: 'p2' },
    { items: [vid(6, 3), vid(5, 4), vid(4, 5)], next: 'p3' },
    { items: [vid(3, 10), vid(2, 20)], next: null },
  ];
  const fetchPage = (calls) => async (token) => { calls.push(token ?? 'first'); return pages[{ undefined: 0, p2: 1, p3: 2 }[token]]; };
  it('reads pages back to a date', async () => {
    const calls = [];
    const r = await scanUploads([], fetchPage(calls), { since: new Date('2026-10-25T00:00:00Z') });
    expect(r.videos.map((x) => x.videoId)).toEqual(['v9', 'v8', 'v7', 'v6', 'v5', 'v4']);
    expect(calls).toEqual(['first', 'p2', 'p3']);
  });
  it('isn\'t stopped by one old video out of order', async () => {
    const outOfOrder = [
      { items: [vid(9, 0), vid(1, 300), vid(8, 1)], next: 'p2' }, // an old premiere near the top
      { items: [vid(7, 2), vid(6, 30)], next: 'p3' },
      { items: [vid(3, 40), vid(2, 50)], next: null },
    ];
    const calls = [];
    const r = await scanUploads([], async (t) => { calls.push(t ?? 'first'); return outOfOrder[{ undefined: 0, p2: 1, p3: 2 }[t]]; }, { since: new Date('2026-10-25T00:00:00Z') });
    expect(r.videos.map((x) => x.videoId)).toEqual(['v9', 'v8', 'v7']);
    expect(calls).toEqual(['first', 'p2', 'p3']); // carried on past the old one; stopped at an all-old page
  });
  it('tops up until it reaches a video it already has', async () => {
    const calls = [];
    const r = await scanUploads([vid(7, 2), vid(6, 3)], fetchPage(calls), { since: new Date('2026-01-01') });
    expect(r.videos.map((x) => x.videoId)).toEqual(['v9', 'v8']);
    expect(calls).toEqual(['first']);
  });
});

describe('European club names', () => {
  const game = (home, away, score = { home: 2, away: 1 }) => ({ id: 'cl', kickoff: '2026-10-21T19:00:00Z', status: 'finished', score, home, away });
  const vt = (title) => [{ videoId: 'clhighlight', title, published: '2026-10-21T22:30:00Z' }];
  const club = (name, full, tla) => ({ name, full, tla });
  it('matches how titles write clubs the data names differently', () => {
    const cases = [
      [club('Bayern', 'FC Bayern München', 'FCB'), club('Atleti', 'Club Atlético de Madrid', 'ATL'), 'Bayern Munich 2-1 Atletico Madrid | UEFA Champions League Highlights'],
      [club('Barça', 'FC Barcelona', 'FCB'), club('Inter', 'FC Internazionale Milano', 'INT'), 'Barcelona vs Inter Milan 2-1 | Champions League highlights'],
      [club('København', 'FC København', 'COP'), club('Bodø/Glimt', 'FK Bodø/Glimt', 'BOD'), 'FC Copenhagen 2-1 Bodo/Glimt | Highlights'],
      [club('PSG', 'Paris Saint-Germain FC', 'PSG'), club('Sporting CP', 'Sporting Clube de Portugal', 'SCP'), 'PSG 2-1 Sporting Lisbon | UCL Highlights'],
      [club('Arsenal', 'Arsenal FC', 'ARS'), club('Slavia Praha', 'SK Slavia Praha', 'SLA'), 'Arsenal 2-1 Slavia Prague | Champions League Highlights'],
      [club('Athletic Club', 'Athletic Club', 'ATH'), club('Union SG', 'Royale Union Saint-Gilloise', 'USG'), 'Athletic Bilbao v Union Saint-Gilloise | Highlights'],
      [club('Man City', 'Manchester City FC', 'MCI'), club('PAE AEK', 'PAE AEK', 'AEK'), 'Foden Is Unstoppable! | Man City 5-1 AEK Athens | UEFA Champions League Highlights'],
    ];
    for (const [home, away, title] of cases) expect(findHighlight(game(home, away), vt(title))?.videoId, title).toBe('clhighlight');
  });
  it('still keeps different clubs apart', () => {
    expect(findHighlight(game(club('Real Madrid', 'Real Madrid CF', 'RMA'), club('Juventus', 'Juventus FC', 'JUV')), vt('Atletico Madrid 2-1 Juventus | Highlights'))).toBeNull();
    expect(findHighlight(game(club('Villarreal', 'Villarreal CF', 'VIL'), club('Arsenal', 'Arsenal FC', 'ARS')), vt('Aston Villa 2-1 Arsenal | Highlights'))).toBeNull();
  });
});

describe('searchName', () => {
  it('searches with the name titles use', () => {
    expect(searchName({ name: 'Atleti', full: 'Club Atlético de Madrid', tla: 'ATL' })).toBe('atletico madrid');
    expect(searchName({ name: 'Bayern', full: 'FC Bayern München', tla: 'FCB' })).toBe('bayern');
    expect(searchName({ name: 'Man United', full: 'Manchester United FC', tla: 'MUN' })).toBe('manchester united');
    expect(searchName({ name: 'Arsenal', full: 'Arsenal FC', tla: 'ARS' })).toBe('arsenal');
    expect(searchName({ name: 'PAE AEK', full: 'PAE AEK', tla: 'AEK' })).toBe('aek athens');
  });
});
