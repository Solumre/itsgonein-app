import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, provider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState('PL'); 
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [voted, setVoted] = useState(false);

  // Data States
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  
  // MOCK DATA
  const newsFeed = [
    { id: 1, tag: 'RUMOR', title: 'Mbappé to Liverpool? Agent spotted in London.', time: '2h ago', img: '🔥' },
    { id: 2, tag: 'VIRAL', title: 'Haaland breaks another robot record.', time: '4h ago', img: '🤖' },
    { id: 3, tag: 'DRAMA', title: 'VAR Audio released: Ref made a huge mistake.', time: '6h ago', img: '⚠️' },
  ];

   const voteOptions = [
    { id: 1, name: 'Bellingham', team: 'Real Madrid', votes: 45 },
    { id: 2, name: 'Saka', team: 'Arsenal', votes: 30 },
    { id: 3, name: 'Salah', team: 'Liverpool', votes: 25 },
  ];

  const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php'; 

 const leagues = [
    { code: 'PL', name: 'Premier League', icon: '🦁' },
    { code: 'PD', name: 'La Liga', icon: '🇪🇸' },
    { code: 'BL1', name: 'Bundesliga', icon: '🇩🇪' },
    { code: 'SA', name: 'Serie A', icon: '🇮🇹' },
    { code: 'FL1', name: 'Ligue 1', icon: '🇫🇷' },
    { code: 'DED', name: 'Eredivisie', icon: '🇳🇱' },
    { code: 'BSA', name: 'Brasileirão', icon: '🇧🇷' },
    { code: 'PPL', name: 'Primeira Liga', icon: '🇵🇹' }
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchData(activeTab, activeLeague);
  }, [activeTab, activeLeague]);

  const fetchData = async (tab, league) => {
    setLoading(true);
    try {
       const resTable = await fetch(`${PHP_PROXY_URL}?league=${league}&type=standings`);
       const dataTable = await resTable.json();
      if (dataTable.standings) {
        setTableData(dataTable.standings[0].table.map(t => ({
          ...t,
          shortName: t.team.shortName || t.team.name
        })));
      }

      if (tab === 'TABLE' || tab === 'SCORERS') {
        const resScorers = await fetch(`${PHP_PROXY_URL}?league=${league}&type=scorers`);
        const dataScorers = await resScorers.json();
        if (dataScorers.scorers) {
          setScorersData(dataScorers.scorers);
        }
      }

      if (tab === 'FIXTURES') {
        const resFixtures = await fetch(`${PHP_PROXY_URL}?league=${league}&type=matches`);
        const dataFixtures = await resFixtures.json();
        if (dataFixtures.matches) {
           const upcoming = dataFixtures.matches
            .filter(m => m.status !== 'FINISHED')
            .slice(0, 15)
            .map(m => ({
              id: m.id,
              date: new Date(m.utcDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              time: new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              home: m.homeTeam.shortName || m.homeTeam.name,
              away: m.awayTeam.shortName || m.awayTeam.name,
              homeCrest: m.homeTeam.crest,
              awayCrest: m.awayTeam.crest
            }));
          setFixturesData(upcoming);
        }
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Login Error:", error); }
  };

  const handleLogout = async () => { await signOut(auth); };

  return (
    <div className="app-container">
      {/* 1. TICKER RESTORED HERE */}
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-wrapper">
           <div className="ticker-content">
              <span>Man City <b className="score">3-1</b> Arsenal <span className="min">88'</span></span>
              <span>Real Madrid <b className="score">2-0</b> Barcelona <span className="min">HT</span></span>
              <span>Bayern <b className="score">0-0</b> Dortmund <span className="min">12'</span></span>
              <span>PSG <b className="score">4-1</b> Lyon <span className="min">FT</span></span>
              <span>Ajax <b className="score">1-0</b> Feyenoord <span className="min">LIVE</span></span>
              <span>Flamengo <b className="score">2-2</b> Santos <span className="min">90+2'</span></span>
              {/* Duplicate for infinite loop */}
              <span>Man City <b className="score">3-1</b> Arsenal <span className="min">88'</span></span>
              <span>Real Madrid <b className="score">2-0</b> Barcelona <span className="min">HT</span></span>
              <span>Bayern <b className="score">0-0</b> Dortmund <span className="min">12'</span></span>
              <span>PSG <b className="score">4-1</b> Lyon <span className="min">FT</span></span>
           </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* COL 1: SIDEBAR */}
        <nav className="side-nav">
          <div className="brand">ITS<span className="accent">GONE</span>IN.</div>
          <div className="nav-group">
            <label>ELITE CIRCUITS</label>
            {leagues.map(l => (
              <div 
                key={l.code} 
                className={`nav-item ${activeLeague === l.code ? 'active' : ''}`}
                onClick={() => setActiveLeague(l.code)}
              >
                <span className="nav-icon">{l.icon}</span>
                <span className="nav-text">{l.name}</span>
              </div>
            ))}
          </div>
           <div className="nav-group">
             <label>COMMUNITY</label>
             <div className="nav-item"><span className="nav-icon">🔥</span> Trending</div>
             <div className="nav-item"><span className="nav-icon">💬</span> Forums</div>
          </div>
        </nav>

        {/* COL 2: MAIN FEED */}
        <main className="main-feed">
          <header className="feed-header">
            <div className="header-title">
              <h1>{leagues.find(l=>l.code===activeLeague)?.name}</h1>
              <span>Season 2024/25</span>
            </div>
            <div className="tabs">
              <button className={`tab-btn ${activeTab === 'TABLE' ? 'active' : ''}`} onClick={()=>setActiveTab('TABLE')}>STANDINGS</button>
              <button className={`tab-btn ${activeTab === 'SCORERS' ? 'active' : ''}`} onClick={()=>setActiveTab('SCORERS')}>TOP SCORERS</button>
              <button className={`tab-btn ${activeTab === 'FIXTURES' ? 'active' : ''}`} onClick={()=>setActiveTab('FIXTURES')}>FIXTURES</button>
            </div>
          </header>

          <div className="feed-content">
            {activeTab !== 'FIXTURES' && scorersData.length > 0 && (
              <div className="spotlight-card">
                <div className="spotlight-info">
                  <span className="badge">GOLDEN BOOT RACE</span>
                  <h3>{scorersData[0].player.name}</h3>
                  <p>{scorersData[0].team.shortName}</p>
                </div>
                <div className="spotlight-stat">
                  <span className="big-num">{scorersData[0].goals}</span>
                  <span className="label">GOALS</span>
                </div>
              </div>
            )}

            <div className="data-container">
              {loading && <div style={{padding:40, textAlign:'center', color:'#666'}}>Scouting Data...</div>}
              
              {!loading && activeTab === 'TABLE' && (
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th width="50">#</th>
                      <th>CLUB</th>
                      <th>MP</th>
                      <th>W / D / L</th>
                      <th className="text-right">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map(t => (
                      <tr key={t.team.id}>
                        <td className="rank">{t.position}</td>
                        <td>
                          <div className="team-flex">
                            <img src={t.team.crest} alt="" />
                            <span>{t.shortName}</span>
                          </div>
                        </td>
                        <td style={{color:'#666'}}>{t.playedGames}</td>
                        <td className="form-mini">
                          <span className="w">{t.won}</span> / <span style={{color:'#666'}}>{t.draw}</span> / <span className="l">{t.lost}</span>
                        </td>
                        <td className="pts">{t.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!loading && activeTab === 'SCORERS' && (
                <div className="scorers-list">
                  {scorersData.map((s, i) => (
                    <div key={i} className="list-row">
                      <div className="rank-badge">{i + 1}</div>
                      <div className="list-info">
                        <span className="list-name">{s.player.name}</span>
                        <span className="list-sub">{s.team.shortName}</span>
                      </div>
                      <div className="list-stat">
                        <span className="stat-val">{s.goals}</span>
                        <span className="stat-label">GOALS</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && activeTab === 'FIXTURES' && (
                <div className="fixtures-list">
                  {fixturesData.map((f) => (
                    <div key={f.id} className="fixture-row">
                      <div className="fixture-date">
                        <span className="date">{f.date}</span>
                        <span className="time">{f.time}</span>
                      </div>
                      <div className="fixture-matchup">
                        <div className="team home">
                          <span>{f.home}</span>
                          {f.homeCrest && <img src={f.homeCrest} alt="" />}
                        </div>
                        <div className="vs-badge">VS</div>
                        <div className="team away">
                          {f.awayCrest && <img src={f.awayCrest} alt="" />}
                          <span>{f.away}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* COL 3: SOCIAL HYPE */}
         <aside className="hype-zone">
          <div className="user-card">
            {user ? (
              <div className="logged-in">
                <img src={user.photoURL} className="avatar-img" alt="User" />
                <div className="user-info">
                  <h4>{user.displayName}</h4>
                  <button onClick={handleLogout} className="logout-btn">Sign Out</button>
                </div>
              </div>
            ) : (
              <div className="login-prompt">
                <p>Join the debate & vote.</p>
                <button onClick={handleGoogleLogin} className="google-btn">SIGN IN WITH GOOGLE</button>
              </div>
            )}
          </div>
           <div className="widget-box vote-box">
            <div className="widget-header">
              <h3>PLAYER OF THE WEEK</h3>
              <span className="live-dot">VOTING LIVE</span>
            </div>
            <div className="vote-list">
              {voteOptions.map(v => (
                <div key={v.id} className={`vote-item ${voted ? 'disabled' : ''}`} onClick={() => setVoted(true)}>
                  <div className="vote-info">
                    <span>{v.name}</span>
                    <small>{v.team}</small>
                  </div>
                  {voted && <div className="vote-perc">{v.votes}%</div>}
                  {voted && <div className="vote-bar" style={{width: `${v.votes}%`}}></div>}
                </div>
              ))}
            </div>
          </div>
           <div className="widget-box news-box">
            <h3>LATEST DROPS</h3>
            {newsFeed.map(news => (
              <div key={news.id} className="news-item">
                <div className="news-icon">{news.img}</div>
                <div className="news-content">
                  <span className={`tag ${news.tag}`}>{news.tag}</span>
                  <p>{news.title}</p>
                  <small>{news.time}</small>
                </div>
              </div>
            ))}
          </div>
         </aside>
      </div>
    </div>
  );
};

export default App;