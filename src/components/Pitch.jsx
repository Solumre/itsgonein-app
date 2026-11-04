import { useRef, useState } from 'react';

// A portrait pitch. Positions are percentages: x across, y up the pitch from your own goal.
export const W = 100, H = 150;
const toSvg = (x, y) => [x, H * (1 - y / 100)];
const surname = (n) => (n ? n.split(' ').slice(-1)[0] : '');

function Markings() {
  return (
    <g className="pitch-lines" fill="none">
      <rect x="2" y="2" width="96" height="146" />
      <line x1="2" y1="75" x2="98" y2="75" />
      <circle cx="50" cy="75" r="11" />
      <rect x="22" y="2" width="56" height="20" /><rect x="36" y="2" width="28" height="7" />
      <rect x="22" y="128" width="56" height="20" /><rect x="36" y="141" width="28" height="7" />
      <path d="M 40 22 A 11 11 0 0 0 60 22" /><path d="M 40 128 A 11 11 0 0 1 60 128" />
    </g>
  );
}

// Draws a board. Interactive when onChange is given: drag players, tap one to pick (onPick),
// and in 'run' or 'pass' mode drag on the pitch to draw an arrow.
export default function Pitch({ board, colors = ['#e11d48', '#ffffff'], mode = 'move', onChange, onPick, hits, small }) {
  const svg = useRef(null);
  const [drag, setDrag] = useState(null); // { i, moved } or { arrow: {x1,y1,x2,y2} }
  const point = (e) => {
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM().inverse());
    return { x: Math.min(100, Math.max(0, p.x)), y: Math.min(100, Math.max(0, (1 - p.y / H) * 100)) };
  };
  const interactive = !!onChange;

  const down = (e, i) => {
    if (!interactive) return;
    e.preventDefault();
    svg.current.setPointerCapture?.(e.pointerId);
    if (mode === 'move' && i != null) setDrag({ i, moved: false, start: point(e) });
    else if (mode !== 'move') { const p = point(e); setDrag({ arrow: { x1: p.x, y1: p.y, x2: p.x, y2: p.y } }); }
  };
  const move = (e) => {
    if (!drag) return;
    const p = point(e);
    if (drag.arrow) return setDrag({ arrow: { ...drag.arrow, x2: p.x, y2: p.y } });
    const far = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 2;
    if (!drag.moved && !far) return;
    onChange({ ...board, players: board.players.map((pl, j) => (j === drag.i ? { ...pl, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } : pl)) });
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };
  const up = () => {
    if (!drag) return;
    if (drag.arrow) {
      const a = drag.arrow;
      if (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) > 5) onChange({ ...board, arrows: [...board.arrows, { kind: mode, ...a }].slice(-12) });
    } else if (!drag.moved) onPick?.(drag.i);
    setDrag(null);
  };

  const arrows = drag?.arrow ? [...board.arrows, { kind: mode, ...drag.arrow }] : board.arrows;
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`pitch${small ? ' small' : ''}${interactive ? ` mode-${mode}` : ''}`}
      onPointerDown={(e) => down(e, null)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}
      role="img" aria-label={`${board.formation} formation`}>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#fff" /></marker>
      </defs>
      <rect width={W} height={H} className="pitch-grass" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * (H / 7)} width={W} height={H / 14} className="pitch-stripe" />)}
      <Markings />
      {arrows.map((a, i) => {
        const [x1, y1] = toSvg(a.x1, a.y1), [x2, y2] = toSvg(a.x2, a.y2);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`arrow ${a.kind}`} markerEnd="url(#arrowhead)" />;
      })}
      {board.players.map((p, i) => {
        const [x, y] = toSvg(p.x, p.y);
        const hit = hits?.[i];
        return (
          <g key={i} transform={`translate(${x} ${y})`} className={`token${drag?.i === i ? ' dragging' : ''}${!p.name ? ' empty' : ''}`}
            onPointerDown={(e) => { e.stopPropagation(); down(e, i); }}>
            {hits && <circle r="6.6" className={hit ? 'hit' : 'miss'} />}
            <circle r="5" fill={i === 0 ? '#facc15' : colors[0]} stroke={colors[1] || '#fff'} strokeWidth="0.8" />
            <text y="1.6" textAnchor="middle" className="token-num" fill={i === 0 ? '#111' : colors[1] || '#fff'}>{p.name ? surname(p.name).slice(0, 3).toUpperCase() : '+'}</text>
            {!small && p.name && <text y="9.5" textAnchor="middle" className="token-name">{surname(p.name)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
