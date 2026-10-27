// Draws the gameweek recap as a 1080×1350 image in the player's club colours.
// League names are left off on purpose: the image may be shared outside the app.
import { DEFAULT_CLUB, textOn } from './clubs';
import { ordinal } from './format';

const W = 1080;
const H = 1350;
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Barlow, system-ui, sans-serif';

function stripes(ctx, color) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  for (let x = -H; x < W + H; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H * 0.47, H);
    ctx.stroke();
  }
  ctx.restore();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function panel(ctx, x, y, w, h, r = 28) {
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function text(ctx, str, x, y, { font, color, align = 'center', spacing = 0 }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

// One line about how the week went, for the bottom of the card.
export function headline(r) {
  const best = r.leagues.find((l) => l.rank);
  if (best?.rank === 1 && best.size > 1) return '👑 Won the week in my league!';
  if (best?.rank && best.size > 1) return `${ordinal(best.rank)} of ${best.size} in my league this week`;
  if (r.percentile != null && r.players > 2) return `Better than ${r.percentile}% of players`;
  return `${r.seasonPoints} points this season`;
}

export async function drawRecap(r) {
  await Promise.all([
    document.fonts?.load(`italic 800 80px ${DISPLAY}`),
    document.fonts?.load(`800 80px ${DISPLAY}`),
    document.fonts?.load(`600 40px ${BODY}`),
  ]).catch(() => {});
  const club = r.club || DEFAULT_CLUB;
  const ink = textOn(club.primary);
  const soft = ink === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(11,13,18,0.72)';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = club.primary;
  ctx.fillRect(0, 0, W, H);
  stripes(ctx, club.secondary);

  text(ctx, 'ITSGONEIN.', 80, 118, { font: `italic 800 64px ${DISPLAY}`, color: ink, align: 'left' });
  text(ctx, `GAMEWEEK ${r.matchday} RECAP`, W - 80, 112, { font: `700 36px ${DISPLAY}`, color: soft, align: 'right', spacing: 5 });

  // Player
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(W / 2, 300, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = club.secondary;
  ctx.stroke();
  text(ctx, r.avatar || '⚽', W / 2, 340, { font: '110px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif', color: ink });
  text(ctx, (r.nickname || '').toUpperCase(), W / 2, 492, { font: `italic 800 92px ${DISPLAY}`, color: ink });
  text(ctx, `${club.name} fan · Level ${r.level}`, W / 2, 548, { font: `600 38px ${BODY}`, color: soft });

  // Points
  text(ctx, String(r.points), W / 2, 790, { font: `italic 800 250px ${DISPLAY}`, color: ink });
  text(ctx, r.points === 1 ? 'POINT' : 'POINTS', W / 2, 850, { font: `800 46px ${DISPLAY}`, color: soft, spacing: 8 });

  // Stats row
  const stats = [['🎯', r.exact, 'exact'], ['✅', r.results, 'results'], ['🏆', r.seasonPoints, 'season pts']];
  const bw = 290, gap = 25, x0 = (W - (bw * 3 + gap * 2)) / 2;
  stats.forEach(([emoji, n, label], i) => {
    const x = x0 + i * (bw + gap);
    panel(ctx, x, 900, bw, 170);
    text(ctx, `${emoji} ${n}`, x + bw / 2, 985, { font: `800 70px ${DISPLAY}`, color: ink });
    text(ctx, label.toUpperCase(), x + bw / 2, 1040, { font: `700 30px ${DISPLAY}`, color: soft, spacing: 4 });
  });

  // Best call
  if (r.best) {
    panel(ctx, 80, 1100, W - 160, 96, 24);
    const b = r.best;
    const call = `${b.kind === 'exact' ? '🎯' : '✅'} BEST CALL: ${b.home.tla} ${b.pick.home}-${b.pick.away} ${b.away.tla}  +${b.points}${b.doubled ? ' ✌️' : ''}`;
    text(ctx, call, W / 2, 1163, { font: `800 44px ${DISPLAY}`, color: ink, spacing: 1 });
  }

  text(ctx, headline(r), W / 2, 1258, { font: `700 42px ${BODY}`, color: ink });
  text(ctx, 'itsgonein.com', W / 2, 1312, { font: `700 30px ${DISPLAY}`, color: soft, spacing: 4 });

  return canvas;
}

export const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
