import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';
import { LEVELS, TROPHIES, PICK_REACTIONS } from '../lib/game';
import { useTitle } from '../lib/hooks';
import { FAQ } from '../lib/faq';

const SECTIONS = [
  ['start', '👋', 'Getting started'],
  ['predict', '🎯', 'Predicting'],
  ['leagues', '🏆', 'Leagues & chat'],
  ['matchday', '⚡', 'On matchday'],
  ['extras', '🧠', 'Quiz & games'],
  ['progress', '📈', 'XP & trophies'],
  ['parents', '🛡️', 'For parents'],
  ['faq', '❓', 'Questions'],
];


function Section({ id, emoji, title, children }) {
  return (
    <section id={id} className="card howto-sec">
      <h2><span aria-hidden="true">{emoji}</span> {title}</h2>
      {children}
    </section>
  );
}

export default function HowTo() {
  const { user } = useSession();
  const { hash } = useLocation();
  useTitle('How to play');
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className={`page howto${user ? '' : ' standalone'}`}>
      {!user && (
        <header className="landing-top">
          <Link to="/" className="brand">ITS<span>GONE</span>IN<i>.</i></Link>
          <Link to="/" className="btn btn-sm">Play free</Link>
        </header>
      )}
      <header className="howto-head">
        <p className="eyebrow">How to play</p>
        <h1>Everything in 2 minutes</h1>
        <p className="hero-sub">Call the score of every Premier League and Champions League game, beat your mates in your own league, and play the quiz and penalties in between.</p>
      </header>

      <nav className="howto-nav" aria-label="Sections">
        {SECTIONS.map(([id, e, t]) => <a key={id} href={`#${id}`}><span aria-hidden="true">{e}</span>{t}</a>)}
      </nav>

      <Section id="start" emoji="👋" title="Getting started">
        <ol className="steps">
          <li><b>Sign in with Google</b> and pick a nickname, an emoji and your club. The whole app turns your club&apos;s colours.</li>
          <li><b>Under 13?</b> Send the link it gives you to a parent or carer. Once they say OK, leagues and chat unlock.</li>
          <li><b>Make your picks</b> on the Predict tab, then <b>make or join a league</b> with your mates.</li>
        </ol>
        <p className="tip">📱 Tip: add ItsGoneIn to your home screen (Share → Add to Home Screen) and it works like an app. Turn on reminders on the Me tab so you never miss a pick.</p>
      </Section>

      <Section id="predict" emoji="🎯" title="Predicting">
        <p>Tap ▲ ▼ to set the score for each game. Picks save by themselves and lock at kickoff.</p>
        <div className="points-grid">
          <div><b>+3</b><span>Exact score</span><small>You said 2-1, it ended 2-1</small></div>
          <div><b>+1</b><span>Right result</span><small>You said 2-0, it ended 3-1</small></div>
          <div><b>0</b><span>Wrong result</span><small>Better luck next time!</small></div>
        </div>
        <ul className="ticks">
          <li><b>✌️ Double Up:</b> pick one game a gameweek to double your points. Choose wisely!</li>
          <li><b>🎲 Lucky dip:</b> in a rush? It fills every game you haven&apos;t picked with a random score.</li>
          <li><b>⭐ Champions League:</b> switch at the top of Predict. It has its own table in every league, and knockout games count the score after 90 minutes.</li>
          <li><b>❓ Bonus questions:</b> each Premier League gameweek asks how many goals there&apos;ll be (3 points exact, 1 if you&apos;re within 2), which game has the most goals (2) and whether any game ends 0-0 (1). They lock at the first kickoff.</li>
        </ul>
      </Section>

      <Section id="leagues" emoji="🏆" title="Leagues & chat">
        <ul className="ticks">
          <li><b>Make a league</b> on the Leagues tab and tap <b>Invite</b> to send the code. Mates tap <b>Join</b> and type it in. You can be in up to 10 leagues.</li>
          <li><b>Table:</b> it updates live as goals go in. Flick between the season and this gameweek.</li>
          <li><b>Picks:</b> see everyone&apos;s picks once a game kicks off. Tap a mate&apos;s pick to react {PICK_REACTIONS.join(' ')}.</li>
          <li><b>Chat:</b> quick-chat buttons, emoji reactions, and 🔮 to show your pick early. The app posts kickoffs, results and who nailed the exact score.</li>
          <li><b>⚔️ Head-to-head:</b> tap ⚔️ next to a mate in the table to challenge them for the next round. Most points wins, and your record is kept forever.</li>
          <li><b>📊 Weekly recap:</b> when a gameweek ends you get a recap card to save or share.</li>
        </ul>
      </Section>

      <Section id="matchday" emoji="⚡" title="On matchday">
        <ul className="ticks">
          <li><b>Live:</b> scores, tables and top scorers for the Premier League, Championship, Champions League and Europe&apos;s big leagues. Use ‹ › to look at other rounds.</li>
          <li><b>Match centre:</b> tap any game for the live score, goals, cards, line-ups, form, head-to-head history, a preview before and 📺 highlights after.</li>
          <li><b>⚡ Live picks:</b> during a game, answer quick questions like <i>Who scores next?</i> (+2) or <i>Goal before half-time?</i> (+1) for extra XP.</li>
          <li><b>💬 Match talk:</b> chat about that game with your league, right on the match page.</li>
        </ul>
      </Section>

      <Section id="extras" emoji="🧠" title="Quiz & games">
        <ul className="ticks">
          <li><b>🧠 Daily quiz:</b> 5 questions every day about the latest scores, the table, players and football facts. +3 XP for each right answer. Keep your 🔥 streak going, and get 5/5 for a shout in your league chat.</li>
          <li><b>🥅 Penalty shootout:</b> tap where to aim, stop the power bar before the red, then dive to save. 5 each, then sudden death. Your best game each day earns up to +20 XP.</li>
        </ul>
      </Section>

      <Section id="progress" emoji="📈" title="XP, levels & trophies">
        <p>Everything earns XP: <b>10 per point</b>, 2 for every pick played, 25 for every badge, plus live picks, the quiz and penalties.</p>
        <div className="level-ladder">{LEVELS.map((l, i) => <span key={l.name}><b>{i + 1}</b>{l.name}<small>{l.xp} XP</small></span>)}</div>
        <p><b>Badges</b> like Sniper (exact scores), On Fire (streaks) and Perfect Week. <b>Trophies</b> for your cabinet, won inside your leagues:</p>
        <ul className="trophy-list">{Object.values(TROPHIES).map((t) => <li key={t.name}><span aria-hidden="true">{t.emoji}</span><b>{t.name}</b><small>{t.desc}</small></li>)}</ul>
      </Section>

      <Section id="parents" emoji="🛡️" title="For parents and carers">
        <ul className="ticks">
          <li><b>Your OK first:</b> under-13s can&apos;t join leagues or chat until you approve their account from a link they send you. You sign in with your own Google account and can withdraw approval at any time.</li>
          <li><b>Friends only:</b> chat happens only inside leagues, which you can only join with a code. There&apos;s no public chat, no private messages and no strangers.</li>
          <li><b>Filtered:</b> swearing, links, phone numbers, emails and other contact details are blocked before they&apos;re posted.</li>
          <li><b>Report and block:</b> any message can be reported to an adult moderator, and any player can be blocked.</li>
          <li><b>Nicknames only:</b> no real names or photos are shown. Videos only come from approved official channels and only load when tapped.</li>
          <li><b>No money:</b> free, no ads, no prizes, no betting, nothing to buy.</li>
          <li><b>Delete any time:</b> Me → Delete my account removes everything.</li>
        </ul>
      </Section>

      <Section id="faq" emoji="❓" title="Questions">
        {FAQ.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}
      </Section>

      <div className="howto-cta">
        {user ? <Link to="/predict" className="btn">Make my picks</Link> : <Link to="/" className="btn">Start playing, it&apos;s free</Link>}
      </div>
    </div>
  );
}
