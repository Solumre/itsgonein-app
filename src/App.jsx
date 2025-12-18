import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, increment, collection, addDoc, query, orderBy, onSnapshot, limit, serverTimestamp } from 'firebase/firestore';

const App = () => {
  const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php';
  
  // NAVIGATION STATE
  const [currentView, setCurrentView] = useState('DASHBOARD'); // 'DASHBOARD' or 'FORUM'
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState(39); 
  const [loading, setLoading] = useState(false);
   const [user, setUser] = useState(null);

  // DATA STATES
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  
  // CHAT STATES
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const dummyDiv = useRef(null); // Auto-scroll to bottom

  // VOTING STATE
  const [hasVoted, setHasVoted] = useState(false);
  const [voteOptions, setVoteOptions] = useState([
    { id: 'bellingham', name: 'Bellingham', team: 'Real Madrid', votes: 45 },
    { id: 'saka', name: 'Saka', team: 'Arsenal', votes: 32 },
    { id: 'kane', name: 'Kane', team: 'Bayern', votes: 28 },
  ]);

  const leagues = [
    { id: 39, name: 'Premier League', icon: '🦁' },
    { id: 140, name: 'La Liga', icon: '🇪🇸' },
    { id: 78, name: 'Bundesliga', icon: '🇩🇪' },
    { id: 135, name: 'Serie A', icon: '🇮🇹' },
    { id: 61, name: 'Ligue 1', icon: '🇫🇷' },
    { id: 88, name: 'Eredivisie', icon: '🇳🇱' },
    { id: 71, name: 'Brasileirão', icon: '🇧🇷' },
    { id: 94, name: 'Primeira Liga', icon: '🇵🇹' }
  ];

  const newsFeed = [
    { id: 1, tag: 'RUMOR', title: 'Mbappé to Liverpool? Agent spotted in London.', time: '2h ago', img: '🔥' },
    { id: 2, tag: 'VIRAL', title: 'Haaland breaks another robot record.', time: '4h ago', img: '🤖' },
  ];

  // 1. LISTENERS: AUTH + CHAT + VOTES
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      // Load Votes
      const docRef = doc(db, "polls", "week_1");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setVoteOptions(prev => prev.map(opt => ({ ...opt, votes: data[opt.id] || opt.votes })));
      }
    });

    // Load Chat Messages (Real-time)
    const q = query(collection(db, "messages"), orderBy("createdAt"), limit(50));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      dummyDiv.current?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => { unsubscribeAuth(); unsubscribeChat(); };
  }, []);

  useEffect(() => {
    if (currentView === 'DASHBOARD') fetchData(activeTab, activeLeague);
  }, [activeTab, activeLeague, currentView]);

  // 2. ACTIONS
  const handleVote = async (optionId) => {
    if (hasVoted) return;
    setVoteOptions(prev => prev.map(o => o.id === optionId ? { ...o, votes: o.votes + 1 } : o));
    setHasVoted(true);
    await setDoc(doc(db, "polls", "week_1"), { [optionId]: increment(1) }, { merge: true });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    await addDoc(collection(db, "messages"), {
      text: newMessage,
      createdAt: serverTimestamp(),
      uid: user.uid,
      photoURL: user.photoURL,
      displayName: user.displayName
    });
    setNewMessage('');
  };

  const getTotalVotes = () => voteOptions.reduce((acc, curr) => acc + curr.votes, 0);

  const fetchData = async (tab, leagueId) => {
    setLoading(true);
    try {
      // 1. Fetch Table
      const resTable = await fetch(`${PHP_PROXY_URL}?league=${leagueId}&type=standings`);
      const jsonTable = await resTable.json();
      if (jsonTable.response && jsonTable.response[0]) {
        const standingsRaw = jsonTable.response[0].league.standings[0];
        setTableData(standingsRaw.map(t => ({
          rank: t.rank, id: t.team.id, name: t.team.name, crest: t.team.logo,
          played: t.all.played, won: t.all.win, draw: t.all.draw, lost: t.all.lose, pts: t.points, form: t.form 
        })));
      }
      
      // 2. Fetch Scorers
      const resScorers = await fetch(`${PHP_PROXY_URL}?league=${leagueId}&type=scorers`);
      const jsonScorers = await resScorers.json();
      if (jsonScorers.response) {
        setScorersData(jsonScorers.response.map((s, i) => ({
          rank: i + 1, name: s.player.name, team: s.statistics[0].team.name, goals: s.statistics[0].goals.total, photo: s.player.photo
        })));
      }

      // 3. Fetch Fixtures
      if (tab === 'FIXTURES') {
        const resFixtures = await fetch(`${PHP_PROXY_URL}?league=${leagueId}&type=fixtures`);
        const jsonFixtures = await resFixtures.json();
        if (jsonFixtures.response) {
          setFixturesData(jsonFixtures.response.map(f => ({
            id: f.fixture.id,
            date: new Date(f.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            time: new Date(f.fixture.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            home: f.teams.home.name, homeCrest: f.teams.home.logo, away: f.teams.away.name, awayCrest: f.teams.away.logo
          })));
        }
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };

  return (
    <div className="app-container">
      {/* TICKER */}
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
        {/* SIDEBAR */}
        <nav className="side-nav">
          <div className="brand">ITS<span className="accent">GONE</span>IN.</div>
          <div className="nav-group">
            <label>LEAGUES</label>
            {leagues.map(l => (
              <div key={l.id} 
                className={`nav-item ${activeLeague === l.id && currentView === 'DASHBOARD' ? 'active' : ''}`} 
                onClick={() => {setActiveLeague(l.id); setCurrentView('DASHBOARD');}}
              >
                <span className="nav-icon">{l.icon}</span>
                <span className="nav-text">{l.name}</span>
              </div>
            ))}
          </div>
          <div className="nav-group">
            <label>COMMUNITY</label>
            <div className="nav-item">🔥 Trending</div>
            <div 
              className={`nav-item ${currentView === 'FORUM' ? 'active' : ''}`}
              onClick={() => setCurrentView('FORUM')}
            >
              <span className="nav-icon">💬</span> Forum
            </div>
          </div>
        </nav>

        {/* MAIN FEED: Switch between DASHBOARD and FORUM */}
        <main className="main-feed">
          
          {/* VIEW 1: DASHBOARD */}
          {currentView === 'DASHBOARD' && (
            <>
              <header className="feed-header">
                <div className="header-title">
                  <h1>{leagues.find(l => l.id === activeLeague)?.name}</h1>
                  <span>Season 2023/24</span>
                </div>
                <div className="tabs">
                  <button className={`tab-btn ${activeTab === 'TABLE' ? 'active' : ''}`} onClick={()=>setActiveTab('TABLE')}>STANDINGS</button>
                  <button className={`tab-btn ${activeTab === 'SCORERS' ? 'active' : ''}`} onClick={()=>setActiveTab('SCORERS')}>SCORERS</button>
                  <button className={`tab-btn ${activeTab === 'FIXTURES' ? 'active' : ''}`} onClick={()=>setActiveTab('FIXTURES')}>FIXTURES</button>
                </div>
              </header>

              <div className="feed-content">
                {activeTab !== 'FIXTURES' && scorersData.length > 0 && (
                  <div className="spotlight-card">
                    <div className="spotlight-info">
                      <span className="badge">GOLDEN BOOT RACE</span>
                      <h3>{scorersData[0].name}</h3>
                      <p>{scorersData[0].team}</p>
                    </div>
                    <div className="spotlight-stat">
                      <span className="big-num">{scorersData[0].goals}</span>
                      <span className="label">GOALS</span>
                    </div>
                  </div>
                )}

                <div className="data-container">
                  {loading && <div style={{padding:40, textAlign:'center'}}>Loading...</div>}
                  {!loading && activeTab === 'TABLE' && (
                    <table className="modern-table">
                      <thead><tr><th width="40">#</th><th>CLUB</th><th>MP</th><th>W/D/L</th><th className="text-right">PTS</th></tr></thead>
                      <tbody>{tableData.map(t => (
                        <tr key={t.id}><td className="rank">{t.rank}</td><td><div className="team-flex"><img src={t.crest} alt=""/><span>{t.name}</span></div></td><td style={{color:'#666'}}>{t.played}</td><td className="form-mini"><span className="w">{t.won}</span>/<span style={{color:'#666'}}>{t.draw}</span>/<span className="l">{t.lost}</span></td><td className="pts">{t.points}</td></tr>
                      ))}</tbody>
                    </table>
                  )}
                  {!loading && activeTab === 'SCORERS' && (
                    <div className="scorers-list">{scorersData.map((s) => (<div key={s.name} className="list-row"><div className="rank-badge">{s.rank}</div><div className="list-info"><span className="list-name">{s.name}</span><span className="list-sub">{s.team}</span></div><div className="list-stat"><span className="stat-val">{s.goals}</span></div></div>))}</div>
                  )}
                  {!loading && activeTab === 'FIXTURES' && (
                    <div className="fixtures-list">{fixturesData.map((f) => (<div key={f.id} className="fixture-row"><div className="fixture-date"><span className="date">{f.date}</span><span className="time">{f.time}</span></div><div className="fixture-matchup"><div className="team home"><span>{f.home}</span><img src={f.homeCrest} alt=""/></div><div className="vs-badge">VS</div><div className="team away"><img src={f.awayCrest} alt=""/><span>{f.away}</span></div></div></div>))}</div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* VIEW 2: FORUM / LIVE CHAT */}
          {currentView === 'FORUM' && (
            <div className="chat-interface">
              <header className="feed-header">
                <div className="header-title"><h1>Ultras Forum</h1><span>Live Community Chat</span></div>
              </header>
              
              <div className="chat-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.uid === user?.uid ? 'sent' : 'received'}`}>
                    <img src={msg.photoURL} alt="" className="chat-avatar" />
                    <div className="message-content">
                      <span className="msg-author">{msg.displayName}</span>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={dummyDiv}></div>
              </div>

              <form onSubmit={handleSendMessage} className="chat-input-area">
                <input 
                  value={newMessage} 
                  onChange={(e) => setNewMessage(e.target.value)} 
                  placeholder={user ? "Type a message..." : "Login to chat"} 
                  disabled={!user}
                />
                <button type="submit" disabled={!user}>SEND</button>
              </form>
            </div>
          )}

        </main>

        {/* RIGHT PANEL */}
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
                     <div className="vote-content-row">
                        <div className="vote-info"><span>{v.name}</span><small>{v.team}</small></div>
                        {hasVoted && <div className="vote-perc">{perc}%</div>}
                     </div>
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
    </div>
  );
};

export default App;