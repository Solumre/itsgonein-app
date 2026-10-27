import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useToast } from '../components/Toast';
import Avatar from '../components/Avatar';
import Confetti from '../components/Confetti';
import { Spinner, ErrorBox, PageHead } from '../components/Bits';

const LETTERS = ['A', 'B', 'C', 'D'];
const CHEERS = ['Unlucky! 😬', 'Getting there 💪', 'Not bad 👍', 'Good effort! 🙌', 'So close! 🔥', 'PERFECT! 🧠🏆'];

function Question({ q, chosen, answer, busy, onPick }) {
  const revealed = answer != null;
  return (
    <section className="card quiz-q">
      {q.image && <img className="quiz-crest" src={q.image} alt="Club badge" />}
      <h2 className="quiz-text">{q.text}</h2>
      <div className="quiz-options">
        {q.options.map((o, i) => {
          const cls = !revealed ? '' : i === answer ? ' right' : i === chosen ? ' wrong' : ' faded';
          return (
            <button key={o} className={`quiz-opt${cls}`} disabled={revealed || busy} onClick={() => onPick(i)}>
              <span className="quiz-letter">{LETTERS[i]}</span>{o}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// A small card for the Predict page: today's quiz and your streak.
export function QuizCard() {
  const { data } = useApi('/api/quiz');
  if (!data) return null;
  const done = data.play?.done;
  return (
    <Link to="/quiz" className="quiz-card">
      <span className="quiz-card-icon">🧠</span>
      <span className="who">
        <strong>Daily quiz</strong>
        <small>{done ? `You got ${data.play.score}/${data.questions.length} today. New one tomorrow!` : data.play ? 'Keep going, you\'re part way through' : '5 quick questions · +3 XP each'}</small>
      </span>
      {data.stats?.streak > 0 && <span className="quiz-streak">🔥{data.stats.streak}</span>}
      {!done && <span className="btn btn-sm">Play</span>}
    </Link>
  );
}

export default function Quiz() {
  const { data, error, loading, reload } = useApi('/api/quiz');
  const toast = useToast();
  const [showing, setShowing] = useState(null); // a question just answered, until "Next"
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState(0);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;

  const qs = data.questions;
  const next = qs.findIndex((q) => q.chosen == null);
  const current = showing ?? (next === -1 ? null : next);
  const score = data.play?.score || 0;

  const pick = async (choice) => {
    setBusy(true);
    try {
      const r = await api('/api/quiz/answer', { method: 'POST', body: { n: current, choice } });
      setShowing(current);
      if (r.right) toast(['⚽ Back of the net!', '🎯 Spot on!', '🔥 Correct!', '🧠 Big brain!'][current % 4], 'good');
      if (r.done && r.score >= 4) setFx((n) => n + 1);
      await reload();
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  };

  return (
    <div className="page quiz">
      <Confetti fire={fx} />
      <PageHead title="Daily quiz" sub={`5 questions a day · +3 XP for each right answer${data.stats?.streak ? ` · 🔥 ${data.stats.streak} day streak` : ''}`} />
      <div className="quiz-dots" aria-label={`Question ${Math.min((current ?? qs.length) + 1, qs.length)} of ${qs.length}`}>
        {qs.map((q, i) => (
          <span key={i} className={`dot${q.chosen == null ? (i === current ? ' now' : '') : q.chosen === q.answer ? ' right' : ' wrong'}`} />
        ))}
      </div>

      {current != null && (
        <>
          <Question q={qs[current]} chosen={qs[current].chosen} answer={qs[current].answer} busy={busy} onPick={pick} />
          {showing != null && (
            <button className="btn quiz-next" onClick={() => setShowing(null)}>{next === -1 ? 'See my score' : 'Next question ›'}</button>
          )}
        </>
      )}

      {current == null && (
        <>
          <section className="card quiz-done">
            <span className="eyebrow">Today&apos;s score</span>
            <b className="quiz-score">{score}<small>/{qs.length}</small></b>
            <p>{CHEERS[Math.min(score, CHEERS.length - 1)]}</p>
            <p className="hint">+{score * 3} XP · A new quiz every day at midnight</p>
          </section>
          <section className="card">
            <h2 className="section-title">Answers</h2>
            <ol className="quiz-review">
              {qs.map((q, i) => (
                <li key={i}>
                  <span>{q.chosen === q.answer ? '✅' : '❌'}</span>
                  <span className="who"><strong>{q.text}</strong><small>{q.options[q.answer]}{q.chosen !== q.answer ? ` (you said ${q.options[q.chosen]})` : ''}</small></span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {data.mates?.length > 0 && (
        <section className="card">
          <h2 className="section-title">Your mates today</h2>
          <ul className="mc-mates">
            {data.mates.map((m) => (
              <li key={m.uid}>
                <Avatar user={m} size={30} />
                <span className="who"><strong>{m.nickname}</strong>{!m.done && <small>playing…</small>}</span>
                <span className="pts-chip exact">{m.score}/{qs.length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
