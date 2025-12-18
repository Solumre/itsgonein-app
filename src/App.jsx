import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState('PL'); 
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(null); // Mock user state
  const [voted, setVoted] = useState(false);

  // Data States
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  
  // MOCK NEWS DATA (Since API doesn't provide news)
  const newsFeed = [
    { id: 1, tag: 'RUMOR', title: 'Mbappé to Liverpool? Agent spotted in London.', time: '2h ago', img: '🔥' },
    { id: 2, tag: 'VIRAL', title: 'Haaland breaks another robot record.', time: '4h ago', img: '🤖' },
    { id: 3, tag: 'DRAMA', title: 'VAR Audio released: Ref made a huge mistake.', time: '6h ago', img: '⚠️' },
  ];

  // MOCK VOTING DATA
  const voteOptions = [
    { id: 1, name: 'Bellingham', team: 'Real Madrid', votes: 45 },
    { id: 2, name: 'Saka', team: 'Arsenal', votes: 30 },
    { id: 3, name: 'Salah', team: 'Liverpool', votes: 25 },
  ];

  const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php'; 

  const leagues = [
    { code: 'PL', name: 'Prem', icon: '🦁' },
    { code: 'PD', name: 'La Liga', icon: '🇪🇸' },
    { code: 'BL1', name: 'Bundesliga', icon: '🇩🇪' },
    { code: 'SA', name: 'Serie A', icon: '🇮🇹' },
    { code: 'FL1', name: 'Ligue 1', icon: '🇫🇷' },
  ];

  useEffect(() => {
    fetchData(activeTab, activeLeague);
  }, [activeTab, activeLeague]);

  const fetchData = async (tab, league) => {
    setLoading(true);
    try {
      // Fetch Standings
      const resTable = await fetch(`${PHP_PROXY_URL}?league=${league}&type=standings`);
      const dataTable = await resTable.json();
      
      if (dataTable.standings) {
        setTableData(dataTable.standings[0].table.map(t => ({
          ...t,
          shortName: t.team.shortName || t.team.name
        })));
      }

      // Fetch Scorers for "Top Stats"
      const resScorers = await fetch(`${PHP_PROXY_URL}?league=${league}&type=scorers`);
      const dataScorers = await resScorers.json();
      if (dataScorers.scorers) {
        setScorersData(dataScorers.scorers.slice(0, 3));
      }

    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setUser({ username: 'FootyFan_99', level: 5 });
    setShowLogin(false);
  };

  return (
    <div className="app-container">
      {/* LOGIN OVERLAY */}
      {showLogin && (
        <div className="modal-overlay">
          <div className="login-box">
            <h2>JOIN THE SQUAD</h2>
            <p>Vote for MVP, Comment, and Rank Up.</p>
            <form onSubmit={handleLogin}>
              <input type="text" placeholder="Username" />
              <input type="password" placeholder="Password" />
              <button type="submit" className="login-btn-action">ENTER GAME</button>
            </form>
            <button className="close-btn" onClick={() => setShowLogin(false)}>✕</button>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        
        {/* COL 1: NAVIGATION (Slimmer) */}
        <nav className="side-nav">
          <div className="brand">IG<span className="accent">I.</span></div>
          
          <div className="nav-group">
            <label>LEAGUES</label>
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
            <div className="nav-item">🔥 Trending</div>
            <div className="nav-item">💬 Forums</div>
            <div className="nav-item">👕 Shop</div>
          </div>
        </nav>

        {/* COL 2: MAIN FEED (The Table + Live) */}
        <main className="main-feed">
          <header className="feed-header">
            <h1>{leagues.find(l=>l.code===activeLeague)?.name} Season</h1>
            <div className="tabs">
              <button className={activeTab === 'TABLE' ? 'active' : ''} onClick={()=>setActiveTab('TABLE')}>Standings</button>
              <button className={activeTab === 'SCORERS' ? 'active' : ''} onClick={()=>setActiveTab('SCORERS')}>Stats</button>
            </div>
          </header>

          {/* DYNAMIC CARD: Top Scorer Spotlight */}
          {scorersData.length > 0 && (
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
            {loading ? <div className="loader">Loading Data...</div> : (
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Club</th>
                    <th>MP</th>
                    <th>W/D/L</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map(t => (
                    <tr key={t.team.id}>
                      <td className="rank">{t.position}</td>
                      <td className="team-flex">
                        <img src={t.team.crest} alt="" />
                        <span>{t.shortName}</span>
                      </td>
                      <td>{t.playedGames}</td>
                      <td className="form-mini">
                         <span className="w">{t.won}</span>/
                         <span className="d">{t.draw}</span>/
                         <span className="l">{t.lost}</span>
                      </td>
                      <td className="pts">{t.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* COL 3: SOCIAL & HYPE (New Engagement Section) */}
        <aside className="hype-zone">
          
          {/* USER PROFILE / LOGIN */}
          <div className="user-card">
            {user ? (
              <div className="logged-in">
                <div className="avatar">😎</div>
                <div className="user-info">
                  <h4>{user.username}</h4>
                  <span className="level">Lvl {user.level} Ultras</span>
                </div>
              </div>
            ) : (
              <div className="login-prompt">
                <p>Join the debate.</p>
                <button onClick={() => setShowLogin(true)}>LOGIN / SIGN UP</button>
              </div>
            )}
          </div>

          {/* VOTING SECTION */}
          <div className="widget-box vote-box">
            <div className="widget-header">
              <h3>PLAYER OF THE WEEK</h3>
              <span className="live-dot">● VOTING LIVE</span>
            </div>
            <div className="vote-list">
              {voteOptions.map(v => (
                <div 
                  key={v.id} 
                  className={`vote-item ${voted ? 'disabled' : ''}`}
                  onClick={() => setVoted(true)}
                >
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

          {/* NEWS FEED */}
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

          {/* STATS MARKET (Mocked for Visual Appeal) */}
          <div className="widget-box stats-box">
            <h3>MARKET MOVERS 📈</h3>
            <div className="market-row">
              <span>💎 Bellingham</span>
              <span className="price">€180M</span>
            </div>
            <div className="market-row">
              <span>💎 Haaland</span>
              <span className="price">€200M</span>
            </div>
            <div className="market-row down">
              <span>🔻 Antony</span>
              <span className="price">€25M</span>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
};

export default App;