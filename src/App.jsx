import React, { useState } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');
  const [selectedTeams, setSelectedTeams] = useState([]);

  // Data with slightly more detail for the comparison
  const tableData = [
    { id: 1, rank: 1, name: 'Arsenal', gd: 20, pts: 36, color: '#ef0107', form: 'WWWDW', attack: 88, defense: 82 },
    { id: 2, rank: 2, name: 'Man City', gd: 22, pts: 34, color: '#6caded', form: 'WDWWL', attack: 94, defense: 75 },
    { id: 3, rank: 3, name: 'Aston Villa', gd: 8, pts: 33, color: '#95bfe5', form: 'LWWWD', attack: 78, defense: 70 },
    { id: 4, rank: 4, name: 'Chelsea', gd: 12, pts: 28, color: '#034694', form: 'DDWWW', attack: 81, defense: 68 },
    { id: 5, rank: 5, name: 'Crystal Palace', gd: 5, pts: 26, color: '#1b458f', form: 'WLLDD', attack: 65, defense: 60 },
  ];

  const scorersData = [
    { rank: 1, name: 'Erling Haaland', team: 'Man City', goals: 14, shots: 45 },
    { rank: 2, name: 'Mohamed Salah', team: 'Liverpool', goals: 11, shots: 38 },
    { rank: 3, name: 'Ollie Watkins', team: 'Aston Villa', goals: 10, shots: 32 },
  ];

  const fixturesData = [
    { home: 'Liverpool', away: 'Arsenal', time: 'SUN 16:30', date: 'Dec 22' },
    { home: 'West Ham', away: 'Man Utd', time: 'SAT 12:30', date: 'Dec 21' },
    { home: 'Spurs', away: 'Chelsea', time: 'SUN 14:00', date: 'Dec 22' },
  ];

  // Logic: Select max 2 teams
  const handleTeamClick = (team) => {
    if (selectedTeams.find(t => t.id === team.id)) {
      // Deselect if already clicked
      setSelectedTeams(selectedTeams.filter(t => t.id !== team.id));
    } else {
      // Add if less than 2 selected
      if (selectedTeams.length < 2) {
        setSelectedTeams([...selectedTeams, team]);
      } else {
        // If 2 already selected, replace the first one (shift)
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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="ticker-group">
              <span>Wolverhampton 1 - 1 Brentford <span className="time-min">88'</span> <b className="sep">|</b></span>
              <span>Tottenham 0 - 2 Liverpool <span className="time-min">HT</span> <b className="sep">|</b></span>
              <span>Everton vs Arsenal <span className="time-upcoming">17:30</span> <b className="sep">|</b></span>
            </div>
          ))}
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
            <div className="nav-item active">Premier League</div>
            <div className="nav-item">La Liga</div>
            <div className="nav-item">Serie A</div>
            <div className="nav-item">Bundesliga</div>
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
                            <span className="team-dot" style={{ backgroundColor: t.color }}></span>
                            {t.name}
                          </div>
                        </td>
                        <td className="text-center form-guide">
                          {t.form.split('').map((r, i) => (
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

            {/* ... (SCORERS and FIXTURES remain same as your original) ... */}
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
          </div>
        </main>

        {/* RIGHT ANALYST PANEL (NOW FUNCTIONAL) */}
        <section className="analyst-view">
          <label className="panel-label">TACTICAL ANALYST</label>
          
          <div className="pro-pitch">
            <div className="pitch-lines">
              <div className="box-top"></div>
              <div className="center-circle"></div>
              <div className="center-line"></div>
              <div className="box-bottom"></div>
            </div>
            
            {/* Dynamic Pitch Content */}
            <div className="pitch-overlay">
              {selectedTeams.length === 0 ? (
                <p className="animate-pulse">Select teams to analyze</p>
              ) : (
                <div className="pitch-visuals">
                   {/* Abstract visualization of team pressure */}
                   <div className="heat-zone" style={{
                     background: `radial-gradient(circle, ${selectedTeams[0].color}40 0%, transparent 70%)`
                   }}></div>
                   {selectedTeams[1] && (
                     <div className="heat-zone zone-bottom" style={{
                       background: `radial-gradient(circle, ${selectedTeams[1].color}40 0%, transparent 70%)`
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
                 <p className="hint">Select 2 teams from the table to compare stats.</p>
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
                
                {/* Stat Bar 1: Attack */}
                <div className="stat-bar-group">
                  <div className="stat-label">
                    <span>{selectedTeams[0].attack}</span>
                    <small>ATT PWR</small>
                    <span>{selectedTeams[1].attack}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill left" style={{width: `${selectedTeams[0].attack}%`, background: selectedTeams[0].color}}></div>
                    <div className="bar-fill right" style={{width: `${selectedTeams[1].attack}%`, background: selectedTeams[1].color}}></div>
                  </div>
                </div>

                {/* Stat Bar 2: Defense */}
                <div className="stat-bar-group">
                  <div className="stat-label">
                    <span>{selectedTeams[0].defense}</span>
                    <small>DEF PWR</small>
                    <span>{selectedTeams[1].defense}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill left" style={{width: `${selectedTeams[0].defense}%`, background: selectedTeams[0].color}}></div>
                    <div className="bar-fill right" style={{width: `${selectedTeams[1].defense}%`, background: selectedTeams[1].color}}></div>
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