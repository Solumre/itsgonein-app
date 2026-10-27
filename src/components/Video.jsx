import { useState } from 'react';
import { Play } from 'lucide-react';

export const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// A YouTube video that only loads YouTube when tapped (faster, and nothing is sent to
// YouTube until then). Privacy-enhanced mode, related videos from the same channel only.
export default function Video({ id, title }) {
  const [on, setOn] = useState(false);
  const [noThumb, setNoThumb] = useState(false);
  if (on) {
    return (
      <div className="video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  return (
    <button className="video video-cover" onClick={() => setOn(true)} aria-label={`Play: ${title}`}>
      {!noThumb && <img src={thumb(id)} alt="" loading="lazy" onError={() => setNoThumb(true)} />}
      <span className="video-play"><Play size={30} fill="currentColor" /></span>
    </button>
  );
}
