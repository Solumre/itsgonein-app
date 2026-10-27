import { useRef, useState } from 'react';
import { Minus, Plus, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useApi, useNow } from '../lib/hooks';
import { BONUS_MAX } from '../lib/game';
import { countdown } from '../lib/format';
import { useToast } from './Toast';

function answerLabel(q, value) {
  if (value == null) return 'No answer';
  if (q.type === 'number') return String(value);
  return q.options.find((o) => o.id === value)?.label ?? '–';
}

function correctLabel(q, correct) {
  if (q.id === 'goals') return `${correct.goals} goals`;
  if (q.id === 'goalfest') return correct.goalfest.map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ');
  if (q.id === 'nil') return correct.nil === 'yes' ? 'Yes' : 'No';
  if (q.id === 'custom') return correct.custom ? answerLabel(q, correct.custom) : 'Waiting for the answer';
  return '';
}

function Question({ q, value, onChange, locked, result }) {
  const pts = result?.points?.[q.id];
  const settled = result && (q.id !== 'custom' || !result.customPending);
  return (
    <div className={`bq${settled ? (pts > 0 ? ' right' : ' wrong') : ''}`}>
      <div className="bq-head">
        <p className="bq-text">{q.text}</p>
        <span className="bq-hint">{settled ? (pts > 0 ? `✅ +${pts}` : '❌ 0') : q.hint}</span>
      </div>
      {locked ? (
        <p className="bq-locked">
          You said <b>{answerLabel(q, value)}</b>
          {result && <> · Answer: <b>{correctLabel(q, result.correct)}</b></>}
        </p>
      ) : q.type === 'number' ? (
        <div className="bq-number">
          <button type="button" className="icon-btn" aria-label="One fewer" disabled={value == null || value <= 0} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}><Minus size={18} /></button>
          <output aria-label="Your answer">{value ?? '–'}</output>
          <button type="button" className="icon-btn" aria-label="One more" disabled={value >= q.max} onClick={() => onChange(value == null ? 25 : value + 1)}><Plus size={18} /></button>
        </div>
      ) : (
        <div className="bq-options" role="radiogroup" aria-label={q.text}>
          {q.options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={`chip${value === o.id ? ' on' : ''}`} onClick={() => onChange(o.id)}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Bonus questions for a Premier League gameweek, on the Predict tab.
export default function BonusCard({ matchday }) {
  const { data, reload } = useApi(`/api/bonus?matchday=${matchday}`);
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  const toast = useToast();
  const now = useNow(30_000);
  if (!data || data.matchday !== matchday) return null;

  const answers = { ...data.answers, ...draft };
  const locked = data.locked || data.lockAt <= now;
  const answered = data.questions.filter((q) => answers[q.id] != null).length;

  const change = (id, value) => {
    const next = { ...answers, [id]: value };
    setDraft(next);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api('/api/bonus', { method: 'POST', body: { matchday, answers: next } });
        setSaved(true);
      } catch (e) {
        toast(e.message, 'bad');
        setDraft({});
        reload();
      }
    }, 600);
  };

  return (
    <section className="card bonus-card">
      <header className="bonus-head">
        <div>
          <span className="eyebrow">Gameweek {matchday}</span>
          <h2>⭐ Bonus questions</h2>
        </div>
        <span className="bonus-score">
          {data.result ? <><b>+{data.result.total}</b> pts</> : <>up to <b>+{BONUS_MAX}</b></>}
        </span>
      </header>
      {data.questions.map((q) => (
        <Question key={q.id} q={q} value={answers[q.id]} locked={locked} result={data.result} onChange={(v) => change(q.id, v)} />
      ))}
      <footer className="bonus-foot">
        {locked
          ? <span><Lock size={13} /> {data.result ? (data.result.customPending ? 'Scored — the extra question is still to be marked' : 'Scored') : 'Locked until the gameweek finishes'}</span>
          : <span><Lock size={13} /> Locks in {countdown(data.lockAt - now)} · {answered}/{data.questions.length} answered</span>}
        {saved && !locked && <span className="saved">Saved ✓</span>}
      </footer>
    </section>
  );
}
