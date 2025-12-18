import React, { useState } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');

  // Realistic Data Sets
  const tableData = [
    { rank: 1, name: 'Arsenal', gd: 20, pts: 36, color: '#ef0107' },
    { rank: 2, name: 'Man City', gd: 22, pts: 34, color: '#6caded' },
    { rank: 3, name: 'Aston Villa', gd: 8, pts: 33, color: '#95bfe5' },
    { rank: 4, name: 'Chelsea', gd: 12, pts: 28, color: '#034694' },
    { rank: 5, name: 'Crystal Palace', gd: 5, pts: 26, color: '#1b458f' },
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

  return (
    <div className="app-container">
      {/* PREMIUM TICKER BAR */}
      <header className="top-ticker">
        <div className="ticker-scroll">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="ticker-group">
              <span>Wolverhampton vs Brentford <b className="sep">|</b></span>
              <span>Tottenham vs Liverpool <b className="sep">|</b></span>
              <span>Everton vs Arsenal <b className="sep">|</b></span>
              <span>Man City vs West Ham <b className="sep">|</b></span>
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
                    <th className="text-center">GD</th>
                    <th className="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((t) => (
                    <tr key={t.rank}>
                      <td>{t.rank}</td>
                      <td>
                        <div className="team-cell">
                          <span className="team-dot" style={{ backgroundColor: t.color }}></span>
                          {t.name}
                        </div>
                      </td>
                      <td className="text-center">{t.gd}</td>
                      <td className="text-right highlight-green">{t.pts}</td>
                    </tr>
                  ))}
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
               <p>Select teams to analyze</p>
            </div>
          </div>

          <div className="h2h-footer">
            <label className="panel-label">H2H COMPARISON</label>
            <p className="hint">Click 2 teams in the table to compare stats.</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;