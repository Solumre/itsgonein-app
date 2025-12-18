import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState('PL'); 
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState([]);
   const [selectedTeams, setSelectedTeams] = useState([]);

  // UPDATE THIS URL TO YOUR HOSTINGER URL
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
    // Reset selection when changing leagues
    if(tab === 'TABLE') setSelectedTeams([]); 
    
    let typeParam = 'standings';
    if (tab === 'SCORERS') typeParam = 'scorers';
    if (tab === 'FIXTURES') typeParam = 'matches';

    try {
      const res = await fetch(`${PHP_PROXY_URL}?league=${league}&type=${typeParam}`);
      const data = await res.json();
      
      if (data.standings) {
        // Process Table Data
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
          // Calculate "Power Stats" for the Pitch Visualizer
          attPwr: Math.min(100, Math.round((t.goalsFor / t.playedGames) * 35)), 
          defPwr: Math.min(100, Math.round(100 - (t.goalsAgainst / t.playedGames) * 30))
        }));
        setTableData(cleanTable);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

   const handleTeamClick = (team) => {
    if (selectedTeams.find(t => t.id === team.id)) {
      setSelectedTeams(selectedTeams.filter(t => t.id !== team.id));
    } else {
      // Allow max 1 team for detailed view, or 2 for comparison. 
      // Let's do 2 for comparison logic.
      if (selectedTeams.length < 2) setSelectedTeams([...selectedTeams, team]);
      else setSelectedTeams([selectedTeams[1], team]);
    }
  };

  return (
    <div className="app-container">
      {/* 1. TICKER FIXED */}
      <div className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-scroll">
          {/* Duplicate content to create seamless loop */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className="ticker-group">
              <span className="ticker-item">Man City <b style={{color:'#00ff88', margin:'0 6px'}}>3 - 1</b> Arsenal</span>
              <span className="ticker-item">Real Madrid <b style={{color:'#00ff88', margin:'0 6px'}}>2 - 0</b> Barcelona</span>
              <span className="ticker-item">Bayern <b style={{color:'#aaa', margin:'0 6px'}}>0 - 0</b> Dortmund</span>
            </div>
          ))}
        </div>
      </div>
       <div className="dashboard-layout">
        {/* 2. SIDEBAR WITH NEW LEAGUES */}
        <nav className="side-nav">
          <div className="brand">ITS<span style={{color:'var(--green)'}}>GONE</span>IN.</div>
          <div className="nav-section">
            <label>Competitions</label>
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

        {/* 3. MAIN TABLE */}
        <main className="main-stage">
           <div className="data-card">
            {loading ? <div style={{padding:40, textAlign:'center', color:'#555'}}>Scouting Data...</div> : (
              <table className="pro-table">
                <thead>
                  <tr>
                    <th width="40">#</th>
                    <th>CLUB</th>
                    <th>PL</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GD</th>
                    <th className="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map(t => {
                    const isSelected = selectedTeams.find(s => s.id === t.id);
                    return (
                      <tr key={t.id} onClick={() => handleTeamClick(t)} style={{background: isSelected ? 'rgba(0,255,136,0.05)' : ''}}>
                        <td className="rank-cell">{t.rank}</td>
                        <td>
                          <div className="team-cell">
                            <img src={t.crest} className="team-crest" alt="" />
                            {t.name}
                          </div>
                        </td>
                        <td style={{color:'#64748b'}}>{t.played}</td>
                        <td>{t.won}</td>
                        <td>{t.draw}</td>
                        <td>{t.lost}</td>
                        <td style={{fontFamily:'monospace'}}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                        <td className="points-cell">{t.pts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* 4. TACTICAL ANALYST (Refined) */}
        <section className="analyst-view">
          <label style={{fontSize:10, letterSpacing:1, color:'#64748b', fontWeight:700}}>TACTICAL PROFILE</label>
          
          {selectedTeams.length > 0 ? (
            <>
              {/* Dynamic Pitch Visualizer */}
              <div className="pro-pitch">
                <div className="zone-control">
                  {/* Attack Zone (Top) */}
                  <div className={`zone ${selectedTeams[0].attPwr > 80 ? 'zone-active' : ''}`}>
                    HIGH PRESS
                  </div>
                  {/* Midfield Zone */}
                  <div className="zone">CONTROL</div>
                  {/* Defense Zone (Bottom) */}
                  <div className={`zone ${selectedTeams[0].defPwr < 60 ? 'zone-danger' : ''}`}>
                    DEFENSIVE LINE
                  </div>
                </div>
              </div>

              {/* Stats Bars */}
              <div className="stats-panel">
                <div className="stat-bar-group">
                  <div className="stat-header">
                    <span>ATTACKING THREAT</span>
                    <span style={{color:'var(--green)'}}>{selectedTeams[0].attPwr}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{width: `${selectedTeams[0].attPwr}%`, background: 'var(--green)'}}></div>
                  </div>
                </div>
 
                <div className="stat-bar-group">
                  <div className="stat-header">
                    <span>DEFENSIVE SOLIDITY</span>
                    <span style={{color: selectedTeams[0].defPwr < 60 ? 'var(--danger)' : '#3b82f6'}}>
                      {selectedTeams[0].defPwr}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{
                      width: `${selectedTeams[0].defPwr}%`, 
                      background: selectedTeams[0].defPwr < 60 ? 'var(--danger)' : '#3b82f6'
                    }}></div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{color:'#444', fontSize:12, fontStyle:'italic'}}>
              Select a team to view tactical analysis.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default App;