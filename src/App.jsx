import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  doc, getDoc, setDoc, increment, collection, addDoc, query, orderBy, 
  onSnapshot, limit, serverTimestamp, deleteDoc 
} from 'firebase/firestore';

const App = () => {
  const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php';
  const ADMIN_EMAIL = "tm@solumre.com"; 

  // --- STATE ---
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [activeTab, setActiveTab] = useState('TABLE');
  
  const [activeLeague, setActiveLeague] = useState(39); 
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [isBanned, setIsBanned] = useState(false);

  // --- MATCH CENTER STATE ---
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [matchCenterData, setMatchCenterData] = useState(null);

  // --- FLASH & SOUND STATE ---
  const [isFlashing, setIsFlashing] = useState(false);
   const prevGoalsRef = useRef(0);
  const goalSound = new Audio('https://www.myinstants.com/media/sounds/goal-horn.mp3');

  // --- DATA ---
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  
  // --- CHAT & VOTES ---
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const dummyDiv = useRef(null); 
  const [hasVoted, setHasVoted] = useState(false);
  const [voteOptions, setVoteOptions] = useState([
    { id: 'bellingham', name: 'Bellingham', team: 'Real Madrid', votes: 45 },
    { id: 'saka', name: 'Saka', team: 'Arsenal', votes: 32 },
    { id: 'kane', name: 'Kane', team: 'Bayern', votes: 28 },
  ]);
  
  const [predictedMatches, setPredictedMatches] = useState(() => {
    const saved = localStorage.getItem('userPredictions');
    return saved ? JSON.parse(saved) : {};
  });
  const [communityVotes, setCommunityVotes] = useState({});

  // Mock data for ticker - in production, this should update from your API
  const tickerData = [
    { id: 1, home: "Man City", away: "Arsenal", goals: { home: 3, away: 1 } },
    { id: 2, home: "Real Madrid", away: "Barcelona", goals: { home: 2, away: 0 } },
    { id: 3, home: "Bayern", away: "Dortmund", goals: { home: 4, away: 0 } }
  ];

  const leagues = [
    { id: 39, name: 'Premier League', icon: '🦁', color: '#3d195b', accent: '#00ff85' },
    { id: 140, name: 'La Liga', icon: '🇪🇸', color: '#ee8707', accent: '#ffffff' },
    { id: 78, name: 'Bundesliga', icon: '🇩🇪', color: '#d20515', accent: '#ffffff' },
    { id: 135, name: 'Serie A', icon: '🇮🇹', color: '#008fd7', accent: '#00ff85' },
    { id: 61, name: 'Ligue 1', icon: '🇫🇷', color: '#dae025', accent: '#12233f' },
    { id: 88, name: 'Eredivisie', icon: '🇳🇱', color: '#00366d', accent: '#ffffff' },
    { id: 71, name: 'Brasileirão', icon: '🇧🇷', color: '#fcbf00', accent: '#009c3b' },
    { id: 94, name: 'Primeira Liga', icon: '🇵🇹', color: '#e83838', accent: '#f5ce42' }
  ];

  // --- MATCH CENTER AUTO-REFRESH ---
  useEffect(() => {
    let interval;
    const fetchMatchUpdate = async () => {
      if (!selectedMatchId || currentView !== 'MATCH_CENTER') return;
      try {
        const res = await fetch(`${PHP_PROXY_URL}?type=match_details&match_id=${selectedMatchId}`);
        const json = await res.json();
        if (json.response) {
          setMatchCenterData(json.response);
        }
      } catch (err) { console.error("Match Refresh Error:", err); }
    };

    if (currentView === 'MATCH_CENTER') {
      fetchMatchUpdate();
      interval = setInterval(fetchMatchUpdate, 60000); // 60s Refresh
    }
    return () => clearInterval(interval);
  }, [currentView, selectedMatchId]);

  // --- GOAL FLASH TRIGGER ---
  useEffect(() => {
    const currentTotalGoals = tickerData.reduce((sum, m) => sum + m.goals.home + m.goals.away, 0);
     if (currentTotalGoals > prevGoalsRef.current && prevGoalsRef.current !== 0) {
      setIsFlashing(true);
      goalSound.play().catch(e => console.log("Audio block:", e));
      setTimeout(() => setIsFlashing(false), 1500);
    }
    prevGoalsRef.current = currentTotalGoals;
  }, [tickerData]);

  // --- AUTH & LISTENERS ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const banRef = doc(db, "banned_users", u.uid);
        const banSnap = await getDoc(banRef);
        setIsBanned(banSnap.exists());
      }
    });

    const q = query(collection(db, "messages"), orderBy("createdAt"), limit(50));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      dummyDiv.current?.scrollIntoView({ behavior: 'smooth' });
    });

    const unsubscribeVotes = onSnapshot(collection(db, "match_votes"), (snapshot) => {
      const votes = {};
      snapshot.docs.forEach(doc => { votes[doc.id] = doc.data(); });
      setCommunityVotes(votes);
    });

    return () => { unsubscribeAuth(); unsubscribeChat(); unsubscribeVotes(); };
  }, []);

  // --- DATA FETCHING ---
  useEffect(() => {
    const activeData = leagues.find(l => l.id === activeLeague);
    if (activeData) {
      document.documentElement.style.setProperty('--primary', activeData.color);
      document.documentElement.style.setProperty('--accent', activeData.accent);
    }

    const loadLeagueData = async () => {
      setLoading(true);
      try {
        const resTable = await fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=standings`);
        const jsonTable = await resTable.json();
        if (jsonTable.response?.[0]) {
          const standingsRaw = jsonTable.response[0].league.standings[0];
          setTableData(standingsRaw.map(t => ({
            rank: t.rank, id: t.team.id, name: t.team.name, crest: t.team.logo,
            played: t.all.played, won: t.all.win, draw: t.all.draw, lost: t.all.lose, pts: t.points, form: t.form 
          })));
        }

        const resFixtures = await fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=fixtures`);
        const jsonFixtures = await resFixtures.json();
        if (jsonFixtures.response) {
          setFixturesData(jsonFixtures.response.map(f => ({
            id: f.fixture.id,
            date: new Date(f.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            time: new Date(f.fixture.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            home: f.teams.home.name, homeCrest: f.teams.home.logo, 
            away: f.teams.away.name, awayCrest: f.teams.away.logo
          })));
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    loadLeagueData();
  }, [activeLeague]);

  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };

  return (
     <div className={`app-container ${isFlashing ? 'goal-flash' : ''}`}>
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-wrapper">
           <div className="ticker-content">
              {tickerData.map(m => (
                <span key={m.id}>{m.home} <b className="score">{m.goals.home}-{m.goals.away}</b> {m.away}</span>
              ))}
           </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <nav className="side-nav">
          <div className="brand">ITS<span className="accent">GONE</span>IN.</div>
          <div className="nav-group">
            <label>LEAGUES</label>
            {leagues.map(l => (
              <div key={l.id} className={`nav-item ${activeLeague === l.id && currentView === 'DASHBOARD' ? 'active' : ''}`} onClick={() => {setActiveLeague(l.id); setCurrentView('DASHBOARD');}}>
                <span className="nav-icon">{l.icon}</span><span className="nav-text">{l.name}</span>
              </div>
            ))}
          </div>
         </nav>

        <main className="main-feed">
          {currentView === 'DASHBOARD' && (
            <>
              <header className="feed-header">
                <div className="header-title"><h1>{leagues.find(l => l.id === activeLeague)?.name}</h1><span>Season 2023/24</span></div>
                <div className="tabs">
                  <button className={`tab-btn ${activeTab === 'TABLE' ? 'active' : ''}`} onClick={()=>setActiveTab('TABLE')}>STANDINGS</button>
                  <button className={`tab-btn ${activeTab === 'SCORERS' ? 'active' : ''}`} onClick={()=>setActiveTab('SCORERS')}>SCORERS</button>
                  <button className={`tab-btn ${activeTab === 'FIXTURES' ? 'active' : ''}`} onClick={()=>setActiveTab('FIXTURES')}>FIXTURES</button>
                </div>
              </header>
              <div className="feed-content">
                 <div className="data-container">
                  {loading ? <div style={{padding:40, textAlign:'center'}}>Loading...</div> : (
                    activeTab === 'TABLE' && (
                      <table className="modern-table">
                        <thead><tr><th>#</th><th>CLUB</th><th>MP</th><th>W/D/L</th><th className="text-right">PTS</th></tr></thead>
                        <tbody>{tableData.map(t => (
                          <tr key={t.id}><td className="rank">{t.rank}</td><td><div className="team-flex"><img src={t.crest} alt=""/><span>{t.name}</span></div></td><td>{t.played}</td><td className="form-mini"><span className="w">{t.won}</span>/{t.draw}/<span className="l">{t.lost}</span></td><td className="pts">{t.pts}</td></tr>
                        ))}</tbody>
                      </table>
                    )
                  )}
                  {activeTab === 'FIXTURES' && (
                    <div className="fixtures-list">
                      {fixturesData.map(f => (
                        <div key={f.id} className="fixture-row" onClick={() => { setSelectedMatchId(f.id); setCurrentView('MATCH_CENTER'); }}>
                          <div className="fixture-date"><span>{f.date}</span><span>{f.time}</span></div>
                          <div className="fixture-matchup">
                            <div className="team home"><span>{f.home}</span><img src={f.homeCrest} alt=""/></div>
                            <div className="vs-badge">VS</div>
                            <div className="team away"><img src={f.awayCrest} alt=""/><span>{f.away}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {currentView === 'MATCH_CENTER' && matchCenterData && (
            <div className="match-center">
              <header className="feed-header">
                <button className="back-btn" onClick={() => setCurrentView('DASHBOARD')}>← Back</button>
                <div className="header-title">
                  <h1>{matchCenterData.match.home} vs {matchCenterData.match.away}</h1>
                  <span className="live-dot">LIVE UPDATING</span>
                </div>
              </header>
              <div className="feed-content">
                <div className="match-hero spotlight-card">
                  <div className="team home">
                    <img src={matchCenterData.match.homeLogo} alt="" />
                    <h3>{matchCenterData.match.home}</h3>
                  </div>
                  <div className="big-num">{matchCenterData.match.score}</div>
                  <div className="team away">
                    <h3>{matchCenterData.match.away}</h3>
                    <img src={matchCenterData.match.awayLogo} alt="" />
                  </div>
                </div>
                <div className="timeline-container data-container">
                  {matchCenterData.timeline.map((event, idx) => (
                    <div key={idx} className="timeline-event fade-in">
                      <span className="event-time">{event.time}</span>
                      <span className="event-icon">{event.icon}</span>
                      <p>{event.detail}</p>
                    </div>
                  ))}
                  {matchCenterData.timeline.length === 0 && <div style={{padding:40, textAlign:'center'}}>Match in progress...</div>}
                </div>
              </div>
            </div>
          )}

          {currentView === 'FORUM' && (
            <div className="chat-interface">
              <header className="feed-header"><div className="header-title"><h1>Ultras Forum</h1></div></header>
              {/* Chat messages would go here */}
            </div>
          )}
        </main>

        <aside className="hype-zone">
          <div className="user-card">
            {user ? (
              <div className="logged-in"><img src={user.photoURL} className="avatar-img" alt=""/><div className="user-info"><h4>{user.displayName}</h4><button onClick={() => signOut(auth)} className="logout-btn">Log Out</button></div></div>
            ) : (
               <div className="login-prompt"><p>Join the community</p><button onClick={handleGoogleLogin} className="google-btn">Login with Google</button></div>
            )}
          </div>
         </aside>
      </div>

      <button className={`forum-fab ${isFlashing ? 'goal-pulse' : ''}`} onClick={() => setCurrentView('FORUM')} title="Open Community Forum">
        {isFlashing ? '⚽️' : '💬'}
      </button>
    </div>
  );
};

export default App;