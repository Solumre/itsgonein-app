import React, { useState, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [activeLeague, setActiveLeague] = useState('PL'); // Default Premier League
  const [loading, setLoading] = useState(true);
  
  // Dynamic Data States
  const [tableData, setTableData] = useState([]);
  const [scorersData, setScorersData] = useState([]);
  const [fixturesData, setFixturesData] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  // URL to your PHP file (Change relative path if needed)
  // Assuming React and PHP are served from same origin, or use full URL like 'http://localhost:8000/api.php'
const PHP_PROXY_URL = 'https://itsgonein.com/football-proxy.php';

  // --- FETCHING LOGIC ---
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

      if (data.error) {
        console.error("API Error:", data.error);
        setLoading(false);
        return;
      }

      // --- DATA MAPPING STRATEGY ---
      if (tab === 'TABLE' && data.standings) {
        const cleanTable = data.standings[0].table.map(t => ({
          id: t.team.id,
          rank: t.position,
          name: t.team.shortName || t.team.name,
          crest: t.team.crest, // Real logo
          form: t.form, // "W,W,L..."
          gd: t.goalDifference,
          pts: t.points,
          // Calculate synthetic stats for the Analyst Panel based on real performance
          attack: Math.min(100, Math.round((t.goalsFor / t.playedGames) * 35)), 
          defense: Math.min(100, Math.round(100 - (t.goalsAgainst / t.playedGames) * 30)),
          primaryColor: '#ffffff' // We'll default to white, or extract if you have a helper
        }));
        setTableData(cleanTable);
      } 
      else if (tab === 'SCORERS' && data.scorers) {
        const cleanScorers = data.scorers.map((s, index) => ({
          rank: index + 1,
          name: s.player.name,
          team: s.team.shortName,
          goals: s.goals
        }));
        setScorersData(cleanScorers);
      }
      else if (tab === 'FIXTURES' && data.matches) {
        // Filter only upcoming matches
        const upcoming = data.matches
          .filter(m => m.status !== 'FINISHED')
          .slice(0, 12) // Show next 12 games
          .map(m => ({
            date: new Date(m.utcDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
            time: new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            home: m.homeTeam.shortName || m.homeTeam.name,
            away: m.awayTeam.shortName || m.awayTeam.name,
          }));
        setFixturesData(upcoming);
      }

    } catch (err) {
      console.error("Connection Failed:", err);
    }
    setLoading(false);
  };

  // --- SELECTION LOGIC ---
  const handleTeamClick = (team) => {
    if (selectedTeams.find(t => t.id === team.id)) {
    setSelectedTeams(selectedTeams.filter(t => t.id !== team.id));
    } else {
     if (selectedTeams.length < 2) {
        setSelectedTeams([...selectedTeams, team]);
    } else {
        setSelectedTeams([selectedTeams[1], team]);
      }
    }
  };

  return (
    <div className="app-container">
      {/* PREMIUM TICKER BAR */}
      <header className="top-ticker">
        <div className="live-badge">LIVE</div>
        <div className="ticker-scroll">
           {/* Static Ticker for aesthetic (API doesn't provide live minute-by-minute updates on free tier) */}
            <div className="ticker-group">
              <span>Wolverhampton 1 - 1 Brentford <span className="time-min">88'</span> <b className="sep">|</b></span>
              <span>Tottenham 0 - 2 Liverpool <span className="time-min">HT</span> <b className="sep">|</b></span>
              <span>Everton vs Arsenal <span className="time-upcoming">17:30</span> <b className="sep">|</b></span>
            </div>
      </div>
      </header>

      <div className="dashboard-layout">
        {/* SIDEBAR */}
        <nav className="side-nav">
          <div className="brand">
            ITS<span className="accent-green">GONE</span>IN<span className="accent-green">.</span>
          </div>
          <div className="nav-section">
            <label>ELITE CIRCUITS</label>
            {/* These buttons now trigger real data refreshes */}
            <div onClick={() => setActiveLeague('PL')} className={`nav-item ${activeLeague === 'PL' ? 'active' : ''}`}>Premier League</div>
            <div onClick={() => setActiveLeague('PD')} className={`nav-item ${activeLeague === 'PD' ? 'active' : ''}`}>La Liga</div>
            <div onClick={() => setActiveLeague('SA')} className={`nav-item ${activeLeague === 'SA' ? 'active' : ''}`}>Serie A</div>
            <div onClick={() => setActiveLeague('BL1')} className={`nav-item ${activeLeague === 'BL1' ? 'active' : ''}`}>Bundesliga</div>
          </div>
        </nav>

        {/* CENTER CONTENT */}
        <main className="main-stage">
          <div className="content-tabs">
            {['TABLE', 'SCORERS', 'FIXTURES'].map(tab => (
              <button 
                key={tab}
                className={activeTab === tab ? 'tab active' : 'tab'}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="data-card">
            {loading ? (
              <div className="loading-state">Scanning Network Data...</div>
            ) : (
              <>
                {activeTab === 'TABLE' && (
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th width="50">#</th>
                        <th>TEAM</th>
                        <th className="text-center">FORM</th>
                        <th className="text-center">GD</th>
                        <th className="text-right">PTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((t) => {
                        const isSelected = selectedTeams.find(s => s.id === t.id);
                        return (
                          <tr 
                            key={t.rank} 
                            onClick={() => handleTeamClick(t)}
                            className={isSelected ? 'row-selected' : ''}
                          >
                            <td className="rank-cell">{t.rank}</td>
                            <td>
                              <div className="team-cell">
                                <img src={t.crest} className="team-crest" alt="crest" />
                                {t.name}
                              </div>
                            </td>
                            <td className="text-center form-guide">
                              {/* Parse the API "W,L,W" string */}
                              {t.form && t.form.split(',').map((r, i) => (
                                <span key={i} className={`form-dot ${r}`}>{r}</span>
                              ))}
                            </td>
                            <td className="text-center dim">{t.gd}</td>
                            <td className="text-right highlight-green">{t.pts}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'SCORERS' && (
                  <div className="scorers-list">
                    {scorersData.map((s) => (
                      <div key={s.name} className="stat-row">
                        <span className="stat-rank">{s.rank}</span>
                        <div className="stat-info">
                          <span className="stat-name">{s.name}</span>
                          <span className="stat-team">{s.team}</span>
                        </div>
                        <div className="stat-value">{s.goals} <small>GOALS</small></div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'FIXTURES' && (
                  <div className="fixtures-grid">
                    {fixturesData.map((f, i) => (
                      <div key={i} className="fixture-card">
                        <div className="fixture-date">{f.date} • {f.time}</div>
                        <div className="fixture-teams">
                          <span>{f.home}</span>
                          <span className="vs">VS</span>
                          <span>{f.away}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* RIGHT ANALYST PANEL */}
        <section className="analyst-view">
          <label className="panel-label">TACTICAL ANALYST</label>
          
          <div className="pro-pitch">
            <div className="pitch-lines">
              <div className="box-top"></div>
              <div className="center-circle"></div>
              <div className="center-line"></div>
              <div className="box-bottom"></div>
            </div>
            
          <div className="pitch-overlay">
              {selectedTeams.length === 0 ? (
                <p className="animate-pulse">Select teams to analyze</p>
              ) : (
               <div className="pitch-visuals">
                   <div className="heat-zone" style={{
                     background: `radial-gradient(circle, #ffffff40 0%, transparent 70%)`
                   }}></div>
                   {selectedTeams[1] && (
                     <div className="heat-zone zone-bottom" style={{
                       background: `radial-gradient(circle, #00ff8840 0%, transparent 70%)`
                     }}></div>
                   )}
                </div>
              )}
            </div>
          </div>

          <div className="h2h-footer">
            <label className="panel-label">H2H COMPARISON</label>
            
            {selectedTeams.length < 2 ? (
               <div className="empty-state">
                 <p className="hint">Select 2 teams to compare stats.</p>
                 <div className="selection-indicators">
                   <div className={`ind ${selectedTeams[0] ? 'filled' : ''}`}></div>
                   <div className={`ind ${selectedTeams[1] ? 'filled' : ''}`}></div>
                 </div>
               </div>
            ) : (
              <div className="comparison-engine">
                <div className="comp-header">
                  <span>{selectedTeams[0].name}</span>
                  <span className="vs-badge">VS</span>
                  <span>{selectedTeams[1].name}</span>
                </div>
                
                {/* Calculated Attack Power */}
                <div className="stat-bar-group">
                  <div className="stat-label">
                    <span>{selectedTeams[0].attack}</span>
                    <small>ATT PWR</small>
                    <span>{selectedTeams[1].attack}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill left" style={{width: `${selectedTeams[0].attack}%`, background: 'white'}}></div>
                    <div className="bar-fill right" style={{width: `${selectedTeams[1].attack}%`, background: '#00ff88'}}></div>
                  </div>
                </div>

                {/* Calculated Defensive Solidity */}
                <div className="stat-bar-group">
                  <div className="stat-label">
                    <span>{selectedTeams[0].defense}</span>
                    <small>DEF PWR</small>
                    <span>{selectedTeams[1].defense}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill left" style={{width: `${selectedTeams[0].defense}%`, background: 'white'}}></div>
                    <div className="bar-fill right" style={{width: `${selectedTeams[1].defense}%`, background: '#00ff88'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;