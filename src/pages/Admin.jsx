import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useApi } from '../lib/hooks';
import { ago } from '../lib/format';
import { useToast } from '../components/Toast';
import { Spinner, ErrorBox, PageHead, Empty } from '../components/Bits';
import HighlightsAdmin from '../components/HighlightsAdmin';
import EmojiPicker from '../components/EmojiPicker';

const REASONS = { mean: 'Mean / bullying', personal_info: 'Personal info', inappropriate: 'Inappropriate', spam: 'Spam', other: 'Other' };

export default function Admin() {
  const { isAdmin } = useSession();
  const { data, error, loading, reload } = useApi(isAdmin ? '/api/admin/overview' : null, { refresh: 60_000 });
  const [ticker, setTicker] = useState('');
  const tickerRef = useRef(null);
  const questionRef = useRef(null);
  const [poll, setPoll] = useState(['', '', ''].map(() => ({ name: '', team: '' })));
  const { data: bonus, reload: reloadBonus } = useApi(isAdmin ? '/api/admin/bonus' : null);
  const [bq, setBq] = useState({ question: '', options: ['', '', ''] });
  const nextMd = bonus?.nextMatchday ?? null;
  const toast = useToast();
  if (!isAdmin) return <Navigate to="/predict" replace />;

  const run = async (fn, ok) => {
    try { await fn(); toast(ok, 'good'); reload(); } catch (e) { toast(e.message, 'bad'); }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div className="page admin">
      <PageHead title="Admin" sub="Moderation and settings" />
      <section className="stat-grid">
        <div><b>{data.users}</b><span>players</span></div>
        <div><b>{data.leagues}</b><span>leagues</span></div>
        <div><b>{data.reports.length}</b><span>open reports</span></div>
        <div><b>{data.pendingConsent}</b><span>awaiting parent</span></div>
      </section>

      <section className="card">
        <h2 className="section-title">Reports</h2>
        {data.reports.length === 0 ? <Empty emoji="✅" title="Nothing to review" /> : data.reports.map((r) => (
          <article key={r.id} className="report">
            <header><b>{REASONS[r.reason]}</b><small>{r.code} · {ago(r.createdAt ? new Date(r.createdAt) : null)}</small></header>
            <p className="quote"><b>{r.message?.nickname}:</b> {r.message?.text || <i>(deleted)</i>}</p>
            <div className="report-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/reports/${r.id}`, { method: 'POST', body: {} }), 'Dismissed')}>Dismiss</button>
              <button className="btn btn-ghost btn-sm" onClick={() => run(() => api(`/api/admin/reports/${r.id}`, { method: 'POST', body: { deleteMessage: true } }), 'Message deleted')}>Delete message</button>
              <button className="btn btn-danger btn-sm" onClick={() => run(() => api(`/api/admin/reports/${r.id}`, { method: 'POST', body: { deleteMessage: true, ban: true } }), 'Deleted and player blocked')}>Delete + block player</button>
            </div>
          </article>
        ))}
      </section>

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

      <HighlightsAdmin run={run} />

      <section className="card">
        <h2 className="section-title">Results</h2>
        <p className="hint">Games settle automatically after full time. Use this if the results look stuck.</p>
        <button className="btn btn-ghost btn-sm" onClick={() => run(() => api('/api/admin/sync', { method: 'POST' }), 'Synced')}>Sync and settle now</button>
      </section>
    </div>
  );
}
