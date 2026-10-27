import { useEffect, useState } from 'react';
import { Share2, Download } from 'lucide-react';
import { api } from '../lib/api';
import { drawRecap, toBlob, headline } from '../lib/recapImage';
import { ordinal } from '../lib/format';
import { roundLabel } from '../lib/game';
import { useToast } from './Toast';
import Sheet from './Sheet';
import { Spinner, ErrorBox } from './Bits';

const seenKey = (comp, md) => (comp === 'PL' ? `igi-recap-${md}` : `igi-recap-${comp}-${md}`);
export const recapSeen = (comp, md) => { try { return !!localStorage.getItem(seenKey(comp, md)); } catch { return true; } };
const markSeen = (comp, md) => { try { localStorage.setItem(seenKey(comp, md), '1'); } catch { /* ignore */ } };

function RecapBody({ competition, matchday }) {
  const [state, setState] = useState({ recap: null, url: null, error: null });
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    let objectUrl;
    api(`/api/recap?competition=${competition}&matchday=${matchday}`)
      .then(async ({ recap }) => {
        const canvas = await drawRecap(recap);
        const blob = await toBlob(canvas);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setState({ recap, url: objectUrl, blob, error: null });
      })
      .catch((error) => { if (!cancelled) setState({ recap: null, url: null, error }); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [competition, matchday]);

  const { recap, url, blob, error } = state;
  if (error) return <ErrorBox error={error} />;
  if (!recap) return <Spinner label="Making your recap…" />;

  const file = new File([blob], `itsgonein-${competition === 'CL' ? 'ucl-' : ''}${recap.roundLabel.toLowerCase().replace(/\W+/g, '-')}.png`, { type: 'image/png' });
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const share = async () => {
    try {
      await navigator.share({ files: [file], title: `My ${recap.roundLabel} on ItsGoneIn` });
    } catch (e) {
      if (e.name !== 'AbortError') toast("Couldn't share — try saving it instead", 'bad');
    }
  };

  const alt = `${recap.roundLabel}: ${recap.points} points, ${recap.exact} exact scores, ${recap.results} right results. ${headline(recap)}`;
  return (
    <div className="recap">
      <img src={url} alt={alt} className="recap-img" />
      <div className="recap-facts">
        {recap.leagues.filter((l) => l.rank).map((l) => (
          <p key={l.code}>{l.rank === 1 ? '👑' : '🏆'} {l.rank === 1 ? 'Won' : `${ordinal(l.rank)} of ${l.size} in`} <b>{l.name}</b>{l.rank !== 1 && l.winner ? ` · ${l.winner.nickname} won with ${l.winner.points}` : ''}</p>
        ))}
        {recap.average != null && <p>📈 Average across everyone: <b>{recap.average}</b> pts</p>}
      </div>
      <div className="recap-actions">
        {canShare && <button className="btn" onClick={share}><Share2 size={16} /> Share</button>}
        <a className={`btn ${canShare ? 'btn-ghost' : ''}`} href={url} download={file.name}><Download size={16} /> Save image</a>
      </div>
      <p className="hint center">Your league names stay off the image, so it's safe to share.</p>
    </div>
  );
}

export function RecapSheet({ competition = 'PL', matchday, open, onClose }) {
  useEffect(() => { if (open && matchday) markSeen(competition, matchday); }, [open, competition, matchday]);
  return (
    <Sheet open={open} onClose={onClose} title={`${roundLabel(competition, matchday)} recap`}>
      {open && <RecapBody competition={competition} matchday={matchday} />}
    </Sheet>
  );
}

// Banner on Predict when a gameweek you played in has just finished.
export function RecapBanner({ competition = 'PL', matchday, onOpen, onDismiss }) {
  return (
    <section className={`recap-banner kit${competition === 'CL' ? ' cl-night' : ''}`}>
      <div>
        <span className="eyebrow">{competition === 'CL' ? 'UCL ' : ''}{roundLabel(competition, matchday)} is done</span>
        <strong>📊 Your recap is ready</strong>
      </div>
      <div className="recap-banner-actions">
        <button className="btn btn-sm recap-open" onClick={onOpen}>See it</button>
        <button className="link-btn" onClick={onDismiss} aria-label="Dismiss">Later</button>
      </div>
    </section>
  );
}
