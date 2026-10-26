// Small shared pieces.
export function Spinner({ label = 'Loading…' }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" /><span className="sr-only">{label}</span></div>;
}

export function Empty({ emoji = '⚽', title, children }) {
  return (
    <div className="empty">
      <div className="empty-emoji" aria-hidden="true">{emoji}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-emoji" aria-hidden="true">📡</div>
      <h3>Couldn't load that</h3>
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children}
    </header>
  );
}
