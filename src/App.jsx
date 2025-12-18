import React, { useState } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('TABLE');

  // Sample Data
  const teams = [
    { rank: 1, name: 'Arsenal', gd: 20, pts: 36, logo: '🔴' },
    { rank: 2, name: 'Man City', gd: 22, pts: 34, logo: '🔵' },
    { rank: 3, name: 'Aston Villa', gd: 8, pts: 33, logo: '🟣' },
    { rank: 4, name: 'Chelsea', gd: 12, pts: 28, logo: '🔵' },
    { rank: 5, name: 'Crystal Palace', gd: 5, pts: 26, logo: '🦅' },
  ];

  const scorers = [
    { rank: 1, name: 'Erling Haaland', team: 'Man City', goals: 14 },
    { rank: 2, name: 'Mohamed Salah', team: 'Liverpool', goals: 11 },
  ];

  const tickerMatches = [
    "Man City vs West Ham", "Wolverhampton vs Brentford", 
    "Tottenham vs Liverpool", "Everton vs Arsenal"
  ];

  return (
    <div className="dashboard">
      {/* 1. TICKER FIX: Added separators and spacing */}
      <div className="ticker-bar">
        <div className="ticker-content">
          {tickerMatches.map((match, i) => (
            <span key={i} className="ticker-item">
              {match} <span className="ticker-sep">|</span>
            </span>
          ))}
        </div>
      </div>

      <div className="main-layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <h1 className="logo">ITS<span>GONE</span>IN<span>.</span></h1>
          <nav>
            <p className="nav-label">ELITE CIRCUITS</p>
            <ul>
              <li className="active">Premier League</li>
              <li>La Liga</li>
              <li>Serie A</li>
              <li>Bundesliga</li>
            </ul>
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="content">
          <div className="tabs">
            <button className={activeTab === 'TABLE' ? 'active' : ''} onClick={() => setActiveTab('TABLE')}>TABLE</button>
            <button className={activeTab === 'SCORERS' ? 'active' : ''} onClick={() => setActiveTab('SCORERS')}>SCORERS</button>
            <button className={activeTab === 'FIXTURES' ? 'active' : ''} onClick={() => setActiveTab('FIXTURES')}>FIXTURES</button>
          </div>

          <div className="table-container">
            {activeTab === 'TABLE' && (
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>TEAM</th>
                    <th>GD</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.rank}>
                      <td>{team.rank}</td>
                      <td><span className="team-icon">{team.logo}</span> {team.name}</td>
                      <td>{team.gd}</td>
                      <td className="pts-highlight">{team.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'SCORERS' && (
              <div className="placeholder-view">
                <h3>Top Scorers</h3>
                {scorers.map(s => <div key={s.name} className="list-item">{s.rank}. {s.name} - {s.goals} Goals</div>)}
              </div>
            )}

            {activeTab === 'FIXTURES' && (
              <div className="placeholder-view">
                <h3>Upcoming Fixtures</h3>
                <div className="list-item">Liverpool vs Arsenal - SUN 16:00</div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANEL: FIXING THE PITCH */}
        <section className="analyst-panel">
          <p className="panel-label">TACTICAL ANALYST</p>
          <div className="pitch">
            <div className="pitch-center-circle"></div>
            <div className="pitch-center-line"></div>
            <div className="pitch-penalty-area"></div>
          </div>
          
          <div className="h2h-section">
            <p className="panel-label">H2H COMPARISON</p>
            <p className="h2h-hint">Click 2 teams in the table to compare stats.</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;