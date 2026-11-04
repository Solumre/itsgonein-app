import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useApi } from '../lib/hooks';
import { ago } from '../lib/format';
import { useToast } from '../components/Toast';
import { Spinner, ErrorBox, PageHead, Empty } from '../components/Bits';
import HighlightsAdmin from '../components/HighlightsAdmin';
import { EditorTools, QuizBank } from '../components/EditorTools';
import EditorsAdmin from '../components/EditorsAdmin';

const REASONS = { mean: 'Mean / bullying', personal_info: 'Personal info', inappropriate: 'Inappropriate', spam: 'Spam', other: 'Other' };

export default function Admin() {
  const { isAdmin } = useSession();
  const { data, error, loading, reload } = useApi(isAdmin ? '/api/admin/overview' : null, { refresh: 60_000 });
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

      <EditorTools run={run} />
      <QuizBank run={run} />
      <EditorsAdmin run={run} />

      <HighlightsAdmin run={run} />

      <section className="card">
        <h2 className="section-title">Results</h2>
        <p className="hint">Games settle automatically after full time. Use this if the results look stuck.</p>
        <button className="btn btn-ghost btn-sm" onClick={() => run(() => api('/api/admin/sync', { method: 'POST' }), 'Synced')}>Sync and settle now</button>
      </section>
    </div>
  );
}
