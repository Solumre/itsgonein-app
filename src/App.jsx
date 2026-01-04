import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  doc, getDoc, setDoc, increment, collection, addDoc, query, orderBy, 
  onSnapshot, limit, serverTimestamp, deleteDoc, getDocs // 👈 Ensure getDocs is here
} from 'firebase/firestore';

// Goal Sound Asset
const goalSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

const App = () => {
const PHP_PROXY_URL = 'https://itsgonein-app.onrender.com/football-proxy';  const ADMIN_EMAIL = "tm@solumre.com"; 

  // --- STATE ---
  const [theme, setTheme] = useState(localStorage.getItem('app-theme') || 'dark');
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState(39); 
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [isBanned, setIsBanned] = useState(false);
  const [goalAlert, setGoalAlert] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  // Create the toggle function
const toggleTheme = () => {
  const newTheme = theme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  localStorage.setItem('app-theme', newTheme);
};
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

const [newsData, setNewsData] = useState([]);
  // --- 1. AUTH & LISTENERS ---
  useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
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
   // Change the listener to look for "current_poll"
const docRef = doc(db, "polls", "current_poll");
const docSnap = await getDoc(docRef);
if (docSnap.exists()) {
  const data = docSnap.data();
  // Sync the names and the current votes
  setVoteOptions(data.players.map(p => ({
    ...p,
    votes: data[p.id] || 0
  })));
}
      } catch (e) { console.error(e); }
    });
const unsubscribeLeaderboard = onSnapshot(
  query(collection(db, "leaderboard"), orderBy("points", "desc"), limit(10)), 
  (snapshot) => {
    setLeaderboard(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }
);
    const unsubscribeNews = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc"), limit(5)), (snapshot) => {
  setNewsData(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
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
const unsubscribeTicker = onSnapshot(doc(db, "settings", "ticker"), (doc) => {
  if (doc.exists() && doc.data().active) {
    setBroadcastMsg(doc.data().message);
  } else {
    setBroadcastMsg("");
  }
});

// Remember to return the unsubscribe function at the end of the useEffect
return () => { 
      unsubscribeAuth(); 
      unsubscribeChat(); 
      unsubscribeVotes(); 
      unsubscribeTicker(); 
      unsubscribeNews();
      unsubscribeLeaderboard();
    };
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
      stats: { homeWinPerc: 0, drawPerc: 0, awayWinPerc: 0 } 
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
        
        // 🚨 FIX: TRUST THE SERVER STATS
        // If the server sends 'stats', use them. Otherwise default to 33/34/33.
        const finalStats = json.response.stats || { homeWinPerc: 33, drawPerc: 34, awayWinPerc: 33 };

        setMatchDetails(prev => ({
          ...prev,
          ...json.response, // This merges 'history' from server
          stats: finalStats, // This uses the SERVER'S math
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
const handleClearAllChat = async () => {
  if (!window.confirm("ARE YOU SURE? This will permanently delete ALL messages!")) return;
  
  try {
    const q = query(collection(db, "messages"));
    const snapshot = await getDocs(q);
    
    const deletePromises = snapshot.docs.map(m => deleteDoc(doc(db, "messages", m.id)));
    await Promise.all(deletePromises);
    
    alert("Chat Cleared!");
  } catch (e) {
    console.error("Error clearing chat:", e);
  }
};
  const handlePredict = async (matchId, selection) => {
  const newPredictions = { ...predictedMatches, [matchId]: selection };
  setPredictedMatches(newPredictions);
  localStorage.setItem('userPredictions', JSON.stringify(newPredictions));
  
  if (user) {
    // Save the specific user's choice for the leaderboard
    await setDoc(doc(db, "user_predictions", `${user.uid}_${matchId}`), {
      uid: user.uid,
      displayName: user.displayName,
      matchId: String(matchId),
      selection: selection, // '1', 'X', or '2'
      timestamp: serverTimestamp()
    });

    // Increment global community stats
    let dbSelection = selection === '1' ? 'home' : (selection === '2' ? 'away' : 'draw');
    await setDoc(doc(db, "match_votes", String(matchId)), { [dbSelection]: increment(1) }, { merge: true });
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
    // ✅ Change "week_1" to "current_poll" to match the Admin Panel
    await setDoc(doc(db, "polls", "current_poll"), { [optionId]: increment(1) }, { merge: true });
  };
const handleUpdatePOTW = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const players = [
    { id: 'p1', name: formData.get('n1'), team: formData.get('t1'), votes: 0 },
    { id: 'p2', name: formData.get('n2'), team: formData.get('t2'), votes: 0 },
    { id: 'p3', name: formData.get('n3'), team: formData.get('t3'), votes: 0 },
  ];
  
  // Update local state
  setVoteOptions(players);
  setHasVoted(false);
  
  // Reset Firebase for a new week (using a timestamp-based ID or custom name)
  const weekId = `week_${Date.now()}`; 
  await setDoc(doc(db, "polls", "current_poll"), { 
    players, 
    activeWeek: weekId,
    p1: 0, p2: 0, p3: 0 
  });
  alert("Poll Updated!");
};

const handleBanUser = async (uid) => {
  if (!uid) return;
  await setDoc(doc(db, "banned_users", uid), { 
    bannedAt: serverTimestamp(),
    reason: "Admin Action"
  });
  alert("User Banned");
};
const handleDeleteMessage = async (msgId) => {
  if (!window.confirm("Delete this message?")) return;
  try {
    await deleteDoc(doc(db, "messages", msgId));
    alert("Message deleted");
  } catch (e) {
    console.error("Error deleting message:", e);
  }
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
  {broadcastMsg && <span className="broadcast-text">📢 {broadcastMsg} 📢</span>}
  {liveMatches.length > 0 ? (
    <>
      {liveMatches.map(m => (
        <span key={m.id}>{m.home} <b className="score">{m.homeScore}-{m.awayScore}</b> {m.away} <small>{m.status}'</small></span>
      ))}
    </>
  ) : (
    !broadcastMsg && <span>No live matches currently in progress</span>
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

          <div className="nav-group">
            <label>COMMUNITY</label>
            <div className="nav-item">🔥 Trending</div>
            
            {/* THEME TOGGLE */}
            <div className="nav-item" onClick={toggleTheme}>
              <span className="nav-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="nav-text">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </div>

            {/* ADMIN PANEL BUTTON */}
            {user?.email === ADMIN_EMAIL && (
              <div 
                className={`nav-item admin-link ${currentView === 'ADMIN' ? 'active' : ''}`} 
                onClick={() => setCurrentView('ADMIN')}
              >
                <span className="nav-icon">🛠</span><span className="nav-text">Admin Panel</span>
              </div>
            )}
          </div>
        </nav>

  <main className="main-feed">
  {/* VIEW 1: ADMIN PANEL */}
  {currentView === 'ADMIN' && (
    <div className="admin-panel fade-in">
      <header className="feed-header">
        <div className="header-title"><h1>Admin Control Center</h1></div>
      </header>
      
      <div className="admin-grid">
        {/* SECTION 1: GLOBAL BROADCAST */}
        <div className="admin-card">
          <h3>Global Broadcast</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const msg = new FormData(e.target).get('broadcast');
            await setDoc(doc(db, "settings", "ticker"), { message: msg, active: true });
            alert("Broadcast Live!");
          }} className="admin-form">
            <input name="broadcast" placeholder="Enter alert..." required />
            <button type="submit" className="admin-btn" style={{marginTop: '10px'}}>Update Ticker</button>
          </form>
          <button 
            className="ban-btn" 
            style={{width: '100%', marginTop: '10px'}}
            onClick={async () => await setDoc(doc(db, "settings", "ticker"), { message: "", active: false })}
          >
            Clear Broadcast
          </button>
        </div>

        {/* SECTION 2: SETTLE PREDICTIONS */}
        <div className="admin-card">
          <h3>Settle Predictions</h3>
          <p style={{fontSize: '0.7rem', opacity: 0.6, marginBottom: '10px'}}>
            Enter Match ID and Result to award points (3pts per correct guess).
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const matchId = e.target.matchId.value;
            const result = e.target.result.value;
            const q = query(collection(db, "user_predictions"), where("matchId", "==", matchId), where("selection", "==", result));
            const snapshot = await getDocs(q);
            const awardPromises = snapshot.docs.map(p => {
              const data = p.data();
              return setDoc(doc(db, "leaderboard", data.uid), {
                displayName: data.displayName,
                points: increment(3)
              }, { merge: true });
            });
            await Promise.all(awardPromises);
            alert(`Settled! Points awarded to ${snapshot.size} users.`);
            e.target.reset();
          }} className="admin-form">
            <input name="matchId" placeholder="Match ID (e.g. 1038291)" required />
            <select name="result" style={{width: '100%', padding: '10px', background: '#222', color: 'white', marginTop: '10px', borderRadius: '6px'}}>
              <option value="1">Home Win (1)</option>
              <option value="X">Draw (X)</option>
              <option value="2">Away Win (2)</option>
            </select>
            <button type="submit" className="admin-btn" style={{marginTop: '10px'}}>Settle & Award Points</button>
          </form>
        </div>

        {/* SECTION 3: POTW POLL */}
        <div className="admin-card">
          <h3>Update POTW Poll</h3>
          <form onSubmit={handleUpdatePOTW} className="admin-form">
            <div className="form-row">
              <input name="n1" placeholder="P1 Name" required />
              <input name="t1" placeholder="Team" required />
            </div>
            <div className="form-row">
              <input name="n2" placeholder="P2 Name" required />
              <input name="t2" placeholder="Team" required />
            </div>
            <div className="form-row">
              <input name="n3" placeholder="P3 Name" required />
              <input name="t3" placeholder="Team" required />
            </div>
            <button type="submit" className="admin-btn">Reset & Start New Poll</button>
          </form>
        </div>

        {/* SECTION 4: FORUM MODERATION */}
        <div className="admin-card">
          <h3>Forum Moderation</h3>
          <div className="admin-list">
            {messages.slice(-5).reverse().map(msg => (
              <div key={msg.id} className="admin-list-item">
                <div style={{display:'flex', justifyContent:'space-between', width:'100%'}}>
                  <span><strong>{msg.displayName}</strong>: {msg.text}</span>
                  <div style={{display:'flex', gap: '5px'}}>
                    <button onClick={() => handleDeleteMessage(msg.id)} className="ban-btn" style={{background:'#555'}}>Del</button>
                    <button onClick={() => handleBanUser(msg.uid)} className="ban-btn">Ban</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleClearAllChat} className="admin-btn" style={{ background: '#ff4d4d', color: 'white', marginTop: '15px' }}>
            🔥 WIPE ALL CHAT HISTORY
          </button>
        </div>

        {/* SECTION 5: LATEST DROPS MANAGER */}
        <div className="admin-card">
          <h3>Latest Drops Manager</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            await addDoc(collection(db, "news"), {
              tag: formData.get('tag'),
              title: formData.get('title'),
              img: formData.get('img'),
              createdAt: serverTimestamp()
            });
            e.target.reset();
            alert("News Posted!");
          }} className="admin-form">
            <div className="form-row">
              <select name="tag" style={{flex: 0.4, background: '#222', color: 'white', borderRadius: '6px', border: '1px solid #444'}}>
                <option value="RUMOR">RUMOR</option>
                <option value="VIRAL">VIRAL</option>
                <option value="OFFICIAL">OFFICIAL</option>
              </select>
              <input name="img" placeholder="Emoji (🔥, 🤖, 🚨)" style={{flex: 0.6}} required />
            </div>
            <input name="title" placeholder="News Title / Headline" required />
            <button type="submit" className="admin-btn" style={{marginTop: '10px'}}>Post News</button>
          </form>
          <div className="admin-list" style={{marginTop: '20px'}}>
             <label style={{fontSize: '0.7rem', opacity: 0.5}}>ACTIVE NEWS</label>
             {newsData.map(n => (
               <div key={n.id} className="admin-list-item">
                 <span style={{fontSize: '0.8rem'}}>{n.img} {n.title}</span>
                 <button onClick={async () => await deleteDoc(doc(db, "news", n.id))} className="ban-btn" style={{padding: '2px 8px'}}>✕</button>
               </div>
             ))}
          </div>
        </div>

 {/* SECTION 6: MATCH ID FINDER - NESTED INSIDE GRID */}
        <div className="admin-card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
            <h3>Match ID Finder</h3>
            <button 
              className="ban-btn" 
              style={{background: 'var(--primary)', fontSize: '10px'}}
              onClick={() => {
                const allIds = fixturesData.map(f => `${f.home} vs ${f.away}: ${f.id}`).join('\n');
                navigator.clipboard.writeText(allIds);
                alert('All IDs copied to clipboard!');
              }}
            >
              Copy All IDs
            </button>
          </div>
          <p style={{fontSize: '0.7rem', opacity: 0.6, marginBottom: '10px'}}>
            Use these IDs to settle predictions. Click an individual ID to copy just the number.
          </p>
          <div className="admin-list match-id-list">
            {fixturesData.map(f => (
              <div key={f.id} className="admin-list-item" style={{fontSize: '0.8rem', padding: '8px'}}>
                <div style={{flex: 1}}>
                  <strong>{f.home} vs {f.away}</strong>
                  <div style={{opacity: 0.7}}>{f.date} @ {f.time}</div>
                </div>
                <code 
                  style={{background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer'}} 
                  onClick={() => {navigator.clipboard.writeText(f.id); alert('ID Copied!');}}
                >
                  {f.id}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div> {/* Closes admin-grid */}
    </div>   /* Closes admin-panel */
  )}   

  {/* VIEW 2: DASHBOARD */}
  {currentView === 'DASHBOARD' && (
    <>
      <header className="feed-header">
        <div className="header-title">
          <h1>{leagues.find(l => l.id === activeLeague)?.name}</h1>
          <span>Season 2025/26</span>
        </div>
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
                                 return (
                                   <div key={idx} className="h2h-row">
                                     <div className="h-team">{parts[0]}</div>
                                     <div className="h-center">
                                        <span className="h-date">{m.date}</span>
                                        <span className="h-stadium">{m.stadium}</span>
                                        <div className="h-score">{parts[1]}</div>
                                     </div>
                                     <div className="h-team away">{parts[2]}</div>
                                   </div>
                                 );
                               })
                             ) : (
                               <div className="empty-state"><p>Head-to-Head data unavailable.</p></div>
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
                       <div className="match-comments-section">
                        <h4 className="section-title">LIVE DISCUSSION</h4>
                        <div className="match-comments-list">
                          {messages
                            .filter(m => m.matchId === String(selectedMatch))
                            .map(msg => (
                              <div key={msg.id} className="m-comment">
                                <img src={msg.photoURL} alt="" />
                                <div className="m-comment-body">
                                  <span className="m-comment-user">{msg.displayName}</span>
                                  <p>{msg.text}</p>
                                </div>
                              </div>
                            ))}
                          {messages.filter(m => m.matchId === String(selectedMatch)).length === 0 && (
                            <p className="empty-state">No comments yet. Start the conversation!</p>
                          )}
                        </div>

                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const val = e.target.comment.value;
                          if (!val.trim() || !user || isBanned) return;
                          await addDoc(collection(db, "messages"), {
                            text: val,
                            matchId: String(selectedMatch),
                            createdAt: serverTimestamp(),
                            uid: user.uid,
                            photoURL: user.photoURL,
                            displayName: user.displayName
                          });
                          e.target.reset();
                        }} className="match-comment-form">
                          <input name="comment" placeholder={user ? "Talk about this match..." : "Login to join the chat"} disabled={!user || isBanned} />
                          <button type="submit">SEND</button>
                        </form>
                      </div>
                    </div>
                  ) : <p>Loading data...</p>}
                </div>
              ) : (
                fixturesData.map(f => (
                  <div key={f.id} className="fixture-row" onClick={() => openMatchCenter(f)}>
                     <div className="fixture-date"><span>{f.date}</span><span>{f.time}</span></div>
                     <div className="fixture-matchup">
                        <div className="team home"><span>{f.home}</span><img src={f.homeCrest} alt=""/></div>
                        <div className="vs-badge">VS</div>
                        <div className="team away"><img src={f.awayCrest} alt=""/><span>{f.away}</span></div>
                     </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )}

  {/* VIEW 3: FORUM/CHAT */}
  {currentView === 'FORUM' && (
    <div className="chat-interface">
       <header className="feed-header"><div className="header-title"><h1>Ultras Forum</h1><span>Live Community Chat</span></div></header>
       <div className="chat-messages">
        {messages
          .filter(msg => !msg.matchId)
          .map(msg => (
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
  {newsData.map(n => (
    <div key={n.id} className="news-item" style={{position: 'relative'}}>
      <div className="news-icon">{n.img}</div>
      <div className="news-content">
        <span className={`tag ${n.tag}`}>{n.tag}</span>
        <p>{n.title}</p>
      </div>
      {/* QUICK DELETE FOR ADMIN ONLY */}
      {user?.email === ADMIN_EMAIL && (
        <button 
          onClick={async () => await deleteDoc(doc(db, "news", n.id))}
          style={{position: 'absolute', right: 0, top: 0, background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '12px'}}
        >
          ✕
        </button>
      )}
    </div>
  ))}
</div>
<div className="widget-box leaderboard-box">
  <h3>🏆 PREDICTOR RANKING</h3>
  <div className="leaderboard-list">
    {leaderboard.map((player, index) => (
      <div key={player.id} className="leaderboard-item">
        <span className="rank">#{index + 1}</span>
        <span className="player-name">{player.displayName}</span>
        <span className="points">{player.points} PTS</span>
      </div>
    ))}
  </div>
</div>
        </aside>
      </div>
      <button className={`forum-fab ${goalAlert ? 'goal-pulse' : ''}`} onClick={() => setCurrentView('FORUM')}>💬</button>
    </div>
  );
};

export default App;