import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import EmojiPicker from './EmojiPicker';

// The jobs a Junior Editor can do (admins too): the ticker, the Player of the Week poll and
// the weekly bonus question. `run(fn, okMessage)` runs an action and shows a toast.
export function EditorTools({ run }) {
  const [ticker, setTicker] = useState('');
  const tickerRef = useRef(null);
  const questionRef = useRef(null);
  const [poll, setPoll] = useState(['', '', ''].map(() => ({ name: '', team: '' })));
  const { data: bonus, reload: reloadBonus } = useApi('/api/admin/bonus');
  const [bq, setBq] = useState({ question: '', options: ['', '', ''] });
  const nextMd = bonus?.nextMatchday ?? null;
  return (
    <>
      <section className="card">
        <h2 className="section-title">Ticker message</h2>
        <form className="row-form" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/ticker', { method: 'POST', body: { message: ticker } }), 'Ticker updated'); }}>
          <input ref={tickerRef} value={ticker} onChange={(e) => setTicker(e.target.value)} maxLength={140} placeholder="e.g. 🚨 Double points this weekend!" />
          <EmojiPicker inputRef={tickerRef} value={ticker} onChange={setTicker} />
          <button className="btn btn-sm">Post</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => api('/api/admin/ticker', { method: 'POST', body: { message: '' } }), 'Ticker cleared')}>Clear</button>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">New Player of the Week poll</h2>
        <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/poll', { method: 'POST', body: { options: poll } }), 'Poll started'); }}>
          {poll.map((p, i) => (
            <div key={i} className="field-row">
              <input placeholder={`Player ${i + 1}`} value={p.name} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input placeholder="Team" value={p.team} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? { ...x, team: e.target.value } : x)))} />
            </div>
          ))}
          <div className="row-form">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPoll([...poll, { name: '', team: '' }].slice(0, 6))}>+ Player</button>
            <button className="btn btn-sm">Start poll</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">Bonus question</h2>
        <p className="hint">Add an extra multiple-choice question to {nextMd ? <b>Gameweek {nextMd}</b> : 'the next gameweek'} (worth 2 points), like "Who scores first in ARS v TOT?". Mark the answer below after the game.</p>
        <form onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/bonus', { method: 'POST', body: { matchday: nextMd, ...bq } }), 'Bonus question added').then(reloadBonus); }}>
          <div className="field field-emoji"><input ref={questionRef} placeholder="Question" value={bq.question} maxLength={120} onChange={(e) => setBq({ ...bq, question: e.target.value })} /><EmojiPicker inputRef={questionRef} value={bq.question} onChange={(q) => setBq((b) => ({ ...b, question: q }))} /></div>
          {bq.options.map((o, i) => (
            <div key={i} className="field"><input placeholder={`Answer ${i + 1}`} value={o} maxLength={40} onChange={(e) => setBq({ ...bq, options: bq.options.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
          ))}
          <div className="row-form">
            {bq.options.length < 4 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBq({ ...bq, options: [...bq.options, ''] })}>+ Answer</button>}
            <button className="btn btn-sm" disabled={!nextMd}>Add question</button>
          </div>
        </form>
        {(bonus?.questions || []).map((q) => (
          <article key={q.matchday} className="report">
            <header><b>GW {q.matchday}: {q.question}</b><small>{q.answer ? 'Marked' : 'Needs an answer'}</small></header>
            <div className="report-actions">
              {q.options.map((o) => (
                <button key={o.id} className={`btn btn-sm ${q.answer === o.id ? '' : 'btn-ghost'}`}
                  onClick={() => run(() => api(`/api/admin/bonus/${q.matchday}/answer`, { method: 'POST', body: { answer: o.id } }), `Marked "${o.label}" as the answer`).then(reloadBonus)}>
                  {q.answer === o.id ? '✓ ' : ''}{o.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

    </>
  );
}

// Questions for the daily quiz: one a day is used, oldest first, credited to whoever wrote it.
export function QuizBank({ run }) {
  const { user, isAdmin } = useSession();
  const { data, reload } = useApi('/api/editor/quiz');
  const [q, setQ] = useState({ question: '', right: '', wrong: ['', '', ''] });
  const qRef = useRef(null);
  const waiting = (data?.questions || []).filter((x) => !x.usedOn).length;
  const go = (fn, ok) => run(fn, ok).then(reload);
  return (
    <section className="card">
      <h2 className="section-title">🧠 Write a quiz question</h2>
      <p className="hint">One of these goes into the daily quiz each day, oldest first, with your name on it. {waiting} waiting.</p>
      <form onSubmit={(e) => { e.preventDefault(); go(() => api('/api/editor/quiz', { method: 'POST', body: q }), 'Question added to the bank').then(() => setQ({ question: '', right: '', wrong: ['', '', ''] })); }}>
        <div className="field field-emoji"><input ref={qRef} placeholder="Question, e.g. Who scored the winner in the 2024 Euro final?" value={q.question} maxLength={120} onChange={(e) => setQ({ ...q, question: e.target.value })} /><EmojiPicker inputRef={qRef} value={q.question} onChange={(v) => setQ((x) => ({ ...x, question: v }))} /></div>
        <div className="field"><input className="right-answer" placeholder="✅ Right answer" value={q.right} maxLength={40} onChange={(e) => setQ({ ...q, right: e.target.value })} /></div>
        {q.wrong.map((w, i) => (
          <div key={i} className="field"><input placeholder={`❌ Wrong answer ${i + 1}`} value={w} maxLength={40} onChange={(e) => setQ({ ...q, wrong: q.wrong.map((x, j) => (j === i ? e.target.value : x)) })} /></div>
        ))}
        <button className="btn btn-sm" disabled={!q.question.trim() || !q.right.trim() || q.wrong.some((w) => !w.trim())}>Add to the quiz</button>
      </form>
      {(data?.questions || []).length > 0 && (
        <ul className="admin-list bank-list">
          {data.questions.map((x) => (
            <li key={x.id}>
              <span className="who"><strong>{x.question}</strong><small>✅ {x.right} · ❌ {x.wrong.join(', ')}{x.by ? ` · ✍️ ${x.by}` : ''}</small></span>
              {x.usedOn ? <small>Used {x.usedOn}</small> : (isAdmin || x.uid === user?.uid) && (
                <button className="btn btn-ghost btn-sm" onClick={() => go(() => api(`/api/editor/quiz/${x.id}`, { method: 'DELETE' }), 'Removed')}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
