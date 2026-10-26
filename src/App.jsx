import { createContext, useContext, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { Target, Trophy, Radio, UserRound, Shield } from 'lucide-react';
import { SessionProvider, useSession } from './lib/session';
import { useMatches, useTicker } from './lib/hooks';
import { ToastProvider } from './components/Toast';
import Avatar from './components/Avatar';
import { Spinner } from './components/Bits';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Predict from './pages/Predict';
import Leagues from './pages/Leagues';
import League from './pages/League';
import Join from './pages/Join';
import Live from './pages/Live';
import Me from './pages/Me';
import Parent from './pages/Parent';

const Admin = lazy(() => import('./pages/Admin'));

// The Premier League feed, shared by the ticker, Predict and Leagues.
const GameMatches = createContext(null);
export const useGameMatches = () => useContext(GameMatches);

function Ticker({ matches }) {
  const { data: ticker } = useTicker();
  const live = (matches || []).filter((m) => m.status === 'live');
  const message = ticker?.active ? ticker.message : null;
  if (!live.length && !message) return null;
  const items = [
    ...(message ? [<span key="msg" className="ticker-msg">📢 {message}</span>] : []),
    ...live.map((m) => (
      <span key={m.id} className="ticker-item">
        {m.home.tla} <b>{m.score?.home}–{m.score?.away}</b> {m.away.tla}
        <small>{m.paused ? 'HT' : m.minute ? `${m.minute}'` : 'LIVE'}</small>
      </span>
    )),
  ];
  return (
    <div className="ticker" aria-label="Live scores">
      {live.length > 0 && <span className="live-pill">LIVE</span>}
      <div className="ticker-track"><div className="ticker-run">{items}</div></div>
    </div>
  );
}

const NAV = [
  { to: '/predict', label: 'Predict', icon: Target },
  { to: '/leagues', label: 'Leagues', icon: Trophy },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/me', label: 'Me', icon: UserRound },
];

function Shell({ children }) {
  const { user, profile, isAdmin } = useSession();
  const matches = useMatches('PL');
  const anyLive = matches.data?.matches?.some((m) => m.status === 'live');
  const home = user ? '/predict' : '/';
  return (
    <GameMatches.Provider value={matches}>
      <div className="shell">
        <header className="topbar">
          <Link to={home} className="brand" aria-label="ItsGoneIn home">ITS<span>GONE</span>IN<i>.</i></Link>
          <div className="topbar-right">
            {isAdmin && <Link to="/admin" className="icon-btn" aria-label="Admin"><Shield size={20} /></Link>}
            {profile ? (
              <Link to="/me" className="topbar-me" aria-label="Your profile">
                <span className="lvl">LV {profile.stats?.level || 1}</span>
                <Avatar user={profile} size={32} />
              </Link>
            ) : !user && <Link to="/" className="btn btn-sm">Sign in</Link>}
          </div>
        </header>
        <Ticker matches={matches.data?.matches} />
        <nav className="nav" aria-label="Main">
          <Link to={home} className="brand nav-brand">ITS<span>GONE</span>IN<i>.</i></Link>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
              <span className="nav-icon">
                <Icon size={22} strokeWidth={2.2} />
                {to === '/live' && anyLive && <i className="nav-dot" />}
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="main">{children}</main>
      </div>
    </GameMatches.Provider>
  );
}

function Guard({ children, needSignIn = true }) {
  const { user, loading, needsProfile } = useSession();
  const loc = useLocation();
  if (loading && (needSignIn || user === undefined)) return <Spinner />;
  if (needSignIn && !user) return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  if (user && needsProfile) return <Navigate to="/welcome" replace />;
  return children;
}

function Home() {
  const { user, loading, needsProfile } = useSession();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={needsProfile ? '/welcome' : '/predict'} replace />;
  return <Landing />;
}

function OnboardingRoute() {
  const { user, loading, needsProfile } = useSession();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  if (!needsProfile) return <Navigate to="/predict" replace />;
  return <Onboarding />;
}

const inShell = (el, needSignIn = true) => <Shell><Guard needSignIn={needSignIn}>{el}</Guard></Shell>;

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/welcome" element={<OnboardingRoute />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/parent/:token" element={<Shell><Parent /></Shell>} />
            <Route path="/predict" element={inShell(<Predict />)} />
            <Route path="/leagues" element={inShell(<Leagues />)} />
            <Route path="/leagues/:code" element={inShell(<League />)} />
            <Route path="/live" element={inShell(<Live />, false)} />
            <Route path="/me" element={inShell(<Me />)} />
            <Route path="/admin" element={inShell(<Suspense fallback={<Spinner />}><Admin /></Suspense>)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
