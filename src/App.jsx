import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  doc, getDoc, setDoc, increment, collection, addDoc, query, orderBy, 
  onSnapshot, limit, serverTimestamp 
} from 'firebase/firestore';

// Goal Sound Asset
const goalSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

const App = () => {
const PHP_PROXY_URL = 'https://itsgonein-app.onrender.com/football-proxy';  const ADMIN_EMAIL = "tm@solumre.com"; 

  // --- STATE ---
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState(39); 
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [isBanned, setIsBanned] = useState(false);
  const [goalAlert, setGoalAlert] = useState(false);

  // --- DATA ---
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchDetails, setMatchDetails] = useState(null);

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

  // --- 1. AUTH & LISTENERS ---
  useEffect(() => {
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

    const q = query(collection(db, "messages"), orderBy("createdAt"), limit(50));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setTimeout(() => {
  dummyDiv.current?.scrollIntoView({ behavior: 'smooth' });
}, 100);
      dummyDiv.current?.scrollIntoView({ behavior: 'smooth' });
    });

     const unsubscribeVotes = onSnapshot(collection(db, "match_votes"), (snapshot) => {
      const votes = {};
      snapshot.docs.forEach(doc => { votes[doc.id] = doc.data(); });
      setCommunityVotes(votes);
    });

    return () => { unsubscribeAuth(); unsubscribeChat(); unsubscribeVotes(); };
  }, []);

  // --- 2. TICKER REFRESH (60s) ---
  useEffect(() => {
    const fetchLiveScores = async () => {
      try {
        const res = await fetch(`${PHP_PROXY_URL}?type=live`); 
        const json = await res.json();
        if (json.response) {
          setLiveMatches(json.response.map(m => ({
            id: m.fixture.id,
            home: m.teams.home.name,
            away: m.teams.away.name,
            homeScore: m.goals.home,
            awayScore: m.goals.away,
            status: m.fixture.status.elapsed
          })));
        }
      } catch (err) { console.error("Ticker Error:", err); }
    };
    fetchLiveScores();
    const tickerInterval = setInterval(fetchLiveScores, 60000);
    return () => clearInterval(tickerInterval);
  }, []);

  // --- 3. LEAGUE DATA FETCHING ---
  useEffect(() => {
    const activeData = leagues.find(l => l.id === activeLeague);
    if (activeData) {
      document.documentElement.style.setProperty('--primary', activeData.color);
      document.documentElement.style.setProperty('--accent', activeData.accent);
    }
// Inside useEffect [activeLeague]
const loadLeagueData = async () => {
  setLoading(true);
  try {
    // Fire all 3 requests at the same time
    const [resTable, resScorers, resFixtures] = await Promise.all([
      fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=standings`),
      fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=scorers`),
      fetch(`${PHP_PROXY_URL}?league=${activeLeague}&type=fixtures`)
    ]);

    const jsonTable = await resTable.json();
    const jsonScorers = await resScorers.json();
    const jsonFixtures = await resFixtures.json();

    // 1. Process Table
    if (jsonTable.response?.[0]) {
      const standingsRaw = jsonTable.response[0].league.standings[0];
      setTableData(standingsRaw.map(t => ({
        rank: t.rank, id: t.team.id, name: t.team.name, crest: t.team.logo,
        played: t.all.played, won: t.all.win, draw: t.all.draw, lost: t.all.lose, points: t.points, form: t.form 
      })));
    }

    // 2. Process Scorers
    if (jsonScorers.response) {
      setScorersData(jsonScorers.response.map((s, i) => ({
        rank: i + 1, name: s.player.name, team: s.statistics[0].team.name, goals: s.statistics[0].goals.total
      })));
    }

    // 3. Process Fixtures
    if (jsonFixtures.response) {
      setFixturesData(jsonFixtures.response.map(f => ({
        id: f.fixture.id,
        homeId: f.teams.home.id,
        awayId: f.teams.away.id,
        status: f.fixture.status.short,
        date: new Date(f.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        time: new Date(f.fixture.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        home: f.teams.home.name, homeCrest: f.teams.home.logo, away: f.teams.away.name, awayCrest: f.teams.away.logo
      })));
    }

  } catch (err) { 
    console.error("Error loading league data:", err); 
  } finally {
    setLoading(false);
  }
};
     loadLeagueData();
  }, [activeLeague]);

  // --- 4. MATCH CENTER AUTO-REFRESH & GOAL ALERT ---
  useEffect(() => {
    let interval;
    if (selectedMatch && matchDetails?.viewType === 'match_details') {
      const updateTimeline = async () => {
        try {
          const res = await fetch(`${PHP_PROXY_URL}?type=match_details&match_id=${selectedMatch}`);
          const json = await res.json();
          if (json.response && json.response.match) {
            // Compare scores for goal alert
            if (json.response.match.score !== matchDetails.match.score) {
              goalSound.play().catch(() => {});
              setGoalAlert(true);
              setTimeout(() => setGoalAlert(false), 5000);
            }
            setMatchDetails({ ...json.response, viewType: 'match_details' });
          }
        } catch (err) { console.error(err); }
      };
      interval = setInterval(updateTimeline, 30000); 
    }
    return () => { if (interval) clearInterval(interval); };
  }, [selectedMatch, matchDetails?.match?.score, matchDetails?.viewType]);

  // --- ACTIONS ---
const openMatchCenter = async (fixture) => {
    setSelectedMatch(fixture.id);
    
    // 1. Initial State
    setMatchDetails({
      match: {
        home: fixture.home,
        homeLogo: fixture.homeCrest,
        away: fixture.away,
        awayLogo: fixture.awayCrest,
        score: "LOADING..." 
      },
      viewType: 'loading', 
      history: [],
      stats: { homeWinPerc: 0, drawPerc: 0, awayWinPerc: 0 } // Prevent crash before load
    });

    try {
      // Added 'NS' (Not Started) which is the most common pre-match code
      const isScheduled = ['SCHEDULED', 'TIMED', 'NS', 'TBD'].includes(fixture.status);
      const fetchType = isScheduled ? 'h2h' : 'match_details';
      
      // Add timestamp to prevent caching
      const res = await fetch(`${PHP_PROXY_URL}?type=${fetchType}&match_id=${fixture.id}&t=${Date.now()}`);
      const json = await res.json();
      
      console.log("API Response:", json); 

      if (json.response) {
        
        // --- NEW: CALCULATE DOMINANCE STATS ---
        let calculatedStats = { homeWinPerc: 33, drawPerc: 34, awayWinPerc: 33 }; // Fallback defaults

        if (fetchType === 'h2h' && json.response.history && json.response.history.length > 0) {
            let hWins = 0, draws = 0, aWins = 0, total = 0;
            
            json.response.history.forEach(match => {
                // Regex to find the score "2-1" hidden inside the string "Arsenal 2-1 Chelsea"
                const scoreMatch = match.score.match(/(\d+)-(\d+)/);
                if (scoreMatch) {
                    total++;
                    const homeGoals = parseInt(scoreMatch[1]);
                    const awayGoals = parseInt(scoreMatch[2]);
                    
                    if (homeGoals > awayGoals) hWins++;
                    else if (awayGoals > homeGoals) aWins++;
                    else draws++;
                }
            });

            if (total > 0) {
                calculatedStats = {
                    homeWinPerc: Math.round((hWins / total) * 100),
                    drawPerc: Math.round((draws / total) * 100),
                    awayWinPerc: Math.round((aWins / total) * 100)
                };
            }
        }
        // --------------------------------------

        setMatchDetails(prev => ({
          ...prev,
          ...json.response,
          stats: calculatedStats, // Inject the stats we just calculated
          viewType: fetchType,
          match: {
             ...prev.match,
            score: json.response.match?.score || "VS",
            ...(json.response.match || {}) 
          }
        }));

      } else {
        // Fallback for empty response
        setMatchDetails(prev => ({ 
            ...prev, 
            viewType: fetchType,
            match: { ...prev.match, score: "VS" } 
        }));
      }
    } catch (err) { 
      console.error("Match Center Error:", err); 
      setMatchDetails(prev => ({ 
        ...prev, 
        viewType: 'error',
        match: { ...prev.match, score: "ERROR" } 
      }));
    }
  };

  const refreshMatchDetails = async () => {
    if (!selectedMatch) return;
    setLoading(true);
    try {
      const res = await fetch(`${PHP_PROXY_URL}?type=match_details&match_id=${selectedMatch}`);
      const json = await res.json();
      setMatchDetails({ ...json.response, viewType: 'match_details' });
    } catch (err) { console.error(err); }
    finally { setLoading(false); } // Use finally to guarantee loading stops
  };

   const handlePredict = (matchId, selection) => {
    const newPredictions = { ...predictedMatches, [matchId]: selection };
    setPredictedMatches(newPredictions);
    localStorage.setItem('userPredictions', JSON.stringify(newPredictions));
     if (user) {
      let dbSelection = selection === '1' ? 'home' : (selection === '2' ? 'away' : 'draw');
      setDoc(doc(db, "match_votes", String(matchId)), { [dbSelection]: increment(1) }, { merge: true });
    }
  };

   const getMatchStats = (matchId) => {
    const votes = communityVotes[matchId];
    if (!votes) return { home: 0, draw: 0, away: 0 };
    const h = votes.home || 0, d = votes.draw || 0, a = votes.away || 0;
    const total = h + d + a;
    return total === 0 ? { home: 0, draw: 0, away: 0 } : {
      home: Math.round((h/total)*100), draw: Math.round((d/total)*100), away: Math.round((a/total)*100)
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

   const handleGoogleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };

  return (
    <div className="app-container">
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-wrapper">
          <div className="ticker-content">
            {liveMatches.length > 0 ? (
              <>
                {liveMatches.map(m => (
                  <span key={m.id}>{m.home} <b className="score">{m.homeScore}-{m.awayScore}</b> {m.away} <small>{m.status}'</small></span>
                ))}
                {liveMatches.map(m => (
                  <span key={`dup-${m.id}`}>{m.home} <b className="score">{m.homeScore}-{m.awayScore}</b> {m.away}</span>
                ))}
              </>
            ) : (
              <span>No live matches currently in progress</span>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <nav className="side-nav">
          <div className="brand" onClick={() => setCurrentView('DASHBOARD')}>ITS<span className="accent">GONE</span>IN.</div>
          <div className="nav-group">
            <label>LEAGUES</label>
            {leagues.map(l => (
              <div 
                key={l.id} 
                className={`nav-item ${activeLeague === l.id && currentView === 'DASHBOARD' ? 'active' : ''}`} 
                onClick={() => { 
                  setActiveLeague(l.id); 
                  setCurrentView('DASHBOARD'); 
                  setSelectedMatch(null); 
                }}
              >
                <span className="nav-icon">{l.icon}</span><span className="nav-text">{l.name}</span>
              </div>
            ))}
          </div>
          <div className="nav-group"><label>COMMUNITY</label><div className="nav-item">🔥 Trending</div></div>
        </nav>

        <main className="main-feed">
          {currentView === 'DASHBOARD' ? (
            <>
              <header className="feed-header">
                <div className="header-title"><h1>{leagues.find(l => l.id === activeLeague)?.name}</h1><span>Season 2025/26</span></div>
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
                      <thead><tr><th>#</th><th>CLUB</th><th>MP</th><th>W/D/L</th><th>PTS</th></tr></thead>
                      <tbody>{tableData.map(t => (
                        <tr key={t.id}><td>{t.rank}</td><td><div className="team-flex"><img src={t.crest} alt=""/><span>{t.name}</span></div></td><td>{t.played}</td><td><span className="w">{t.won}</span>/<span>{t.draw}</span>/<span className="l">{t.lost}</span></td><td className="pts">{t.points}</td></tr>
                      ))}</tbody>
                    </table>
                  )}

                  {!loading && activeTab === 'SCORERS' && (
                    <div className="scorers-list">
                      {scorersData.map((s) => (
                        <div key={s.name} className="list-row">
                          <div className="rank-badge">{s.rank}</div>
                          <div className="list-info"><span className="list-name">{s.name}</span><span className="list-sub">{s.team}</span></div>
                          <div className="list-stat"><span className="stat-val">{s.goals}</span></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && activeTab === 'FIXTURES' && (
                    <div className="fixtures-list">
                      {selectedMatch ? (
                        <div className={`match-center fade-in ${goalAlert ? 'goal-flash' : ''}`}>
                          <div className="center-actions">
                            <button className="close-center" onClick={() => setSelectedMatch(null)}>✕ BACK TO FIXTURES</button>
                            <button className="refresh-center" onClick={refreshMatchDetails} disabled={loading}>
                              <span className="pulse-dot"></span>
                              {loading ? 'REFRESHING...' : 'LIVE UPDATES'}
                            </button>
                          </div>
                          {matchDetails ? (
                            <div className="center-content">
                               <div className="center-score">
                                  <div className="c-team"><img src={matchDetails.match?.homeLogo} alt=""/><h3>{matchDetails.match?.home}</h3></div>
                                  <div className="c-result">{matchDetails.match?.score}</div>
                                  <div className="c-team"><img src={matchDetails.match?.awayLogo} alt=""/><h3>{matchDetails.match?.away}</h3></div>
                               </div>
                               
                               {matchDetails.viewType === 'h2h' ? (
                                 <div className="h2h-container">
                                   {matchDetails.stats && (
                                     <div className="dominance-meter">
                                       <div className="meter-bar">
                                         <div className="segment home" style={{ width: `${matchDetails.stats.homeWinPerc}%` }}></div>
                                         <div className="segment draw" style={{ width: `${matchDetails.stats.drawPerc}%` }}></div>
                                         <div className="segment away" style={{ width: `${matchDetails.stats.awayWinPerc}%` }}></div>
                                       </div>
                                       <div className="meter-labels">
                                         <span>Win {matchDetails.stats.homeWinPerc}%</span>
                                         <span>Draw {matchDetails.stats.drawPerc}%</span>
                                         <span>Win {matchDetails.stats.awayWinPerc}%</span>
                                       </div>
                                     </div>
                                   )}
                        
<div className="h2h-history">
  <h4 className="section-title">PREVIOUS ENCOUNTERS</h4>
  
  {matchDetails.history && matchDetails.history.length > 0 ? (
    matchDetails.history.map((m, idx) => {
      const parts = m.score.split(/(\d+\s*-\s*\d+)/);
      const homeName = parts[0] || "";
      const scoreStr = parts[1] || "";
      const awayName = parts[2] || "";

      return (
        <div key={idx} className="h2h-row">
          <div className="h-team">{homeName}</div>
          
          <div className="h-center">
             <span className="h-date">{m.date}</span>
             {/* NEW: Stadium Line */}
             <span className="h-stadium">{m.stadium}</span>
             <div className="h-score">{scoreStr.replace(/-/g, '-')}</div>
          </div>

          <div className="h-team away">{awayName}</div>
        </div>
      );
    })
  ) : (
    <div className="empty-state">
      <div style={{fontSize: '24px', marginBottom: '10px'}}>🔒</div>
      <p>Head-to-Head data unavailable.</p>
    </div>
  )}
</div>
                                 </div>
                               ) : (
                                 <div className="timeline">
                                    {matchDetails.timeline?.map((e, idx) => (
                                      <div key={idx} className="timeline-item">
                                        <span className="t-time">{e.time}</span>
                                        <span className="t-icon">{e.icon}</span>
                                        <span className="t-detail">{e.detail}</span>
                                      </div>
                                    ))}
                                 </div>
                               )}
                            </div>
                          ) : <p>Loading data...</p>}
                        </div>
                      ) : (
                        fixturesData.map(f => {
                           const stats = getMatchStats(f.id);
                           const voted = predictedMatches[f.id];
                           return (
                             <div key={f.id} className="fixture-row" onClick={() => openMatchCenter(f)}>
                                <div className="fixture-date"><span className="date">{f.date}</span><span className="time">{f.time}</span></div>
                                <div className="fixture-center-group">
                                   <div className="fixture-matchup">
                                      <div className="team home"><span>{f.home}</span><img src={f.homeCrest} alt=""/></div>
                                      <div className="vs-badge">VS</div>
                                      <div className="team away"><img src={f.awayCrest} alt=""/><span>{f.away}</span></div>
                                   </div>
                                   <div className="prediction-wrapper" onClick={(e) => e.stopPropagation()}>
                                      <div className="prediction-bar">
                                         <button className={`pred-btn ${voted === '1' ? 'active' : ''}`} onClick={() => handlePredict(f.id, '1')}>1</button>
                                         <button className={`pred-btn ${voted === 'X' ? 'active' : ''}`} onClick={() => handlePredict(f.id, 'X')}>X</button>
                                         <button className={`pred-btn ${voted === '2' ? 'active' : ''}`} onClick={() => handlePredict(f.id, '2')}>2</button>
                                      </div>
                                      {voted && (
                                        <div className="community-stats fade-in">
                                          <div className="stat-label">{stats.home}%</div>
                                          <div className="stat-label">{stats.draw}%</div>
                                          <div className="stat-label">{stats.away}%</div>
                                        </div>
                                      )}
                                   </div>
                                </div>
                             </div>
                           );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="chat-interface">
              <header className="feed-header"><div className="header-title"><h1>Ultras Forum</h1><span>Live Community Chat</span></div></header>
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
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={user ? "Type a message..." : "Login to chat"} disabled={!user || isBanned}/>
                <button type="submit">SEND</button>
              </form>
            </div>
          )}
        </main>

        <aside className="hype-zone">
          <div className="user-card">
            {user ? (
              <div className="logged-in"><img src={user.photoURL} className="avatar-img" alt=""/><div><h4>{user.displayName}</h4><button onClick={() => signOut(auth)}>Log Out</button></div></div>
            ) : (
              <button onClick={handleGoogleLogin} className="google-btn">Login with Google</button>
            )}
          </div>
          <div className="widget-box vote-box">
            <div className="widget-header"><h3>POTW</h3><span className="live-dot">LIVE</span></div>
            <div className="vote-list">
              {voteOptions.map(v => {
                 const total = voteOptions.reduce((acc, curr) => acc + curr.votes, 0);
                 const perc = total > 0 ? Math.round((v.votes / total) * 100) : 0;
                 return (
                   <div key={v.id} className={`vote-item ${hasVoted ? 'voted' : ''}`} onClick={() => handleVote(v.id)}>
                     {hasVoted && <div className="vote-bar" style={{width: `${perc}%`}}></div>}
                     <div className="vote-content-row"><span>{v.name}</span>{hasVoted && <span>{perc}%</span>}</div>
                   </div>
                 )
              })}
            </div>
          </div>
          <div className="widget-box news-box">
            <h3>LATEST DROPS</h3>
            {newsFeed.map(n => (
              <div key={n.id} className="news-item"><div className="news-icon">{n.img}</div><div className="news-content"><span className={`tag ${n.tag}`}>{n.tag}</span><p>{n.title}</p></div></div>
            ))}
          </div>
        </aside>
      </div>
      <button className={`forum-fab ${goalAlert ? 'goal-pulse' : ''}`} onClick={() => setCurrentView('FORUM')}>💬</button>
    </div>
  );
};

export default App;