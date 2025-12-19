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
  
  // PREDICTIONS STATE
  const [predictedMatches, setPredictedMatches] = useState(() => {
    const saved = localStorage.getItem('userPredictions');
    return saved ? JSON.parse(saved) : {};
  });
  
  // NEW: Store community votes from DB { matchId: { home: 10, draw: 2, away: 5 } }
  const [communityVotes, setCommunityVotes] = useState({});

  // --- CONFIG ---
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

  const newsFeed = [
    { id: 1, tag: 'RUMOR', title: 'Mbappé to Liverpool? Agent spotted in London.', time: '2h ago', img: '🔥' },
    { id: 2, tag: 'VIRAL', title: 'Haaland breaks another robot record.', time: '4h ago', img: '🤖' },
  ];

  // --- 1. AUTH & REALTIME LISTENERS ---
  useEffect(() => {
    // Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const banRef = doc(db, "banned_users", u.uid);
          const banSnap = await getDoc(banRef);
          setIsBanned(banSnap.exists());
        } catch (e) { console.error(e); }
      }
      try {
        const docRef = doc(db, "polls", "week_1");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setVoteOptions(prev => prev.map(opt => ({ ...opt, votes: data[opt.id] || opt.votes })));
        }
      } catch (e) { console.error(e); }
    });

    // Chat Listener
    const q = query(collection(db, "messages"), orderBy("createdAt"), limit(50));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      dummyDiv.current?.scrollIntoView({ behavior: 'smooth' });
    });

    // NEW: Match Votes Listener (Real-time Percentages)
    const unsubscribeVotes = onSnapshot(collection(db, "match_votes"), (snapshot) => {
      const votes = {};
      snapshot.docs.forEach(doc => {
        votes[doc.id] = doc.data();
      });
      setCommunityVotes(votes);
    });

    return () => { unsubscribeAuth(); unsubscribeChat(); unsubscribeVotes(); };
  }, []);

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    const activeData = leagues.find(l => l.id === activeLeague);
    if (activeData) {
      document.documentElement.style.setProperty('--primary', activeData.color);
      document.documentElement.style.setProperty('--accent', activeData.accent);
    }

    const loadLeagueData = async () => {
      setLoading(true);
      setTableData([]); setScorersData([]); setFixturesData([]);

      try {
        const resTable = await fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=standings`);
        const jsonTable = await resTable.json();
        if (jsonTable.response && jsonTable.response[0]) {
          const standingsRaw = jsonTable.response[0].league.standings[0];
          setTableData(standingsRaw.map(t => ({
            rank: t.rank, id: t.team.id, name: t.team.name, crest: t.team.logo,
            played: t.all.played, won: t.all.win, draw: t.all.draw, lost: t.all.lose, pts: t.points, form: t.form 
          })));
        }

        const resScorers = await fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=scorers`);
        const jsonScorers = await resScorers.json();
        if (jsonScorers.response) {
          setScorersData(jsonScorers.response.map((s, i) => ({
            rank: i + 1, name: s.player.name, team: s.statistics[0].team.name, goals: s.statistics[0].goals.total, photo: s.player.photo
          })));
        }

        const resFixtures = await fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=fixtures`);
        const jsonFixtures = await resFixtures.json();
        if (jsonFixtures.response) {
          setFixturesData(jsonFixtures.response.map(f => ({
            id: f.fixture.id,
            date: new Date(f.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            time: new Date(f.fixture.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            home: f.teams.home.name, homeCrest: f.teams.home.logo, away: f.teams.away.name, awayCrest: f.teams.away.logo
          })));
        }

      } catch (err) { console.error("API Error:", err); }
      setLoading(false);
    };

    loadLeagueData();
  }, [activeLeague]);

  // --- ACTIONS ---
  const handleDeleteMessage = async (msgId) => {
    if (window.confirm("Admin: Delete this message?")) await deleteDoc(doc(db, "messages", msgId));
  };

  const handleBlockUser = async (uid, name) => {
    if (window.confirm(`Admin: PERMANENTLY BAN ${name}?`)) {
      await setDoc(doc(db, "banned_users", uid), { bannedAt: serverTimestamp(), bannedBy: user.email });
      alert(`${name} has been banned.`);
    }
  };

  // PREDICTION LOGIC
  const handlePredict = (matchId, selection) => {
    // Update Local State
    const newPredictions = { ...predictedMatches, [matchId]: selection };
    setPredictedMatches(newPredictions);
    localStorage.setItem('userPredictions', JSON.stringify(newPredictions));

    // Update DB
    if (user) {
      let dbSelection = 'draw';
      if (selection === '1') dbSelection = 'home';
      if (selection === '2') dbSelection = 'away';
      
      const matchRef = doc(db, "match_votes", String(matchId));
      setDoc(matchRef, { [dbSelection]: increment(1) }, { merge: true }).catch(console.error);
    }
  };

  // Helper to get percentages for a match
  const getMatchStats = (matchId) => {
    const votes = communityVotes[matchId];
    if (!votes) return { home: 0, draw: 0, away: 0, total: 0 };
    
    const h = votes.home || 0;
    const d = votes.draw || 0;
    const a = votes.away || 0;
    const total = h + d + a;
    
    if (total === 0) return { home: 0, draw: 0, away: 0, total: 0 };

    return {
      home: Math.round((h / total) * 100),
      draw: Math.round((d / total) * 100),
      away: Math.round((a / total) * 100),
      total
    };
  };

  const handleVote = async (optionId) => {
    if (hasVoted || isBanned) return; 
    setVoteOptions(prev => prev.map(o => o.id === optionId ? { ...o, votes: o.votes + 1 } : o));
    setHasVoted(true);
    await setDoc(doc(db, "polls", "week_1"), { [optionId]: increment(1) }, { merge: true });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || isBanned) return;
    await addDoc(collection(db, "messages"), {
      text: newMessage, createdAt: serverTimestamp(), uid: user.uid, photoURL: user.photoURL, displayName: user.displayName
    });
    setNewMessage('');
  };

  const getTotalVotes = () => voteOptions.reduce((acc, curr) => acc + curr.votes, 0);
  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };

  return (
     <div className="app-container">
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-wrapper">
           <div className="ticker-content">
              <span>Man City <b className="score">3-1</b> Arsenal</span>
              <span>Real Madrid <b className="score">2-0</b> Barcelona</span>
              <span>Bayern <b className="score">4-0</b> Dortmund</span>
              <span>Man City <b className="score">3-1</b> Arsenal</span>
           </div>
        </div>
      </div>

      <div className="dashboard-grid">
  <nav className="side-nav">
    <div className="brand">ITS<span className="accent">GONE</span>IN.</div>
    
    {/* 1. LEAGUES SECTION */}
    <div className="nav-group">
      <label>LEAGUES</label>
      {leagues.map(l => (
        <div 
          key={l.id} 
          className={`nav-item ${activeLeague === l.id && currentView === 'DASHBOARD' ? 'active' : ''}`} 
          onClick={() => {setActiveLeague(l.id); setCurrentView('DASHBOARD');}}
        >
          <span className="nav-icon">{l.icon}</span>
          <span className="nav-text">{l.name}</span>
        </div>
      ))}
    </div>

    {/* 2. COMMUNITY / FORUM SECTION */}
    <div className="nav-group">
      <label>COMMUNITY</label>
      <div 
        className={`nav-item ${currentView === 'FORUM' ? 'active' : ''}`} 
        onClick={() => setCurrentView('FORUM')}
      >
        <span className="nav-icon">💬</span>
        <span className="nav-text">Forum</span>
      </div>
    </div>

    {/* 3. MOBILE USER CARD (Hidden on Desktop, Shows on Mobile Nav) */}
    <div className="nav-group mobile-only-user">
      <div className="nav-item" onClick={() => { if(!user) handleGoogleLogin() }}>
        {user ? (
          <>
            <img src={user.photoURL} className="nav-icon small-avatar" alt="" />
            <span className="nav-text" onClick={() => signOut(auth)}>Log Out</span>
          </>
        ) : (
          <>
            <span className="nav-icon">👤</span>
            <span className="nav-text">Login</span>
          </>
        )}
      </div>
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
                {scorersData.length > 0 && activeTab !== 'FIXTURES' && (
                  <div className="spotlight-card">
                    <div className="spotlight-info"><span className="badge">GOLDEN BOOT RACE</span><h3>{scorersData[0].name}</h3><p>{scorersData[0].team}</p></div>
                    <div className="spotlight-stat"><span className="big-num">{scorersData[0].goals}</span><span className="label">GOALS</span></div>
                  </div>
                )}
                
                <div className="data-container">
                  {loading && <div style={{padding:40, textAlign:'center'}}>Loading...</div>}
                  
                  {!loading && activeTab === 'TABLE' && (
                    <table className="modern-table">
                      <thead><tr><th width="40">#</th><th>CLUB</th><th>MP</th><th>W/D/L</th><th className="text-right">PTS</th></tr></thead>
                      <tbody>{tableData.map(t => (
                        <tr key={t.id}><td className="rank">{t.rank}</td><td><div className="team-flex"><img src={t.crest} alt=""/><span>{t.name}</span></div></td><td style={{color:'var(--text-dim)'}}>{t.played}</td><td className="form-mini"><span className="w">{t.won}</span>/<span style={{color:'var(--text-dim)'}}>{t.draw}</span>/<span className="l">{t.lost}</span></td><td className="pts">{t.points}</td></tr>
                      ))}</tbody>
                    </table>
                  )}
                  {!loading && activeTab === 'SCORERS' && (
                    <div className="scorers-list">{scorersData.map((s) => (<div key={s.name} className="list-row"><div className="rank-badge">{s.rank}</div><div className="list-info"><span className="list-name">{s.name}</span><span className="list-sub">{s.team}</span></div><div className="list-stat"><span className="stat-val">{s.goals}</span></div></div>))}</div>
                  )}
                  
                  {/* --- FIXTURES WITH PREDICTIONS --- */}
                  {!loading && activeTab === 'FIXTURES' && (
                    <div className="fixtures-list">{fixturesData.map((f) => {
                      const stats = getMatchStats(f.id);
                      const userVoted = predictedMatches[f.id];

                      return (
                      <div key={f.id} className="fixture-row">
                        <div className="fixture-date"><span className="date">{f.date}</span><span className="time">{f.time}</span></div>
                        
                        <div className="fixture-center-group">
                          <div className="fixture-matchup">
                            <div className="team home"><span>{f.home}</span><img src={f.homeCrest} alt=""/></div>
                            <div className="vs-badge">VS</div>
                            <div className="team away"><img src={f.awayCrest} alt=""/><span>{f.away}</span></div>
                          </div>
                          
                          <div className="prediction-wrapper">
                            <div className="prediction-bar">
                              <button className={`pred-btn ${userVoted === '1' ? 'active' : ''}`} onClick={() => handlePredict(f.id, '1')}>1</button>
                              <button className={`pred-btn ${userVoted === 'X' ? 'active' : ''}`} onClick={() => handlePredict(f.id, 'X')}>X</button>
                              <button className={`pred-btn ${userVoted === '2' ? 'active' : ''}`} onClick={() => handlePredict(f.id, '2')}>2</button>
                            </div>

                            {/* COMMUNITY STATS (Only visible after voting) */}
                            {userVoted && (
                              <div className="community-stats fade-in">
                                <div className="stat-label" style={{textAlign:'left'}}>{stats.home}%</div>
                                <div className="stat-label" style={{textAlign:'center'}}>{stats.draw}%</div>
                                <div className="stat-label" style={{textAlign:'right'}}>{stats.away}%</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )})}</div>
                  )}
                </div>
              </div>
            </>
          )}

           {currentView === 'FORUM' && (
            <div className="chat-interface">
              <header className="feed-header"><div className="header-title"><h1>Ultras Forum</h1><span>Live Community Chat</span></div></header>
              <div className="chat-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.uid === user?.uid ? 'sent' : 'received'}`}>
                    <img src={msg.photoURL} alt="" className="chat-avatar" />
                    <div className="message-content">
                      <div className="msg-header">
                        <span className="msg-author">{msg.displayName}</span>
                        {user?.email === ADMIN_EMAIL && (
                          <div className="admin-controls">
                            <span className="admin-btn delete" onClick={() => handleDeleteMessage(msg.id)} title="Delete Msg">✖</span>
                            <span className="admin-btn block" onClick={() => handleBlockUser(msg.uid, msg.displayName)} title="Ban User">🚫</span>
                          </div>
                        )}
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={dummyDiv}></div>
               </div>
              <form onSubmit={handleSendMessage} className="chat-input-area">
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={isBanned ? "⛔️ You have been banned." : (user ? "Type a message..." : "Login to chat")} disabled={!user || isBanned}/>
                <button type="submit" disabled={!user || isBanned}>SEND</button>
              </form>
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
           <div className="widget-box vote-box">
            <div className="widget-header"><h3>PLAYER OF THE WEEK</h3><span className="live-dot">VOTING LIVE</span></div>
            <div className="vote-list">
              {voteOptions.map(v => {
                 const total = getTotalVotes();
                 const perc = total > 0 ? Math.round((v.votes / total) * 100) : 0;
                 return (
                   <div key={v.id} className={`vote-item ${hasVoted ? 'voted' : ''}`} onClick={() => handleVote(v.id)}>
                     {hasVoted && <div className="vote-bar" style={{width: `${perc}%`}}></div>}
                     <div className="vote-content-row"><div className="vote-info"><span>{v.name}</span><small>{v.team}</small></div>{hasVoted && <div className="vote-perc">{perc}%</div>}</div>
                   </div>
                 )
              })}
            </div>
           </div>
          <div className="widget-box news-box">
            <h3>LATEST DROPS</h3>
            {newsFeed.map(news => (
              <div key={news.id} className="news-item"><div className="news-icon">{news.img}</div><div className="news-content"><span className={`tag ${news.tag}`}>{news.tag}</span><p>{news.title}</p><small>{news.time}</small></div></div>
            ))}
          </div>
        </aside>
      </div>
    {/* ✅ ADD THE BUTTON HERE */}
      <button 
        className="forum-fab" 
        onClick={() => setCurrentView('FORUM')}
        title="Open Community Forum"
      >
        💬
      </button>
    </div>
  );
};

export default App;