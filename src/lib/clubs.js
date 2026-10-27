// Club colours for theming. football-data only gives names ("Red / White"), so the
// common clubs get hand-picked hex values and everyone else falls back to the names.
const CLUB_COLORS = {
  ARS: ['#EF0107', '#FFFFFF'], AVL: ['#670E36', '#95BFE5'], BOU: ['#DA291C', '#000000'],
  BRE: ['#E30613', '#FFFFFF'], BHA: ['#0057B8', '#FFFFFF'], BUR: ['#6C1D45', '#99D6EA'],
  CHE: ['#034694', '#FFFFFF'], CRY: ['#1B458F', '#C4122E'], EVE: ['#003399', '#FFFFFF'],
  FUL: ['#FFFFFF', '#000000'], LEE: ['#1D428A', '#FFCD00'], LIV: ['#C8102E', '#00B2A9'],
  MCI: ['#6CABDD', '#1C2C5B'], MUN: ['#DA291C', '#FBE122'], NEW: ['#241F20', '#FFFFFF'],
  NOT: ['#DD0000', '#FFFFFF'], SUN: ['#EB172B', '#FFFFFF'], TOT: ['#132257', '#FFFFFF'],
  WHU: ['#7A263A', '#1BB1E7'], WOL: ['#FDB913', '#231F20'], LEI: ['#003090', '#FDBE11'],
  IPS: ['#0044A9', '#FFFFFF'], SOU: ['#D71920', '#FFFFFF'], LUT: ['#F78F1E', '#002D62'],
  BIR: ['#0000FF', '#FFFFFF'], BLA: ['#009EE0', '#FFFFFF'], BRC: ['#E21A23', '#FFFFFF'],
  CHA: ['#D4021D', '#FFFFFF'], COV: ['#59CBE8', '#FFFFFF'], DER: ['#FFFFFF', '#000000'],
  HUL: ['#F5A12D', '#000000'], MID: ['#E21B23', '#FFFFFF'], MIL: ['#001D5E', '#FFFFFF'],
  NOR: ['#FFF200', '#00A650'], OXF: ['#FFD100', '#002147'], POR: ['#001489', '#FFFFFF'],
  PNE: ['#FFFFFF', '#002B5C'], QPR: ['#1D5BA4', '#FFFFFF'], SHU: ['#EE2737', '#FFFFFF'],
  SHW: ['#0E00F7', '#FFFFFF'], STK: ['#E03A3E', '#FFFFFF'], SWA: ['#FFFFFF', '#000000'],
  WAT: ['#FBEE23', '#ED2127'], WBA: ['#122F67', '#FFFFFF'], WRE: ['#D71920', '#FFFFFF'],
  CAR: ['#0070B5', '#FFFFFF'], PLY: ['#00483A', '#FFFFFF'], SHE: ['#EE2737', '#FFFFFF'],
};

const NAMED = {
  red: '#D7191F', white: '#FFFFFF', black: '#111111', blue: '#1F4FB4', 'royal blue': '#1A4AB0',
  'navy blue': '#13234F', navy: '#13234F', 'sky blue': '#6CABDD', claret: '#7A263A', yellow: '#FFD200',
  gold: '#FDB913', amber: '#F5A12D', green: '#0B8A3E', orange: '#F78F1E', purple: '#5B2A86',
  maroon: '#7A1F2B', grey: '#8A8F98', gray: '#8A8F98', silver: '#C0C4CC', burgundy: '#6E1E35',
};

export const DEFAULT_CLUB = { id: null, name: 'Neutral', tla: 'FAN', crest: null, primary: '#16A34A', secondary: '#FFFFFF' };

export function clubColors(team) {
  if (CLUB_COLORS[team.tla]) return CLUB_COLORS[team.tla];
  const named = String(team.colors || '').toLowerCase().split('/').map((s) => NAMED[s.trim()]).filter(Boolean);
  return [named[0] || DEFAULT_CLUB.primary, named[1] || (named[0] === '#FFFFFF' ? '#111111' : '#FFFFFF')];
}

export function teamToClub(team) {
  const [primary, secondary] = clubColors(team);
  return { id: team.id, name: team.name, tla: team.tla, crest: team.crest, primary, secondary };
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
export const textOn = (hex) => (luminance(hex) > 0.4 ? '#0B0D12' : '#FFFFFF');

const BG = { dark: '#0B0D12', light: '#F3F4F7' };

// The accent has to read on the page background, so a navy or black club (Spurs,
// Newcastle) uses its second colour on dark mode, and a white one its second on light.
export function themeVars(club, mode) {
  const c = club || DEFAULT_CLUB;
  const bg = BG[mode];
  const candidates = [c.primary, c.secondary, mode === 'dark' ? '#FFFFFF' : '#111111'];
  const accent = candidates.find((x) => contrast(x, bg) >= 3) || candidates[2];
  const n = parseInt(c.primary.slice(1), 16);
  return {
    '--club': c.primary,
    '--club-2': c.secondary,
    '--club-rgb': `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`,
    '--on-club': textOn(c.primary),
    '--accent': accent,
    '--on-accent': textOn(accent),
  };
}

export function resolveMode(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(club, pref) {
  const mode = resolveMode(pref);
  const root = document.documentElement;
  root.dataset.theme = mode;
  for (const [k, v] of Object.entries(themeVars(club, mode))) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? BG.dark : BG.light);
  try {
    localStorage.setItem('igi-theme', JSON.stringify({ club, pref }));
  } catch { /* private mode */ }
}

export function savedTheme() {
  try {
    return JSON.parse(localStorage.getItem('igi-theme')) || {};
  } catch {
    return {};
  }
}
