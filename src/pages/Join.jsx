import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Spinner, ErrorBox } from '../components/Bits';
import Landing from './Landing';

// Invite links: /join/ABC123. Remembers the code through sign-in and onboarding.
export default function Join() {
  const { code } = useParams();
  const { user, loading, needsProfile, canSocial } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const tried = useRef(false);

  useEffect(() => {
    try { localStorage.setItem('igi-join', code.toUpperCase()); } catch { /* ignore */ }
  }, [code]);

  useEffect(() => {
    if (loading || !user || needsProfile || !canSocial || tried.current) return;
    tried.current = true;
    api('/api/leagues/join', { method: 'POST', body: { code } })
      .then((r) => {
        try { localStorage.removeItem('igi-join'); } catch { /* ignore */ }
        navigate(`/leagues/${r.code}`, { replace: true });
      })
      .catch(setError);
  }, [loading, user, needsProfile, canSocial, code, navigate]);

  if (loading) return <Spinner />;
  if (!user) return <Landing />;
  if (needsProfile) return <Navigate to="/welcome" replace />;
  if (!canSocial) return <Navigate to="/leagues" replace />;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  return <Spinner label="Joining league…" />;
}
