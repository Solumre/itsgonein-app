import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signIn } from '../lib/session';

export default function Landing() {
  const [error, setError] = useState(null);
  const go = () => signIn().catch((e) => setError(e.message));
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="brand">ITS<span>GONE</span>IN<i>.</i></span>
        <Link to="/live" className="btn btn-ghost btn-sm">Scores &amp; tables</Link>
      </header>

      <section className="hero">
        <p className="eyebrow">Premier League predictor</p>
        <h1>Call the score.<br /><em>Beat your mates.</em></h1>
        <p className="hero-sub">Predict every Premier League game, run a league with your friends and talk about it as the goals go in.</p>
        <button className="btn btn-google" onClick={go}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          Sign in with Google
        </button>
        {error && <p className="form-error">{error}</p>}

        <div className="hero-card" aria-hidden="true">
          <div className="hc-row"><span className="hc-team">ARS</span><span className="hc-score">2</span><span className="hc-dash">–</span><span className="hc-score">1</span><span className="hc-team">CHE</span></div>
          <div className="hc-points">🎯 Exact score · +3 ✌️ Doubled · +6</div>
        </div>
      </section>

      <section className="features">
        <article><span>🎯</span><h3>Predict every game</h3><p>3 points for the exact score, 1 for the right result. Use your Double Up once a week.</p></article>
        <article><span>🏆</span><h3>Leagues with your mates</h3><p>Make a league, share the code, and watch the table change live as the goals go in.</p></article>
        <article><span>🎨</span><h3>Your club, your colours</h3><p>Pick your club and the whole app turns your colours. Earn badges and level up.</p></article>
      </section>

      <section className="safety-note">
        <h2>Built for young fans</h2>
        <ul>
          <li>Chat is only with friends in your leagues. There's no public chat and no private messages.</li>
          <li>Nicknames only: no real names or photos are shown.</li>
          <li>Swearing, links and contact details are blocked. Anything can be reported.</li>
          <li>Players under 13 need a parent or carer to say OK.</li>
        </ul>
      </section>

      <footer className="landing-foot">Free to play. No prizes, no betting. Not affiliated with the Premier League or any club.</footer>
    </div>
  );
}
