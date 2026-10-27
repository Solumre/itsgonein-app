// What search engines and link previews see: a sitemap, and each public page's HTML with its
// own title, description and canonical link (the app itself is the same single page).
import { FAQ } from '../src/lib/faq.js';

export const SITE = 'https://itsgonein.com';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Title, description and extra structured data for a path, or null to leave the page as is.
export function pageMeta(path, { match } = {}) {
  if (path === '/how-to') {
    return {
      title: 'How to play ItsGoneIn: scoring, leagues, quiz and safety',
      description: 'How ItsGoneIn works: 3 points for an exact score, 1 for the result, Double Up, private leagues and chat, live picks, the daily quiz, penalties, trophies, and what parents need to know.',
      jsonld: {
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    };
  }
  if (path === '/live') {
    return {
      title: 'Live football scores, tables and top scorers · ItsGoneIn',
      description: 'Live scores, league tables and top scorers for the Premier League, Championship, Champions League, La Liga, Bundesliga, Serie A and Ligue 1, with highlights.',
    };
  }
  if (match) {
    const { home, away, score, status } = match;
    const vs = `${home.name} ${score && status !== 'upcoming' ? `${score.home}-${score.away}` : 'v'} ${away.name}`;
    const comp = match.competition === 'CL' ? 'Champions League' : 'Premier League';
    return {
      title: `${vs}: ${status === 'finished' ? 'highlights, goals and stats' : status === 'live' ? 'live score' : 'preview and predictions'} · ItsGoneIn`,
      description: `${vs} (${comp}): ${status === 'upcoming' ? 'form, head-to-head, preview and predictions' : 'goals, cards, line-ups, highlights'} and what your mates predicted, on ItsGoneIn.`,
    };
  }
  return null;
}

// The page's HTML with its own title, description, canonical and social tags.
export function renderPage(html, path, meta) {
  if (!meta) return html;
  const url = `${SITE}${path}`;
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(meta.description)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(meta.title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(meta.description)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${esc(meta.title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${esc(meta.description)}"`);
  if (meta.jsonld) out = out.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(meta.jsonld).replace(/</g, '\\u003c')}</script>\n  </head>`);
  return out;
}

// Main pages, plus PL and CL games from the last and next two weeks.
export function sitemap(matches, now = Date.now()) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const urls = [
    { loc: '/', freq: 'daily', priority: '1.0', mod: day(now) },
    { loc: '/how-to', freq: 'monthly', priority: '0.8' },
    { loc: '/live', freq: 'hourly', priority: '0.7', mod: day(now) },
    ...matches
      .filter((m) => Math.abs(now - new Date(m.kickoff)) < 14 * 86400_000)
      .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
      .map((m) => ({ loc: `/match/${m.id}?c=${m.competition}`, freq: m.status === 'finished' ? 'weekly' : 'daily', priority: '0.5', mod: day(Math.min(now, new Date(m.kickoff).getTime())) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(SITE + u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}
