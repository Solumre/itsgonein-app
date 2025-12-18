import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState('PL'); 
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // YOUR HOSTINGER URL
  const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php'; 

  const leagues = [
    { code: 'PL', name: 'Premier League' },
    { code: 'PD', name: 'La Liga' },
    { code: 'BL1', name: 'Bundesliga' },
    { code: 'SA', name: 'Serie A' },
    { code: 'FL1', name: 'Ligue 1' },
    { code: 'DED', name: 'Eredivisie' },
    { code: 'BSA', name: 'Brasileirão' },
  ];

  useEffect(() => {
    fetchData(activeTab, activeLeague);
  }, [activeTab, activeLeague]);

  const fetchData = async (tab, league) => {
     setLoading(true);
    let typeParam = 'standings';
    if (tab === 'SCORERS') typeParam = 'scorers';
    if (tab === 'FIXTURES') typeParam = 'matches';

    try {
      const res = await fetch(`${PHP_PROXY_URL}?league=${league}&type=${typeParam}`);
      const data = await res.json();
      
      // 1. TABLE DATA
      if (tab === 'TABLE' && data.standings) {
        const cleanTable = data.standings[0].table.map(t => ({
          id: t.team.id,
          rank: t.position,
          name: t.team.shortName || t.team.name,
          crest: t.team.crest,
          played: t.playedGames,
          won: t.won,
          draw: t.draw,
          lost: t.lost,
          gd: t.goalDifference,
          pts: t.points,
          form: t.form, // "W,W,L,D,W"
          goalsFor: t.goalsFor,
          goalsAgainst: t.goalsAgainst
        }));
        setTableData(cleanTable);
      } 
      // 2. SCORERS DATA
      else if (tab === 'SCORERS' && data.scorers) {
        const cleanScorers = data.scorers.map((s, index) => ({
          rank: index + 1,
          name: s.player.name,
          team: s.team.shortName,
          goals: s.goals,
          assists: s.assists || 0
        }));
        setScorersData(cleanScorers);
      }
      // 3. FIXTURES DATA
      else if (tab === 'FIXTURES' && data.matches) {
        const upcoming = data.matches
          .filter(m => m.status !== 'FINISHED')
          .slice(0, 15)
          .map(m => ({
            id: m.id,
            date: new Date(m.utcDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            time: new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            home: m.homeTeam.shortName || m.homeTeam.name,
            away: m.awayTeam.shortName || m.awayTeam.name,
          }));
        setFixturesData(upcoming);
      }

    } catch (err) {
      console.error(err);
    }
    setLoading(false);
   };

   return (
    <div className="app-container">
      {/* 1. FIXED TICKER (Full width, no overlap) */}
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-wrapper">
           <div className="ticker-content">
              <span>Man City <b className="score">3-1</b> Arsenal</span>
              <span>Real Madrid <b className="score">2-0</b> Barcelona</span>
              <span>Bayern <b className="score">0-0</b> Dortmund</span>
              <span>PSG <b className="score">4-1</b> Lyon</span>
              <span>Ajax <b className="score">1-0</b> Feyenoord</span>
              <span>Flamengo <b className="score">2-2</b> Santos</span>
              {/* Duplicate for infinite loop */}
              <span>Man City <b className="score">3-1</b> Arsenal</span>
              <span>Real Madrid <b className="score">2-0</b> Barcelona</span>
              <span>Bayern <b className="score">0-0</b> Dortmund</span>
              <span>PSG <b className="score">4-1</b> Lyon</span>
           </div>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* SIDEBAR */}
        <nav className="side-nav">
          <div className="brand">ITS<span className="accent">GONE</span>IN.</div>
          <div className="nav-section">
            <label>LEAGUES</label>
            {leagues.map(l => (
              <div 
                key={l.code} 
                className={`nav-item ${activeLeague === l.code ? 'active' : ''}`}
                onClick={() => setActiveLeague(l.code)}
              >
                {l.name}
              </div>
            ))}
          </div>
        </nav>

        {/* MAIN STAGE */}
        <main className="main-stage">
          {/* 2. TABS RESTORED HERE */}
          <div className="tabs-header">
            {['TABLE', 'SCORERS', 'FIXTURES'].map(tab => (
              <button 
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="data-card">
            {loading && <div className="loading-msg">Fetching Live Data...</div>}
            
            {!loading && activeTab === 'TABLE' && (
              <table className="pro-table">
                <thead>
                  <tr>
                    <th width="40">#</th>
                    <th>CLUB</th>
                    <th>PL</th>
                     <th>GD</th>
                    <th className="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map(t => (
                    <tr 
                      key={t.id} 
                      onClick={() => setSelectedTeam(t)} 
                      className={selectedTeam?.id === t.id ? 'row-selected' : ''}
                    >
                      <td className="rank-cell">{t.rank}</td>
                      <td>
                        <div className="team-cell">
                          <img src={t.crest} className="team-crest" alt="" />
                          {t.name}
                        </div>
                      </td>
                      <td className="dim-text">{t.played}</td>
                      <td className="mono-text">{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                      <td className="points-cell">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && activeTab === 'SCORERS' && (
              <div className="list-view">
                {scorersData.map(s => (
                  <div key={s.name} className="list-row">
                     <span className="rank-badge">{s.rank}</span>
                     <div className="list-info">
                       <span className="list-name">{s.name}</span>
                       <span className="list-sub">{s.team}</span>
                     </div>
                     <span className="list-value">{s.goals}</span>
                  </div>
                ))}
              </div>
            )}

            {!loading && activeTab === 'FIXTURES' && (
              <div className="fixtures-grid">
                {fixturesData.map(f => (
                  <div key={f.id} className="fixture-box">
                    <div className="fixture-meta">{f.date} <span className="dot">•</span> {f.time}</div>
                    <div className="fixture-vs">
                      <span>{f.home}</span>
                      <span className="vs-label">VS</span>
                      <span>{f.away}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* 3. NEW RIGHT PANEL (Replaces empty blob) */}
        <section className="analyst-view">
          <label className="panel-title">TEAM INTELLIGENCE</label>
          
          {selectedTeam ? (
            <div className="team-profile">
               <div className="profile-header">
                  <img src={selectedTeam.crest} className="profile-crest" alt="" />
                  <h2>{selectedTeam.name}</h2>
                  <span className="rank-tag">Rank #{selectedTeam.rank}</span>
               </div>

               <div className="stat-block">
                 <label>RECENT FORM</label>
                 <div className="form-row">
                   {selectedTeam.form ? selectedTeam.form.split(',').map((r, i) => (
                     <span key={i} className={`form-pill ${r}`}>{r}</span>
                   )) : <span className="no-data">N/A</span>}
                 </div>
               </div>

               <div className="stat-grid">
                 <div className="mini-stat">
                   <span className="val">{(selectedTeam.goalsFor / selectedTeam.played).toFixed(1)}</span>
                   <label>Goals / Game</label>
                 </div>
                 <div className="mini-stat">
                   <span className="val" style={{color:'#ff4757'}}>{(selectedTeam.goalsAgainst / selectedTeam.played).toFixed(1)}</span>
                   <label>Conceded / Game</label>
                 </div>
               </div>

               <div className="efficiency-bar">
                  <label>Win Rate</label>
                  <div className="progress-bg">
                    <div 
                      className="progress-fill" 
                      style={{width: `${(selectedTeam.won / selectedTeam.played) * 100}%`}}
                    ></div>
                  </div>
                  <span className="perc">{Math.round((selectedTeam.won / selectedTeam.played) * 100)}%</span>
               </div>

            </div>
          ) : (
            <div className="empty-state">
              <p>Select a club from the table to view their intelligence report.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default App;